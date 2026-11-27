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
import type { LoadedQuest } from "whetstone/src/game/load.js";
import { RECORD_TARGET_ID, recordBase, type BoardFile } from "whetstone/src/game/board.js";
import { GOAL_MONSTER, readGoals, writeGoal } from "../game/goals.js";
import { DELIVERY_TYPE, QUEST_TYPE } from "whetstone/src/game/quest-fields.js";
import {
  readSpawns,
  OBJECTIVE_COUNT_OFFSET,
  OBJECTIVE_ID_OFFSET,
  OBJECTIVE_KIND_MONSTER,
  OBJECTIVE_OFFSETS,
  POWER_OFFSET,
  QUANTITY_OFFSET,
  SIZE_PERCENT_OFFSET,
  SIZE_VARIATION_OFFSET,
  SIZE_VARIATIONS,
  START_POSITION_OFFSET,
  START_ROTATION_OFFSET,
  START_STAGE_OFFSET,
  TARGET_ID_OFFSET,
  type QuestSpawns,
  type Spawn,
} from "../game/spawns.js";
import {
  BAND_NAMES,
  inScope,
  isPlayable,
  questTier,
  type Band,
  type Tier,
} from "whetstone/src/game/tiers.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "whetstone/src/edits.js";
import { questLabel, type MonsterNames } from "whetstone/src/names.js";
import type { Rng } from "../rng.js";
import { getOrInsert, median } from "./shuffle.js";
import type { Report } from "whetstone/src/report.js";

/** Variants that share their base species' skeleton, moves and overlay, by emID. */
export const MONSTER_FAMILIES: readonly (readonly number[])[] = [
  [1, 37, 42], // Rathian, Pink, Gold
  [11, 41, 49], // Rathalos, Silver, Azure
  [2, 36, 71], // Fatalis, Crimson, White
  [6, 38], // Yian Kut-Ku, Blue
  [20, 39], // Gypceros, Purple
  [78, 40], // Yian Garuga, Scarred
  [14, 43], // Diablos, Black
  [26, 44], // Monoblos, White
  [15, 45], // Khezu, Red
  [21, 46], // Plesioth, Green
  [17, 47], // Gravios, Black
  [48, 86], // Daimyo Hermitaur, Plum
  [67, 87], // Shogun Ceanataur, Terra
  [7, 50], // Lao-Shan Lung, Ash
  [51, 84], // Blangonga, Copper
  [52, 85], // Congalala, Emerald
  [53, 89], // Rajang, Furious
  [54, 60], // Kushala Daora, Rusted
  [65, 64], // Teostra, Lunastra
  [27, 28, 31, 77], // Velocidrome, Gendrome, Iodrome, Giadrome
];

const FAMILY = new Map<number, readonly number[]>();
for (const family of MONSTER_FAMILIES) for (const id of family) FAMILY.set(id, family);

/** A monster's family (itself and its variants), by emID. */
export function familyOf(emId: number): readonly number[] {
  return FAMILY.get(emId) ?? [emId];
}

/** A large monster starting point on a map, and the monster the disc starts there. */
export interface Start {
  monster: number;
  stage: number;
  rotation: number;
  x: number;
  y: number;
  z: number;
}

export const pointKey = (s: Pick<Start, "stage" | "x" | "y" | "z">) =>
  `${s.stage}:${s.x}:${s.y}:${s.z}`;

/** The distinct points where the disc starts one of `monster`'s kind (`starts` being one map's). */
export function familyPoints(starts: readonly Start[], monster: number): Start[] {
  const family = familyOf(monster);
  const seen = new Set<string>();
  return starts.filter((s) => {
    if (!family.includes(s.monster) || seen.has(pointKey(s))) return false;
    seen.add(pointKey(s));
    return true;
  });
}

export type Point = Omit<Start, "monster">;

/**
 * Where `monster` starts in place of the large monsters starting at
 * `points`: a point the disc starts its kind at stays (null), each other
 * one moves to a point of its kind that no record takes, `occupied` (the
 * quest's other records) included; `pick` chooses among the free ones.
 * Null if its kind has too few free points on the map.
 */
export function restart(
  starts: readonly Start[],
  monster: number,
  points: readonly Point[],
  pick: (n: number) => number,
  occupied: ReadonlySet<string> = new Set(),
): (Point | null)[] | null {
  const own = familyPoints(starts, monster);
  const ownKeys = new Set(own.map(pointKey));
  const used = new Set([...occupied, ...points.map(pointKey).filter((k) => ownKeys.has(k))]);
  const moves = points.filter((p) => !ownKeys.has(pointKey(p))).length;
  if (own.filter((s) => !used.has(pointKey(s))).length < moves) return null;
  return points.map((p) => {
    if (ownKeys.has(pointKey(p))) return null;
    const free = own.filter((s) => !used.has(pointKey(s)));
    const { monster: _, ...to } = free[pick(free.length)]!;
    used.add(pointKey(to));
    return to;
  });
}

/** A large monster record's starting point. */
export function readStart(payload: Buffer, record: number): Point {
  return {
    stage: payload.readUInt16LE(record + START_STAGE_OFFSET),
    rotation: payload.readUInt32LE(record + START_ROTATION_OFFSET),
    x: payload.readFloatLE(record + START_POSITION_OFFSET),
    y: payload.readFloatLE(record + START_POSITION_OFFSET + 4),
    z: payload.readFloatLE(record + START_POSITION_OFFSET + 8),
  };
}

function writeStart(payload: Buffer, record: number, start: Point): void {
  payload.writeUInt16LE(start.stage, record + START_STAGE_OFFSET);
  payload.writeUInt32LE(start.rotation, record + START_ROTATION_OFFSET);
  payload.writeFloatLE(start.x, record + START_POSITION_OFFSET);
  payload.writeFloatLE(start.y, record + START_POSITION_OFFSET + 4);
  payload.writeFloatLE(start.z, record + START_POSITION_OFFSET + 8);
}

/**
 * Every large monster starting point the Village and Guild quests use, by
 * map (day and night apart: their stages differ). Read from each quest's
 * file, so quests a map move rebuilt count with their new points, which
 * are all points the disc starts the same kind at.
 */
export function collectStartPoints(quests: readonly LoadedQuest[]): Map<number, Start[]> {
  const out = new Map<number, Start[]>();
  const seen = new Set<string>();
  for (const quest of quests) {
    if (!questTier(quest.parsed)) continue;
    const { payload } = quest.file;
    const map = quest.parsed.header.map;
    for (const { offset, monsterId } of readSpawns(payload, quest.parsed.header).large) {
      const start = readStart(payload, offset);
      const key = `${map}:${monsterId}:${pointKey(start)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      getOrInsert(out, map, () => []).push({ monster: monsterId, ...start });
    }
  }
  return out;
}

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

/**
 * A monster's HP in a quest is a signed 16-bit value (its `+0x2E4`), set to
 * `trunc(base HP * hp multiplier)`: past this it wraps negative.
 */
export const MAX_HP = 0x7fff;

/** A row's HP multiplier (multiplier set, quest table, level), or null where the disc has none. */
export type HpMultiplierOf = (set: number, table: number, power: number) => number | null;

/**
 * The most base HP each monster can have: `MAX_HP` over the highest HP
 * multiplier any quest a player can take (`isPlayable`: Training and
 * Treasure ones too) gives a monster of its set, as `edits` has them (after species
 * swaps and difficulty). By set rather than by monster, since the Unknown
 * Monster quests give any monster of a set the levels others of it have.
 */
export function hpLimit(
  quests: readonly LoadedQuest[],
  edits: Edits,
  setOf: MultiplierSetOf,
  hpOf: HpMultiplierOf,
): (emId: number) => number {
  const highest = new Map<number, number>();
  for (const quest of quests) {
    if (!isPlayable(quest.parsed)) continue;
    const { header } = quest.parsed;
    for (const { monsterId, power } of readSpawns(edits.questNow(quest), header).large) {
      const set = setOf(monsterId);
      const hp = hpOf(set, header.statTable, power);
      if (hp !== null && hp > (highest.get(set) ?? 0)) highest.set(set, hp);
    }
  }
  return (emId) => {
    const hp = highest.get(setOf(emId));
    return hp === undefined ? 0xffff : Math.min(0xffff, Math.floor(MAX_HP / hp));
  };
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

export type SpeciesPool = "variants" | "rank" | "adjacent" | "any";

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
  /** Where the disc starts each kind of large monster, by map (`collectStartPoints`). */
  starts: ReadonlyMap<number, readonly Start[]>,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
  boards: readonly BoardFile[] = [],
  /** Whether a monster's HP at a level fits (`MAX_HP`); a swap steps its level down until it does. */
  fits: (emId: number, table: number, power: number) => boolean = () => true,
): {
  report: Report;
  questsAfter: ParsedQuest[];
  /** Each changed quest's swaps (old emID -> new), by DATA.BIN index. */
  swaps: Map<number, Map<number, number>>;
} {
  const onMap = new Map<number, Set<number>>();
  const bands = new Map<number, Set<Band>>();
  /** Levels by monster or set, quest table and rank (see `usualLevel`). */
  const levels = new Map<string, number[]>();
  const push = (key: string, power: number) => getOrInsert(levels, key, () => []).push(power);
  for (const { quest, tier, spawns } of list) {
    const map = habitat(quest.parsed.header.map);
    const table = quest.parsed.header.statTable;
    for (const { monsterId, power } of spawns.large) {
      getOrInsert(onMap, map, () => new Set()).add(monsterId);
      getOrInsert(bands, monsterId, () => new Set()).add(tier.band);
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

  const lines: Report["lines"] = [];
  const changed = new Map<number, Map<number, number>>();
  /** Each changed quest's new levels (old emID -> level), where the set changed. */
  const relevelled = new Map<number, Map<number, number>>();
  const startRng = rng.fork("starts");
  let restarted = 0;
  let otherSet = 0;
  let lowered = 0;
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
    // Only monsters whose kind the disc starts somewhere on this map (by day
    // or by night: their stages differ), so each has a point to start at.
    const mapStarts = starts.get(quest.parsed.header.map) ?? [];
    /** The points the quest's other large monsters start at. */
    const occupiedBy = (monster: number) =>
      new Set(
        spawns.large
          .filter((s) => s.monsterId !== monster)
          .map((s) => pointKey(readStart(quest.file.payload, s.offset))),
      );
    const taken = new Set<number>();
    const mapping = new Map<number, number>();
    let choice = false;
    for (const old of species) {
      const points = spawns.large
        .filter((s) => s.monsterId === old)
        .map((s) => readStart(quest.file.payload, s.offset));
      const occupied = occupiedBy(old);
      const options = (
        pool === "variants"
          ? (FAMILY.get(old) ?? [old]).filter((id) => id === old || here.has(id))
          : [...here].filter(
              (id) =>
                pool === "any" ||
                [...(bands.get(id) ?? [])].some((band) =>
                  inScope(pool, { band: tier.band, stars: 0 }, { band, stars: 0 }),
                ),
            )
      ).filter((id) => id === old || restart(mapStarts, id, points, () => 0, occupied) !== null);
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
    if (level.size > 0) otherSet++;
    const setLevel = new Map(level);
    for (const { offset, monsterId, power } of spawns.large) {
      const next = mapping.get(monsterId);
      if (next === undefined) continue;
      // The set's usual level, or the record's own; never another record's step-down.
      const usual = setLevel.get(monsterId) ?? power;
      let now = usual;
      while (now > 0 && !fits(next, quest.parsed.header.statTable, now)) now--;
      if (now !== usual) lowered++;
      if (setLevel.has(monsterId) || now !== power) {
        level.set(monsterId, now);
        payload[offset + POWER_OFFSET] = now;
      }
    }
    // A monster starts at a point the disc starts its kind at: another's
    // may have no ground it can stand on (water, sand, a nest), and two
    // monsters never share one.
    const movedTo = new Set<string>();
    const moved = new Map<number, string[]>();
    for (const [old, next] of mapping) {
      const records = spawns.large.filter((s) => s.monsterId === old);
      const was = records.map((s) => readStart(payload, s.offset));
      // Only `variants` swaps quests with more than one kind, and a family
      // shares its points, so the options' check still holds after a move.
      const occupied = new Set([...occupiedBy(old), ...movedTo]);
      const to = restart(mapStarts, next, was, (n) => startRng.int(n), occupied)!;
      records.forEach(({ offset }, i) => {
        const point = to[i];
        if (!point) return;
        writeStart(payload, offset, point);
        movedTo.add(pointKey(point));
        getOrInsert(moved, old, () => []).push(`stage ${point.stage} (was ${was[i]!.stage})`);
        restarted++;
      });
    }
    // A delivery quest's TargetID is an item, not a monster.
    const delivery = payload[QUEST_TYPE] === DELIVERY_TYPE;
    const target = mapping.get(payload.readUInt16LE(TARGET_ID_OFFSET));
    if (target !== undefined && !delivery) payload.writeUInt16LE(target, TARGET_ID_OFFSET);
    // And the second goal's ("Hunt the Rathalos and Rathian").
    const second = readGoals(payload)[1]!;
    const secondNext = second.flags & GOAL_MONSTER ? mapping.get(second.id) : undefined;
    if (secondNext !== undefined) writeGoal(payload, 1, { ...second, id: secondNext });
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
        const base = recordBase(record);
        const goal = readGoals(board.data, base)[1]!;
        const goalNext = goal.flags & GOAL_MONSTER ? mapping.get(goal.id) : undefined;
        if (goalNext !== undefined)
          writeGoal(edits.dataFile(board.index), 1, { ...goal, id: goalNext }, base);
      }
    }
    changed.set(quest.index, mapping);
    if (level.size > 0) relevelled.set(quest.index, level);
    for (const [old, next] of mapping) {
      const was = spawns.large.find((s) => s.monsterId === old)?.power;
      const now = level.get(old);
      const start = moved.get(old);
      lines.push({
        where: questLabel(quest),
        text:
          `${monsterName(next)} (was ${monsterName(old)})` +
          (now === undefined ? "" : `, level ${now} (was ${was})`) +
          (start ? `, starts in ${start.join(", ")}` : ""),
      });
    }
  }

  const notes = [
    pool === "variants"
      ? "Each large monster became one of its variants, on maps where that variant is found."
      : `Each large monster became any large monster found on the quest's map${pool === "rank" ? " at the quest's rank" : pool === "adjacent" ? " at the quest's rank or the next" : ""}.`,
  ];
  if (mixed > 0)
    notes.push(`${mixed} quests with more than one kind of large monster were left alone.`);
  if (stuck > 0) {
    notes.push(
      `${stuck} quests kept their monsters because no other ${pool === "variants" ? "variant" : "monster"} is found on their map.`,
    );
  }
  if (drawnSame > 0) notes.push(`${drawnSame} quests drew their own monsters again.`);
  if (otherSet > 0) {
    notes.push(
      `${otherSet} quests got a monster with another stat table set (Fatalis, Lao-Shan Lung and their kind have their own), which takes the level it usually has with the quest's table and rank.`,
    );
  }
  notes.push(
    "A monster only becomes one whose kind the disc starts on the quest's map, and starts at a point where it does: where the old monster's point isn't one, it moves to one of its kind's starting points that no other monster of the quest takes.",
  );
  if (lowered > 0) {
    notes.push(
      `${lowered} swapped monsters took a lower level, where their HP at it would pass ${MAX_HP} and wrap around.`,
    );
  }
  if (restarted > 0) notes.push(`${restarted} swapped monsters moved to another starting point.`);
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
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
  /** Whether a monster at a level keeps its HP within `MAX_HP` (monster, quest table, level). */
  fits: (emId: number, table: number, power: number) => boolean = () => true,
): Report {
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

  const lines: Report["lines"] = [];
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
      let next = Math.min(hi, Math.max(lo, spawn.power + delta));
      // Down towards its own level until its HP fits.
      const table = q.quest.parsed.header.statTable;
      while (next !== spawn.power && !fits(spawn.monsterId, table, next)) {
        next += next > spawn.power ? -1 : 1;
      }
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
    "A level that would take a monster's HP past 32767 (the most the game holds) isn't used: it stays nearer its own.",
  ];
  if (unbounded > 0) {
    notes.push(
      `${unbounded} large monsters kept their level: no quest uses their table set with their quest's table${options.range === "rank" ? " at that rank" : ""}.`,
    );
  }
  return { title: "Monster difficulty", notes, lines };
}

/** Counts at or above this are left alone: 99 looks like "keeps coming". */
export const SPECIAL_COUNT = 99;

/**
 * How many of each small monster a quest must keep, by emID: a slay goal's
 * count (the header's target, not on a delivery, and each objective naming
 * one) and, where `keep` says so, every one the quest has (a delivery's
 * carves). Never more than the quest has, so its own counts always do.
 * Species with an endless spawn need none.
 */
export function smallMonsterFloors(
  q: QuestMonsters,
  keep: (emId: number) => boolean,
  /** The quest as it is now: the goals shuffle may have changed its goals. */
  payload: Buffer = q.quest.file.payload,
): Map<number, number> {
  const own = new Map<number, number>();
  const endless = new Set<number>();
  for (const { monsterId, quantity } of q.spawns.small) {
    if (quantity >= SPECIAL_COUNT) endless.add(monsterId);
    else own.set(monsterId, (own.get(monsterId) ?? 0) + quantity);
  }
  const need = new Map<number, number>();
  const want = (emId: number, count: number) => {
    const have = own.get(emId);
    if (have === undefined || endless.has(emId) || count <= 0) return;
    need.set(emId, Math.min(have, Math.max(need.get(emId) ?? 0, count)));
  };
  if (payload[QUEST_TYPE] !== DELIVERY_TYPE) {
    want(payload.readUInt16LE(TARGET_ID_OFFSET), payload.readUInt16LE(TARGET_ID_OFFSET + 2));
    const second = readGoals(payload)[1]!;
    if (second.flags & GOAL_MONSTER) want(second.id, second.count);
  }
  for (const objective of OBJECTIVE_OFFSETS) {
    if (payload.readUInt32LE(objective) !== OBJECTIVE_KIND_MONSTER) continue;
    want(
      payload.readUInt16LE(objective + OBJECTIVE_ID_OFFSET),
      payload[objective + OBJECTIVE_COUNT_OFFSET]!,
    );
  }
  for (const [emId, have] of own) if (keep(emId)) want(emId, have);
  return need;
}

export function randomizeSmallCounts(
  list: readonly QuestMonsters[],
  spread: number,
  rng: Rng,
  edits: Edits,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
  /** Small monsters a quest keeps at least as many of as it has (`smallMonsterFloors`). */
  keep: (quest: LoadedQuest, emId: number) => boolean = () => false,
): Report {
  let cap = 1;
  for (const q of list) {
    for (const { quantity } of q.spawns.small) {
      if (quantity < SPECIAL_COUNT) cap = Math.max(cap, quantity);
    }
  }
  const lines: Report["lines"] = [];
  let held = 0;
  for (const q of list) {
    const next = new Map<Spawn, number>();
    for (const spawn of q.spawns.small) {
      if (spawn.quantity === 0 || spawn.quantity >= SPECIAL_COUNT) continue;
      const factor = 1 - spread + 2 * spread * rng.float();
      next.set(spawn, Math.min(cap, Math.max(1, Math.round(spawn.quantity * factor))));
    }
    // A goal that asks for more than the new counts give keeps the quest's own.
    let kept = false;
    for (const [emId, need] of smallMonsterFloors(
      q,
      (em) => keep(q.quest, em),
      edits.questNow(q.quest),
    )) {
      const mine = q.spawns.small.filter((s) => s.monsterId === emId);
      const total = mine.reduce((n, s) => n + (next.get(s) ?? s.quantity), 0);
      if (total >= need) continue;
      for (const s of mine) next.delete(s);
      kept = true;
    }
    if (kept) held++;
    for (const [spawn, count] of next) {
      if (count === spawn.quantity) continue;
      edits.quest(q.quest)[spawn.offset + QUANTITY_OFFSET] = count;
      lines.push({
        where: questLabel(q.quest),
        text: `${monsterName(spawn.monsterId)} x${count} (was x${spawn.quantity})`,
      });
    }
  }
  const notes = [
    `Counts moved by up to ${Math.round(spread * 100)}%, between 1 and ${cap} (the most any quest has). Counts of 0 and ${SPECIAL_COUNT} or more are unchanged.`,
    "A quest never has fewer of a small monster than its goal asks to slay, nor fewer of one a delivery is carved from, than it had.",
  ];
  if (held > 0) notes.push(`${held} quests kept some counts as they were for that.`);
  return { title: "Small monster counts", notes, lines };
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
): Report {
  const lines: Report["lines"] = [];
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
): Report {
  const lines: Report["lines"] = [];
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
          : // Spread 0 holds every monster at the quest's size, so no crowns:
            // random only picks among the four that vary it.
            1 + rng.int(SIZE_VARIATIONS.length - 1);
    if (next === before) continue;
    edits.quest(q.quest).writeUInt8(next, SIZE_VARIATION_OFFSET);
    lines.push({
      where: questLabel(q.quest),
      text: `crown spread ${label(next)} (was ${label(before)})`,
    });
  }
  const how = {
    random:
      "Each quest's crown spread (the range its monsters' sizes roll in) is one of the game's four that vary it, at random",
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
