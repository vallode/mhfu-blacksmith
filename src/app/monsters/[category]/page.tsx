import { notFound } from "next/navigation";
import { getMonsterCategories } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import type { Metadata } from "next";
import MonsterListClient from "./MonsterListClient";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  return getMonsterCategories().map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const name = category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: `${name} — MHFU Blacksmith` };
}

export default async function MonsterListPage({ params }: Props) {
  const { category } = await params;

  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) notFound();

  return <MonsterListClient category={category as MonsterCategory} />;
}
