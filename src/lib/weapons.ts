import fs from "fs";
import path from "path";
import { WEAPON_TYPES, type WeaponType, WEAPON_CLASS_MULTIPLIER } from "./constants";
import { slugify } from "./slug";
import type { Weapon, WeaponTree } from "./types";

const contentDir = path.join(process.cwd(), "content");

function computeRank(hr: string | number | undefined, elder: string | number | undefined): string {
  const hrNum = Number(hr ?? 0);
  if (hrNum <= 5) return "low-rank";
  if (hrNum <= 8) return "high-rank";
  if (hrNum > 8 && Number(elder)) return "g-rank";
  return "high-rank";
}

export function getWeaponTypes(): WeaponType[] {
  return [...WEAPON_TYPES];
}

export function getWeapons(type: WeaponType): Weapon[] {
  const filePath = path.join(contentDir, "blacksmith", type, `${type}-crafting.json`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { weapons: Weapon[] };

  return raw.weapons
    .filter((w) => !("donotrender" in w))
    .map((w) => {
      const multiplier = WEAPON_CLASS_MULTIPLIER[w.type];
      return {
        ...w,
        slug: slugify(w.name),
        raw_attack: multiplier && w.attack ? Math.floor(Number(w.attack) / multiplier) : undefined,
        rank: computeRank(w.hr, w.elder),
      };
    });
}

export function getWeapon(type: WeaponType, slug: string): Weapon | undefined {
  return getWeapons(type).find((w) => w.slug === slug);
}

export function getWeaponTree(type: WeaponType): WeaponTree {
  const filePath = path.join(contentDir, "blacksmith", type, "map.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeaponTree;
}
