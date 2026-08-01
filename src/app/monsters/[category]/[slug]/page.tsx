import { notFound } from "next/navigation";
import { getMonsters, getMonster } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import type { Metadata } from "next";
import MonsterDetailClient from "./MonsterDetailClient";

interface Props {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { category: string; slug: string }[] = [];
  for (const category of MONSTER_CATEGORIES) {
    for (const monster of getMonsters(category)) {
      params.push({ category, slug: monster.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const monster = getMonster(category as MonsterCategory, slug);
  return {
    title: monster ? `${monster.name} — MHFU Blacksmith` : "Monster",
    description: monster?.description,
  };
}

export default async function MonsterDetailPage({ params }: Props) {
  const { category, slug } = await params;

  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) notFound();

  return <MonsterDetailClient category={category as MonsterCategory} slug={slug} />;
}
