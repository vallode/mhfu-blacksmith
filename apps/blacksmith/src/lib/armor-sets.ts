/**
 * Which pieces make up an armor set. The game has no such grouping (each
 * slot is its own table, and a set's pieces don't share IDs or models), so
 * it's matched here at build time from what a set's pieces do share: the
 * rank and rarity, the skill trees, the materials, and usually the first
 * word of the name ("Rathalos Helm", "Rathalos Mail"). Names alone don't do
 * it: the Leather set's legs are the Green Pants.
 *
 * A set is found through its chest piece: a piece in another slot picks the
 * chest that matches it best, and the chest picks the rest. The piece asked
 * about is always in its set, in its own slot; the rest are the chest's
 * picks. So the pieces a chest picks all come to that chest's set, but a
 * piece the chest passed over for its slot (a second helmet as good as the
 * first) shows the same set with itself in that slot.
 *
 * Helmets fit both hunter types, so a Blademaster's helm and a Gunner's cap
 * often match a chest equally well. The game lists a set's Blademaster piece
 * just before its Gunner one in every slot, so equal matches are taken in ID
 * order: the first of the equals goes with the first.
 */
import { ARMOR_SLOTS, type ArmorSlot } from "./constants";
import type { EquipRef } from "./schema";

/** What the matching reads of a piece. */
export interface SetPiece {
  /** The slot's armor ID; equal matches are told apart by it. */
  id: number;
  name: string;
  rank: string;
  rarity?: string | number;
  sex?: string;
  hunter_type?: string;
  skills?: { name: string }[];
  create_mats?: { name: string }[];
}

/** A set's piece in each slot, by name; null where nothing matched. */
export type ArmorSetNames = Record<ArmorSlot, string | null>;

/** Upgrade tier suffixes ("Rathalos Helm S", "Rathalos Mail U"). */
const TIER = /^(S|U|X|Z|D|G|R|\+)$/;
/** A tier on a name cut to the game's 20 characters ("Velociprey LeggingsS"). */
const GLUED_TIER = /[a-z]([SUXZDGR])$/;
/** The skill of a piece that copies its chest's skills, which matches any set. */
const TORSO_UP = "Torso Inc";

/** The lowest score a match must reach (see `score`). */
const MIN_SCORE = 3.5;

interface Prepared<T extends SetPiece> {
  piece: T;
  slot: ArmorSlot;
  first: string;
  tier: string;
  skills: Set<string>;
  mats: Set<string>;
  types: string[];
  sexes: string[];
}

function prepare<T extends SetPiece>(piece: T, slot: ArmorSlot): Prepared<T> {
  const words = piece.name.split(" ");
  const last = words.at(-1) ?? "";
  return {
    piece,
    slot,
    // "Hunter's Helm" goes with "Hunter Vambraces".
    first: (words[0] ?? "").replace(/'s$/, ""),
    tier: words.length > 1 && TIER.test(last) ? last : (GLUED_TIER.exec(last)?.[1] ?? ""),
    skills: new Set(piece.skills?.map((s) => s.name)),
    mats: new Set(piece.create_mats?.map((m) => m.name)),
    // "Blademaster/Gunner", "Male/Female"; absent means either.
    types: piece.hunter_type?.split("/") ?? [],
    sexes: piece.sex?.split("/") ?? [],
  };
}

const overlaps = (a: string[], b: string[]) =>
  a.length === 0 || b.length === 0 || a.some((x) => b.includes(x));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size > 0 && a.size === b.size && [...a].every((x) => b.has(x));

/** How well `b` goes with `a`; -Infinity when it can't be in the same set. */
function score(a: Prepared<SetPiece>, b: Prepared<SetPiece>): number {
  if (a.piece.rank !== b.piece.rank) return -Infinity;
  if (String(a.piece.rarity ?? "") !== String(b.piece.rarity ?? "")) return -Infinity;
  if (!overlaps(a.types, b.types) || !overlaps(a.sexes, b.sexes)) return -Infinity;
  if (a.tier !== b.tier) return -Infinity;
  return skillScore(a.skills, b.skills) + (a.first === b.first ? 2 : 0) + jaccard(a.mats, b.mats);
}

/**
 * Up to 6 for the skill trees. A piece with Torso Up, or with no skills (the
 * Black set), could go with any set, so it takes half: enough with the name
 * or the materials, not alone.
 */
function skillScore(a: Set<string>, b: Set<string>): number {
  const torsoUp = (x: Set<string>) => x.size === 1 && x.has(TORSO_UP);
  if (torsoUp(a) || torsoUp(b)) return 3;
  if (a.size === 0 || b.size === 0) return 3;
  return (sameSet(a, b) ? 3 : 0) + 3 * jaccard(a, b);
}

/**
 * The pieces of `a`'s slot that are its version for the other hunter type
 * (or sex): the same rank, rarity, name and tier, in ID order.
 */
function twins<T extends SetPiece>(a: Prepared<T>, slot: Prepared<T>[]): Prepared<T>[] {
  return slot
    .filter(
      (b) =>
        b.piece.rank === a.piece.rank &&
        String(b.piece.rarity ?? "") === String(a.piece.rarity ?? "") &&
        b.first === a.first &&
        b.tier === a.tier,
    )
    .sort((x, y) => x.piece.id - y.piece.id);
}

/**
 * Matches sets among `pieces`: `setOf(slot, i)` is the set of
 * `pieces[slot][i]`, null when it would be only that piece. A set is worked
 * out when first asked for, and the matches it reads are kept, so a page
 * that needs one piece's set doesn't match every other piece's.
 */
export function armorSetMatcher<T extends SetPiece>(
  pieces: Record<ArmorSlot, readonly T[]>,
): (slot: ArmorSlot, index: number) => ArmorSetNames | null {
  const prepared = Object.fromEntries(
    ARMOR_SLOTS.map((slot) => [slot, pieces[slot].map((p) => prepare(p, slot))]),
  ) as Record<ArmorSlot, Prepared<T>[]>;
  const ordinals = new Map<Prepared<T>, number>();
  const matches = new Map<Prepared<T>, Map<ArmorSlot, Prepared<T> | null>>();

  /** The piece of `slot` that goes best with `a`, or null if none goes well enough. */
  const best = (a: Prepared<T>, slot: ArmorSlot): Prepared<T> | null => {
    let byA = matches.get(a);
    if (!byA) matches.set(a, (byA = new Map()));
    const known = byA.get(slot);
    if (known !== undefined) return known;
    let top = -Infinity;
    let tied: Prepared<T>[] = [];
    for (const b of prepared[slot]) {
      const s = score(a, b);
      if (s < MIN_SCORE) continue;
      if (s > top + 1e-9) {
        top = s;
        tied = [b];
      } else if (s > top - 1e-9) tied.push(b);
    }
    let found = tied[0] ?? null;
    if (tied.length > 1) {
      tied.sort((x, y) => x.piece.id - y.piece.id);
      let ordinal = ordinals.get(a);
      if (ordinal === undefined) {
        ordinal = Math.max(twins(a, prepared[a.slot]).indexOf(a), 0);
        ordinals.set(a, ordinal);
      }
      found = tied[Math.min(ordinal, tied.length - 1)]!;
    }
    byA.set(slot, found);
    return found;
  };

  return (slot, index) => {
    const a = prepared[slot][index];
    if (!a) return null;
    const chest = slot === "plate" ? a : best(a, "plate");
    // Without a chest, the piece picks the rest itself.
    const from = chest ?? a;
    const set = {} as ArmorSetNames;
    let count = 0;
    for (const other of ARMOR_SLOTS) {
      const match = other === slot ? a : other === "plate" && chest ? chest : best(from, other);
      set[other] = match?.piece.name ?? null;
      if (match) count++;
    }
    return count > 1 ? set : null;
  };
}

/**
 * Every piece's set, in the order `pieces` lists them: `sets[slot][i]` is
 * the set of `pieces[slot][i]`, null when it would be only that piece.
 */
export function matchArmorSets<T extends SetPiece>(
  pieces: Record<ArmorSlot, readonly T[]>,
): Record<ArmorSlot, (ArmorSetNames | null)[]> {
  const setOf = armorSetMatcher(pieces);
  return Object.fromEntries(
    ARMOR_SLOTS.map((slot) => [slot, pieces[slot].map((_, i) => setOf(slot, i))]),
  ) as Record<ArmorSlot, (ArmorSetNames | null)[]>;
}

/**
 * Each piece's game ID: its index in the slot's equipment ID table
 * (equipment-ids.json's `EquipRef`s), found by slug where the table gives
 * one (pieces sold per sex under one name), else by name. A piece missing
 * from the table sorts last.
 */
export function armorGameIds(
  table: readonly (EquipRef | null)[],
  pieces: readonly { name: string; slug: string }[],
): number[] {
  const byKey = new Map<string, number>();
  table.forEach((ref, id) => {
    if (ref) byKey.set(ref[3] ?? ref[1], id);
  });
  return pieces.map((p) => byKey.get(p.slug) ?? byKey.get(p.name) ?? Number.MAX_SAFE_INTEGER);
}
