import { WEAPON_TYPES, type WeaponType, WEAPON_CLASS_MULTIPLIER } from "./constants";
import { slugify } from "./slug";
import type { Weapon } from "./types";
import { DATA_DIR } from "./paths";
import { cached } from "./data-cache";
import { readData } from "game-data";

const dataDir = DATA_DIR;

export function getWeaponTypes(): WeaponType[] {
  return [...WEAPON_TYPES];
}

const cache = new Map<WeaponType, Weapon[]>();

export function getWeapons(type: WeaponType): Weapon[] {
  return cached(cache, type, () => loadWeapons(type));
}

function loadWeapons(type: WeaponType): Weapon[] {
  const raw = readData<{ weapons: Weapon[] }>(dataDir, "weapons", `${type}.json`);

  return raw.weapons.map((w) => {
    const multiplier = WEAPON_CLASS_MULTIPLIER[w.type];
    return {
      ...w,
      slug: slugify(w.name),
      raw_attack: multiplier && w.attack ? Math.floor(Number(w.attack) / multiplier) : undefined,
    };
  });
}

export function getWeapon(type: WeaponType, slug: string): Weapon | undefined {
  return getWeapons(type).find((w) => w.slug === slug);
}
