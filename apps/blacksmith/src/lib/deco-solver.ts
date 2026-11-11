/**
 * Decoration placement for the armor set search (set-search.ts): given a
 * set's slotted items (weapon and pieces) and its armor skill points, find
 * decorations that bring every wanted skill tree up to its threshold and, when
 * bad skills aren't allowed, keep every other tree above its negative skill.
 *
 * Exact, by dynamic programming over the slotted items:
 * 1. Only some trees matter for a set: the wanted ones and, without bad
 *    skills, the trees that could end up at a negative skill (already there
 *    from the armor, or reachable through the penalties of decorations that
 *    might be used). Decorations that add to none of them are never useful.
 * 2. For each item size (1 to 3 slots), every combination of those
 *    decorations that fits is listed once per distinct effect on the trees
 *    that matter, keeping the one with the fewest slots and decorations.
 * 3. Items are filled one at a time. Partial fills that can no longer reach a
 *    threshold are dropped, and fills that are equivalent for what remains
 *    (beyond a threshold extra points no longer matter) are merged.
 *
 * Of all the fills that work, it picks the one that uses the fewest slots,
 * then leaves the most weapon slots free, then uses the fewest decorations,
 * then has the smallest penalties.
 */
import type { Deco, DecoBin } from "./set-search";

/** A slotted item: the weapon or an armor piece. */
export interface SolverBin {
  slot: DecoBin;
  /** Free slots, 0 to 3. */
  size: number;
  /** How many times its decorations count (the torso with Torso Up pieces). */
  mult: number;
}

export interface SolverOptions {
  /** The decorations that may be used. */
  decorations: Deco[];
  /** Wanted tree -> points needed. */
  wanted: Map<string, number>;
  /**
   * Tree -> its weakest negative skill's threshold (Defense -20's -10): the
   * total must stay above it. Null when bad skills are allowed.
   */
  bad: Map<string, number> | null;
}

export interface Placement {
  deco: Deco;
  /** Index into the bins passed to `solve`. */
  bin: number;
}

interface Loadout {
  decos: Deco[];
  /** Points per tracked tree. */
  vec: number[];
  slots: number;
  /** Total negative points, as a positive number (smaller is cleaner). */
  penalty: number;
}

interface State {
  vec: number[];
  weapon: number;
  slots: number;
  count: number;
  penalty: number;
  prev: State | null;
  loadout: Loadout | null;
  bin: number;
}

/** `a` is a better way to fill than `b`. */
function better(a: State, b: State): boolean {
  return (
    (a.slots - b.slots || a.weapon - b.weapon || a.count - b.count || a.penalty - b.penalty) < 0
  );
}

function penaltyOf(deco: Deco): number {
  let sum = 0;
  for (const v of Object.values(deco.points)) if (v < 0) sum -= v;
  return sum;
}

/** Forget the cached answers past this many (they're cheap to redo). */
const MAX_ANSWERS = 200_000;

export class DecoSolver {
  private readonly decorations: Deco[];
  private readonly wanted: Map<string, number>;
  private readonly bad: Map<string, number> | null;
  /** Tracked trees (joined) -> loadouts by item size. */
  private readonly tables = new Map<string, Loadout[][]>();
  /** Bins and points (see `solve`) -> placements, by position in fill order. */
  private readonly answers = new Map<string, Placement[] | null>();

  constructor(options: SolverOptions) {
    this.decorations = options.decorations;
    this.wanted = options.wanted;
    this.bad = options.bad;
  }

  /**
   * Decorations for `bins` given the armor's points per tree (Torso Up
   * already applied), or null when no placement works. An empty list means
   * the armor needs none.
   *
   * Answers are cached: items of the same size and multiplier are
   * interchangeable, and only the points in trees that could matter count.
   */
  solve(bins: SolverBin[], armor: Record<string, number>): Placement[] | null {
    // Fill the torso and other pieces first, the weapon last.
    const order = bins
      .map((_, i) => i)
      .filter((i) => bins[i].size > 0)
      .sort((a, b) => {
        const x = bins[a];
        const y = bins[b];
        return (
          Number(x.slot === "weapon") - Number(y.slot === "weapon") ||
          y.mult - x.mult ||
          y.size - x.size
        );
      });

    let key = "";
    for (const i of order)
      key += `${bins[i].slot === "weapon" ? "w" : ""}${bins[i].size}x${bins[i].mult},`;
    for (const t of this.wanted.keys()) key += `${armor[t] ?? 0},`;
    if (this.bad) for (const t of this.bad.keys()) key += `${armor[t] ?? 0},`;
    let answer = this.answers.get(key);
    if (answer === undefined) {
      answer = this.place(bins, order, armor);
      if (this.answers.size >= MAX_ANSWERS) this.answers.clear();
      this.answers.set(key, answer);
    }
    return answer && answer.map(({ deco, bin }) => ({ deco, bin: order[bin] }));
  }

  /** `solve` for bins filled in `order`; bins in the answer are positions in it. */
  private place(
    bins: SolverBin[],
    order: number[],
    armor: Record<string, number>,
  ): Placement[] | null {
    const capacity = bins.reduce((n, b) => n + b.size * b.mult, 0);
    const maxMult = Math.max(1, ...bins.filter((b) => b.size > 0).map((b) => b.mult));
    const trees = this.tracked(armor, capacity, maxMult);
    const req = trees.map(
      (t) => (this.wanted.has(t) ? this.wanted.get(t)! : this.bad!.get(t)! + 1) - (armor[t] ?? 0),
    );
    if (req.every((r) => r <= 0)) return [];

    const tables = this.tablesFor(trees);
    const k = trees.length;

    // Most and least each remaining item can still add, per tree.
    const n = order.length;
    const remMax = Array.from({ length: n + 1 }, () => new Array<number>(k).fill(0));
    const remMin = Array.from({ length: n + 1 }, () => new Array<number>(k).fill(0));
    for (let j = n - 1; j >= 0; j--) {
      const bin = bins[order[j]];
      const table = tables[bin.size];
      for (let i = 0; i < k; i++) {
        let max = 0;
        let min = 0;
        for (const l of table) {
          if (l.vec[i] > max) max = l.vec[i];
          if (l.vec[i] < min) min = l.vec[i];
        }
        remMax[j][i] = remMax[j + 1][i] + max * bin.mult;
        remMin[j][i] = remMin[j + 1][i] + min * bin.mult;
      }
    }
    for (let i = 0; i < k; i++) if (remMax[0][i] < req[i]) return null;

    let states: State[] = [
      {
        vec: new Array<number>(k).fill(0),
        weapon: 0,
        slots: 0,
        count: 0,
        penalty: 0,
        prev: null,
        loadout: null,
        bin: -1,
      },
    ];
    for (let j = 0; j < n; j++) {
      const bin = bins[order[j]];
      const isWeapon = bin.slot === "weapon";
      const max = remMax[j + 1];
      const min = remMin[j + 1];
      const next = new Map<string, State>();
      for (const s of states) {
        loadouts: for (const l of tables[bin.size]) {
          const vec = new Array<number>(k);
          let key = "";
          for (let i = 0; i < k; i++) {
            const v = s.vec[i] + l.vec[i] * bin.mult;
            if (v + max[i] < req[i]) continue loadouts;
            vec[i] = v;
            // Beyond this, more points can't matter for what's left.
            key += Math.min(v, req[i] - min[i]) + ",";
          }
          const state: State = {
            vec,
            weapon: s.weapon + (isWeapon ? l.slots : 0),
            slots: s.slots + l.slots,
            count: s.count + l.decos.length,
            penalty: s.penalty + l.penalty * bin.mult,
            prev: s,
            loadout: l,
            bin: j,
          };
          const seen = next.get(key);
          if (!seen || better(state, seen)) next.set(key, state);
        }
      }
      if (next.size === 0) return null;
      states = [...next.values()];
    }

    let best: State | null = null;
    for (const s of states) {
      if (s.vec.every((v, i) => v >= req[i]) && (!best || better(s, best))) best = s;
    }
    if (!best) return null;
    const placed: Placement[] = [];
    for (let s: State | null = best; s?.loadout; s = s.prev) {
      for (const deco of s.loadout.decos) placed.push({ deco, bin: s.bin });
    }
    return placed.reverse();
  }

  /**
   * The trees that matter for these armor points: the wanted ones, then (in
   * name order) every tree that is at, or could be pushed to, a negative
   * skill by decorations that add to a tree that matters.
   *
   * How far decorations could push a tree down is bounded by how many points
   * they add where they're useful: the placement picked never has a
   * decoration it could do without (dropping it would use fewer slots). So
   * decorations for a tree add less than it needs plus one more decoration,
   * unless other decorations take points off it too.
   */
  private tracked(armor: Record<string, number>, capacity: number, maxMult: number): string[] {
    const wanted = [...this.wanted.keys()];
    if (!this.bad) return wanted;
    const bad = this.bad;
    const need = (t: string) =>
      (this.wanted.has(t) ? this.wanted.get(t)! : bad.get(t)! + 1) - (armor[t] ?? 0);
    const risky = new Set<string>();
    for (const [t, limit] of bad) if ((armor[t] ?? 0) <= limit) risky.add(t);
    for (;;) {
      const trees = new Set([...wanted, ...risky]);
      const useful = this.useful(trees);
      // Most points decorations could add to each tree that matters.
      const most = new Map<string, number>();
      for (const t of trees) {
        const own = useful.filter((d) => (d.points[t] ?? 0) > 0);
        if (own.length === 0) continue;
        let densest = 0;
        let biggest = 0;
        for (const d of own) {
          densest = Math.max(densest, d.points[t] / d.slots);
          biggest = Math.max(biggest, d.points[t]);
        }
        let points = capacity * densest;
        if (!useful.some((d) => (d.points[t] ?? 0) < 0)) {
          const n = need(t);
          points = Math.min(points, n > 0 ? n - 1 + biggest * maxMult : 0);
        }
        most.set(t, points);
      }
      let added = false;
      for (const [t, limit] of bad) {
        if (trees.has(t)) continue;
        // The worst decorations for each tree that matters could do to `t`.
        let worst = 0;
        for (const [s, points] of most) {
          let ratio = 0;
          for (const d of useful) {
            const v = d.points[t];
            const p = d.points[s] ?? 0;
            if (v !== undefined && p > 0 && v / p < ratio) ratio = v / p;
          }
          worst += points * ratio;
        }
        if ((armor[t] ?? 0) + worst <= limit) {
          risky.add(t);
          added = true;
        }
      }
      if (!added) return [...wanted, ...[...risky].sort()];
    }
  }

  /** Decorations that add points to one of `trees`. */
  private useful(trees: Set<string>): Deco[] {
    return this.decorations.filter((d) =>
      Object.entries(d.points).some(([t, v]) => v > 0 && trees.has(t)),
    );
  }

  /** Every useful way to fill 0 to 3 slots, for these tracked trees. */
  private tablesFor(trees: string[]): Loadout[][] {
    const key = trees.join("|");
    const cached = this.tables.get(key);
    if (cached) return cached;

    const k = trees.length;
    const vecOf = (d: Deco) => trees.map((t) => d.points[t] ?? 0);
    // Drop a decoration when another as small is as good on every tracked
    // tree (ties: keep the one with the smaller penalty, then the first).
    const all = this.useful(new Set(trees)).map((deco) => ({
      deco,
      vec: vecOf(deco),
      penalty: penaltyOf(deco),
    }));
    const decos = all.filter(
      (d, i) =>
        !all.some((e, j) => {
          if (j === i || e.deco.slots > d.deco.slots) return false;
          let strict = e.deco.slots < d.deco.slots;
          for (let x = 0; x < k; x++) {
            if (e.vec[x] < d.vec[x]) return false;
            if (e.vec[x] > d.vec[x]) strict = true;
          }
          return strict || e.penalty < d.penalty || (e.penalty === d.penalty && j < i);
        }),
    );

    const tables: Loadout[][] = [];
    for (let size = 0; size <= 3; size++) {
      const byVec = new Map<string, Loadout>();
      const add = (l: Loadout) => {
        const key = l.vec.join();
        const seen = byVec.get(key);
        if (
          !seen ||
          (l.slots - seen.slots || l.decos.length - seen.decos.length || l.penalty - seen.penalty) <
            0
        ) {
          byVec.set(key, l);
        }
      };
      const go = (from: number, left: number, l: Loadout) => {
        add(l);
        for (let d = from; d < decos.length; d++) {
          const { deco, vec, penalty } = decos[d];
          if (deco.slots > left) continue;
          go(d, left - deco.slots, {
            decos: [...l.decos, deco],
            vec: l.vec.map((v, i) => v + vec[i]),
            slots: l.slots + deco.slots,
            penalty: l.penalty + penalty,
          });
        }
      };
      go(0, size, { decos: [], vec: new Array<number>(k).fill(0), slots: 0, penalty: 0 });
      // Keep a fill only if no other is as good everywhere with no more slots.
      const list = [...byVec.values()];
      tables.push(
        list.filter(
          (l) =>
            !list.some(
              (m) => m !== l && m.slots <= l.slots && m.vec.every((v, i) => v >= l.vec[i]),
            ),
        ),
      );
    }
    this.tables.set(key, tables);
    return tables;
  }
}
