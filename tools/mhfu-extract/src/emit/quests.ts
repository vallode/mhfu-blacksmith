/**
 * Maps `ParsedQuest` (src/quests/parser.ts) onto the data/quests/*.json
 * schema shape (data/schemas/quest.schema.json).
 *
 * Every numeric/structured field below is either a raw disc value or
 * resolved through the same ItemID/emID enum bootstrap the equipment emit
 * modules use (src/strings/names.ts). Quest board text (title/goal/fail/
 * details/client) is extracted verbatim from the disc and is Japanese-only
 * — the JP disc never populated distinct English text for retail quests
 * (every `LangPTRs` slot aliases the same Japanese pointer; confirmed
 * against a real EU disc, whose `mission_jpn/*.mib` TOC indices/layout
 * don't line up with the JP one at all, so this isn't a simple region
 * swap). See README's "Quests" section for the full writeup — this is a
 * known, documented gap, not silently dropped.
 */
import type { MonsterSpawn, ParsedQuest, RewardTable, SmallMonsterTable, SupplyItem } from "../quests/parser.js";
import { getNameResolver } from "../strings/names.js";
import { resolveMapName } from "../tables/quest-maps.js";
import type { Rank } from "./common.js";

export type QuestHub = "village" | "guild" | "training-school" | "treasure-hunting";

/**
 * `questHeader.Rank` -> (hub, rank tier). Confirmed against real quest data
 * across all 551 real on-disc quests:
 *  - rank 3's `client` string is always "トレジィ" ("Treshi", the Treasure
 *    Hunting NPC per community guides) — 7 quests, all Treasure Hunting.
 *  - rank 4's `client` is always "教官" ("Instructor", the Training School
 *    NPC) and every title ends in "討伐訓練" ("... Subjugation Training")
 *    — 29 quests, all Training School.
 *  - rank 0/1/2/5's star ranges (1-5,8,10 / 1-6 / mostly 6-9 / 9-11) line up
 *    with community-documented Village / Guild-Low-Rank / Guild-High-Rank /
 *    Guild-G-Rank star bands.
 */
const RANK_TO_HUB: Record<number, { hub: QuestHub; rank: Rank | null }> = {
  0: { hub: "village", rank: null },
  1: { hub: "guild", rank: "low-rank" },
  2: { hub: "guild", rank: "high-rank" },
  3: { hub: "treasure-hunting", rank: null },
  4: { hub: "training-school", rank: null },
  5: { hub: "guild", rank: "g-rank" },
};

/**
 * The disc has 3 unused/disabled quest slots (`m50001`-`m50003`: 0 zenny
 * fee, 1 zenny reward, every text field this exact literal) — real quest
 * IDs that were apparently never wired up. Skipped entirely rather than
 * emitted as garbage.
 */
function isPlaceholderQuest(parsed: ParsedQuest): boolean {
  return parsed.strings?.title === "**********";
}

export interface EmittedSupply {
  item: string;
  amount: number;
}

export interface EmittedRewardItem {
  chance: number;
  item: string;
  amount: number;
}

export interface EmittedRewardTable {
  items: EmittedRewardItem[];
}

export interface EmittedMonsterSpawn {
  monster: string;
  quantity: number;
  power: number;
}

export interface EmittedSmallMonsterSpawn {
  monster: string;
  max_quantity: number;
}

export interface EmittedQuestTarget {
  monster: string;
  amount: number;
}

export interface EmittedQuest {
  id: number;
  hub: QuestHub;
  rank: Rank | null;
  stars: number;
  map: string | null;
  fee: number;
  reward: number;
  penalty: number;
  time_limit_minutes: number;
  target: EmittedQuestTarget | null;
  supplies: EmittedSupply[];
  reward_tables: EmittedRewardTable[];
  large_monsters: EmittedMonsterSpawn[];
  small_monsters: EmittedSmallMonsterSpawn[];
  title: string | null;
  goal: string | null;
  details: string | null;
  fail: string | null;
  client: string | null;
}

function resolveSupplies(supplies: SupplyItem[]): EmittedSupply[] {
  const names = getNameResolver();
  const out: EmittedSupply[] = [];
  for (const s of supplies) {
    const item = names.resolve("ItemID", s.itemId);
    if (item) out.push({ item, amount: s.amount });
  }
  return out;
}

function resolveRewardTables(tables: RewardTable[]): EmittedRewardTable[] {
  const names = getNameResolver();
  return tables.map((table) => {
    const items: EmittedRewardItem[] = [];
    for (const i of table.items) {
      const item = names.resolve("ItemID", i.itemId);
      if (item) items.push({ chance: i.chance, item, amount: i.amount });
    }
    return { items };
  });
}

/** Dedupes exact-duplicate (monster, quantity, power) rows — `LargeMonTable`s are occasionally repeated verbatim, same as small monster tables (see dedupeSmallMonsters). */
function dedupeLargeMonsters(spawns: (MonsterSpawn & { stage: number })[]): EmittedMonsterSpawn[] {
  const names = getNameResolver();
  const seen = new Set<string>();
  const out: EmittedMonsterSpawn[] = [];
  for (const spawn of spawns) {
    const monster = names.resolve("emID", spawn.monsterId);
    if (!monster) continue;
    const key = `${monster}:${spawn.quantity}:${spawn.power}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ monster, quantity: spawn.quantity, power: spawn.power });
  }
  return out;
}

/**
 * Small-monster spawn tables are frequently repeated verbatim across
 * several `SmallMonIndex` entries (real quests seen with the *entire* zone
 * list duplicated 2x+ — see `readSmallMonsters`'s docs) and are broken down
 * per zone, which isn't meaningful once resolved to a public-facing name.
 * Flattens to one row per distinct species actually encountered anywhere in
 * the quest, keeping the largest quantity seen for it in any single zone.
 */
function dedupeSmallMonsters(tables: SmallMonsterTable[]): EmittedSmallMonsterSpawn[] {
  const names = getNameResolver();
  const maxByMonster = new Map<string, number>();
  for (const table of tables) {
    for (const spawn of table.monsters) {
      const monster = names.resolve("emID", spawn.monsterId);
      if (!monster) continue;
      maxByMonster.set(monster, Math.max(maxByMonster.get(monster) ?? 0, spawn.quantity));
    }
  }
  return [...maxByMonster.entries()].map(([monster, max_quantity]) => ({ monster, max_quantity }));
}

/**
 * `targetId`/`targetNum` name the quest's primary hunt/capture objective —
 * null when there isn't a single specific target (`targetNum === 0`, or
 * `targetId` doesn't resolve to a real monster, e.g. Treasure Hunting
 * quests, which reuse this field for something else entirely: real values
 * like 928 are far outside emID's 90-entry range).
 */
function resolveTarget(targetId: number, targetNum: number): EmittedQuestTarget | null {
  if (targetNum <= 0) return null;
  const monster = getNameResolver().resolve("emID", targetId);
  return monster ? { monster, amount: targetNum } : null;
}

/** Maps one parsed `.mib` quest to the `data/quests/*.json` shape, or null for an unused/disabled quest slot. */
export function emitQuest(parsed: ParsedQuest): EmittedQuest | null {
  if (isPlaceholderQuest(parsed)) return null;
  const { header } = parsed;
  const { hub, rank } = RANK_TO_HUB[header.rank] ?? { hub: "guild" as QuestHub, rank: null };

  return {
    id: header.questId,
    hub,
    rank,
    stars: header.questStars,
    map: resolveMapName(header.map),
    fee: header.fee,
    reward: header.reward,
    penalty: header.penalty,
    // Raw ticks -> minutes: confirmed exact (no remainder) against every
    // real sample checked, e.g. quest ID 1's timeLimit=90000 -> 50 minutes.
    time_limit_minutes: Math.round(header.timeLimit / 1800),
    target: resolveTarget(header.targetId, header.targetNum),
    supplies: resolveSupplies(parsed.supplies),
    reward_tables: resolveRewardTables(parsed.rewards),
    large_monsters: dedupeLargeMonsters(parsed.largeMonsters),
    small_monsters: dedupeSmallMonsters(parsed.smallMonsters),
    title: parsed.strings?.title ?? null,
    goal: parsed.strings?.goal ?? null,
    details: parsed.strings?.details ?? null,
    fail: parsed.strings?.fail ?? null,
    client: parsed.strings?.client ?? null,
  };
}

export const QUEST_HUB_TO_FILE: Record<QuestHub, string> = {
  village: "quests/village.json",
  guild: "quests/guild.json",
  "training-school": "quests/training-school.json",
  "treasure-hunting": "quests/treasure-hunting.json",
};

/** Maps every parsed quest into the `data/quests/*.json`-shaped output, grouped by hub, dropping unused slots. */
export function emitQuestsFile(parsedQuests: ParsedQuest[]): Record<string, { quests: EmittedQuest[] }> {
  const byHub: Record<QuestHub, EmittedQuest[]> = {
    village: [],
    guild: [],
    "training-school": [],
    "treasure-hunting": [],
  };
  for (const parsed of parsedQuests) {
    const emitted = emitQuest(parsed);
    if (emitted) byHub[emitted.hub].push(emitted);
  }

  const output: Record<string, { quests: EmittedQuest[] }> = {};
  for (const hub of Object.keys(byHub) as QuestHub[]) {
    output[QUEST_HUB_TO_FILE[hub]] = { quests: byHub[hub] };
  }
  return output;
}
