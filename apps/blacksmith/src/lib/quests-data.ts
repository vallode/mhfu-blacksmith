/**
 * Build-time quest lookups for static params and page metadata, read from
 * data/<game>/quests/*.json by ID (game-records.ts), with each quest's text
 * from the page's language's strings. Pages render from public/data/<game>/quests.json on the client.
 */
import { isHiddenQuest, questHubSlug, type QuestHubSlug } from "./quests";
import { gameRecords } from "./game-records";

export interface QuestSummary {
  id: number;
  hub: QuestHubSlug;
  title: string;
  goal: string | null;
}

let cache: QuestSummary[] | null = null;

export function getQuestSummaries(): QuestSummary[] {
  if (cache) return cache;
  const out: QuestSummary[] = [];
  const records = gameRecords();
  for (const file of records.list("quests")) {
    const { quests } = records.raw<{ quests: { id: number; hub: string; rank: string | null }[] }>(
      file,
    );
    for (const q of quests) {
      const hub = questHubSlug(q.hub, q.rank);
      if (!hub || isHiddenQuest(q.id)) continue;
      const title = records.strings.find("quest", q.id) ?? null;
      const goal = records.strings.find("quest_goal", q.id) ?? null;
      out.push({ id: q.id, hub, title: title ?? `Quest ${q.id}`, goal });
    }
  }
  cache = out;
  return out;
}

export function getQuestSummary(hub: string, id: number): QuestSummary | undefined {
  return getQuestSummaries().find((q) => q.hub === hub && q.id === id);
}
