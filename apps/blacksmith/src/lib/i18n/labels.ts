/**
 * Type guards for indexing the shared vocabulary in the `common` messages
 * with ids that arrive as plain strings (from data or URLs).
 */
import { ARMOR_RANKS, ARMOR_SLOTS, MONSTER_CATEGORIES, WEAPON_TYPES } from "../constants";
import type { ArmorRank, ArmorSlot, MonsterCategory, WeaponType } from "../constants";

const has = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

export const isRank = (v: unknown): v is ArmorRank => has(ARMOR_RANKS, v);
export const isArmorSlot = (v: unknown): v is ArmorSlot => has(ARMOR_SLOTS, v);
export const isWeaponType = (v: unknown): v is WeaponType => has(WEAPON_TYPES, v);
export const isMonsterCategory = (v: unknown): v is MonsterCategory => has(MONSTER_CATEGORIES, v);
