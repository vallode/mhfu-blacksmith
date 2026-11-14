import fs from "fs";
import path from "path";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "./constants";
import { armorSlugs } from "./slug";
import type { ArmorPiece, WeaponTree } from "./types";
import { DATA_DIR } from "./paths";
import { cached } from "./data-cache";
import { readData } from "game-data";

const contentDir = path.join(process.cwd(), "content");
const dataDir = DATA_DIR;

// data/armor/<slot>.json holds every rank in one file; each piece carries
// its own "rank" field.
const allCache = new Map<ArmorSlot, ArmorPiece[]>();
const rankCache = new Map<string, ArmorPiece[]>();

function getAllArmorPieces(slot: ArmorSlot): ArmorPiece[] {
  return cached(allCache, slot, () => loadArmorPieces(slot));
}

function loadArmorPieces(slot: ArmorSlot): ArmorPiece[] {
  const filePath = path.join(dataDir, "armor", `${slot}.json`);
  if (!fs.existsSync(filePath)) return [];

  const raw = readData<{ armor: ArmorPiece[] }>(dataDir, "armor", `${slot}.json`);

  return raw.armor;
}

export function getArmorPieces(slot: ArmorSlot, rank: ArmorRank): ArmorPiece[] {
  return cached(rankCache, `${slot}/${rank}`, () => {
    const pieces = getAllArmorPieces(slot).filter((p) => p.rank === rank);
    const slugs = armorSlugs(pieces);
    return pieces.map((p, i) => ({ ...p, slug: slugs[i] }));
  });
}

export function getArmorPiece(
  slot: ArmorSlot,
  rank: ArmorRank,
  slug: string,
): ArmorPiece | undefined {
  return getArmorPieces(slot, rank).find((p) => p.slug === slug);
}

export function getArmorTree(slot: ArmorSlot, rank: ArmorRank): WeaponTree | null {
  const filePath = path.join(contentDir, "armorsmith", slot, rank, "map.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeaponTree;
}

/** All valid slot+rank combinations that actually have pieces. */
export function getArmorParams(): { slot: ArmorSlot; rank: ArmorRank }[] {
  const params: { slot: ArmorSlot; rank: ArmorRank }[] = [];
  for (const slot of ARMOR_SLOTS) {
    const pieces = getAllArmorPieces(slot);
    for (const rank of ARMOR_RANKS) {
      if (pieces.some((p) => p.rank === rank)) {
        params.push({ slot, rank });
      }
    }
  }
  return params;
}
