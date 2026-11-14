/**
 * Maps `ParsedQuest` (src/quests/parser.ts) onto the data/quests/*.json
 * schema shape (data/schemas/quest.schema.json).
 *
 * Every numeric/structured field below is either a raw disc value or
 * resolved through the same ItemID/emID enum bootstrap the equipment emit
 * modules use (src/strings/names.ts). Quest board text (title/goal/fail/
 * details/client) is the first populated `LangPTRs` slot, verbatim: English
 * on the EU disc, Japanese on the JP disc (whose slots all alias the same
 * Japanese text). See README's "Quests" section.
 */
import type {
  MonsterSpawn,
  ParsedQuest,
  RewardTable,
  SmallMonsterTable,
  SupplyItem,
} from "../quests/parser.js";
import type { MultiplierRow } from "../monsters/multipliers.js";
import { crownChances, sizeRange, type Crowns, type SizeTables } from "../monsters/sizes.js";
import { getNameResolver } from "../strings/names.js";
import { resolveMapName } from "../tables/quest-maps.js";
import { QUEST_PREREQUISITES } from "../tables/quest-prerequisites.js";
import { URGENT_QUESTS } from "../tables/urgent-quests.js";
import type { Rank } from "./common.js";

export type QuestHub = "village" | "guild" | "training-school" | "treasure-hunting";

/**
 * The quest board, from the quest ID (`m#####.mib`). The disc numbers its
 * quests in blocks, one block per board and star level (`1001`-`1022` is
 * Guild Low Rank's ★3, `10101`-`10118` the Village's ★2, ...):
 *  - `1`-`10`/`101`-`109`: Guild Low Rank ★1 and ★2. The Monster Hunter
 *    Wiki's Guild Hall list has all 19 with the disc's fee, reward, locale
 *    and client. Many share a title and client with a Village quest
 *    (`2` and `10105` are both "Reckless Bulldrome Hunter" for the "Troubled
 *    Father"), but pay 12x their fee like every Guild quest, where the
 *    Village pays 6x. Some only appear once a prerequisite is cleared (`109`
 *    "Attack of the Rathian" after `10203` "Shadow in the Snow").
 *  - `1xxx`/`2xxx`/`3xxx`: Guild Low (★3-★5) / High (★6-★8) / G Rank.
 *  - `4xxx`: Treasure Hunting (client always "Treshi").
 *  - `10xxx`/`11xxx`: Village, ★1-★6 then ★7-★9 (many from the "Pokke
 *    Village Chief"; `10004`/`10108` are the Village's two Tigrex quests).
 *  - `20xxx`-`22xxx`: Training School (client always "Instructor"):
 *    Basic Training and the weapon Mastery quests, then the Subjugation
 *    Training quests.
 *  - `30001`-`30090`: 90 identical "Gathering - Snowy Mountains" copies
 *    with Guild Low Rank's header rank; kept there (the site hides them).
 *
 * The header's `rank` byte is not the board: the Village's `10xxx` quests
 * carry the same values as Guild Low Rank. It is the quest's rank tier
 * (`RANK_TIER`).
 */
export function questHub(questId: number): QuestHub | null {
  if (questId >= 1 && questId < 4000) return "guild";
  if (questId >= 4000 && questId < 5000) return "treasure-hunting";
  if (questId >= 10000 && questId < 12000) return "village";
  if (questId >= 20000 && questId < 23000) return "training-school";
  if (questId >= 30001 && questId <= 30090) return "guild";
  return null;
}

/**
 * `questHeader.Rank` -> rank tier. 1/2/5 agree with the quest ID block on
 * every Guild quest. Village quests use them too: `10xxx`
 * are 1 (one ★6 is 2), `11xxx` 2 (one ★9 is 5). 0 (the Training School's
 * Basic/Mastery quests, the Village's two Tigrex quests and the Guild's ★1
 * and ★2), 3 (Treasure Hunting) and 4 (Subjugation Training) have no tier.
 * The Guild's ★1/★2 quests and the Village's two Tigrex quests (★1 and ★2)
 * are still Low Rank, so they are emitted as low rank (`questRank`).
 */
const RANK_TIER: Record<number, Rank> = {
  1: "low-rank",
  2: "high-rank",
  5: "g-rank",
};

/**
 * Unused quest slots, skipped rather than emitted as garbage. Every text
 * field is one placeholder literal: "**********" on the JP disc, "none" on
 * the EU disc. On EU that is `m50001`-`m50003` (0 zenny fee, 1 zenny reward)
 * and `m40001`-`m40008` (0 zenny fee, real monsters and rewards, but no
 * text in any language, so never shown on a quest board).
 */
/** The emitted rank: the header's tier, or Low Rank for the Guild's and Village's rank-0 quests. */
function questRank(hub: QuestHub, headerRank: number): Rank | null {
  return RANK_TIER[headerRank] ?? (hub === "guild" || hub === "village" ? "low-rank" : null);
}

const PLACEHOLDER_TITLES = new Set(["**********", "none"]);

export function isPlaceholderQuest(parsed: ParsedQuest): boolean {
  return PLACEHOLDER_TITLES.has(parsed.strings?.title ?? "");
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

/**
 * What a reward table is, from `RewardTBL.Unkn1` (see `classifyRewardTable`):
 *  - "main": the main reward pool (`0x8000`). Always the first table.
 *  - "extra": a fixed extra reward (`0x8001`), one pick per table.
 *  - "conditional": any other value, which the game checks against a
 *    condition this extractor doesn't decode (kept raw in `condition`).
 */
export type RewardTableKind = "main" | "extra" | "conditional";

export interface EmittedRewardTable {
  kind: RewardTableKind;
  /** How many times the table is drawn, or null where the disc data doesn't say. */
  draws: number | null;
  /** Raw `RewardTBL.Unkn1` of a "conditional" table; null for main and extra tables. */
  condition: number | null;
  items: EmittedRewardItem[];
}

export interface EmittedMonsterSpawn {
  monster: string;
  quantity: number;
  power: number;
  /** The stat multiplier row this spawn gets (src/monsters/multipliers.ts); absent without one. */
  multipliers?: MultiplierRow;
  /**
   * The chance this monster rolls a mini, silver or gold crown size here
   * (`crownChances`; silver short of gold). Absent for a monster without
   * crowns, or without the size tables. For a quest with
   * `monster_size.fixed_until_flag`, it's the chance once the flag is set.
   */
  crown_chances?: Crowns;
}

/**
 * A large monster's stat multiplier row: by its emID, the quest's
 * `statTable` and the spawn's `power` (`multiplierRow`), or null.
 */
export type MultiplierLookup = (
  emId: number,
  statTable: number,
  power: number,
) => MultiplierRow | null;

export interface EmittedSmallMonsterSpawn {
  monster: string;
  /** The most of this species in any single zone. */
  max_quantity: number;
  /** All of this species across the quest's zones, each distinct spawn table counted once. */
  total_quantity: number;
  /** Present when a spawn is marked 99, which the game uses for a species that keeps coming; those spawns are left out of the counts. */
  endless?: true;
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
  /** How big the large monsters can be; null without large monsters or the size tables. */
  monster_size: EmittedMonsterSize | null;
  small_monsters: EmittedSmallMonsterSpawn[];
  title: string | null;
  goal: string | null;
  details: string | null;
  fail: string | null;
  client: string | null;
  /** Quest ID that must be cleared before this one appears, or null if none is known. */
  requires: number | null;
  /** An Urgent Quest: the one that unlocks the next star level. Hand-entered, not on the disc. */
  urgent: boolean;
}

/**
 * The quest's monster size, in percent of each monster's base size (see
 * src/monsters/sizes.ts). Monsters without crowns are always 100.
 */
export interface EmittedMonsterSize {
  /** The header's `MonSizeModifier`: the size a roll of 100 gives. */
  modifier: number;
  /** The smallest and largest size a roll can give. */
  min: number;
  max: number;
  /**
   * The save flag (bit) these story quests wait on: until it is set, every
   * monster is 100 and `modifier`, `min` and `max` don't apply.
   */
  fixed_until_flag?: number;
}

function monsterSize(
  parsed: ParsedQuest,
  sizes: SizeTables | undefined,
): EmittedMonsterSize | null {
  if (!sizes || parsed.largeMonsters.length === 0) return null;
  const { questId, monSizeModifier, sizeVariation } = parsed.header;
  const flag = sizes.fixedSizeQuests.get(questId);
  return {
    modifier: monSizeModifier,
    ...sizeRange(sizes, monSizeModifier, sizeVariation),
    ...(flag != null ? { fixed_until_flag: flag } : {}),
  };
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

const REWARD_MAIN = 0x8000;
const REWARD_EXTRA = 0x8001;

/**
 * Decodes `RewardTBL.Unkn1`/`Unkn2`. Evidence, across all 837 tables of the
 * 551 EU quests (README "Reward tables" has the full breakdown):
 *  - `Unkn1 = 0x8000` heads every quest except the 7 Treasure Hunting ones,
 *    exactly once and always first: the main reward pool. Its `Unkn2` is
 *    `N << 8` with N = 4..7 (0 on one training quest), rising with the
 *    quest's stars, and `Unkn2` is 0 on every other table. N is read as the
 *    main pool's base number of draws (before Luck skills); that reading is
 *    inferred from the data, not confirmed in game.
 *  - `Unkn1 = 0x8001` tables follow the main table on multi-monster hunts
 *    (one per large monster, holding that monster's material) and on
 *    Fortress/Rajang quests (Commendations). Each sums to 100%, so each is
 *    one draw.
 *  - Every other value is a condition: 1 on elder dragon "Slay" quests,
 *    0x28-0x32 on Training School quests, 0xf9-0x101 on "Survive or deliver
 *    the Paw Pass Ticket" quests and 0x10c-0x119 on Treasure Hunting quests
 *    (14 tiers). Draws aren't known for these.
 */
export function classifyRewardTable(
  table: Pick<RewardTable, "unkn1" | "unkn2">,
): Omit<EmittedRewardTable, "items"> {
  if (table.unkn1 === REWARD_MAIN)
    return { kind: "main", draws: table.unkn2 >> 8, condition: null };
  if (table.unkn1 === REWARD_EXTRA) return { kind: "extra", draws: 1, condition: null };
  return { kind: "conditional", draws: null, condition: table.unkn1 };
}

function resolveRewardTables(tables: RewardTable[]): EmittedRewardTable[] {
  const names = getNameResolver();
  return tables.map((table) => {
    const items: EmittedRewardItem[] = [];
    for (const i of table.items) {
      const item = names.resolve("ItemID", i.itemId);
      if (item) items.push({ chance: i.chance, item, amount: i.amount });
    }
    return { ...classifyRewardTable(table), items };
  });
}

/** Dedupes exact-duplicate (monster, quantity, power) rows — `LargeMonTable`s are occasionally repeated verbatim, same as small monster tables (see dedupeSmallMonsters). */
function dedupeLargeMonsters(
  spawns: (MonsterSpawn & { stage: number })[],
  header: Pick<ParsedQuest["header"], "statTable" | "monSizeModifier" | "sizeVariation">,
  multipliers?: MultiplierLookup,
  sizes?: SizeTables,
): EmittedMonsterSpawn[] {
  const names = getNameResolver();
  const seen = new Set<string>();
  const out: EmittedMonsterSpawn[] = [];
  for (const spawn of spawns) {
    const monster = names.resolve("emID", spawn.monsterId);
    if (!monster) continue;
    const key = `${monster}:${spawn.quantity}:${spawn.power}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = multipliers?.(spawn.monsterId, header.statTable, spawn.power);
    const crowns =
      sizes && crownChances(sizes, spawn.monsterId, header.monSizeModifier, header.sizeVariation);
    out.push({
      monster,
      quantity: spawn.quantity,
      power: spawn.power,
      ...(row ? { multipliers: row } : {}),
      ...(crowns ? { crown_chances: crowns } : {}),
    });
  }
  return out;
}

/** The quantity the game gives a species that keeps spawning (554 spawn records on disc, against at most 20 for the rest). */
const ENDLESS_QUANTITY = 99;

/**
 * Small-monster spawn tables are frequently repeated across several
 * `SmallMonIndex` entries (real quests seen with the *entire* zone list
 * pointing at the same records 2x+ — see `readSmallMonsters`'s docs). Those
 * repeats are dropped (same zone, same record address), then one row per
 * species remains: the largest quantity in any single zone, and the total
 * across the quest's distinct spawn tables.
 */
function dedupeSmallMonsters(tables: SmallMonsterTable[]): EmittedSmallMonsterSpawn[] {
  const names = getNameResolver();
  const seen = new Set<string>();
  const stats = new Map<string, { max: number; total: number; endless: boolean }>();
  for (const table of tables) {
    const key = `${table.stageId}:${table.dataPtr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inTable = new Map<string, { quantity: number; endless: boolean }>();
    for (const spawn of table.monsters) {
      const monster = names.resolve("emID", spawn.monsterId);
      if (!monster) continue;
      const entry = inTable.get(monster) ?? { quantity: 0, endless: false };
      if (spawn.quantity === ENDLESS_QUANTITY) entry.endless = true;
      else entry.quantity += spawn.quantity;
      inTable.set(monster, entry);
    }
    for (const [monster, { quantity, endless }] of inTable) {
      const row = stats.get(monster) ?? { max: 0, total: 0, endless: false };
      row.max = Math.max(row.max, quantity);
      row.total += quantity;
      row.endless ||= endless;
      stats.set(monster, row);
    }
  }
  return [...stats.entries()].map(([monster, { max, total, endless }]) => ({
    monster,
    max_quantity: max,
    total_quantity: total,
    ...(endless ? { endless: true as const } : {}),
  }));
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

/**
 * Maps one parsed `.mib` quest to the `data/quests/*.json` shape, or null for
 * an unused/disabled quest slot or a quest on no board (see `questHub`).
 * Large monsters get their stat multipliers from `multipliers`, and the
 * quest its `monster_size` from `sizes`, if given.
 */
export function emitQuest(
  parsed: ParsedQuest,
  multipliers?: MultiplierLookup,
  sizes?: SizeTables,
): EmittedQuest | null {
  if (isPlaceholderQuest(parsed)) return null;
  const { header } = parsed;
  const hub = questHub(header.questId);
  if (!hub) return null;

  return {
    id: header.questId,
    hub,
    rank: questRank(hub, header.rank),
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
    large_monsters: dedupeLargeMonsters(parsed.largeMonsters, header, multipliers, sizes),
    monster_size: monsterSize(parsed, sizes),
    small_monsters: dedupeSmallMonsters(parsed.smallMonsters),
    title: parsed.strings?.title ?? null,
    goal: parsed.strings?.goal ?? null,
    details: parsed.strings?.details ?? null,
    fail: parsed.strings?.fail ?? null,
    client: parsed.strings?.client ?? null,
    requires: QUEST_PREREQUISITES[header.questId] ?? null,
    urgent: URGENT_QUESTS.has(header.questId),
  };
}

export const QUEST_HUB_TO_FILE: Record<QuestHub, string> = {
  village: "quests/village.json",
  guild: "quests/guild.json",
  "training-school": "quests/training-school.json",
  "treasure-hunting": "quests/treasure-hunting.json",
};

/** Maps every parsed quest into the `data/quests/*.json`-shaped output, grouped by hub, dropping unused slots. */
export function emitQuestsFile(
  parsedQuests: ParsedQuest[],
  multipliers?: MultiplierLookup,
  sizes?: SizeTables,
): Record<string, { quests: EmittedQuest[] }> {
  const byHub: Record<QuestHub, EmittedQuest[]> = {
    village: [],
    guild: [],
    "training-school": [],
    "treasure-hunting": [],
  };
  for (const parsed of parsedQuests) {
    const emitted = emitQuest(parsed, multipliers, sizes);
    if (emitted) byHub[emitted.hub].push(emitted);
  }

  const output: Record<string, { quests: EmittedQuest[] }> = {};
  for (const hub of Object.keys(byHub) as QuestHub[]) {
    output[QUEST_HUB_TO_FILE[hub]] = { quests: byHub[hub] };
  }
  return output;
}
