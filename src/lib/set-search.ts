/**
 * Armor set search, in the spirit of Athena's Armor Set Search (ASS): pick
 * the skills you want, and find every armor set (plus decorations) that
 * activates them.
 *
 * Pure and synchronous, so it runs the same in the worker
 * (src/workers/set-search.worker.ts) and in the tests.
 *
 * How it searches:
 * 1. Each wanted skill becomes a skill tree and a points threshold
 *    ("Attack Up (Large)" -> Attack >= 20).
 * 2. Per armor slot, pieces are grouped by what matters for the search: their
 *    points in the wanted trees, their slot count and whether they are Torso
 *    Up. A group that another group beats or equals everywhere is dropped
 *    (Pareto pruning). Each surviving group is shown as its highest-defence
 *    piece, with the rest as alternatives.
 * 3. A depth-first search picks one group per slot (torso first, so Torso Up
 *    pieces know what they copy) and prunes a branch as soon as the best
 *    remaining pieces plus the most efficient decorations can't reach a
 *    threshold.
 * 4. For each full set, an exact search places decorations into the weapon's
 *    and pieces' slots. A decoration has to fit in one piece's slots; the
 *    torso's decorations count once more per Torso Up piece.
 */
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "./constants";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** One activation of a skill tree, e.g. Attack Up (Large) at 20 points. */
export interface SkillActivation {
  name: string;
  points: number;
}

/** A skill tree from data/skills.json. */
export interface SkillTreeData {
  /** The game's skill tree name (the disc's `SkillID` spelling). */
  tree: string;
  /** Other spellings of the tree used in data/ (armor and decorations). */
  aliases?: string[];
  skills: SkillActivation[];
}

/** The tree Torso Up pieces carry. It never activates a skill by itself. */
export const TORSO_UP_TREE = "Torso Inc";

/** Armor piece as decoded from the client bundles (see client-data.ts). */
export interface ArmorInput {
  slot: ArmorSlot;
  rank: ArmorRank;
  name: string;
  slug: string;
  defence?: number;
  /** [fire, water, thunder, ice, dragon] */
  res?: number[];
  slots?: number;
  rarity?: number;
  sex?: string;
  hunterType?: string;
  skills?: { name: string; amount: number }[];
}

export interface DecorationInput {
  name: string;
  slug: string;
  slots?: number;
  color?: string;
  rarity?: number;
  /** "Attack +1" style strings. */
  skills?: string[];
}

export interface Piece {
  /** Index into SearchData.pieces. */
  id: number;
  slot: ArmorSlot;
  rank: ArmorRank;
  name: string;
  slug: string;
  href: string;
  defence: number;
  res: number[];
  slots: number;
  rarity?: number;
  /** "Male", "Female" or "Both". */
  sex: string;
  /** "Blademaster", "Gunner" or "Both". */
  hunterType: string;
  /** Skill tree -> points, with tree names normalized. */
  points: Record<string, number>;
  torsoUp: boolean;
}

export interface Deco {
  /** Index into SearchData.decorations. */
  id: number;
  name: string;
  slug: string;
  href: string;
  slots: number;
  color?: string;
  rarity?: number;
  points: Record<string, number>;
}

export interface SearchData {
  trees: SkillTreeData[];
  pieces: Piece[];
  decorations: Deco[];
}

/** Map every spelling of a tree (name and aliases) to the tree name. */
export function treeNameIndex(trees: SkillTreeData[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const t of trees) {
    index.set(t.tree, t.tree);
    for (const a of t.aliases ?? []) index.set(a, t.tree);
  }
  return index;
}

const DECO_SKILL = /^(.*?)\s*([+-]\d+)$/;

/** Parse a decoration skill string ("Attack +1", "NormalS up +4"). */
export function parseDecorationSkill(s: string): { name: string; amount: number } | null {
  const m = DECO_SKILL.exec(s.trim());
  return m && m[1] ? { name: m[1], amount: Number(m[2]) } : null;
}

function both(value: string | undefined, a: string, b: string): string {
  if (!value || (value.includes(a) && value.includes(b))) return "Both";
  return value.includes(a) ? a : b;
}

/**
 * Normalize armor and decorations for searching. Unknown skill tree names are
 * kept as they are (they still show up in a set's totals).
 */
export function prepareSearchData(
  trees: SkillTreeData[],
  armor: ArmorInput[],
  decorations: DecorationInput[],
): SearchData {
  const names = treeNameIndex(trees);
  const tree = (n: string) => names.get(n) ?? n;

  const pieces = armor.map((a, id): Piece => {
    const points: Record<string, number> = {};
    for (const s of a.skills ?? []) {
      const t = tree(s.name);
      points[t] = (points[t] ?? 0) + Number(s.amount);
    }
    return {
      id,
      slot: a.slot,
      rank: a.rank,
      name: a.name,
      slug: a.slug,
      href: `/armorsmith/${a.slot}/${a.rank}/${a.slug}/`,
      defence: a.defence ?? 0,
      res: a.res ?? [0, 0, 0, 0, 0],
      slots: a.slots ?? 0,
      rarity: a.rarity,
      sex: both(a.sex, "Male", "Female"),
      hunterType: both(a.hunterType, "Blademaster", "Gunner"),
      points,
      torsoUp: (points[TORSO_UP_TREE] ?? 0) > 0,
    };
  });

  const decos = decorations.map((d, id): Deco => {
    const points: Record<string, number> = {};
    for (const s of d.skills ?? []) {
      const parsed = parseDecorationSkill(s);
      if (!parsed) continue;
      const t = tree(parsed.name);
      points[t] = (points[t] ?? 0) + parsed.amount;
    }
    return {
      id,
      name: d.name,
      slug: d.slug,
      href: `/decorations/${d.slug}/`,
      slots: d.slots ?? 1,
      color: d.color,
      rarity: d.rarity,
      points,
    };
  });

  return { trees, pieces, decorations: decos };
}

/** The skill a tree activates at `points`, or null. */
export function activeSkill(tree: SkillTreeData, points: number): SkillActivation | null {
  let best: SkillActivation | null = null;
  for (const s of tree.skills) {
    if (s.points > 0 ? points >= s.points : points <= s.points) {
      if (!best || Math.abs(s.points) > Math.abs(best.points)) best = s;
    }
  }
  return best;
}

/** Every positive skill, for the skill picker: tree order, strongest first. */
export function selectableSkills(trees: SkillTreeData[]): (SkillActivation & { tree: string })[] {
  return trees
    .filter((t) => t.tree !== TORSO_UP_TREE)
    .flatMap((t) => t.skills.filter((s) => s.points > 0).map((s) => ({ ...s, tree: t.tree })));
}

// ---------------------------------------------------------------------------
// Query and results
// ---------------------------------------------------------------------------

export interface SearchQuery {
  /** Wanted skills, by activation name ("Attack Up (Large)"). */
  skills: string[];
  hunterType: "Blademaster" | "Gunner";
  sex: "Male" | "Female";
  /** Highest rank to use armor from. */
  rank: ArmorRank;
  weaponSlots: number;
  /** Keep sets that also activate a negative skill. */
  allowBadSkills: boolean;
  /** Only use these pieces (e.g. the hunter's equipment box). */
  onlyPieces?: number[];
  /** Never use these pieces. */
  excludePieces?: number[];
  /** Return at most this many sets (the highest defence ones). */
  limit?: number;
  /** Give up after this long, returning what was found. */
  timeLimitMs?: number;
}

export type DecoBin = "weapon" | ArmorSlot;

export interface PlacedDeco {
  deco: Deco;
  bin: DecoBin;
}

export interface ActiveSkill {
  tree: string;
  name: string;
  /** Total points in the tree. */
  points: number;
  /** The activation's threshold; negative for bad skills. */
  threshold: number;
}

export interface ArmorSet {
  /** One piece per slot, in ARMOR_SLOTS order. */
  pieces: Piece[];
  /** Other pieces that would do the same job, per slot (ARMOR_SLOTS order). */
  alternatives: Piece[][];
  decorations: PlacedDeco[];
  defence: number;
  res: number[];
  /** Skill tree -> total points. */
  totals: Record<string, number>;
  /** Activated skills, wanted ones first. */
  skills: ActiveSkill[];
  /** Weapon and armor slots left empty. */
  freeSlots: number;
}

export interface SearchResult {
  /** Highest defence first. */
  sets: ArmorSet[];
  /** Sets found, before `limit`. */
  total: number;
  /** Stopped at MAX_FOUND sets: the best sets may be missing. */
  truncated: boolean;
  /** Hit `timeLimitMs` before searching everything. */
  timedOut: boolean;
  /** Wanted skills that no armor or decoration in range can provide. */
  unknownSkills: string[];
  elapsedMs: number;
}

export const DEFAULT_LIMIT = 200;
export const DEFAULT_TIME_LIMIT_MS = 20_000;
/** Stop searching after this many sets. */
export const MAX_FOUND = 20_000;

// Search order: torso first, so Torso Up pieces know what they copy.
const SEARCH_ORDER: ArmorSlot[] = ["plate", "helmet", "gauntlets", "waist", "leggings"];

interface PieceClass {
  /** Points in each wanted tree. */
  vec: number[];
  slots: number;
  torsoUp: boolean;
  /** Highest defence first. */
  pieces: Piece[];
}

interface DecoOption {
  deco: Deco;
  vec: number[];
  size: number;
}

/** `a` is at least as good as `b` in every wanted tree and slot count. */
function covers(aVec: number[], aSlots: number, bVec: number[], bSlots: number): boolean {
  if (aSlots < bSlots) return false;
  for (let i = 0; i < aVec.length; i++) if (aVec[i] < bVec[i]) return false;
  return true;
}

function groupPieces(pieces: Piece[], trees: string[]): PieceClass[] {
  const groups = new Map<string, PieceClass>();
  for (const p of pieces) {
    const vec = p.torsoUp ? trees.map(() => 0) : trees.map((t) => p.points[t] ?? 0);
    const key = `${p.torsoUp ? "T" : ""}|${p.slots}|${vec.join(",")}`;
    let g = groups.get(key);
    if (!g) {
      g = { vec, slots: p.slots, torsoUp: p.torsoUp, pieces: [] };
      groups.set(key, g);
    }
    g.pieces.push(p);
  }
  const all = [...groups.values()];
  for (const g of all) g.pieces.sort((a, b) => b.defence - a.defence);

  const kept = all.filter(
    (g) =>
      g.torsoUp ||
      !all.some((h) => h !== g && !h.torsoUp && covers(h.vec, h.slots, g.vec, g.slots)),
  );
  // Most useful first, so good sets turn up early (and before the limit).
  const score = (g: PieceClass) => g.vec.reduce((s, v) => s + v, 0) + g.slots * 1.5;
  return kept.sort((a, b) => score(b) - score(a) || b.pieces[0].defence - a.pieces[0].defence);
}

function decoOptions(decos: Deco[], trees: string[]): DecoOption[][] {
  return trees.map((t) => {
    const opts = decos
      .filter((d) => (d.points[t] ?? 0) > 0)
      .map((d) => ({ deco: d, vec: trees.map((u) => d.points[u] ?? 0), size: d.slots }));
    // Drop a decoration when another as small is as good in every wanted tree.
    const kept = opts.filter(
      (o) =>
        !opts.some(
          (p) =>
            p !== o &&
            p.size <= o.size &&
            p.vec.every((v, i) => v >= o.vec[i]) &&
            (p.size < o.size || p.vec.some((v, i) => v > o.vec[i]) || p.deco.id < o.deco.id),
        ),
    );
    return kept.sort(
      (a, b) => b.size - a.size || b.vec[trees.indexOf(t)] - a.vec[trees.indexOf(t)],
    );
  });
}

interface Bin {
  slot: DecoBin;
  free: number;
  mult: number;
}

interface DecoSolver {
  /** Up to `max` ways to cover `deficit` (need minus armor points, per wanted tree). */
  solve(bins: Bin[], deficit: number[], max: number): { option: DecoOption; bin: number }[][];
}

function decoSolver(options: DecoOption[][], perSlot: number[]): DecoSolver {
  const k = perSlot.length;

  return {
    solve(bins, deficit, max) {
      const results: { option: DecoOption; bin: number }[][] = [];
      const placed: { option: DecoOption; bin: number }[] = [];
      const failed = new Set<string>();
      let budget = 20_000; // nodes, so a pathological set can't stall the search

      const go = (): boolean => {
        if (--budget < 0) return false;
        let t = -1;
        for (let i = 0; i < k; i++) if (deficit[i] > 0 && (t < 0 || deficit[i] > deficit[t])) t = i;
        if (t < 0) {
          results.push([...placed]);
          return true;
        }
        // Can the free slots cover what's left, even with the best decorations?
        let capacity = 0;
        for (const b of bins) capacity += b.free * b.mult;
        let required = 0;
        for (let i = 0; i < k; i++) {
          if (deficit[i] <= 0) continue;
          if (perSlot[i] <= 0) return false;
          required += Math.ceil(deficit[i] / perSlot[i]);
        }
        if (required > capacity) return false;

        const key = bins.map((b) => `${b.free}x${b.mult}`).join() + "|" + deficit.join();
        if (failed.has(key)) return false;

        let found = false;
        for (const option of options[t]) {
          const seen = new Set<string>();
          for (let b = 0; b < bins.length; b++) {
            const bin = bins[b];
            if (bin.free < option.size) continue;
            const binKey = `${bin.free}x${bin.mult}`;
            if (seen.has(binKey)) continue;
            seen.add(binKey);

            bin.free -= option.size;
            for (let i = 0; i < k; i++) deficit[i] -= option.vec[i] * bin.mult;
            placed.push({ option, bin: b });
            if (go()) found = true;
            placed.pop();
            for (let i = 0; i < k; i++) deficit[i] += option.vec[i] * bin.mult;
            bin.free += option.size;
            if (results.length >= max) return true;
          }
        }
        if (!found) failed.add(key);
        return found;
      };

      go();
      return results;
    },
  };
}

/** Totals, skills and stats for a full set. */
export function evaluateSet(
  data: SearchData,
  pieces: Piece[],
  decorations: PlacedDeco[],
  weaponSlots: number,
  wanted: string[] = [],
): Omit<ArmorSet, "alternatives"> {
  const totals: Record<string, number> = {};
  const add = (points: Record<string, number>, mult = 1) => {
    for (const [t, v] of Object.entries(points)) {
      if (t === TORSO_UP_TREE) continue;
      totals[t] = (totals[t] ?? 0) + v * mult;
    }
  };
  const torsoUps = pieces.filter((p) => p.torsoUp && p.slot !== "plate").length;
  const torsoMult = 1 + torsoUps;
  const plate = pieces.find((p) => p.slot === "plate");
  for (const p of pieces) {
    if (p.torsoUp && p.slot !== "plate") continue;
    add(p.points, p.slot === "plate" ? torsoMult : 1);
  }
  for (const d of decorations) add(d.deco.points, d.bin === "plate" && plate ? torsoMult : 1);

  const res = [0, 0, 0, 0, 0];
  let defence = 0;
  for (const p of pieces) {
    defence += p.defence;
    p.res.forEach((v, i) => (res[i] += v));
  }

  const skills: ActiveSkill[] = [];
  for (const tree of data.trees) {
    const total = totals[tree.tree];
    if (!total || tree.tree === TORSO_UP_TREE) continue;
    const skill = activeSkill(tree, total);
    if (skill)
      skills.push({ tree: tree.tree, name: skill.name, points: total, threshold: skill.points });
  }
  const rank = (s: ActiveSkill) => (wanted.includes(s.tree) ? 0 : s.threshold > 0 ? 1 : 2);
  skills.sort((a, b) => rank(a) - rank(b));

  const used = decorations.reduce((n, d) => n + d.deco.slots, 0);
  const freeSlots = weaponSlots + pieces.reduce((n, p) => n + p.slots, 0) - used;
  return { pieces, decorations, defence, res, totals, skills, freeSlots };
}

/**
 * Wanted trees and thresholds for a query's skills. Skills not in the table
 * are returned as `unknown`.
 */
export function resolveWanted(
  trees: SkillTreeData[],
  skills: string[],
): { wanted: Map<string, number>; unknown: string[] } {
  const wanted = new Map<string, number>();
  const unknown: string[] = [];
  for (const name of skills) {
    const tree = trees.find((t) => t.skills.some((s) => s.name === name && s.points > 0));
    const skill = tree?.skills.find((s) => s.name === name);
    if (!tree || !skill) {
      unknown.push(name);
      continue;
    }
    wanted.set(tree.tree, Math.max(wanted.get(tree.tree) ?? 0, skill.points));
  }
  return { wanted, unknown };
}

/** Pieces a query may use, before pruning. */
export function eligiblePieces(data: SearchData, query: SearchQuery): Piece[] {
  const maxRank = ARMOR_RANKS.indexOf(query.rank);
  const only = query.onlyPieces ? new Set(query.onlyPieces) : null;
  const excluded = new Set(query.excludePieces ?? []);
  return data.pieces.filter(
    (p) =>
      ARMOR_RANKS.indexOf(p.rank) <= maxRank &&
      (p.sex === "Both" || p.sex === query.sex) &&
      (p.hunterType === "Both" || p.hunterType === query.hunterType) &&
      (!only || only.has(p.id)) &&
      !excluded.has(p.id),
  );
}

export function searchSets(
  data: SearchData,
  query: SearchQuery,
  onProgress?: (found: number) => void,
): SearchResult {
  const started = Date.now();
  const limit = query.limit ?? DEFAULT_LIMIT;
  const deadline = started + (query.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS);
  const { wanted, unknown } = resolveWanted(data.trees, query.skills);
  const trees = [...wanted.keys()];
  const need = trees.map((t) => wanted.get(t)!);
  const k = trees.length;
  const done = (sets: ArmorSet[], truncated = false, timedOut = false): SearchResult => ({
    sets: sets.slice(0, limit),
    total: sets.length,
    truncated,
    timedOut,
    unknownSkills: unknown,
    elapsedMs: Date.now() - started,
  });
  if (k === 0) return done([]);

  const eligible = eligiblePieces(data, query);
  const classes = SEARCH_ORDER.map((slot) =>
    groupPieces(
      eligible.filter((p) => p.slot === slot),
      trees,
    ),
  );
  if (classes.some((c) => c.length === 0)) return done([]);

  const options = decoOptions(data.decorations, trees);
  // Best points per decoration slot, per wanted tree (for the bounds).
  const perSlot = trees.map((_, i) =>
    options[i].reduce((best, o) => Math.max(best, o.vec[i] / o.size), 0),
  );
  const solver = decoSolver(options, perSlot);

  // Per slot (search order): best points per tree, most slots, has Torso Up.
  const slotMax = classes.map((cs) => ({
    vec: trees.map((_, i) =>
      Math.max(...cs.filter((c) => !c.torsoUp).map((c) => c.vec[i]), -Infinity),
    ),
    slots: Math.max(...cs.map((c) => c.slots)),
    torsoUp: cs.some((c) => c.torsoUp),
  }));

  const sets: ArmorSet[] = [];
  const seen = new Set<string>();
  const chosen: PieceClass[] = [];
  const cur = new Array<number>(k).fill(0);
  let nodes = 0;
  let timedOut = false;
  let truncated = false;

  // Could the remaining slots (from `depth`) still make every threshold?
  const reachable = (depth: number): boolean => {
    const plateVec = chosen[0].vec;
    let torsoUps = 0;
    let capacity = query.weaponSlots;
    for (let d = 1; d < chosen.length; d++) {
      if (chosen[d].torsoUp) torsoUps++;
      else capacity += chosen[d].slots;
    }
    let possibleTorsoUps = torsoUps;
    for (let d = depth; d < SEARCH_ORDER.length; d++) {
      capacity += slotMax[d].slots;
      if (slotMax[d].torsoUp) possibleTorsoUps++;
    }
    capacity += chosen[0].slots * (1 + possibleTorsoUps);

    let required = 0;
    for (let i = 0; i < k; i++) {
      let best = cur[i];
      for (let d = depth; d < SEARCH_ORDER.length; d++) {
        const m = slotMax[d];
        best += Math.max(m.vec[i], m.torsoUp ? plateVec[i] : -Infinity);
      }
      const deficit = need[i] - best;
      if (deficit <= 0) continue;
      if (perSlot[i] <= 0) return false;
      required += Math.ceil(deficit / perSlot[i]);
    }
    return required <= capacity;
  };

  const finish = () => {
    const torsoUps = chosen.filter((c, d) => d > 0 && c.torsoUp).length;
    const bins: Bin[] = [];
    if (query.weaponSlots > 0) bins.push({ slot: "weapon", free: query.weaponSlots, mult: 1 });
    chosen.forEach((c, d) => {
      if (c.slots > 0)
        bins.push({ slot: SEARCH_ORDER[d], free: c.slots, mult: d === 0 ? 1 + torsoUps : 1 });
    });
    const deficit = need.map((n, i) => n - cur[i]);
    const solutions = solver.solve(bins, deficit, query.allowBadSkills ? 1 : 4);
    if (solutions.length === 0) return;

    const bySlot = (d: number) => ARMOR_SLOTS.indexOf(SEARCH_ORDER[d]);
    const ordered = chosen
      .map((c, d) => ({ c, i: bySlot(d) }))
      .sort((a, b) => a.i - b.i)
      .map(({ c }) => c);

    for (const solution of solutions) {
      const placed: PlacedDeco[] = solution.map(({ option, bin }) => ({
        deco: option.deco,
        bin: bins[bin].slot,
      }));
      const set = pickPieces(ordered, (pieces) => {
        const s = evaluateSet(data, pieces, placed, query.weaponSlots, trees);
        return query.allowBadSkills || s.skills.every((x) => x.threshold > 0) ? s : null;
      });
      if (!set) continue;
      const key = set.pieces.map((p) => p.id).join();
      if (seen.has(key)) return;
      seen.add(key);
      sets.push({
        ...set,
        alternatives: ordered.map((c, i) => c.pieces.filter((p) => p !== set.pieces[i])),
      });
      if (sets.length % 100 === 0) onProgress?.(sets.length);
      return;
    }
  };

  const dfs = (depth: number): boolean => {
    if (++nodes % 2048 === 0 && Date.now() > deadline) {
      timedOut = true;
      return false;
    }
    if (depth === SEARCH_ORDER.length) {
      finish();
      if (sets.length >= MAX_FOUND) {
        truncated = true;
        return false;
      }
      return true;
    }
    for (const c of classes[depth]) {
      const vec = c.torsoUp && depth > 0 ? chosen[0].vec : c.vec;
      for (let i = 0; i < k; i++) cur[i] += vec[i];
      chosen.push(c);
      const ok = !reachable(depth + 1) || dfs(depth + 1);
      chosen.pop();
      for (let i = 0; i < k; i++) cur[i] -= vec[i];
      if (!ok) return false;
    }
    return true;
  };

  dfs(0);
  sets.sort((a, b) => b.defence - a.defence || b.freeSlots - a.freeSlots);
  return done(sets, truncated, timedOut);
}

/**
 * The highest-defence pieces (one per class) that `accept` takes. Tries the
 * classes' alternatives when the first pick is rejected (e.g. for a bad skill).
 */
function pickPieces(
  classes: PieceClass[],
  accept: (pieces: Piece[]) => Omit<ArmorSet, "alternatives"> | null,
): Omit<ArmorSet, "alternatives"> | null {
  let tries = 64;
  const picked: Piece[] = [];
  const go = (i: number): Omit<ArmorSet, "alternatives"> | null => {
    if (i === classes.length) return tries-- > 0 ? accept([...picked]) : null;
    for (const p of classes[i].pieces) {
      picked.push(p);
      const r = go(i + 1);
      picked.pop();
      if (r || tries <= 0) return r;
    }
    return null;
  };
  return go(0);
}
