/**
 * The game facts the site's pages are built on, from the game's config in
 * game-data (`game-data/games`), which the extractor shares. The site shows
 * MHFU, the only game with data so far; these are its lists.
 */
import { MHFU_GAME } from "game-data/games";

/** The game whose pages these are. */
export const SITE_GAME = MHFU_GAME;

type Game = typeof SITE_GAME;

export type WeaponType = Game["weaponClasses"][number]["slug"];
export type ArmorSlot = Game["armorSlots"][number];
export type ArmorRank = Game["ranks"][number];
export type MonsterCategory = Game["monsterCategories"][number];

/** The weapon types, in the game's menu order. */
export const WEAPON_TYPES: readonly WeaponType[] = SITE_GAME.weaponClasses.map((w) => w.slug);

export const ARMOR_SLOTS: readonly ArmorSlot[] = SITE_GAME.armorSlots;

export const ARMOR_RANKS: readonly ArmorRank[] = SITE_GAME.ranks;

export const MONSTER_CATEGORIES: readonly MonsterCategory[] = SITE_GAME.monsterCategories;

/** Each weapon type's class multiplier: displayed attack is true attack times this. */
export const WEAPON_CLASS_MULTIPLIER: Record<string, number> = Object.fromEntries(
  SITE_GAME.weaponClasses.map((w) => [w.slug, w.multiplier]),
);
