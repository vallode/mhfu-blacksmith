import fs from "fs";
import path from "path";
import { MONSTER_CATEGORIES, type MonsterCategory } from "./constants";
import { monsterGameId } from "./monster-ids";
import type { MonsterLogMonster } from "./monster-log";
import { slugify } from "./slug";
import type { Monster } from "./types";
import { DATA_DIR, GAME, GAME_DATA_DIR } from "./paths";
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
  const filePath = path.join(GAME_DATA_DIR, "monsters", `${category}.json`);
  if (!fs.existsSync(filePath)) return [];

  const raw = readData<{ monsters: Monster[] }>(dataDir, GAME, "monsters", `${category}.json`);

  return raw.monsters.map((m) => ({
    ...m,
    slug: slugify(m.name),
  }));
}

export function getMonster(category: MonsterCategory, slug: string): Monster | undefined {
  return getMonsters(category).find((m) => m.slug === slug);
}

/**
 * Every monster as the hunter's monster log lists it: its page, its type and
 * the size data the Guild Card's records are shown with, in the bestiary's
 * order. The log's rows come from the save, so the page hands it the whole
 * list and `monsterLog` picks out the monsters with a record.
 */
export function getMonsterLogMonsters(): MonsterLogMonster[] {
  return MONSTER_CATEGORIES.flatMap((category) =>
    getMonsters(category).map((m) => ({
      name: m.name,
      slug: m.slug,
      category,
      small: m.small === true,
      ...(m.base_size !== undefined && { baseSize: m.base_size }),
      ...(m.crowns && { crowns: m.crowns }),
    })),
  );
}

/**
 * The game IDs of the small monsters, from `data/mhfu/monsters`' `small` flag.
 * The Guild Card keeps their kills apart from the large monsters': a few
 * thousand Kelbi would swamp the hunts that matter.
 */
export function getSmallMonsterIds(): number[] {
  return MONSTER_CATEGORIES.flatMap((category) =>
    getMonsters(category).flatMap((m) => {
      const id = m.small ? monsterGameId(m.name) : undefined;
      return id === undefined ? [] : [id];
    }),
  ).sort((a, b) => a - b);
}
