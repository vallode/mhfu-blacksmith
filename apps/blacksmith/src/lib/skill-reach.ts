/**
 * Skills within reach of a search, for min-maxing (the set builder's "Skills
 * within reach" sheet): which skills could be added to the wanted ones, or
 * which wanted ones raised to a stronger level, with at least one armor set
 * (and decorations) still activating them all under the same options. Like
 * Athena's Armor Set Search's additional skills.
 *
 * Each candidate is one search that stops at the first set it finds
 * (SearchOptions.firstOnly), unless a set an earlier check found also works
 * with other decorations. The searches share their setup (searchBase): each
 * wants the query's trees and one more. A tree's levels are tried weakest
 * first, and the first that no set reaches ends the tree: a stronger one
 * needs more points.
 * Pure and synchronous, like set-search.ts; the page runs it in the worker.
 */
import { DecoSolver, type SolverBin } from "./deco-solver";
import { isAvailable } from "./min-rank";
import {
  badSkillLimits,
  prepareSearch,
  resolveWanted,
  SEARCH_ROUNDS,
  searchBase,
  TORSO_UP_TREE,
  type Deco,
  type Piece,
  type SearchBase,
  type SearchData,
  type SearchQuery,
  type SkillTreeData,
} from "./set-search";

/** A skill tree's levels that are within reach. */
export interface ReachTree {
  tree: string;
  /** Activation names, weakest first: each has a set with the wanted skills. */
  skills: string[];
  /** A check ran out of time: a stronger level may be within reach too. */
  unsure: boolean;
}

/** Whether a set activates the wanted skills themselves. */
export type ReachBase = "ok" | "none" | "unsure";

export interface ReachResult {
  base: ReachBase;
  /** Trees with at least one level within reach, in data order. */
  trees: ReachTree[];
}

export interface ReachOptions {
  /** Each tree once it's checked: `checked` of `total` trees. */
  onTree?: (tree: ReachTree, checked: number, total: number) => void;
  /** How long one check may take before it counts as unsure. */
  checkTimeMs?: number;
}

export const DEFAULT_CHECK_MS = 4000;

/** The positive levels of `tree` stronger than `above` points, weakest first. */
function levelsAbove(tree: SkillTreeData, above: number) {
  return tree.skills.filter((s) => s.points > above).sort((a, b) => a.points - b.points);
}

/** The trees a query can be checked for, with the levels to try. */
export function reachCandidates(
  trees: SkillTreeData[],
  skills: string[],
): { tree: SkillTreeData; levels: string[] }[] {
  const { wanted } = resolveWanted(trees, skills);
  return trees
    .filter((t) => t.tree !== TORSO_UP_TREE)
    .map((tree) => ({
      tree,
      levels: levelsAbove(tree, wanted.get(tree.tree) ?? 0).map((s) => s.name),
    }))
    .filter((c) => c.levels.length > 0);
}

/** What doesn't change between checks of one query. */
interface CheckContext {
  decorations: Deco[];
  limits: Map<string, number>;
  /** The searches' setup, for skills that include the query's. */
  base: SearchBase;
}

function checkContext(data: SearchData, query: SearchQuery): CheckContext {
  return {
    decorations: data.decorations.filter((d) => isAvailable(d.minRank, query.progress ?? null)),
    limits: badSkillLimits(data.trees),
    base: searchBase(data, query),
  };
}

/**
 * Can `pieces` (a whole set) activate `skills` with some decorations, and
 * no bad skill unless the query allows them?
 */
function regems(
  data: SearchData,
  query: SearchQuery,
  ctx: CheckContext,
  pieces: Piece[],
  skills: string[],
): boolean {
  const { wanted } = resolveWanted(data.trees, skills);
  const torsoUps = pieces.filter((p) => p.torsoUp && p.slot !== "plate").length;
  const armor: Record<string, number> = {};
  const bins: SolverBin[] = [{ slot: "weapon", size: query.weaponSlots, mult: 1 }];
  for (const p of pieces) {
    const mult = p.slot === "plate" ? 1 + torsoUps : 1;
    bins.push({ slot: p.slot, size: p.slots, mult });
    if (p.torsoUp && p.slot !== "plate") continue;
    for (const [t, v] of Object.entries(p.points)) {
      if (t !== TORSO_UP_TREE) armor[t] = (armor[t] ?? 0) + v * mult;
    }
  }
  // Quick no, as the search's bound: the slots can't hold the decorations
  // the trees need, each filled with its most points per slot.
  const capacity = bins.reduce((n, b) => n + b.size * b.mult, 0);
  let required = 0;
  for (const [t, need] of wanted) {
    const deficit = need - (armor[t] ?? 0);
    if (deficit <= 0) continue;
    const perSlot = ctx.decorations.reduce((m, d) => Math.max(m, (d.points[t] ?? 0) / d.slots), 0);
    if (perSlot <= 0) return false;
    required += Math.ceil(deficit / perSlot);
    if (required > capacity) return false;
  }
  const limits = new Map(ctx.limits);
  for (const t of wanted.keys()) limits.delete(t);
  const solver = new DecoSolver({
    decorations: ctx.decorations,
    wanted,
    bad: query.allowBadSkills ? null : limits,
  });
  return solver.solve(bins, armor) !== null;
}

/** Sets found by earlier checks, tried before searching (most recent first). */
export type Witnesses = Piece[][];
const MAX_WITNESSES = 8;

/**
 * Does some set activate `skills` under `query`'s options? Null when the
 * check ran out of time. A set found by an earlier check that also works
 * with other decorations answers it without a search; pass the same
 * `witnesses` to every check of one query.
 */
export function anySet(
  data: SearchData,
  query: SearchQuery,
  skills: string[],
  timeLimitMs = DEFAULT_CHECK_MS,
  witnesses: Witnesses = [],
  ctx: CheckContext = checkContext(data, query),
): boolean | null {
  for (const [i, pieces] of witnesses.entries()) {
    if (regems(data, query, ctx, pieces, skills)) {
      // Keep the sets that answer most near the front.
      witnesses.splice(i, 1);
      witnesses.unshift(pieces);
      return true;
    }
  }
  const search = prepareSearch(data, { ...query, skills, limit: 1, timeLimitMs }, ctx.base);
  const result = search.run(SEARCH_ROUNDS - 1, { firstOnly: true });
  const set = result.sets[0];
  if (set) {
    witnesses.unshift(set.pieces);
    if (witnesses.length > MAX_WITNESSES) witnesses.pop();
    return true;
  }
  return result.timedOut ? null : false;
}

export function reachableSkills(
  data: SearchData,
  query: SearchQuery,
  options: ReachOptions = {},
): ReachResult {
  const time = options.checkTimeMs ?? DEFAULT_CHECK_MS;
  const candidates = reachCandidates(data.trees, query.skills);
  const witnesses: Witnesses = [];
  const ctx = checkContext(data, query);
  // With no set for the wanted skills, adding one can't help.
  if (query.skills.length > 0) {
    const base = anySet(data, query, query.skills, time, witnesses, ctx);
    if (base !== true) return { base: base === false ? "none" : "unsure", trees: [] };
  }
  const trees: ReachTree[] = [];
  candidates.forEach(({ tree, levels }, i) => {
    // The wanted skills, with this tree's (if any) replaced by the level tried.
    const others = query.skills.filter((n) => !tree.skills.some((s) => s.name === n));
    const reach: ReachTree = { tree: tree.tree, skills: [], unsure: false };
    for (const level of levels) {
      const ok = anySet(data, query, [...others, level], time, witnesses, ctx);
      if (ok === null) reach.unsure = true;
      if (!ok) break;
      reach.skills.push(level);
    }
    if (reach.skills.length > 0) trees.push(reach);
    options.onTree?.(reach, i + 1, candidates.length);
  });
  return { base: "ok", trees };
}
