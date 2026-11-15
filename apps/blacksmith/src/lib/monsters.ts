import { MONSTER_CATEGORIES, type MonsterCategory } from "./constants";
import { slugify } from "./slug";
import type { Monster } from "./types";
import { cached } from "./data-cache";
import { gameRecords } from "./game-records";

export function getMonsterCategories(): MonsterCategory[] {
  return [...MONSTER_CATEGORIES];
}

const cache = new Map<MonsterCategory, Monster[]>();

export function getMonsters(category: MonsterCategory): Monster[] {
  return cached(cache, category, () => loadMonsters(category));
}

/** A category's monsters, named in the page's language; slugs from their English names. */
function loadMonsters(category: MonsterCategory): Monster[] {
  const records = gameRecords();
  const file = `monsters/${category}.json`;
  if (!records.has(file)) return [];
  const english = records.english<{ monsters: Monster[] }>(file).monsters;
  return records.named<{ monsters: Monster[] }>(file).monsters.map((m, i) => ({
    ...m,
    slug: slugify(english[i]!.name),
  }));
}

export function getMonster(category: MonsterCategory, slug: string): Monster | undefined {
  return getMonsters(category).find((m) => m.slug === slug);
}
