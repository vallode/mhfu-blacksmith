/**
 * Weapons to go with a set search's result: the strongest weapons of a class
 * that have room for the jewels the search put in the weapon (at least its
 * weapon slots), and that the hunter can make at the search's rank and quest
 * progress.
 */
import { WEAPON_TYPES, type ArmorRank, type WeaponType } from "./constants";
import { GUILD_RANKS, isAvailable, type Tier } from "./min-rank";
import type { Weapon } from "./types";

const GUNNER_TYPES: readonly WeaponType[] = ["light-bowgun", "heavy-bowgun", "bow"];

/** The weapon classes a Blademaster or a Gunner uses, in the site's order. */
export function weaponTypesFor(hunterType: string): WeaponType[] {
  const gunner = hunterType === "Gunner";
  return WEAPON_TYPES.filter((t) => GUNNER_TYPES.includes(t) === gunner);
}

export interface WeaponSuggestQuery {
  /** The weapon slots the search assumed: suggestions have at least these. */
  slots: number;
  /** The search's armor rank: no weapon that needs a later rank. */
  rank: ArmorRank;
  /** The quest progress the search kept to, if any. */
  progress?: Tier | null;
  /** How many to suggest (default 8). */
  limit?: number;
}

/** Unused debug entries in the weapon data ("dummy (Pirate J Cannon)"). */
const isDummy = (w: Weapon) => w.name.toLowerCase().startsWith("dummy");

const withinRank = (needs: Tier | undefined, rank: ArmorRank) =>
  !needs || GUILD_RANKS.indexOf(needs.rank) <= GUILD_RANKS.indexOf(rank);

const affinity = (w: Weapon) => Number.parseInt(w.affinity ?? "0", 10) || 0;
const elementAttack = (w: Weapon) => (w.elements ?? []).reduce((n, e) => n + e.attack, 0);

/**
 * One class's weapons (a weapon bundle, all of one type) that fit the search,
 * best first: attack, then affinity, element, more slots and rarity. Attack
 * is only compared within a class, where its multiplier is the same.
 */
export function suggestWeapons(weapons: Weapon[], query: WeaponSuggestQuery): Weapon[] {
  return weapons
    .filter(
      (w) =>
        !isDummy(w) &&
        (w.slots ?? 0) >= query.slots &&
        withinRank(w.min_rank, query.rank) &&
        isAvailable(w.min_rank, query.progress ?? null),
    )
    .sort(
      (a, b) =>
        (b.attack ?? 0) - (a.attack ?? 0) ||
        affinity(b) - affinity(a) ||
        elementAttack(b) - elementAttack(a) ||
        (b.slots ?? 0) - (a.slots ?? 0) ||
        (b.rarity ?? 0) - (a.rarity ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, query.limit ?? 8);
}
