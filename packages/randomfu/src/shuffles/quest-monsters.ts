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
 * Difficulty is the `power` byte, the row of the quest's stat multiplier
 * table (HP, attack, defense, status: mhfu-extract `monsters/multipliers.ts`).
 * New rows stay within those Village and Guild quests of the same table set
 * use (header rank 0 picks set 0, the rest set 1), and with "rank", the same
 * rank: rows past them may be filler.
 */
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
  TARGET_ID_OFFSET,
  type QuestSpawns,
} from "../game/spawns.js";
import { BAND_NAMES, questTier, type Band, type Tier } from "../game/tiers.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import { monsterName, questLabel } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

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
  boards: readonly BoardFile[] = [],
): {
  report: ShuffleReport;
  questsAfter: ParsedQuest[];
  /** Each changed quest's swaps (old emID -> new), by DATA.BIN index. */
  swaps: Map<number, Map<number, number>>;
} {
  const onMap = new Map<number, Set<number>>();
  const bands = new Map<number, Set<Band>>();
  for (const { quest, tier, spawns } of list) {
    const map = habitat(quest.parsed.header.map);
    for (const { monsterId } of spawns.large) {
      (onMap.get(map) ?? onMap.set(map, new Set()).get(map)!).add(monsterId);
      (bands.get(monsterId) ?? bands.set(monsterId, new Set()).get(monsterId)!).add(tier.band);
    }
  }

  const lines: ShuffleReport["lines"] = [];
  const changed = new Map<number, Map<number, number>>();
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

    const payload = edits.quest(quest);
    for (const { offset, monsterId } of [...spawns.large, ...spawns.loads]) {
      const next = mapping.get(monsterId);
      if (next !== undefined) payload.writeUInt16LE(next, offset);
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
    for (const [old, next] of mapping) {
      lines.push({
        where: questLabel(quest),
        text: `${monsterName(next)} (was ${monsterName(old)})`,
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
      return {
        ...q.parsed,
        largeMonsters: q.parsed.largeMonsters.map((m) => ({
          ...m,
          monsterId: mapping.get(m.monsterId) ?? m.monsterId,
        })),
      };
    }),
  };
}

/** The multiplier table set a quest's header rank picks (mhfu-extract `multipliers.ts`). */
const multiplierSet = (quest: LoadedQuest) => (quest.parsed.header.rank === 0 ? 0 : 1);

export function randomizeDifficulty(
  list: readonly QuestMonsters[],
  options: { spread: number; range: "rank" | "any" },
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const key = (q: QuestMonsters) =>
    options.range === "rank"
      ? `${multiplierSet(q.quest)}:${q.tier.band}`
      : `${multiplierSet(q.quest)}`;
  const bounds = new Map<string, [number, number]>();
  for (const q of list) {
    for (const { power } of q.spawns.large) {
      const [lo, hi] = bounds.get(key(q)) ?? [power, power];
      bounds.set(key(q), [Math.min(lo, power), Math.max(hi, power)]);
    }
  }

  const lines: ShuffleReport["lines"] = [];
  for (const q of list) {
    const [lo, hi] = bounds.get(key(q)) ?? [0, 0];
    for (const spawn of q.spawns.large) {
      const delta = rng.int(options.spread * 2 + 1) - options.spread;
      const next = Math.min(hi, Math.max(lo, spawn.power + delta));
      if (next === spawn.power) continue;
      const payload = edits.quest(q.quest);
      payload[spawn.offset + POWER_OFFSET] = next;
      lines.push({
        where: questLabel(q.quest),
        text: `${monsterName(payload.readUInt16LE(spawn.offset))}: level ${next} (was ${spawn.power})`,
      });
    }
  }
  const ranges = [...bounds]
    .map(([k, [lo, hi]]) => {
      const [set, band] = k.split(":");
      return `table set ${set}${band ? `, ${BAND_NAMES[band as Band]}` : ""}: ${lo}-${hi}`;
    })
    .join("; ");
  return {
    title: "Monster difficulty",
    notes: [
      `Large monsters moved up to ${options.spread} difficulty levels (the row of the quest's HP, attack and defense multipliers).`,
      `Levels stay within those quests use: ${ranges}.`,
    ],
    lines,
  };
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
      "Changing it was seen to resize a quest's monsters in game; whether hurtboxes follow is untested.",
    ],
    lines,
  };
}
