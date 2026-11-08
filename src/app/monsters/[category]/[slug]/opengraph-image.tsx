import { getMonster, getMonsters } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import { monsterCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export function generateStaticParams() {
  return MONSTER_CATEGORIES.flatMap((category) =>
    getMonsters(category).map((m) => ({ category, slug: m.slug })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  return monsterCard(getMonster(category as MonsterCategory, slug)!);
}
