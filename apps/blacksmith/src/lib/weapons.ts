import { WEAPON_TYPES, type WeaponType, WEAPON_CLASS_MULTIPLIER } from "./constants";
import { slugify } from "./slug";
import type { Weapon } from "./types";
import { cached } from "./data-cache";
import { gameRecords } from "./game-records";

export function getWeaponTypes(): WeaponType[] {
  return [...WEAPON_TYPES];
}

const cache = new Map<WeaponType, Weapon[]>();

export function getWeapons(type: WeaponType): Weapon[] {
  return cached(cache, type, () => loadWeapons(type));
}

/** A type's weapons, named in the page's language; slugs from their English names. */
function loadWeapons(type: WeaponType): Weapon[] {
  const records = gameRecords();
  const file = `weapons/${type}.json`;
  const english = records.english<{ weapons: Weapon[] }>(file).weapons;
  return records.named<{ weapons: Weapon[] }>(file).weapons.map((w, i) => {
    const multiplier = WEAPON_CLASS_MULTIPLIER[w.type];
    return {
      ...w,
      slug: slugify(english[i]!.name),
      raw_attack: multiplier && w.attack ? Math.floor(Number(w.attack) / multiplier) : undefined,
    };
  });
}

export function getWeapon(type: WeaponType, slug: string): Weapon | undefined {
  return getWeapons(type).find((w) => w.slug === slug);
}
