import fs from "fs";
import path from "path";
import { WEAPON_TYPES, type WeaponType, WEAPON_CLASS_MULTIPLIER } from "./constants";
import { slugify } from "./slug";
import type { Weapon } from "./types";

const dataDir = path.join(process.cwd(), "data");

export function getWeaponTypes(): WeaponType[] {
  return [...WEAPON_TYPES];
}

export function getWeapons(type: WeaponType): Weapon[] {
  const filePath = path.join(dataDir, "weapons", `${type}.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { weapons: Weapon[] };

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
