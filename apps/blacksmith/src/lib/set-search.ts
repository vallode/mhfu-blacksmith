/**
 * Armor set search, in the spirit of Athena's Armor Set Search (ASS): pick
 * the skills you want, and find every armor set (plus decorations) that
 * activates them.
 *
 * Pure and synchronous, so it runs the same in the worker
 * (src/workers/set-search.worker.ts) and in the tests.
 *
 * The search is exact: unless it runs out of time, it returns the `limit`
 * highest-defence sets, and a set it leaves out is never better than the
 * ones it returns. Sets that differ only in pieces with the same points and
 * slots are one set, the other pieces being its alternatives. How:
 * 1. Each wanted skill becomes a skill tree and a points threshold
 *    ("Attack Up (Large)" -> Attack >= 20). Without bad skills, every other
 *    tree must also stay above its negative skill (Defense > -10).
 * 2. Per armor slot, a piece is dropped when another is at least as good in
 *    everything that matters: points in the wanted trees, slots, defence and,
 *    without bad skills, points in every tree that could reach a negative
 *    skill. The rest are grouped by their points in the wanted trees and
 *    slots.
 * 3. A depth-first search picks one group per slot (torso first, so Torso Up
 *    pieces know what they copy). A branch is cut as soon as the best
 *    remaining pieces plus the most efficient decorations can't reach a
 *    threshold, or the highest defence it could still reach can't beat the
 *    `limit`th best set found so far.
 * 4. For each full set of groups, the best pieces in them (by defence) that
 *    work are found, with their decorations placed by an exact search
 *    (deco-solver.ts). A decoration has to fit in one piece's slots; the
 *    torso's decorations count once more per Torso Up piece.
 */
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "./constants";
import { DecoSolver, type SolverBin } from "./deco-solver";
import { isAvailable, type Tier } from "./min-rank";

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
  /** Earliest quest progress the piece can be made at (see min-rank.ts). */
  minRank?: Tier;
}

export interface DecorationInput {
  name: string;
  slug: string;
  slots?: number;
  color?: string;
  rarity?: number;
  /** "Attack +1" style strings. */
  skills?: string[];
  /** Earliest quest progress the decoration can be made at (see min-rank.ts). */
  minRank?: Tier;
  /** The game's item ID (data/items.json), for share links. */
  itemId?: number;
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
  /** Earliest quest progress the piece can be made at. */
  minRank?: Tier;
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
  /** Earliest quest progress the decoration can be made at. */
  minRank?: Tier;
  /** The game's item ID (data/items.json), for share links. */
  itemId?: number;
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
      minRank: a.minRank,
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
      minRank: d.minRank,
      itemId: d.itemId,
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
  /**
   * The hunter's quest progress: leave out pieces and decorations that need
   * materials from later quests. Null or omitted uses all of them.
   */
  progress?: Tier | null;
  /** Never use these pieces. */
  excludePieces?: number[];
  /** Return the best this many sets (by defence). */
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
  /**
   * Other pieces that would do the same job, per slot (ARMOR_SLOTS order):
   * swapped in, the set still activates the wanted skills with the same
   * decorations (and, unless allowed, no bad skill).
   */
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
  /** The `limit` best sets, highest defence first. */
  sets: ArmorSet[];
  /**
   * Hit `timeLimitMs` before searching everything: better sets than these may
   * exist.
   */
  timedOut: boolean;
  /** Wanted skills that no armor or decoration in range can provide. */
  unknownSkills: string[];
  elapsedMs: number;
}

export const DEFAULT_LIMIT = 200;
export const DEFAULT_TIME_LIMIT_MS = 20_000;

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
      !excluded.has(p.id) &&
      isAvailable(p.minRank, query.progress ?? null),
  );
}

// Search order: torso first, so Torso Up pieces know what they copy.
const SEARCH_ORDER: ArmorSlot[] = ["plate", "helmet", "gauntlets", "waist", "leggings"];

/** Pieces with the same points in the wanted trees, slots and Torso Up. */
interface PieceClass {
  /** Points in each wanted tree (zero for Torso Up pieces). */
  vec: number[];
  slots: number;
  torsoUp: boolean;
  /** The pieces worth trying, best first. */
  members: Piece[];
  /** Every eligible piece of the class, best first (for alternatives). */
  all: Piece[];
}

/** Tree -> its weakest negative skill's threshold (Defense -20's -10). */
export function badSkillLimits(trees: SkillTreeData[]): Map<string, number> {
  const limits = new Map<string, number>();
  for (const t of trees) {
    if (t.tree === TORSO_UP_TREE) continue;
    const negative = t.skills.filter((s) => s.points < 0).map((s) => s.points);
    if (negative.length > 0) limits.set(t.tree, Math.max(...negative));
  }
  return limits;
}

/**
 * The trees that could reach a negative skill in some set, with the points
 * beyond which a piece's points in it no longer matter: at that many, no set
 * can take the tree down to its negative skill.
 */
function riskyTrees(
  bySlot: Piece[][],
  decorations: Deco[],
  limits: Map<string, number>,
  weaponSlots: number,
): { tree: string; cap: number }[] {
  // SEARCH_ORDER: the torso is bySlot[0].
  const torsoUps = bySlot.slice(1).filter((ps) => ps.some((p) => p.torsoUp)).length;
  const maxSlots = bySlot.map((ps) => Math.max(0, ...ps.map((p) => p.slots)));
  const capacity = weaponSlots + maxSlots.reduce((a, b) => a + b, 0) + maxSlots[0] * torsoUps;
  const risky: { tree: string; cap: number }[] = [];
  for (const [tree, limit] of limits) {
    let lowest = 0;
    bySlot.forEach((ps, d) => {
      const min = Math.min(0, ...ps.filter((p) => !p.torsoUp).map((p) => p.points[tree] ?? 0));
      lowest += d === 0 ? min * (1 + torsoUps) : min;
    });
    let perSlot = 0;
    for (const deco of decorations) {
      const v = deco.points[tree];
      if (v !== undefined && v / deco.slots < perSlot) perSlot = v / deco.slots;
    }
    lowest += capacity * perSlot;
    if (lowest <= limit) risky.push({ tree, cap: limit + 1 - lowest });
  }
  return risky;
}

/**
 * Drop every piece another piece of the slot is at least as good as, in
 * everything the search cares about, and group the rest.
 */
function pieceClasses(
  pieces: Piece[],
  wanted: string[],
  risky: { tree: string; cap: number }[],
): PieceClass[] {
  const vecOf = (p: Piece) =>
    p.torsoUp ? wanted.map(() => 0) : wanted.map((t) => p.points[t] ?? 0);
  const byDefence = [...pieces].sort((a, b) => b.defence - a.defence || a.id - b.id);

  // Compare each distinct profile once.
  interface Profile {
    piece: Piece;
    torsoUp: boolean;
    slots: number;
    defence: number;
    vec: number[];
  }
  const profiles = new Map<string, Profile>();
  for (const p of byDefence) {
    const vec = vecOf(p);
    if (!p.torsoUp) {
      for (const { tree, cap } of risky) vec.push(Math.min(p.points[tree] ?? 0, cap));
    }
    const key = `${p.torsoUp ? "T" : ""}|${p.slots}|${p.defence}|${vec.join()}`;
    if (!profiles.has(key))
      profiles.set(key, { piece: p, torsoUp: p.torsoUp, slots: p.slots, defence: p.defence, vec });
  }
  const list = [...profiles.values()];
  const kept = new Set<Piece>();
  for (const a of list) {
    const beaten = list.some(
      (b) =>
        b !== a &&
        b.torsoUp === a.torsoUp &&
        b.slots >= a.slots &&
        b.defence >= a.defence &&
        b.vec.every((v, i) => v >= a.vec[i]),
    );
    if (!beaten) kept.add(a.piece);
  }

  const classes = new Map<string, PieceClass>();
  for (const p of byDefence) {
    const vec = vecOf(p);
    const key = `${p.torsoUp ? "T" : ""}|${p.slots}|${vec.join()}`;
    let c = classes.get(key);
    if (!c) {
      c = { vec, slots: p.slots, torsoUp: p.torsoUp, members: [], all: [] };
      classes.set(key, c);
    }
    c.all.push(p);
    if (kept.has(p)) c.members.push(p);
  }
  // Best first, so good sets turn up early and raise the bar for the rest.
  return [...classes.values()]
    .filter((c) => c.members.length > 0)
    .sort((a, b) => b.members[0].defence - a.members[0].defence);
}

/** A way to fill the last slots: points in the wanted trees, slots, Torso Up pieces. */
interface Completion {
  vec: number[];
  slots: number;
  torsoUps: number;
}

/** The first slot (search order) the search precomputes completions from. */
const FIRST_COMPLETION = 2;

/** The completions no other one beats, with as many Torso Up pieces. */
function unbeaten(list: Completion[]): Completion[] {
  const sum = (c: Completion) => c.vec.reduce((a, b) => a + b, c.slots);
  const kept: Completion[] = [];
  for (const c of [...list].sort((a, b) => sum(b) - sum(a))) {
    const beaten = kept.some(
      (o) =>
        o.torsoUps === c.torsoUps && o.slots >= c.slots && o.vec.every((v, i) => v >= c.vec[i]),
    );
    if (!beaten) kept.push(c);
  }
  return kept;
}

/** A set found by the search, before it's built into an ArmorSet. */
interface Found {
  defence: number;
  freeSlots: number;
  /** One per slot, SEARCH_ORDER. */
  pieces: Piece[];
  classes: PieceClass[];
  decorations: PlacedDeco[];
}

/** `a` ranks above `b`. */
const ranksAbove = (a: Found, b: Found) => a.defence - b.defence || a.freeSlots - b.freeSlots;

export interface SearchOptions {
  /** Called as the list of best sets grows. */
  onProgress?: (found: number) => void;
  /**
   * Search only part of the sets, for running a search in several workers:
   * shard `index` of `count`. Merge the parts with mergeResults.
   */
  shard?: { index: number; count: number };
}

/**
 * A search with its pieces grouped and bounds worked out, to run round by
 * round (see searchSets).
 */
export interface PreparedSearch {
  /**
   * The best `limit` sets in round `round` (0 to SEARCH_ROUNDS - 1): only
   * sets with at least that round's defence. The last round takes all.
   */
  run(round: number, options?: SearchOptions): SearchResult;
}

/** How far below the highest possible defence each round's floor is. */
const FLOOR_STEPS = [8, 16, 32, 64, 128];
export const SEARCH_ROUNDS = FLOOR_STEPS.length + 1;

/** Results order: highest defence first, then most free slots. */
export function compareSets(a: ArmorSet, b: ArmorSet): number {
  return b.defence - a.defence || b.freeSlots - a.freeSlots;
}

/** One result from the shards of a search (see SearchOptions.shard). */
export function mergeResults(parts: SearchResult[], limit = DEFAULT_LIMIT): SearchResult {
  return {
    sets: parts
      .flatMap((p) => p.sets)
      .sort(compareSets)
      .slice(0, limit),
    timedOut: parts.some((p) => p.timedOut),
    unknownSkills: parts[0]?.unknownSkills ?? [],
    elapsedMs: Math.max(0, ...parts.map((p) => p.elapsedMs)),
  };
}

/**
 * The search, in rounds: each takes only sets with at least so much defence,
 * lower each time. A round that finds `limit` sets has found the best ones
 * (every set it didn't take has less defence), and the early rounds, which
 * cut almost everything, are cheap.
 */
export function searchSets(
  data: SearchData,
  query: SearchQuery,
  options: SearchOptions = {},
): SearchResult {
  const search = prepareSearch(data, query);
  const limit = Math.max(1, query.limit ?? DEFAULT_LIMIT);
  let result = search.run(0, options);
  for (let round = 1; round < SEARCH_ROUNDS; round++) {
    if (result.timedOut || result.sets.length >= limit) break;
    result = search.run(round, options);
  }
  return result;
}

export function prepareSearch(data: SearchData, query: SearchQuery): PreparedSearch {
  const started = Date.now();
  const limit = Math.max(1, query.limit ?? DEFAULT_LIMIT);
  const deadline = started + (query.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS);
  const { wanted, unknown } = resolveWanted(data.trees, query.skills);
  const trees = [...wanted.keys()];
  const need = trees.map((t) => wanted.get(t)!);
  const k = trees.length;
  let found = 0;
  const done = (sets: ArmorSet[], timedOut = false): SearchResult => ({
    sets,
    timedOut,
    unknownSkills: unknown,
    elapsedMs: Date.now() - started,
  });
  const nothing: PreparedSearch = { run: () => done([]) };
  if (k === 0) return nothing;

  const eligible = eligiblePieces(data, query);
  const bySlot = SEARCH_ORDER.map((slot) => eligible.filter((p) => p.slot === slot));
  const decorations = data.decorations.filter((d) =>
    isAvailable(d.minRank, query.progress ?? null),
  );
  const limits = badSkillLimits(data.trees);
  for (const t of trees) limits.delete(t);
  const risky = query.allowBadSkills
    ? []
    : riskyTrees(bySlot, decorations, limits, query.weaponSlots);
  const classes = bySlot.map((ps) => pieceClasses(ps, trees, risky));
  if (classes.some((c) => c.length === 0)) return nothing;

  const solver = new DecoSolver({
    decorations,
    wanted,
    bad: query.allowBadSkills ? null : limits,
  });
  // For a whole group of pieces, only the wanted trees are known.
  const wantedSolver = new DecoSolver({ decorations, wanted, bad: null });

  // Best points per decoration slot, per wanted tree (for the bounds).
  const perSlot = trees.map((t) =>
    decorations.reduce((best, d) => Math.max(best, (d.points[t] ?? 0) / d.slots), 0),
  );
  // Per slot (search order): best points per tree, most slots, has Torso Up.
  const slotMax = classes.map((cs) => ({
    vec: trees.map((_, i) =>
      Math.max(...cs.filter((c) => !c.torsoUp).map((c) => c.vec[i]), -Infinity),
    ),
    slots: Math.max(...cs.map((c) => c.slots)),
    torsoUp: cs.some((c) => c.torsoUp),
  }));
  // Each piece's points, without Torso Up.
  const pointList = data.pieces.map((p) =>
    Object.entries(p.points).filter(([t]) => t !== TORSO_UP_TREE),
  );
  // Highest defence the slots from `depth` on can add.
  const defenceLeft = new Array<number>(SEARCH_ORDER.length + 1).fill(0);
  for (let d = SEARCH_ORDER.length - 1; d >= 0; d--) {
    defenceLeft[d] = defenceLeft[d + 1] + Math.max(...classes[d].map((c) => c.members[0].defence));
  }

  /** The best sets so far, best first. */
  const best: Found[] = [];
  /** The running round's options. */
  let options: SearchOptions = {};
  /** The running round's defence floor: sets below it are left out. */
  let floor = -Infinity;
  /** Defence a new set needs to make the list. */
  const bar = () => Math.max(floor, best.length < limit ? -Infinity : best[limit - 1].defence);

  const keep = (f: Found) => {
    let i = best.length;
    while (i > 0 && ranksAbove(f, best[i - 1]) > 0) i--;
    best.splice(i, 0, f);
    if (best.length > limit) best.pop();
    if (best.length > found) {
      found = best.length;
      if (found % 50 === 0) options.onProgress?.(found);
    }
  };

  const chosen: PieceClass[] = [];
  const cur = new Array<number>(k).fill(0);
  let nodes = 0;
  let timedOut = false;
  const outOfTime = () => {
    if (++nodes % 1024 === 0 && Date.now() > deadline) timedOut = true;
    return timedOut;
  };

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
      let most = cur[i];
      for (let d = depth; d < SEARCH_ORDER.length; d++) {
        const m = slotMax[d];
        most += Math.max(m.vec[i], m.torsoUp ? plateVec[i] : -Infinity);
      }
      const deficit = need[i] - most;
      if (deficit <= 0) continue;
      if (perSlot[i] <= 0) return false;
      required += Math.ceil(deficit / perSlot[i]);
    }
    return required <= capacity;
  };

  // The ways to fill the last slots (from FIRST_COMPLETION on) that no
  // other way beats: as many points in every wanted tree and as many slots,
  // with the same number of Torso Up pieces. Checking a branch against these
  // cuts far more than `reachable`, which takes each tree's best separately.
  const completions: Completion[][] = [];
  completions[SEARCH_ORDER.length] = [{ vec: trees.map(() => 0), slots: 0, torsoUps: 0 }];
  for (let d = SEARCH_ORDER.length - 1; d >= FIRST_COMPLETION; d--) {
    completions[d] = unbeaten(
      classes[d].flatMap((c) =>
        completions[d + 1].map((p) =>
          c.torsoUp
            ? { ...p, torsoUps: p.torsoUps + 1 }
            : {
                vec: p.vec.map((v, i) => v + c.vec[i]),
                slots: p.slots + c.slots,
                torsoUps: p.torsoUps,
              },
        ),
      ),
    );
  }

  // Could some completion of the slots from `depth` make every threshold?
  const completable = (depth: number): boolean => {
    const plateVec = chosen[0].vec;
    let torsoUps = 0;
    let capacity = query.weaponSlots;
    for (let d = 1; d < chosen.length; d++) {
      if (chosen[d].torsoUp) torsoUps++;
      else capacity += chosen[d].slots;
    }
    completions: for (const p of completions[depth]) {
      const slots = capacity + p.slots + chosen[0].slots * (1 + torsoUps + p.torsoUps);
      let required = 0;
      for (let i = 0; i < k; i++) {
        const deficit = need[i] - (cur[i] + p.vec[i] + p.torsoUps * plateVec[i]);
        if (deficit <= 0) continue;
        if (perSlot[i] <= 0) continue completions;
        required += Math.ceil(deficit / perSlot[i]);
        if (required > slots) continue completions;
      }
      return true;
    }
    return false;
  };

  /** The weapon's and pieces' slots, as decoration bins. */
  const binsFor = (torsoUps: number): SolverBin[] => {
    const bins: SolverBin[] = [{ slot: "weapon", size: query.weaponSlots, mult: 1 }];
    chosen.forEach((c, d) =>
      bins.push({ slot: SEARCH_ORDER[d], size: c.slots, mult: d === 0 ? 1 + torsoUps : 1 }),
    );
    return bins;
  };

  // A full set of groups: find its best pieces that work.
  const finish = () => {
    const torsoUps = chosen.filter((c, d) => d > 0 && c.torsoUp).length;
    const bins = binsFor(torsoUps);
    const wantedPoints: Record<string, number> = {};
    trees.forEach((t, i) => (wantedPoints[t] = cur[i]));
    // The best decorations for the wanted skills alone. When they cause no
    // bad skill with some pieces, they're the best decorations for those
    // pieces too.
    const plain = wantedSolver.solve(bins, wantedPoints);
    if (!plain) return;
    const plainPoints: Record<string, number> = {};
    for (const x of plain) {
      for (const [t, v] of Object.entries(x.deco.points)) {
        plainPoints[t] = (plainPoints[t] ?? 0) + v * bins[x.bin].mult;
      }
    }
    const plainWorks = (armor: Record<string, number>) => {
      if (query.allowBadSkills) return true;
      for (const [t, limit] of limits) {
        if ((armor[t] ?? 0) + (plainPoints[t] ?? 0) <= limit) return false;
      }
      return true;
    };

    // Highest defence the slots from `d` on can add.
    const left = new Array<number>(chosen.length + 1).fill(0);
    for (let d = chosen.length - 1; d >= 0; d--)
      left[d] = left[d + 1] + chosen[d].members[0].defence;

    const result: { pick: Found | null } = { pick: null };
    const pieces: Piece[] = [];
    const go = (d: number, defence: number) => {
      if (timedOut) return;
      if (d === chosen.length) {
        if (outOfTime()) return;
        const armor: Record<string, number> = {};
        pieces.forEach((p, i) => {
          if (p.torsoUp) return;
          const mult = i === 0 ? 1 + torsoUps : 1;
          for (const [t, v] of pointList[p.id]) armor[t] = (armor[t] ?? 0) + v * mult;
        });
        const placed = plainWorks(armor) ? plain : solver.solve(bins, armor);
        if (!placed) return;
        const used = placed.reduce((n, x) => n + x.deco.slots, 0);
        const capacity = bins.reduce((n, b) => n + b.size, 0);
        const f: Found = {
          defence,
          freeSlots: capacity - used,
          pieces: [...pieces],
          classes: [...chosen],
          decorations: placed.map((x) => ({ deco: x.deco, bin: bins[x.bin].slot })),
        };
        if (!result.pick || ranksAbove(f, result.pick) > 0) result.pick = f;
        return;
      }
      for (const p of chosen[d].members) {
        const most = defence + p.defence + left[d + 1];
        // Members are best first: once one can't win, none after it can.
        if (most < bar() || (result.pick && most <= result.pick.defence)) break;
        pieces.push(p);
        go(d + 1, defence + p.defence);
        pieces.pop();
      }
    };
    go(0, 0);
    if (result.pick) keep(result.pick);
  };

  // A shard takes every count-th torso and helmet pair.
  let plateIndex = 0;
  const inShard = (depth: number, i: number) => {
    const { shard } = options;
    return (
      !shard || depth !== 1 || (plateIndex * classes[1].length + i) % shard.count === shard.index
    );
  };

  const dfs = (depth: number, defence: number) => {
    if (outOfTime()) return;
    if (depth === SEARCH_ORDER.length) {
      finish();
      return;
    }
    for (const [i, c] of classes[depth].entries()) {
      if (depth === 0) plateIndex = i;
      if (!inShard(depth, i)) continue;
      // Classes are best first: once one can't make the list, none after it can.
      if (defence + c.members[0].defence + defenceLeft[depth + 1] < bar()) break;
      const vec = c.torsoUp && depth > 0 ? chosen[0].vec : c.vec;
      for (let i = 0; i < k; i++) cur[i] += vec[i];
      chosen.push(c);
      const next = depth + 1;
      if (next >= FIRST_COMPLETION ? completable(next) : reachable(next)) {
        dfs(next, defence + c.members[0].defence);
      }
      chosen.pop();
      for (let i = 0; i < k; i++) cur[i] -= vec[i];
      if (timedOut) return;
    }
  };
  const build = (f: Found): ArmorSet => {
    const ordered = ARMOR_SLOTS.map((slot) => SEARCH_ORDER.indexOf(slot));
    const pieces = ordered.map((d) => f.pieces[d]);
    const set = evaluateSet(data, pieces, f.decorations, query.weaponSlots, trees);
    const torsoMult = 1 + pieces.filter((p) => p.torsoUp && p.slot !== "plate").length;
    // Swapping `p` in for `old` keeps every wanted skill and adds no bad one.
    const swaps = (old: Piece, p: Piece) => {
      if (old.torsoUp) return true; // Torso Up pieces only copy the torso
      const mult = old.slot === "plate" ? torsoMult : 1;
      for (const t of new Set([...Object.keys(old.points), ...Object.keys(p.points)])) {
        if (t === TORSO_UP_TREE) continue;
        const v = (set.totals[t] ?? 0) + ((p.points[t] ?? 0) - (old.points[t] ?? 0)) * mult;
        const need = wanted.get(t);
        if (need !== undefined && v < need) return false;
        const limit = limits.get(t);
        if (!query.allowBadSkills && limit !== undefined && v <= limit) return false;
      }
      return true;
    };
    const alternatives = ordered.map((d, i) =>
      f.classes[d].all.filter((p) => p !== pieces[i] && swaps(pieces[i], p)),
    );
    return { ...set, alternatives };
  };

  return {
    run(round, runOptions = {}) {
      options = runOptions;
      floor = round < FLOOR_STEPS.length ? defenceLeft[0] - FLOOR_STEPS[round] : -Infinity;
      best.length = 0;
      found = 0;
      if (!timedOut) dfs(0, 0);
      return done(best.map(build), timedOut);
    },
  };
}
