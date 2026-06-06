import fs from "fs";
import path from "path";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "./constants";
import { slugify } from "./slug";
import type { ArmorPiece, WeaponTree } from "./types";

const contentDir = path.join(process.cwd(), "content");

function computeRank(hr: string | number | undefined, elder: string | number | undefined): string {
  const hrNum = Number(hr ?? 0);
  if (hrNum <= 5) return "low-rank";
  if (hrNum <= 8) return "high-rank";
  if (hrNum > 8 && Number(elder)) return "g-rank";
  return "high-rank";
}

export function getArmorSlots(): ArmorSlot[] {
  return [...ARMOR_SLOTS];
}

export function getArmorRanks(): ArmorRank[] {
  return [...ARMOR_RANKS];
}

export function getArmorPieces(slot: ArmorSlot, rank: ArmorRank): ArmorPiece[] {
  const filePath = path.join(contentDir, "armorsmith", slot, rank, `${slot}-crafting.json`);
  if (!fs.existsSync(filePath)) return [];

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { weapons: ArmorPiece[] };

  return raw.weapons
    .filter((p) => !("donotrender" in p))
    .map((p) => ({
      ...p,
      slug: slugify(p.name),
      rank: computeRank(p.hr, p.elder),
    }));
}

export function getArmorPiece(slot: ArmorSlot, rank: ArmorRank, slug: string): ArmorPiece | undefined {
  return getArmorPieces(slot, rank).find((p) => p.slug === slug);
}

export function getArmorTree(slot: ArmorSlot, rank: ArmorRank): WeaponTree | null {
  const filePath = path.join(contentDir, "armorsmith", slot, rank, "map.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeaponTree;
}

/** All valid slot+rank combinations that actually have data files. */
export function getArmorParams(): { slot: ArmorSlot; rank: ArmorRank }[] {
  const params: { slot: ArmorSlot; rank: ArmorRank }[] = [];
  for (const slot of ARMOR_SLOTS) {
    for (const rank of ARMOR_RANKS) {
      const filePath = path.join(contentDir, "armorsmith", slot, rank, `${slot}-crafting.json`);
      if (fs.existsSync(filePath)) {
        params.push({ slot, rank });
      }
    }
  }
  return params;
}
