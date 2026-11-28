/**
 * Bowgun shot damage: the damage calculator's Shots table. Pure, for client
 * components. How the game works it out is a static read of the EU disc's
 * code (packages/mhfu-extract `tables/shots.ts`), not checked in game, and
 * leaves out skills, rapid fire, the monster's state and the quest's defense.
 */
import { defended } from "./motion-values";
import type { Weapon } from "./types";

/** The element columns of a monster part's hitzones. */
export type ShotElement = "fire" | "water" | "thunder" | "ice" | "dragon";
export const SHOT_ELEMENTS: readonly ShotElement[] = ["fire", "water", "thunder", "ice", "dragon"];

/** A bowgun ammo that deals damage (data/motion-values.json `shots`). */
export interface ShotValue {
  /** The game's shot ID. */
  shot: number;
  /** The ammo's name and level, as the weapons' ammo lists give them. */
  ammo: string;
  level: number;
  motion_value: number;
  /** How many times it hits (a pierce shot's hits, Pellet S's pellets), when more than once. */
  hits?: number;
  element?: { type: ShotElement; value: number; attack_scaled?: true };
  /** What it bursts into after it hits: Crag S's explosion, Clust S's bomblets. */
  explosion?: ShotExplosion;
}

/**
 * An explosion's attack: fixed damage, as its hits read no shot hitzone and
 * no bowgun multiplier, plus its element on that element's hitzone.
 */
export interface ShotExplosion {
  /** Its damage, or with `attack_scaled` a motion value scaled like a shot's. */
  power: number;
  attack_scaled?: true;
  /** How many: Clust S's bomblets. */
  hits?: number;
  element?: { type: ShotElement; value: number };
}

/** public/data/shots.json: data/motion-values.json's shots. */
export interface ShotsFile {
  bowgun_shot_multiplier: number;
  shots: ShotValue[];
}

/** A monster part's shot and element hitzones. */
export type ShotHitzones = { shot: number } & Record<ShotElement, number>;

/** The weapon's capacity lists, each ammo's levels in order. */
const ammoLists = (w: Weapon) => [w.ammo, w.status_ammo, w.element_ammo, w.misc_ammo];

/** Whether the bowgun loads the shot (a capacity above 0 for its level). */
export const loadsShot = (w: Weapon, s: ShotValue) =>
  ammoLists(w).some((list) =>
    list?.some((a) => a.name === s.ammo && Number(a.capacity[s.level - 1] ?? 0) > 0),
  );

/** Single-precision, as the game's floats. */
const f = Math.fround;

/**
 * A value scaled by true attack / 100 (hunter +0x380), truncated and held to
 * 1–255, as a bullet's power and attack-scaled element are (EU game_task
 * 0x09B703C8).
 */
export const shotPower = (trueAttack: number, value: number) =>
  Math.min(255, Math.max(1, Math.trunc(f(value * f(trueAttack / 100)))));

/**
 * One hit of a shot on a part: its power × the shot hitzone × the bowgun
 * multiplier, truncated, plus its element × that element's hitzone,
 * truncated (EU game_sub 0x09C441A8 and on).
 */
export function shotHitDamage(
  trueAttack: number,
  s: ShotValue,
  zone: ShotHitzones,
  multiplier: number,
): number {
  const raw = Math.trunc(
    f(f(multiplier) * f(shotPower(trueAttack, s.motion_value) * f(zone.shot / 100))),
  );
  const e = s.element;
  if (!e) return raw;
  const element = e.attack_scaled ? shotPower(trueAttack, e.value) : e.value;
  return raw + elementDamage(element, zone[e.type]);
}

/** An element value's damage on its hitzone, truncated. */
const elementDamage = (value: number, zone: number) => Math.trunc(f(value * f(zone / 100)));

/**
 * One of a shot's explosions: its power as it is, or scaled by true attack
 * like a shot's (Clust S's bomblets), plus its element (EU game_sub: an
 * attack off the shot path multiplies its power by 1).
 */
export function explosionHitDamage(trueAttack: number, e: ShotExplosion, zone: ShotHitzones) {
  const power = e.attack_scaled ? shotPower(trueAttack, e.power) : e.power;
  return power + (e.element ? elementDamage(e.element.value, zone[e.element.type]) : 0);
}

/** A shot's damage over all its hits, and every explosion's after them. */
export const shotDamage = (
  trueAttack: number,
  s: ShotValue,
  zone: ShotHitzones,
  multiplier: number,
  /** The quest's defense multiplier for the monster, on each hit. */
  defense = 1,
) =>
  defended(shotHitDamage(trueAttack, s, zone, multiplier), defense) * (s.hits ?? 1) +
  (s.explosion
    ? // A fixed explosion (Crag S's) is left unscaled, as it ignores attack
      // and hitzone; whether the game applies the defense to it is unchecked.
      (s.explosion.attack_scaled
        ? defended(explosionHitDamage(trueAttack, s.explosion, zone), defense)
        : explosionHitDamage(trueAttack, s.explosion, zone)) * (s.explosion.hits ?? 1)
    : 0);
