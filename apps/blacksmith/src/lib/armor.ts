import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "./constants";
import { armorSlugs } from "./slug";
import type { ArmorPiece } from "./types";
import { cached } from "./data-cache";
import { gameRecords } from "./game-records";

// data/<game>/armor/<slot>.json holds every rank in one file; each piece carries
// its own "rank" field.
const allCache = new Map<ArmorSlot, { pieces: ArmorPiece[]; english: ArmorPiece[] }>();
const rankCache = new Map<string, ArmorPiece[]>();

/** A slot's pieces named in the page's language, and the same pieces named in English. */
function getAllArmorPieces(slot: ArmorSlot): { pieces: ArmorPiece[]; english: ArmorPiece[] } {
  return cached(allCache, slot, () => loadArmorPieces(slot));
}

function loadArmorPieces(slot: ArmorSlot): { pieces: ArmorPiece[]; english: ArmorPiece[] } {
  const records = gameRecords();
  const file = `armor/${slot}.json`;
  if (!records.has(file)) return { pieces: [], english: [] };
  return {
    pieces: records.named<{ armor: ArmorPiece[] }>(file).armor,
    english: records.english<{ armor: ArmorPiece[] }>(file).armor,
  };
}

export function getArmorPieces(slot: ArmorSlot, rank: ArmorRank): ArmorPiece[] {
  return cached(rankCache, `${slot}/${rank}`, () => {
    const { pieces, english } = getAllArmorPieces(slot);
    const atRank = pieces.flatMap((p, i) => (p.rank === rank ? [i] : []));
    // Slugs from the English names, whatever the page's language.
    const slugs = armorSlugs(atRank.map((i) => english[i]!));
    return atRank.map((i, j) => ({ ...pieces[i]!, slug: slugs[j]! }));
  });
}

export function getArmorPiece(
  slot: ArmorSlot,
  rank: ArmorRank,
  slug: string,
): ArmorPiece | undefined {
  return getArmorPieces(slot, rank).find((p) => p.slug === slug);
}

/** All valid slot+rank combinations that actually have pieces. */
export function getArmorParams(): { slot: ArmorSlot; rank: ArmorRank }[] {
  const params: { slot: ArmorSlot; rank: ArmorRank }[] = [];
  for (const slot of ARMOR_SLOTS) {
    const { pieces } = getAllArmorPieces(slot);
    for (const rank of ARMOR_RANKS) {
      if (pieces.some((p) => p.rank === rank)) {
        params.push({ slot, rank });
      }
    }
  }
  return params;
}
