import { getMonsterCategories, getMonsters } from "@/lib/monsters";
import type { MonsterCategory } from "@/lib/constants";
import { monsterCategoryCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export function generateStaticParams() {
  return getMonsterCategories().map((category) => ({ category }));
}

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return monsterCategoryCard(
    category,
    getMonsters(category as MonsterCategory).map((m) => m.name),
  );
}
