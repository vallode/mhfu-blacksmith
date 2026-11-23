import { notFound } from "next/navigation";
import { getMonsters, getMonster } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import type { Metadata } from "next";
import { monsterDescription, pageMetadata } from "@/lib/seo";
import { MONSTER_CARD_VERSION, monsterCardAlt, monsterCardPath } from "@/lib/monster-card";
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
  return {
    // An old URL: describes the current page, which search engines should index instead.
    ...(moved && { robots: { index: false } }),
    ...faviconMetadata(category),
    ...pageMetadata({
      title: monster.name,
      description: monsterDescription(monster),
      path: `/monsters/${category}/${slug}/`,
      // The version in the URL makes Discord and others fetch a changed card again.
      card: {
        url: `${monsterCardPath(slug)}?v=${MONSTER_CARD_VERSION}`,
        alt: monsterCardAlt(monster),
      },
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
