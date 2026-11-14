/**
 * A hand-built armor set, as the set builder's editor holds it: a piece (or
 * nothing) per armor slot, decorations placed in the weapon's and pieces'
 * slots, and the hunter it's for. Pure helpers to edit and check one; the
 * stats come from evaluateSet (set-search.ts), like the search's results.
 */
import { ARMOR_SLOTS, type ArmorSlot } from "./constants";
import {
  evaluateSet,
  type ArmorSet,
  type DecoBin,
  type Deco,
  type Piece,
  type PlacedDeco,
  type SearchData,
  type SearchQuery,
} from "./set-search";

export const MAX_WEAPON_SLOTS = 3;

export interface BuildSet {
  /** One entry per slot, in ARMOR_SLOTS order; null = nothing equipped. */
  pieces: (Piece | null)[];
  decorations: PlacedDeco[];
  weaponSlots: number;
  hunterType: SearchQuery["hunterType"];
  sex: SearchQuery["sex"];
}

export function emptyBuild(
  hunterType: BuildSet["hunterType"] = "Blademaster",
  sex: BuildSet["sex"] = "Male",
  weaponSlots = 0,
): BuildSet {
  return { pieces: ARMOR_SLOTS.map(() => null), decorations: [], weaponSlots, hunterType, sex };
}

/** A search result as a set to edit. */
export function buildFromResult(
  set: Pick<ArmorSet, "pieces" | "decorations">,
  query: Pick<SearchQuery, "weaponSlots" | "hunterType" | "sex">,
): BuildSet {
  return {
    pieces: ARMOR_SLOTS.map((slot) => set.pieces.find((p) => p.slot === slot) ?? null),
    decorations: set.decorations.map((d) => ({ ...d })),
    weaponSlots: query.weaponSlots,
    hunterType: query.hunterType,
    sex: query.sex,
  };
}

/**
 * English slot names, for validateBuild's messages and the link previews
 * (set-embed.ts), which stay English. The page shows translated ones.
 */
export const BIN_LABELS: Record<DecoBin, string> = {
  weapon: "Weapon",
  helmet: "Head",
  plate: "Chest",
  gauntlets: "Arms",
  waist: "Waist",
  leggings: "Legs",
};

export function pieceIn(set: BuildSet, slot: ArmorSlot): Piece | null {
  return set.pieces[ARMOR_SLOTS.indexOf(slot)] ?? null;
}

/** The slots a bin has: the weapon's, or its piece's (0 when the slot is empty). */
export function binSlots(set: BuildSet, bin: DecoBin): number {
  return bin === "weapon" ? set.weaponSlots : (pieceIn(set, bin)?.slots ?? 0);
}

export function usedSlots(set: Pick<BuildSet, "decorations">, bin: DecoBin): number {
  return set.decorations.reduce((n, d) => (d.bin === bin ? n + d.deco.slots : n), 0);
}

export function freeSlotsIn(set: BuildSet, bin: DecoBin): number {
  return binSlots(set, bin) - usedSlots(set, bin);
}

/** Keep each bin's decorations, in order, while they fit its slots. */
function fitDecorations(set: BuildSet): BuildSet {
  const used = new Map<DecoBin, number>();
  const decorations = set.decorations.filter((d) => {
    const n = (used.get(d.bin) ?? 0) + d.deco.slots;
    if (n > binSlots(set, d.bin)) return false;
    used.set(d.bin, n);
    return true;
  });
  return decorations.length === set.decorations.length ? set : { ...set, decorations };
}

/** Equip `piece` (or nothing) in `slot`. Decorations that no longer fit come off. */
export function withPiece(set: BuildSet, slot: ArmorSlot, piece: Piece | null): BuildSet {
  const i = ARMOR_SLOTS.indexOf(slot);
  const pieces = set.pieces.map((p, j) => (j === i ? piece : p));
  return fitDecorations({ ...set, pieces });
}

export function withWeaponSlots(set: BuildSet, weaponSlots: number): BuildSet {
  return fitDecorations({ ...set, weaponSlots });
}

/** Add a decoration to a bin; unchanged if it doesn't fit. */
export function withDecoration(set: BuildSet, bin: DecoBin, deco: Deco): BuildSet {
  if (freeSlotsIn(set, bin) < deco.slots) return set;
  return { ...set, decorations: [...set.decorations, { deco, bin }] };
}

/** Remove the `index`th decoration of `set.decorations`. */
export function withoutDecoration(set: BuildSet, index: number): BuildSet {
  return { ...set, decorations: set.decorations.filter((_, i) => i !== index) };
}

/** Stats for the set: what evaluateSet gives the search's results. */
export function evaluateBuild(
  data: SearchData,
  set: BuildSet,
  wanted: string[] = [],
): Omit<ArmorSet, "alternatives"> {
  const pieces = set.pieces.filter((p): p is Piece => p !== null);
  // Decorations in an empty slot (a broken shared set) count for nothing.
  const decorations = set.decorations.filter((d) => binSlots(set, d.bin) > 0);
  return evaluateSet(data, pieces, decorations, set.weaponSlots, wanted);
}

export function suitsHunter(
  piece: Piece,
  hunterType: BuildSet["hunterType"],
  sex: BuildSet["sex"],
): boolean {
  return (
    (piece.hunterType === "Both" || piece.hunterType === hunterType) &&
    (piece.sex === "Both" || piece.sex === sex)
  );
}

/**
 * A problem with a set, as data, so the page can say it in the site's
 * language. Piece names are English (the data's names).
 */
export type SetProblem =
  | { kind: "weapon-slots"; max: number; slots: number }
  | { kind: "wrong-slot"; piece: string; is: ArmorSlot; slot: ArmorSlot }
  | { kind: "hunter-type"; piece: string; hunterType: BuildSet["hunterType"] }
  | { kind: "sex"; piece: string; sex: BuildSet["sex"] }
  | { kind: "torso-up"; piece: string }
  | { kind: "empty-slot"; bin: DecoBin }
  /** `piece` is null for the weapon. */
  | { kind: "too-many-decorations"; piece: string | null; used: number; has: number };

export interface SetWarning {
  /** The part of the set it's about, if any. */
  bin?: DecoBin;
  problem: SetProblem;
  /** The problem in English. */
  message: string;
}

/** A SetProblem in English. */
function describeProblem(p: SetProblem): string {
  switch (p.kind) {
    case "weapon-slots":
      return `A weapon has at most ${p.max} slots, not ${p.slots}.`;
    case "wrong-slot":
      return `${p.piece} is ${BIN_LABELS[p.is].toLowerCase()} armor, not ${BIN_LABELS[p.slot].toLowerCase()}.`;
    case "hunter-type":
      return `${p.piece} is ${p.hunterType} armor.`;
    case "sex":
      return `${p.piece} is only for ${p.sex.toLowerCase()} hunters.`;
    case "torso-up":
      return `${p.piece} has Torso Up, which copies the chest piece's skills: there is none.`;
    case "empty-slot":
      return `There are decorations in the ${BIN_LABELS[p.bin].toLowerCase()} slot, which is empty. They don't count.`;
    case "too-many-decorations":
      return `The decorations in ${p.piece ?? "the weapon"} need ${p.used} slots; it has ${p.has}.`;
  }
}

/**
 * What's wrong with a set: pieces the hunter can't wear or in the wrong slot,
 * decorations that don't fit. The editor only makes valid sets; shared and
 * saved ones may not be (or may stop being after a data change).
 */
export function validateBuild(set: BuildSet): SetWarning[] {
  const warnings: SetWarning[] = [];
  const warn = (bin: DecoBin, problem: SetProblem) =>
    warnings.push({ bin, problem, message: describeProblem(problem) });
  if (set.weaponSlots < 0 || set.weaponSlots > MAX_WEAPON_SLOTS) {
    warn("weapon", { kind: "weapon-slots", max: MAX_WEAPON_SLOTS, slots: set.weaponSlots });
  }
  ARMOR_SLOTS.forEach((slot, i) => {
    const p = set.pieces[i];
    if (!p) return;
    if (p.slot !== slot) {
      warn(slot, { kind: "wrong-slot", piece: p.name, is: p.slot, slot });
    }
    if (p.hunterType !== "Both" && p.hunterType !== set.hunterType) {
      warn(slot, {
        kind: "hunter-type",
        piece: p.name,
        hunterType: p.hunterType as BuildSet["hunterType"],
      });
    }
    if (p.sex !== "Both" && p.sex !== set.sex) {
      warn(slot, { kind: "sex", piece: p.name, sex: p.sex as BuildSet["sex"] });
    }
    if (p.torsoUp && slot !== "plate" && !pieceIn(set, "plate")) {
      warn(slot, { kind: "torso-up", piece: p.name });
    }
  });
  const bins: DecoBin[] = ["weapon", ...ARMOR_SLOTS];
  for (const bin of bins) {
    const used = usedSlots(set, bin);
    if (used === 0) continue;
    const has = binSlots(set, bin);
    const piece = bin === "weapon" ? null : pieceIn(set, bin);
    if (bin !== "weapon" && !piece) {
      warn(bin, { kind: "empty-slot", bin });
    } else if (used > has) {
      warn(bin, { kind: "too-many-decorations", piece: piece?.name ?? null, used, has });
    }
  }
  return warnings;
}
