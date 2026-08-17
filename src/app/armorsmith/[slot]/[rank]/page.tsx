import { notFound } from "next/navigation";
import { getArmorParams, getArmorTree } from "@/lib/armor";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import type { Metadata } from "next";
import ArmorTreeListClient from "./ArmorTreeListClient";

interface Props {
  params: Promise<{ slot: string; rank: string }>;
}

export async function generateStaticParams() {
  return getArmorParams().map(({ slot, rank }) => ({ slot, rank }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot, rank } = await params;
  const fmt = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: `${fmt(rank)} ${fmt(slot)} — MHFU Blacksmith` };
}

export default async function ArmorTreePage({ params }: Props) {
  const { slot, rank } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  const tree = getArmorTree(slot as ArmorSlot, rank as ArmorRank);
  if (!tree) notFound();

  return <ArmorTreeListClient slot={slot as ArmorSlot} rank={rank as ArmorRank} />;
}
