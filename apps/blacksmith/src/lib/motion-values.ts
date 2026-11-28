import type { WeaponType } from "./constants";
import type { ShotsFile } from "./shots";

/** One hit of a move: its motion value, and Dual Blades' value in Demon Mode. */
export interface MotionHit {
  row: number;
  motion_value: number;
  demon_mode?: number;
  /** How many times the move deals this hit, when more than once. */
  count?: number;
  /** Dual Blades: the blade it strikes with, which carries a dual-element weapon's first or second element. */
  blade?: 1 | 2;
}

/**
 * The percentages a move's hits weigh a monster part's cut and impact
 * hitzones by. The larger weighted value is the hitzone the hit uses.
 */
export interface HitzoneWeights {
  cut: number;
  impact: number;
}

/** A weapon type's move, keyed by `move` (named in `t.motionValues.moves`). */
export interface MotionMove {
  move: string;
  /** Dual Blades: a move done only in Demon Mode. */
  demon?: true;
  hitzone_weights: HitzoneWeights;
  /** Long Sword: the weights while the spirit gauge glows. */
  glow_hitzone_weights?: HitzoneWeights;
  /** Lance: the charge's weights once it runs at full speed. */
  charge_hitzone_weights?: HitzoneWeights;
  hits: MotionHit[];
}

/**
 * data/motion-values.json; public/data/motion-values.json is its `weapons`
 * and public/data/shots.json its bowgun shots.
 */
export interface MotionValuesFile extends ShotsFile {
  demon_mode_multiplier: number;
  /** The Bowguns have none: their calculator shows their shots (`./shots`). */
  weapons: Partial<Record<WeaponType, MotionMove[]>>;
}

/** A hit's value, in Demon Mode where asked and the hit has one. */
const hitValue = (hit: MotionHit, demon: boolean) =>
  demon ? (hit.demon_mode ?? hit.motion_value) : hit.motion_value;

/**
 * The moves shown with Demon Mode on or off: Demon Mode moves only with it
 * on. Weapons other than Dual Blades have no Demon Mode and show them all.
 */
export const movesIn = (moves: MotionMove[], demon: boolean) =>
  moves.filter((m) => demon || !m.demon);

/** Every hit's value, a hit dealt N times listed N times. */
export function hitValues(move: MotionMove, demon = false): number[] {
  return move.hits.flatMap((h) => Array<number>(h.count ?? 1).fill(hitValue(h, demon)));
}

/** The sum of a move's hits. */
export const moveTotal = (move: MotionMove, demon = false) =>
  hitValues(move, demon).reduce((a, b) => a + b, 0);

/** Whether any move has Demon Mode values (Dual Blades). */
export const hasDemonMode = (moves: MotionMove[]) =>
  moves.some((m) => m.hits.some((h) => h.demon_mode !== undefined));

/** Whether any move hits harder while the spirit gauge glows (Long Sword). */
export const hasSpiritGlow = (moves: MotionMove[]) =>
  moves.some((m) => m.glow_hitzone_weights !== undefined);

/** A move's hitzone weights, with the spirit gauge glowing or the charge at full speed where asked. */
export const moveWeights = (
  move: MotionMove,
  { glow = false, fullSpeed = false }: { glow?: boolean; fullSpeed?: boolean } = {},
) =>
  (glow && move.glow_hitzone_weights) ||
  (fullSpeed && move.charge_hitzone_weights) ||
  move.hitzone_weights;

/** Raw damage multiplier of each sharpness colour, red to purple. */
export const SHARPNESS_MULTIPLIERS = [0.5, 0.75, 1, 1.125, 1.25, 1.3, 1.5];

/**
 * Sharpness for the gunners' melee hits, from a static read of the hit code
 * (EU game_sub 0x09C439F8), not checked in game. The Bow's take none (1);
 * its branch gives 1.3 instead to attacks whose kind (their vtable +0x18)
 * is 5, and which attacks those are is unknown. (The Bowguns' melee bash
 * isn't listed: their calculator shows their shots.)
 */
export const GUNNER_MELEE_SHARPNESS: Partial<Record<WeaponType, number>> = { bow: 1 };

/** A monster part's cut and impact hitzones. */
export interface PartHitzones {
  cut: number;
  bash: number;
}

/**
 * The hitzone a hit uses on a part: the larger of its cut and impact
 * values, each weighted by the move's percentage (EU game_sub 0x09C43A94).
 */
export const weightedHitzone = (zone: PartHitzones, w: HitzoneWeights) =>
  Math.max(zone.cut * w.cut, zone.bash * w.impact) / 100;

/**
 * One hit's raw damage on a monster: true attack × motion value × sharpness
 * × hitzone, rounded down (before affinity, element and the quest's defense).
 */
export const hitDamage = (trueAttack: number, mv: number, sharpness: number, hitzone: number) =>
  Math.floor((trueAttack * mv * sharpness * hitzone) / 10000);

/**
 * Element damage multiplier of each sharpness colour, red to purple (EU
 * game_sub 0x09CF9754, beside the raw table). The Bow's melee hits take 1,
 * as their raw sharpness.
 */
export const ELEMENT_SHARPNESS_MULTIPLIERS = [0.25, 0.5, 0.75, 1, 1.0625, 1.125, 1.2];

/** Single-precision, as the game's floats. */
const f = Math.fround;

/**
 * One hit's element damage on a part: its element (a tenth of what the
 * game shows) × the part's hitzone for that element / 100 × the element
 * sharpness multiplier, truncated (EU game_sub 0x09C43458: the reads at
 * 0x09C4383C, the sum at 0x09C44700). It adds to the raw damage, which is
 * truncated on its own.
 */
export const elementHitDamage = (element: number, hitzone: number, sharpness: number) =>
  Math.trunc(f(f(sharpness) * f(f(element) * f(hitzone / 100))));

/** Affinity's effect on a hit's motion value: a critical hit, or a negative one. */
export type HitKind = "normal" | "critical" | "weak";

/**
 * A motion value after affinity: × 1.25 for a critical hit, × 0.75 for a
 * negative one, in floats and stored back as a byte (EU game_task's swing
 * builder, from 0x09B687C4). Element doesn't change.
 */
export function affinityMotion(mv: number, kind: HitKind): number {
  if (kind === "normal") return mv;
  return Math.min(255, Math.trunc(f(mv * f(kind === "critical" ? 1.25 : 0.75))));
}

/** A weapon's element as a hit carries it: the type and a tenth of the shown value, after skills. */
export interface HitElement {
  type: "fire" | "water" | "thunder" | "ice" | "dragon";
  value: number;
}

/** A part's hitzones for a move's hits: cut, impact and each element. */
export type StruckZone = PartHitzones & Record<HitElement["type"], number>;

/**
 * A hit's damage times the quest's defense multiplier for the monster,
 * truncated (community formula, not traced in the game).
 */
export const defended = (damage: number, defense: number) =>
  defense === 1 ? damage : Math.trunc(f(damage * f(defense)));

/**
 * A move's damage on a part, each hit's raw and element damage truncated
 * on their own and summed over its hits: the raw share and the element's.
 * `elementOf` gives the element a hit carries (a dual-element weapon's
 * differs by blade), or null.
 */
export function moveDamage(
  move: MotionMove,
  {
    attack,
    sharpness,
    elementSharpness,
    elementOf,
    zone,
    demon = false,
    glow = false,
    fullSpeed = false,
    hit = "normal",
    defense = 1,
  }: {
    attack: number;
    sharpness: number;
    elementSharpness: number;
    elementOf: (hit: MotionHit) => HitElement | null;
    zone: StruckZone;
    demon?: boolean;
    glow?: boolean;
    fullSpeed?: boolean;
    hit?: HitKind;
    /** The quest's defense multiplier for the monster: each hit's damage times it, truncated. */
    defense?: number;
  },
): { raw: number; element: number } {
  const weighted = weightedHitzone(zone, moveWeights(move, { glow, fullSpeed }));
  let raw = 0;
  let element = 0;
  for (const h of move.hits) {
    const n = h.count ?? 1;
    const r = hitDamage(attack, affinityMotion(hitValue(h, demon), hit), sharpness, weighted);
    const e = elementOf(h);
    const el = e ? elementHitDamage(e.value, zone[e.type], elementSharpness) : 0;
    // The defense multiplies the hit's sum; the raw part shows scaled on its
    // own, and the element takes the rest, so the two still add up.
    const total = defended(r + el, defense);
    const rawPart = Math.min(defended(r, defense), total);
    raw += n * rawPart;
    element += n * (total - rawPart);
  }
  return { raw, element };
}
