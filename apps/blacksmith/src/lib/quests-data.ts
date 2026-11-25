/**
 * Build-time quest lookups for static params and page metadata, read from
 * data/quests/*.json. Pages render from public/data/quests.json on the client.
 */
import fs from "fs";
import path from "path";
import {
  huntStarsByMonster,
  isHiddenQuest,
  questHubSlug,
  type HuntStars,
  type QuestAppearance,
  type QuestHubSlug,
} from "./quests";
import { DATA_DIR } from "./paths";
import { readData } from "game-data";

export interface QuestSummary {
  id: number;
  hub: QuestHubSlug;
  title: string;
  goal: string | null;
  /** The quest's map, as data/quests names it. */
  map: string | null;
  /** Whether the quest has recorded monster spawns on its map. */
  hasSpawns: boolean;
}

const questDir = path.join(DATA_DIR, "quests");

let cache: QuestSummary[] | null = null;

export function getQuestSummaries(): QuestSummary[] {
  if (cache) return cache;
  const out: QuestSummary[] = [];
  for (const file of fs.readdirSync(questDir).filter((f) => f.endsWith(".json"))) {
    const { quests } = readData(DATA_DIR, "quests", file) as {
      quests: {
        id: number;
        hub: string;
        rank: string | null;
        title: string | null;
        goal: string | null;
        map: string | null;
        large_monsters?: { spawns?: unknown[] }[];
        small_monsters?: { spawns?: unknown[] }[];
      }[];
    };
    for (const q of quests) {
      const hub = questHubSlug(q.hub, q.rank);
      const hasSpawns = [...(q.large_monsters ?? []), ...(q.small_monsters ?? [])].some(
        (monster) => (monster.spawns?.length ?? 0) > 0,
      );
      if (hub && !isHiddenQuest(q.id))
        out.push({
          id: q.id,
          hub,
          title: q.title ?? `Quest ${q.id}`,
          goal: q.goal,
          map: q.map,
          hasSpawns,
        });
    }
  }
  cache = out;
  return out;
}

export function getQuestSummary(hub: string, id: number): QuestSummary | undefined {
  return getQuestSummaries().find((q) => q.hub === hub && q.id === id);
}

let huntStars: Map<string, HuntStars> | null = null;

/** The star levels a monster (by English name) is hunted at on the Village and Guild boards. */
export function getHuntStars(name: string): HuntStars {
  huntStars ??= huntStarsByMonster(
    ["village.json", "guild.json"].flatMap(
      (file) => readData<{ quests: QuestAppearance[] }>(DATA_DIR, "quests", file).quests,
    ),
  );
  return huntStars.get(name) ?? {};
}
