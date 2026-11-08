import { notFound } from "next/navigation";
import { getMonsterCategories, getMonsters } from "@/lib/monsters";
import { monsterCategoryEmbedIcon, pageMetadata, titleCase } from "@/lib/seo";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import type { Metadata } from "next";
import { faviconMetadata } from "@/lib/favicon";
import MonsterListClient from "./MonsterListClient";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  return getMonsterCategories().map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const name = titleCase(category);
  const names = getMonsters(category as MonsterCategory).map((m) => m.name);
  return {
    ...faviconMetadata(category),
    ...pageMetadata({
      title: name,
      description: `${names.length} ${name} monsters in Monster Hunter Freedom Unite: ${names.slice(0, 6).join(", ")}${names.length > 6 ? "…" : ""}. Hitzones, drops and habitats.`,
      path: `/monsters/${category}/`,
      image: monsterCategoryEmbedIcon(category),
    }),
  };
}

export default async function MonsterListPage({ params }: Props) {
  const { category } = await params;

  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) notFound();

  return <MonsterListClient category={category as MonsterCategory} />;
}
