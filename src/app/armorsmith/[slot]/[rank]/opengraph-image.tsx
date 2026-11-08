import { getArmorParams, getArmorPieces } from "@/lib/armor";
import type { ArmorRank, ArmorSlot } from "@/lib/constants";
import { armorSetCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export function generateStaticParams() {
  return getArmorParams();
}

// Armor pages below this segment share the slot and rank's card.
export default async function Image({
  params,
}: {
  params: Promise<{ slot: string; rank: string }>;
}) {
  const { slot, rank } = await params;
  return armorSetCard(slot, rank, getArmorPieces(slot as ArmorSlot, rank as ArmorRank).length);
}
