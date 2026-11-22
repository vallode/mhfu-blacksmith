/**
 * The weapon type the user last viewed, kept in localStorage so the main menu's
 * "Weapons" entry can open it directly instead of a list of types.
 */
import { WEAPON_TYPES, type WeaponType } from "./constants";

export const LAST_WEAPON_KEY = "mhfu_last_weapon";
export const DEFAULT_WEAPON: WeaponType = "great-sword";

/** The pages that open the last weapon type viewed: `/` and `/blacksmith/`. */
export const LAST_WEAPON_PATHS = ["/", "/blacksmith/"];

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

/**
 * An inline script for the document head. `/` and `/blacksmith/` are built
 * as the default weapon's tree page, so a first visit paints it straight
 * away; for a visitor who last viewed another type, this sends the browser
 * to that type's page before any of the default one is drawn, instead of
 * waiting for the app to load and redirect.
 */
export const LAST_WEAPON_SCRIPT = `(function(){try{if(${JSON.stringify(LAST_WEAPON_PATHS)}.indexOf(location.pathname)<0)return;var t=localStorage.getItem(${JSON.stringify(LAST_WEAPON_KEY)});if(t&&t!==${JSON.stringify(DEFAULT_WEAPON)}&&${JSON.stringify(WEAPON_TYPES)}.indexOf(t)>=0)location.replace("/blacksmith/"+t+"/"+location.search+location.hash)}catch(e){}})()`;
