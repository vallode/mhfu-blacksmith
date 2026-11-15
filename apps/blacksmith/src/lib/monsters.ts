import fs from "fs";
import path from "path";
import { MONSTER_CATEGORIES, type MonsterCategory } from "./constants";
import { slugify } from "./slug";
import type { Monster } from "./types";
import { DATA_DIR } from "./paths";
import { cached } from "./data-cache";
import { readData } from "game-data";

const dataDir = DATA_DIR;

export function getMonsterCategories(): MonsterCategory[] {
  return [...MONSTER_CATEGORIES];
}

const cache = new Map<MonsterCategory, Monster[]>();

export function getMonsters(category: MonsterCategory): Monster[] {
  return cached(cache, category, () => loadMonsters(category));
}

function loadMonsters(category: MonsterCategory): Monster[] {
  const filePath = path.join(dataDir, "monsters", `${category}.json`);
  if (!fs.existsSync(filePath)) return [];

  const raw = readData<{ monsters: Monster[] }>(dataDir, "monsters", `${category}.json`);

  return raw.monsters.map((m) => ({
    ...m,
    slug: slugify(m.name),
  }));
}

export function getMonster(category: MonsterCategory, slug: string): Monster | undefined {
  return getMonsters(category).find((m) => m.slug === slug);
}
