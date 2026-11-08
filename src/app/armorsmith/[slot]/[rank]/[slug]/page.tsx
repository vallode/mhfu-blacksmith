import { notFound } from "next/navigation";
import { getArmorParams, getArmorPiece, getArmorPieces } from "@/lib/armor";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import type { Metadata, Viewport } from "next";
import { accentViewport, armorDescription, pageMetadata } from "@/lib/seo";
import { tintFor } from "@/lib/og";
import ArmorDetailClient from "./ArmorDetailClient";

interface Props {
  params: Promise<{ slot: string; rank: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { slot: string; rank: string; slug: string }[] = [];
  for (const { slot, rank } of getArmorParams()) {
    for (const piece of getArmorPieces(slot, rank)) {
      params.push({ slot, rank, slug: piece.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot, rank, slug } = await params;
  const piece = getArmorPiece(slot as ArmorSlot, rank as ArmorRank, slug);
  if (!piece) return {};
  return pageMetadata({
    title: piece.name,
    description: armorDescription(piece),
    path: `/armorsmith/${slot}/${rank}/${slug}/`,
    image: `/armorsmith/${slot}/${rank}/opengraph-image`,
  });
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slot, rank, slug } = await params;
  const piece = getArmorPiece(slot as ArmorSlot, rank as ArmorRank, slug);
  return accentViewport(tintFor(Number(piece?.rarity)));
}

export default async function ArmorDetailPage({ params }: Props) {
  const { slot, rank, slug } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  return <ArmorDetailClient slot={slot as ArmorSlot} rank={rank as ArmorRank} slug={slug} />;
}
