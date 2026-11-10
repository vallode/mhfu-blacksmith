/**
 * The weapon type the user last viewed, kept in localStorage so the main menu's
 * "Weapons" entry can open it directly instead of a list of types.
 */
import { WEAPON_TYPES, type WeaponType } from "./constants";

export const LAST_WEAPON_KEY = "mhfu_last_weapon";
export const DEFAULT_WEAPON: WeaponType = "great-sword";

export function readLastWeapon(): WeaponType {
  try {
    const value = localStorage.getItem(LAST_WEAPON_KEY);
    return WEAPON_TYPES.find((t) => t === value) ?? DEFAULT_WEAPON;
  } catch {
    return DEFAULT_WEAPON;
  }
}

export function writeLastWeapon(type: WeaponType): void {
  try {
    localStorage.setItem(LAST_WEAPON_KEY, type);
  } catch {
    // Ignore storage errors; the menu falls back to the default weapon.
  }
}
