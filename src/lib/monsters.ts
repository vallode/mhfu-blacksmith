import fs from "fs";
import path from "path";
import { MONSTER_CATEGORIES, type MonsterCategory } from "./constants";
import { slugify } from "./slug";
import type { Monster } from "./types";

const dataDir = path.join(process.cwd(), "data");

export function getMonsterCategories(): MonsterCategory[] {
  return [...MONSTER_CATEGORIES];
}

export function getMonsters(category: MonsterCategory): Monster[] {
  const filePath = path.join(dataDir, "monsters", `${category}.json`);
  if (!fs.existsSync(filePath)) return [];

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { monsters: Monster[] };

  return raw.monsters.map((m) => ({
    ...m,
    slug: slugify(m.name),
  }));
}

export function getMonster(category: MonsterCategory, slug: string): Monster | undefined {
  return getMonsters(category).find((m) => m.slug === slug);
}
