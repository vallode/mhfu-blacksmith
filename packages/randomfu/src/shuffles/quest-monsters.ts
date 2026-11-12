/**
 * Quest monsters: which large monsters a quest has, how hard they are, and
 * how many small monsters it has. All edits are in place in the quest's
 * spawn records (`game/spawns.ts`), so every quest file keeps its size.
 * Only Village and Guild quests change (`questTier`).
 *
 * Species. A swap changes every `LargeMonData` and preload (`emLoadTable`)
 * entry for the monster, and the header's `TargetID` and objective slots
 * if they name it, and the `TargetID` of the quest's board records
 * (`game/board.ts`). Two things limit which monsters can trade:
 *
 * - Maps. A monster only goes to a map (day and night alike) where some
 *   Village or Guild quest already has it as a large monster, so Lao-Shan
 *   Lung stays at the Fortress and nothing else goes there, and monsters
 *   that need water, lava or sand go where those are.
 * - Overlays. Each species' code lives in an `emNN.ovl`, and those share
 *   load addresses: nothing shows which monsters can be loaded together.
 *   Variants use their base species' overlay, so "variants" swaps every
 *   monster in a quest; the wider pools only touch quests with one kind of
 *   large monster, which then still have one.
 *
 * The quest's text is renamed separately (`quest-text.ts`). Scripts
 * (`QuestScript`) need nothing: on the EU disc no packet argument is ever
 * a quest's target or one of its monsters (mhfu-extract `quest-probe`).
 *
 * Difficulty is the `power` byte, the row of the stat multiplier table
 * (HP, attack, defense, status: mhfu-extract `monsters/multipliers.ts`).
 * The game picks the table set by the monster (`emChunk +0x14F`: Fatalis
 * and the siege-style elders have their own) and the table by the quest
 * header's `statTable`. A row means something else in another set, and the
 * Fatalis and siege sets are filler past the rows their quests use, so:
 *
 * - a species swap that changes the set also changes the spawn's level, to
 *   the one the new monster usually has with the quest's table and rank;
 * - new levels stay within those Village and Guild quests use for monsters
 *   of the same set and the same table, and with "rank", the same rank.
 */
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  locateMonsterChunks,
  MONSTER_CHUNK_SIZE,
  MULTIPLIER_SET_OFFSET,
} from "mhfu-extract/src/monsters/hitzones.js";
import type { LoadedQuest } from "../game/load.js";
import { RECORD_TARGET_ID, type BoardFile } from "../game/board.js";
import { DELIVERY_TYPE, QUEST_TYPE } from "../game/quest-fields.js";
import {
  readSpawns,
  OBJECTIVE_ID_OFFSET,
  OBJECTIVE_KIND_MONSTER,
  OBJECTIVE_OFFSETS,
  POWER_OFFSET,
  QUANTITY_OFFSET,
  SIZE_PERCENT_OFFSET,
  SIZE_VARIATION_OFFSET,
  SIZE_VARIATIONS,
  TARGET_ID_OFFSET,
  type QuestSpawns,
} from "../game/spawns.js";
import { BAND_NAMES, questTier, type Band, type Tier } from "../game/tiers.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import { monsterName, questLabel } from "../names.js";
import type { Rng } from "../rng.js";
import { median, type ShuffleReport } from "./shuffle.js";

/** Variants that share their base species' skeleton, moves and overlay, by emID. */
export const MONSTER_FAMILIES: readonly (readonly number[])[] = [
  [1, 37, 42], // Rathian, Pink, Gold
  [11, 41, 49], // Rathalos, Silver, Azure
  [2, 36, 71], // Fatalis, Crimson, White
  [6, 38], // Yian Kut-Ku, Blue
  [20, 39], // Gypceros, Purple
  [78, 40], // Yian Garuga, One-Ear
  [14, 43], // Diablos, Black
  [26, 44], // Monoblos, White
  [15, 45], // Khezu, Red
  [21, 46], // Plesioth, Green
  [17, 47], // Gravios, Black
  [48, 86], // Daimyo Hermitaur, Plum
  [67, 87], // Shogun Ceanataur, Terra
  [7, 50], // Lao-Shan Lung, Ashen
  [51, 84], // Blangonga, Copper
  [52, 85], // Congalala, Emerald
  [53, 89], // Rajang, Furious
  [54, 60], // Kushala Daora, Rusted
  [65, 64], // Teostra, Lunastra
  [27, 28, 31, 77], // Velocidrome, Gendrome, Iodrome, Giadrome
];

const FAMILY = new Map<number, readonly number[]>();
for (const family of MONSTER_FAMILIES) for (const id of family) FAMILY.set(id, family);

/** `questHeader.Map`: night versions share their day map's monsters. */
const NIGHT_TO_DAY: Record<number, number> = { 16: 2, 17: 3, 18: 4, 19: 5, 20: 6, 21: 11, 31: 30 };

export function habitat(map: number): number {
  return NIGHT_TO_DAY[map] ?? map;
}

/** The stat multiplier table sets, as `emChunk +0x14F` numbers them. */
const SET_NAMES = ["small monsters", "large monsters", "Fatalis", "siege monsters"];

/** A monster's stat multiplier set, by emID. */
export type MultiplierSetOf = (emId: number) => number;

/** Reads each monster's stat multiplier set from its `emChunk` (`+0x14F`). */
export function multiplierSets(ovl: OvlFile): MultiplierSetOf {
  const found = locateMonsterChunks(ovl);
  if (!found) throw new Error("game_task.ovl: the monster table wasn't found");
  return (emId) => ovl.reader.s8(found.offset + emId * MONSTER_CHUNK_SIZE + MULTIPLIER_SET_OFFSET);
}

export interface QuestMonsters {
  quest: LoadedQuest;
  tier: Tier;
  spawns: QuestSpawns;
}

/** The spawns of every Village and Guild quest. */
export function collectQuestMonsters(quests: readonly LoadedQuest[]): QuestMonsters[] {
  const out: QuestMonsters[] = [];
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    out.push({ quest, tier, spawns: readSpawns(quest.file.payload, quest.parsed.header) });
  }
  return out;
}

export type SpeciesPool = "variants" | "rank" | "any";

const unique = (ids: number[]) => [...new Set(ids)];

/**
 * Swaps large monsters. Returns the report and every quest's parse with its
 * new monsters, for working out where monsters (and their carves) are met.
 */
export function swapSpecies(
  list: readonly QuestMonsters[],
  pool: SpeciesPool,
  rng: Rng,
  edits: Edits,
  allQuests: readonly LoadedQuest[],
  setOf: MultiplierSetOf,
  boards: readonly BoardFile[] = [],
): {
  report: ShuffleReport;
  questsAfter: ParsedQuest[];
  /** Each changed quest's swaps (old emID -> new), by DATA.BIN index. */
  swaps: Map<number, Map<number, number>>;
} {
  const onMap = new Map<number, Set<number>>();
  const bands = new Map<number, Set<Band>>();
  /** Levels by monster or set, quest table and rank (see `usualLevel`). */
  const levels = new Map<string, number[]>();
  const push = (key: string, power: number) =>
    (levels.get(key) ?? levels.set(key, []).get(key)!).push(power);
  for (const { quest, tier, spawns } of list) {
    const map = habitat(quest.parsed.header.map);
    const table = quest.parsed.header.statTable;
    for (const { monsterId, power } of spawns.large) {
      (onMap.get(map) ?? onMap.set(map, new Set()).get(map)!).add(monsterId);
      (bands.get(monsterId) ?? bands.set(monsterId, new Set()).get(monsterId)!).add(tier.band);
      const set = setOf(monsterId);
      push(`m${monsterId}:${table}:${tier.band}`, power);
      push(`s${set}:${table}:${tier.band}`, power);
      push(`s${set}:${tier.band}`, power);
      push(`m${monsterId}`, power);
    }
  }
  /**
   * The level (lower median) a monster usually has in quests of this table
   * and rank; failing that, what its set has there (Lunastra has no G Rank
   * quest), its set at this rank, and last the monster anywhere.
   */
  const usualLevel = (emId: number, table: number, band: Band) => {
    const set = setOf(emId);
    const found =
      levels.get(`m${emId}:${table}:${band}`) ??
      levels.get(`s${set}:${table}:${band}`) ??
      levels.get(`s${set}:${band}`) ??
      levels.get(`m${emId}`)!;
    return median(found, "lower");
  };

  const lines: ShuffleReport["lines"] = [];
  const changed = new Map<number, Map<number, number>>();
  /** Each changed quest's new levels (old emID -> level), where the set changed. */
  const relevelled = new Map<number, Map<number, number>>();
  let mixed = 0;
  let stuck = 0;
  let drawnSame = 0;
  /** Per monster: whether any quest it's in offered it another species. */
  const movable = new Map<number, boolean>();
  for (const { quest, tier, spawns } of list) {
    const species = unique(spawns.large.map((s) => s.monsterId));
    if (species.length === 0) continue;
    if (pool !== "variants" && species.length > 1) {
      mixed++;
      continue;
    }
    const here = onMap.get(habitat(quest.parsed.header.map)) ?? new Set<number>();
    const taken = new Set<number>();
    const mapping = new Map<number, number>();
    let choice = false;
    for (const old of species) {
      const options =
        pool === "variants"
          ? (FAMILY.get(old) ?? [old]).filter((id) => id === old || here.has(id))
          : [...here].filter((id) => pool === "any" || bands.get(id)?.has(tier.band));
      // Never empty: every monster of the quest is on its map, so its family
      // has as many options as the quest has members of it.
      const free = options.filter((id) => !taken.has(id)).sort((a, b) => a - b);
      const others = options.some((id) => id !== old);
      movable.set(old, (movable.get(old) ?? false) || others);
      choice ||= others;
      const next = free.length > 1 ? free[rng.int(free.length)]! : (free[0] ?? old);
      taken.add(next);
      if (next !== old) mapping.set(old, next);
    }
    if (mapping.size === 0) {
      if (choice) drawnSame++;
      else stuck++;
      continue;
    }

    // Another set's rows mean something else: take the new monster's usual level.
    const level = new Map<number, number>();
    for (const [old, next] of mapping) {
      if (setOf(next) !== setOf(old)) {
        level.set(old, usualLevel(next, quest.parsed.header.statTable, tier.band));
      }
    }
    const payload = edits.quest(quest);
    for (const { offset, monsterId } of [...spawns.large, ...spawns.loads]) {
      const next = mapping.get(monsterId);
      if (next !== undefined) payload.writeUInt16LE(next, offset);
    }
    for (const { offset, monsterId } of spawns.large) {
      const next = level.get(monsterId);
      if (next !== undefined) payload[offset + POWER_OFFSET] = next;
    }
    // A delivery quest's TargetID is an item, not a monster.
    const delivery = payload[QUEST_TYPE] === DELIVERY_TYPE;
    const target = mapping.get(payload.readUInt16LE(TARGET_ID_OFFSET));
    if (target !== undefined && !delivery) payload.writeUInt16LE(target, TARGET_ID_OFFSET);
    for (const objective of OBJECTIVE_OFFSETS) {
      if (payload.readUInt32LE(objective) !== OBJECTIVE_KIND_MONSTER) continue;
      const idAt = objective + OBJECTIVE_ID_OFFSET;
      const next = mapping.get(payload.readUInt16LE(idAt));
      if (next !== undefined) payload.writeUInt16LE(next, idAt);
    }
    // The board keeps its own copy of the header, TargetID included.
    for (const board of boards) {
      for (const record of board.records) {
        if (record.questId !== quest.parsed.header.questId || delivery) continue;
        const at = record.offset + RECORD_TARGET_ID;
        const next = mapping.get(board.data.readUInt16LE(at));
        if (next !== undefined) edits.dataFile(board.index).writeUInt16LE(next, at);
      }
    }
    changed.set(quest.index, mapping);
    if (level.size > 0) relevelled.set(quest.index, level);
    for (const [old, next] of mapping) {
      const was = spawns.large.find((s) => s.monsterId === old)?.power;
      const now = level.get(old);
      lines.push({
        where: questLabel(quest),
        text:
          `${monsterName(next)} (was ${monsterName(old)})` +
          (now === undefined ? "" : `, level ${now} (was ${was})`),
      });
    }
  }

  const notes = [
    pool === "variants"
      ? "Each large monster became one of its variants, on maps where that variant is found."
      : `Each large monster became any large monster found on the quest's map${pool === "rank" ? " at the quest's rank" : ""}.`,
  ];
  if (mixed > 0)
    notes.push(`${mixed} quests with more than one kind of large monster were left alone.`);
  if (stuck > 0) {
    notes.push(
      `${stuck} quests kept their monsters because no other ${pool === "variants" ? "variant" : "monster"} is found on their map.`,
    );
  }
  if (drawnSame > 0) notes.push(`${drawnSame} quests drew their own monsters again.`);
  if (relevelled.size > 0) {
    notes.push(
      `${relevelled.size} quests got a monster with another stat table set (Fatalis, Lao-Shan Lung and their kind have their own), which takes the level it usually has with the quest's table and rank.`,
    );
  }
  const neverMoves = [...movable].filter(([, m]) => !m).map(([id]) => monsterName(id));
  if (neverMoves.length > 0) {
    notes.push(
      `Never changed by this pool (no other choice on any of their maps): ${neverMoves.sort().join(", ")}.`,
    );
  }
  return {
    report: { title: "Quest monsters", notes, lines },
    swaps: changed,
    questsAfter: allQuests.map((q) => {
      const mapping = changed.get(q.index);
      if (!mapping) return q.parsed;
      const level = relevelled.get(q.index);
      return {
        ...q.parsed,
        largeMonsters: q.parsed.largeMonsters.map((m) => ({
          ...m,
          monsterId: mapping.get(m.monsterId) ?? m.monsterId,
          power: level?.get(m.monsterId) ?? m.power,
        })),
      };
    }),
  };
}

export function randomizeDifficulty(
  list: readonly QuestMonsters[],
  options: { spread: number; range: "rank" | "any" },
  rng: Rng,
  edits: Edits,
  setOf: MultiplierSetOf,
): ShuffleReport {
  // A level is a row of one table: the monster's set, the quest's table.
  const key = (q: QuestMonsters, emId: number) =>
    `${setOf(emId)}:${q.quest.parsed.header.statTable}` +
    (options.range === "rank" ? `:${q.tier.band}` : "");
  const bounds = new Map<string, [number, number]>();
  for (const q of list) {
    for (const { monsterId, power } of q.spawns.large) {
      const k = key(q, monsterId);
      const [lo, hi] = bounds.get(k) ?? [power, power];
      bounds.set(k, [Math.min(lo, power), Math.max(hi, power)]);
    }
  }

  const lines: ShuffleReport["lines"] = [];
  let unbounded = 0;
  for (const q of list) {
    // As the species swap left them: monsters, and levels it reset.
    const now = readSpawns(edits.questNow(q.quest), q.quest.parsed.header);
    for (const spawn of now.large) {
      const range = bounds.get(key(q, spawn.monsterId));
      if (!range) {
        unbounded++;
        continue;
      }
      const [lo, hi] = range;
      const delta = rng.int(options.spread * 2 + 1) - options.spread;
      const next = Math.min(hi, Math.max(lo, spawn.power + delta));
      if (next === spawn.power) continue;
      const payload = edits.quest(q.quest);
      payload[spawn.offset + POWER_OFFSET] = next;
      lines.push({
        where: questLabel(q.quest),
        text: `${monsterName(spawn.monsterId)}: level ${next} (was ${spawn.power})`,
      });
    }
  }
  const ranges = [...bounds]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, [lo, hi]]) => {
      const [set, table, band] = k.split(":");
      const where = [SET_NAMES[Number(set)] ?? `set ${set}`, `table ${table}`];
      if (band) where.push(BAND_NAMES[band as Band]);
      return `${where.join(", ")}: ${lo}-${hi}`;
    })
    .join("; ");
  const notes = [
    `Large monsters moved up to ${options.spread} difficulty levels (the row of their HP, attack and defense multipliers).`,
    `Levels stay within those quests use for the same monster table set and quest table: ${ranges}.`,
  ];
  if (unbounded > 0) {
    notes.push(
      `${unbounded} large monsters kept their level: no quest uses their table set with their quest's table${options.range === "rank" ? " at that rank" : ""}.`,
    );
  }
  return { title: "Monster difficulty", notes, lines };
}

/** Counts at or above this are left alone: 99 looks like "keeps coming". */
const SPECIAL_COUNT = 99;

export function randomizeSmallCounts(
  list: readonly QuestMonsters[],
  spread: number,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  let cap = 1;
  for (const q of list) {
    for (const { quantity } of q.spawns.small) {
      if (quantity < SPECIAL_COUNT) cap = Math.max(cap, quantity);
    }
  }
  const lines: ShuffleReport["lines"] = [];
  for (const q of list) {
    for (const spawn of q.spawns.small) {
      if (spawn.quantity === 0 || spawn.quantity >= SPECIAL_COUNT) continue;
      const factor = 1 - spread + 2 * spread * rng.float();
      const next = Math.min(cap, Math.max(1, Math.round(spawn.quantity * factor)));
      if (next === spawn.quantity) continue;
      edits.quest(q.quest)[spawn.offset + QUANTITY_OFFSET] = next;
      lines.push({
        where: questLabel(q.quest),
        text: `${monsterName(spawn.monsterId)} x${next} (was x${spawn.quantity})`,
      });
    }
  }
  return {
    title: "Small monster counts",
    notes: [
      `Counts moved by up to ${Math.round(spread * 100)}%, between 1 and ${cap} (the most any quest has). Counts of 0 and ${SPECIAL_COUNT} or more are unchanged.`,
    ],
    lines,
  };
}

/** Size percentages are kept within this (the byte the disc uses holds up to 255). */
const SIZE_LIMITS = [50, 200] as const;

/**
 * Each Village and Guild quest's monster size (`MonSizeModifier`, a
 * percentage), scaled by a random factor within `spread`. Quest-wide: every
 * large monster in the quest gets it. Values the disc doesn't use (0) are
 * left alone.
 */
export function randomizeQuestSize(
  list: readonly QuestMonsters[],
  spread: number,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const lines: ShuffleReport["lines"] = [];
  for (const q of list) {
    if (q.spawns.large.length === 0) continue;
    const size = q.quest.file.payload.readUInt32LE(SIZE_PERCENT_OFFSET);
    if (size === 0 || size > 255) continue;
    const factor = 1 - spread + 2 * spread * rng.float();
    const next = Math.min(SIZE_LIMITS[1], Math.max(SIZE_LIMITS[0], Math.round(size * factor)));
    if (next === size) continue;
    edits.quest(q.quest).writeUInt32LE(next, SIZE_PERCENT_OFFSET);
    lines.push({ where: questLabel(q.quest), text: `size ${next}% (was ${size}%)` });
  }
  return {
    title: "Quest monster size",
    notes: [
      `Each quest's monster size (its header's size percentage) moved by up to ${Math.round(spread * 100)}%, kept between ${SIZE_LIMITS[0]}% and ${SIZE_LIMITS[1]}%.`,
      "Changing it was seen to resize a quest's monsters in game; whether hitboxes follow is untested.",
    ],
    lines,
  };
}

/**
 * Each Village and Guild quest's size variation (`SIZE_VARIATION_OFFSET`):
 * which of the game's five clamps limits its large monsters' size rolls,
 * and so which crowns it can give. "random" picks one per quest, "wide"
 * gives every quest the widest (85-125%), "none" pins every monster at the
 * quest's size.
 */
export function randomizeCrownSpread(
  list: readonly QuestMonsters[],
  mode: "random" | "wide" | "none",
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const lines: ShuffleReport["lines"] = [];
  const label = (v: number) => {
    const [lo, hi] = SIZE_VARIATIONS[v]!;
    return lo === hi ? "none" : `${lo}-${hi}%`;
  };
  for (const q of list) {
    if (q.spawns.large.length === 0) continue;
    const before = q.quest.file.payload[SIZE_VARIATION_OFFSET]!;
    if (before >= SIZE_VARIATIONS.length) continue;
    const next =
      mode === "wide"
        ? SIZE_VARIATIONS.length - 1
        : mode === "none"
          ? 0
          : rng.int(SIZE_VARIATIONS.length);
    if (next === before) continue;
    edits.quest(q.quest).writeUInt8(next, SIZE_VARIATION_OFFSET);
    lines.push({
      where: questLabel(q.quest),
      text: `crown spread ${label(next)} (was ${label(before)})`,
    });
  }
  const how = {
    random:
      "Each quest's crown spread (the range its monsters' sizes roll in) is one of the game's five at random",
    wide: "Every quest's crown spread (the range its monsters' sizes roll in) is the widest, 85-125% of its size",
    none: "Every quest's monsters are exactly the quest's size",
  }[mode];
  return {
    title: "Quest crown spread",
    notes: [
      `${how}. Monsters without crowns stay at 100%, and story quests that hold their monsters at 100% until first cleared still do.`,
    ],
    lines,
  };
}
