/**
 * The hunter's buffs in the damage calculator: skills, items, Hunting Horn
 * songs and Felyne Kitchen skills, and how they change a weapon's true
 * attack, affinity and element. Pure, for client components. Read from the
 * EU disc's code (a static read, not checked in game):
 *
 * - True attack: EBOOT 0x088D8ED4 (stored to the hunter's +0x380 at
 *   0x088D92E0). The weapon's true raw, plus Powercharm and Powertalon, the
 *   Demondrug slot and the seed slot (one value each, the last item used
 *   wins), the Long Sword's spirit glow, then one Attack Up or Down skill;
 *   then × the Horn's Attack Up and × a low-health skill, each multiply in
 *   floats and truncated.
 * - Affinity: the getter 0x088DA398 (kind 8): the weapon's, plus one
 *   Expert or Critical Eye skill; then, when it's above 0 and the weapon a
 *   melee one, +5 in blue sharpness and +10 in white or purple.
 * - Element: the getter's 0x088DA740, a tenth of what the game shows ×
 *   Element Attack Up, then × the Horn's Elemental Attack Up, each
 *   truncated; the swing builder (game_task 0x09B6834C) then gives Dual
 *   Blades × 0.7, and their rows 101 to 108 × 0.7 again.
 */
import type { HitElement } from "./motion-values";

/** Single-precision, as the game's floats. */
const f = Math.fround;

/** Attack Up and Down skills: only one counts, each adding this to true attack. Edgemaster counts as Attack Up (L). */
export const ATTACK_SKILLS = {
  none: 0,
  "up-s": 10,
  "up-m": 15,
  "up-l": 20,
  "down-s": -5,
  "down-m": -10,
  "down-l": -15,
} as const;
export type AttackSkill = keyof typeof ATTACK_SKILLS;

/** Demondrug and Mega Demondrug, by their English names: one value, the higher one used (the hunter's +0x38A). */
export const DEMONDRUGS = { none: 0, Demondrug: 3, "Mega Demondrug": 5 } as const;
export type Demondrug = keyof typeof DEMONDRUGS;

/**
 * Power Seed, Power Pill and Demon Flute share one value (+0x3D4): the last
 * one used replaces the others. Keyed by the items' English names.
 */
export const SEEDS = { none: 0, "Power Seed": 10, "Power Pill": 25, "Demon Flute": 10 } as const;
export type Seed = keyof typeof SEEDS;

/**
 * The Horn's Attack Up, by the song's level (+0x5F8): (S) gives level 1,
 * played again 2; (L) gives 3, played again 4.
 */
export const HORN_ATTACK = { none: 1, s: 1.1, "s-again": 1.15, l: 1.15, "l-again": 1.2 } as const;
export type HornAttack = keyof typeof HORN_ATTACK;

/**
 * Low-health skills, at 40% health or less: Adrenaline+2 (or Fury) × 1.3,
 * Worry × 0.7. Felyne Heroics, a Felyne Kitchen skill, gives × 1.35 at 10
 * health or less instead (and wins over Adrenaline+2).
 */
export const LOW_HEALTH = { none: 1, adrenaline: 1.3, heroics: 1.35, worry: 0.7 } as const;
export type LowHealth = keyof typeof LOW_HEALTH;

/** Expert and Critical Eye skills (Expert and Critical Eye's trees): one counts. */
export const AFFINITY_SKILLS = {
  none: 0,
  "up-1": 10,
  "up-2": 20,
  "up-3": 30,
  "down-1": -5,
  "down-2": -10,
  "down-3": -15,
} as const;
export type AffinitySkill = keyof typeof AFFINITY_SKILLS;

/** The Horn's Elemental Attack Up (+0x6CC bit 0x2000, level +0x606): × 1.15, played again × 1.2. */
export const HORN_ELEMENT = { none: 1, once: 1.15, again: 1.2 } as const;
export type HornElement = keyof typeof HORN_ELEMENT;

/** Element Attack Up (skill 68). */
export const ELEMENT_ATTACK_UP = 1.2;

export interface Buffs {
  attackSkill: AttackSkill;
  powercharm: boolean;
  powertalon: boolean;
  demondrug: Demondrug;
  seed: Seed;
  hornAttack: HornAttack;
  lowHealth: LowHealth;
  affinitySkill: AffinitySkill;
  elementAttack: boolean;
  hornElement: HornElement;
  /** Sharpness +1: the calculator starts on that bar. */
  sharpnessPlus: boolean;
}

export const NO_BUFFS: Buffs = {
  attackSkill: "none",
  powercharm: false,
  powertalon: false,
  demondrug: "none",
  seed: "none",
  hornAttack: "none",
  lowHealth: "none",
  affinitySkill: "none",
  elementAttack: false,
  hornElement: "none",
  sharpnessPlus: false,
};

/** A multiply in floats, truncated, as the game does each one. */
const scale = (n: number, by: number) => Math.trunc(f(f(n) * f(by)));

/**
 * The true attack with buffs, from the weapon's true raw. `spiritGlow`:
 * a Long Sword's spirit gauge glowing (+10).
 */
export function buffedAttack(raw: number, b: Buffs, { spiritGlow = false } = {}): number {
  let a =
    raw +
    (b.powercharm ? 6 : 0) +
    (b.powertalon ? 9 : 0) +
    DEMONDRUGS[b.demondrug] +
    SEEDS[b.seed] +
    (spiritGlow ? 10 : 0) +
    ATTACK_SKILLS[b.attackSkill];
  if (b.hornAttack !== "none") a = scale(a, HORN_ATTACK[b.hornAttack]);
  if (b.lowHealth !== "none") a = scale(a, LOW_HEALTH[b.lowHealth]);
  return Math.max(1, a);
}

/** Affinity in percent with skills and, for a melee weapon, its sharpness colour (0 red to 6 purple). */
export function buffedAffinity(weapon: number, b: Buffs, sharpness: number | null): number {
  const a = weapon + AFFINITY_SKILLS[b.affinitySkill];
  if (a <= 0 || sharpness === null) return a;
  return a + (sharpness === 4 ? 5 : sharpness >= 5 ? 10 : 0);
}

/** Dual Blades' element: × 0.7 on every hit, and again on rows 101 to 108 (Lunging Slash, Demon Dance's last two). */
export const DUAL_BLADES_ELEMENT = 0.7;
const TWICE_SCALED_ROWS = [101, 108] as const;

/**
 * A hit's element after skills and the Horn: `shown` is the value the
 * game shows (350), the hit carries a tenth of it. Dual Blades' (`dualBlades`)
 * is scaled down, twice on `row`s 101 to 108.
 */
export function hitElementValue(
  shown: number,
  b: Buffs,
  { dualBlades = false, row = 0 }: { dualBlades?: boolean; row?: number } = {},
): number {
  let v = Math.trunc(shown / 10);
  if (b.elementAttack) v = scale(v, ELEMENT_ATTACK_UP);
  if (b.hornElement !== "none") v = scale(v, HORN_ELEMENT[b.hornElement]);
  if (dualBlades) {
    v = scale(v, DUAL_BLADES_ELEMENT);
    if (row >= TWICE_SCALED_ROWS[0] && row <= TWICE_SCALED_ROWS[1])
      v = scale(v, DUAL_BLADES_ELEMENT);
  }
  return Math.min(255, v);
}

/** The elements that deal damage, by the data's names. */
const ELEMENT_TYPES: Record<string, HitElement["type"]> = {
  Fire: "fire",
  Water: "water",
  Thunder: "thunder",
  Ice: "ice",
  Dragon: "dragon",
};

/** One of a weapon's attributes: a damaging element's type, or null for a status. */
export interface WeaponAttribute {
  type: HitElement["type"] | null;
  shown: number;
}

/** A weapon's attributes in order (two for a dual-element Dual Blades), statuses as null. */
export const weaponAttributes = (
  elements: { name: string; attack: number }[] | null | undefined,
): WeaponAttribute[] =>
  (elements ?? []).map((e) => ({ type: ELEMENT_TYPES[e.name] ?? null, shown: e.attack }));

/**
 * The element a hit carries, or null: a dual-attribute weapon's hit takes
 * the attribute of its blade (`blade` 1 the first, 2 the second), and a
 * status deals no element damage.
 */
export function hitElement(
  attributes: WeaponAttribute[],
  b: Buffs,
  hit: { row: number; blade?: 1 | 2 },
  dualBlades: boolean,
): HitElement | null {
  const a = attributes.length > 1 ? attributes[(hit.blade ?? 1) - 1] : attributes[0];
  if (!a?.type) return null;
  return { type: a.type, value: hitElementValue(a.shown, b, { dualBlades, row: hit.row }) };
}
