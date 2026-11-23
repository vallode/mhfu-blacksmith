import { notFound } from "next/navigation";
import { getMonsters, getMonster } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import type { Metadata } from "next";
import { monsterDescription, pageMetadata } from "@/lib/seo";
import { monsterCardAlt, monsterCardUrl } from "@/lib/monster-card";
import { getFirstQuests } from "@/lib/quests-data";
import { faviconMetadata } from "@/lib/favicon";
import { MOVED_MONSTER_SLUGS, movedMonsterSlug } from "@/lib/moved-monsters";
import MonsterDetailClient from "./MonsterDetailClient";
import MovedMonster from "./MovedMonster";

interface Props {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { category: string; slug: string }[] = [];
  for (const category of MONSTER_CATEGORIES) {
    for (const monster of getMonsters(category)) {
      params.push({ category, slug: monster.slug });
    }
    for (const slug of Object.keys(MOVED_MONSTER_SLUGS[category] ?? {}))
      params.push({ category, slug });
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug: requested } = await params;
  const moved = movedMonsterSlug(category, requested);
  const slug = moved ?? requested;
  const monster = getMonster(category as MonsterCategory, slug);
  if (!monster) return {};
  const first = getFirstQuests(monster.name);
  return {
    // An old URL: describes the current page, which search engines should index instead.
    ...(moved && { robots: { index: false } }),
    ...faviconMetadata(category),
    ...pageMetadata({
      title: monster.name,
      description: monsterDescription(monster),
      path: `/monsters/${category}/${slug}/`,
      card: { url: monsterCardUrl(monster, first), alt: monsterCardAlt(monster, first) },
      oembed: true,
    }),
  };
}

export default async function MonsterDetailPage({ params }: Props) {
  const { category, slug } = await params;

  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) notFound();
  const moved = movedMonsterSlug(category, slug);
  if (moved) return <MovedMonster to={`/monsters/${category}/${moved}/`} />;

  return <MonsterDetailClient category={category as MonsterCategory} slug={slug} />;
}
