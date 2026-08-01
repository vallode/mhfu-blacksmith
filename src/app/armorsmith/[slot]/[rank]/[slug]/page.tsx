import { notFound } from "next/navigation";
import { getArmorParams, getArmorPiece, getArmorPieces } from "@/lib/armor";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import type { Metadata } from "next";
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
  return { title: piece ? `${piece.name} — MHFU Blacksmith` : "Armor" };
}

export default async function ArmorDetailPage({ params }: Props) {
  const { slot, rank, slug } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  return <ArmorDetailClient slot={slot as ArmorSlot} rank={rank as ArmorRank} slug={slug} />;
}
