/**
 * Quest maps: moving Village and Guild quests to other maps, and where
 * their large monsters start. Both work on quest documents (mhfu-extract
 * `quests/document.ts`), which `randomize.ts` rebuilds afterwards
 * (`game/rebuild.ts`).
 *
 * What in a quest belongs to its map, from all 551 quests on the EU disc:
 *
 * - Stages (areas) are numbered across the whole game, and a map's day and
 *   night versions have different ones (Forest and Hills: 32-43 by day,
 *   184-196 by night). Small monster areas and each large monster's
 *   starting stage name them.
 * - Gathering points: each map's quests share one node layout (two on some
 *   maps, by rank), the nodes pointing into the quest's gathering item
 *   tables by index.
 * - `UnknPTR2`, read as position sets per stage: only the Jungle (Day) has
 *   any (three, the same in all 28 of its quests).
 * - A large monster record's stage, rotation and position. The rest of it
 *   (flag, the two `DynamicData` blocks, the timers and wave order seen
 *   there) is the quest's own.
 * - Nothing else: the header's unknown bytes and the quest script vary
 *   within a map and name no stage.
 *
 * So a moved quest takes, from a quest already on the new map (the donor):
 * its gathering points and item tables, position sets and small monsters.
 * Each large monster gets a starting point where the disc's quests start
 * one of its kind on that map (a map with none for it isn't offered).
 * Everything else stays: monsters, rewards, supplies, terms, text and
 * script.
 */
import type { QuestDoc, Spawn } from "mhfu-extract/src/quests/document.js";
import { MAP_NAMES } from "mhfu-extract/src/tables/quest-maps.js";
import type { Edits } from "../edits.js";
import { RECORD_MAP, type BoardFile } from "../game/board.js";
import type { LoadedQuest } from "../game/load.js";
import { DELIVERY_TYPE } from "../game/quest-fields.js";
import { questDoc } from "../game/rebuild.js";
import { OBJECTIVE_KIND_MONSTER } from "../game/spawns.js";
import { questTier, type Tier } from "../game/tiers.js";
import { questLabel, type MonsterNames } from "../names.js";
import type { Rng } from "../rng.js";
import {
  collectStartPoints,
  familyOf,
  familyPoints,
  habitat,
  pointKey,
  type Start,
} from "./quest-monsters.js";
import { getOrInsert, groupBy, type ShuffleReport } from "./shuffle.js";

/** A Village or Guild quest as a document. */
export interface DocQuest {
  quest: LoadedQuest;
  tier: Tier;
  /** As on the disc. Never edited. */
  vanilla: QuestDoc;
  /** As the shuffles so far left it. */
  doc: QuestDoc;
}

/** Every Village and Guild quest that survives a rebuild, and the paths of those that don't. */
export function collectDocQuests(quests: readonly LoadedQuest[]): {
  list: DocQuest[];
  locked: string[];
} {
  const list: DocQuest[] = [];
  const locked: string[] = [];
  for (const quest of quests) {
    const tier = questTier(quest.parsed);
    if (!tier) continue;
    const vanilla = questDoc(quest);
    if (vanilla) list.push({ quest, tier, vanilla, doc: structuredClone(vanilla) });
    else locked.push(quest.path);
  }
  return { list, locked };
}

export const mapName = (map: number) => MAP_NAMES[map] ?? `map ${map}`;

export function largeSpecies(doc: QuestDoc): number[] {
  return [...new Set(doc.large.flatMap((g) => g.spawns.map((s) => s.monster)))];
}

/** The monsters a quest's goal names: its objectives' and (not on a delivery) its target. */
export function namedMonsters(doc: QuestDoc): number[] {
  const named = doc.header.objectives
    .filter((o) => o.kind === OBJECTIVE_KIND_MONSTER)
    .map((o) => o.id);
  if (!isDelivery(doc) && doc.header.targetId !== 0) named.push(doc.header.targetId);
  return [...new Set(named)];
}

export const isDelivery = (doc: QuestDoc) => (doc.header.questType & 0xff) === DELIVERY_TYPE;

/** Why a quest stays on its map, or null if it can move. */
export function staysOnMap(doc: QuestDoc): string | null {
  if (isDelivery(doc)) return "a delivery quest (its item is found on its own map)";
  if (doc.header.objectives.some((o) => o.kind !== 0 && o.kind !== OBJECTIVE_KIND_MONSTER)) {
    return "an item to deliver";
  }
  const species = largeSpecies(doc);
  if (species.length === 0) return "no large monsters";
  if (namedMonsters(doc).some((id) => !species.includes(id))) {
    return "a small monster target";
  }
  return null;
}

/**
 * A starting point for `monster`: one its family starts at (a point another
 * monster starts at may be off its ground) that this quest hasn't used, so
 * no two monsters share one; null if there's none left.
 */
function pickStart(
  starts: readonly Start[],
  monster: number,
  used: Set<string>,
  rng: Rng,
): Start | null {
  const family = familyOf(monster);
  const own = starts.filter((s) => family.includes(s.monster));
  const free = own.filter((s) => !used.has(pointKey(s)));
  return free.length > 0 ? free[rng.int(free.length)]! : null;
}

/** Whether each kind of the quest's large monsters starts at enough points on a map for all of its records. */
function roomFor(doc: QuestDoc, starts: readonly Start[]): boolean {
  const spawns = doc.large.flatMap((g) => g.spawns);
  const kinds = groupBy(spawns, (s) => familyOf(s.monster).join(","));
  return [...kinds.values()].every(
    (records) => familyPoints(starts, records[0]!.monster).length >= records.length,
  );
}

/**
 * Each large monster at a new starting point from `starts` (`pickStart`);
 * one with none left keeps its own and counts in `missing`, and the caller
 * keeps the quest as it was.
 */
function placeLarge(
  doc: QuestDoc,
  starts: readonly Start[],
  rng: Rng,
): { large: QuestDoc["large"]; moved: { spawn: Spawn; to: Start }[]; missing: number } {
  const used = new Set<string>();
  const moved: { spawn: Spawn; to: Start }[] = [];
  let missing = 0;
  const large = doc.large.map((group) => ({
    ...group,
    spawns: group.spawns.map((spawn) => {
      const to = pickStart(starts, spawn.monster, used, rng);
      if (!to) {
        missing++;
        return spawn;
      }
      used.add(pointKey(to));
      moved.push({ spawn, to });
      const { stage, rotation, x, y, z } = to;
      return { ...spawn, stage, rotation, x, y, z };
    }),
  }));
  return { large, moved, missing };
}

export type MapPool = "time" | "any";

/**
 * Moves quests to other maps (see the file comment). `fits` says whether a
 * document still fits its quest's sectors; a donor whose map parts make it
 * too big is passed over for another.
 */
export function moveQuests(
  list: readonly DocQuest[],
  pool: MapPool,
  rng: Rng,
  fits: (entry: DocQuest, doc: QuestDoc) => boolean,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
): { report: ShuffleReport; moved: Set<DocQuest> } {
  const donors = groupBy(list, (e) => e.vanilla.header.map);
  const starts = collectStartPoints(list.map((e) => e.quest));
  /** Large monsters found on each habitat (day and night together). */
  const found = new Map<number, Set<number>>();
  for (const { vanilla } of list) {
    const h = habitat(vanilla.header.map);
    for (const id of largeSpecies(vanilla)) getOrInsert(found, h, () => new Set()).add(id);
  }
  /** The `spawn` header bytes each map's quests use (2 at the Fortress and Castle Schrade). */
  const spawnValues = new Map<number, Set<number>>();
  for (const { vanilla } of list) {
    const m = vanilla.header.map;
    getOrInsert(spawnValues, m, () => new Set()).add(vanilla.header.spawn);
  }
  const maps = [...donors.keys()].sort((a, b) => a - b);

  const lines: ShuffleReport["lines"] = [];
  const moved = new Set<DocQuest>();
  const stays = new Map<string, number>();
  let nowhere = 0;
  let full = 0;
  for (const entry of list) {
    const why = staysOnMap(entry.doc);
    if (why) {
      stays.set(why, (stays.get(why) ?? 0) + 1);
      continue;
    }
    const from = entry.doc.header.map;
    const species = largeSpecies(entry.doc);
    // Only maps where the disc starts each of the quest's monsters' kinds at
    // enough points for one each.
    const options = maps.filter(
      (m) =>
        m !== from &&
        (pool === "time"
          ? habitat(m) === habitat(from)
          : species.every((id) => found.get(habitat(m))?.has(id))) &&
        roomFor(entry.doc, starts.get(m) ?? []),
    );
    if (options.length === 0) {
      nowhere++;
      continue;
    }
    const to = options[rng.int(options.length)]!;
    // Donors of the quest's own rank first, so its gathering and small monsters match it.
    const candidates = donors.get(to)!;
    const order = [
      ...rng.shuffle(candidates.filter((d) => d.tier.band === entry.tier.band)),
      ...rng.shuffle(candidates.filter((d) => d.tier.band !== entry.tier.band)),
    ];
    // Every map offered has a starting point for each monster; kinds that
    // share a point could still run short.
    const placed = placeLarge(entry.doc, starts.get(to) ?? [], rng);
    if (placed.missing > 0) {
      nowhere++;
      continue;
    }
    let done = false;
    for (const donor of order) {
      const { vanilla } = donor;
      const spawn = spawnValues.get(to)!.has(entry.doc.header.spawn)
        ? entry.doc.header.spawn
        : vanilla.header.spawn;
      const next: QuestDoc = {
        ...entry.doc,
        header: { ...entry.doc.header, map: to, spawn },
        gatherTables: structuredClone(vanilla.gatherTables),
        gatherAreas: structuredClone(vanilla.gatherAreas),
        positions: structuredClone(vanilla.positions),
        small: structuredClone(vanilla.small),
        large: placed.large,
      };
      if (!fits(entry, next)) continue;
      entry.doc = next;
      moved.add(entry);
      lines.push({
        where: questLabel(entry.quest),
        text:
          `${mapName(to)} (was ${mapName(from)}); gathering and small monsters as in ${questLabel(donor.quest)}; ` +
          placed.moved
            .map((m) => `${monsterName(m.spawn.monster)} starts in stage ${m.to.stage}`)
            .join(", "),
      });
      done = true;
      break;
    }
    if (!done) full++;
  }

  const notes = [
    pool === "time"
      ? "Quests moved to the same place at the other time of day (Forest and Hills by day to by night, and so on), where the disc's quests start each of their large monsters' kinds."
      : "Quests moved to any map where the disc's Village and Guild quests have all of their large monsters and start each one's kind.",
    "A moved quest takes its gathering points and small monsters from a quest on its new map (one of its own rank where there is one), and each large monster starts where the disc's quests start one of its kind there. Monsters, rewards, supplies, money and text stay.",
    "The quest's text still names its old map where it does; the Quest Details screen shows the new one.",
  ];
  for (const [why, n] of stays) notes.push(`${n} quests stayed: ${why}.`);
  if (nowhere > 0) {
    notes.push(
      `${nowhere} quests stayed: no other map${pool === "time" ? " at another time of day" : ""} has all of their large monsters with somewhere to start.`,
    );
  }
  if (full > 0) notes.push(`${full} quests stayed: no new map's parts fit in their file.`);
  return { report: { title: "Quest maps", notes, lines }, moved };
}

/** New starting points for the large monsters of quests that didn't move. */
export function randomizeStarts(
  list: readonly DocQuest[],
  skip: ReadonlySet<DocQuest>,
  rng: Rng,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
): ShuffleReport {
  const starts = collectStartPoints(list.map((e) => e.quest));
  const lines: ShuffleReport["lines"] = [];
  for (const entry of list) {
    if (skip.has(entry)) continue;
    const placed = placeLarge(entry.doc, starts.get(entry.doc.header.map) ?? [], rng);
    if (placed.missing > 0) continue;
    const real = placed.moved.filter((m) => pointKey(m.spawn) !== pointKey(m.to));
    if (real.length === 0) continue;
    entry.doc = { ...entry.doc, large: placed.large };
    for (const { spawn, to } of real) {
      lines.push({
        where: questLabel(entry.quest),
        text: `${monsterName(spawn.monster)} starts in stage ${to.stage} (was ${spawn.stage})`,
      });
    }
  }
  return {
    title: "Large monster starts",
    notes: [
      "Each large monster starts at a point where the disc's quests start one of its own kind on the same map (no two of a quest's monsters share one; a quest whose kinds have too few points keeps its own starts). Monsters still roam as usual afterwards.",
    ],
    lines,
  };
}

/** Points every board record of each moved quest at its new map. */
export function updateBoardMaps(
  moved: Iterable<DocQuest>,
  boards: readonly BoardFile[],
  edits: Edits,
): void {
  for (const { quest, doc } of moved) {
    for (const board of boards) {
      for (const record of board.records) {
        if (record.questId !== quest.parsed.header.questId) continue;
        edits.dataFile(board.index)[record.offset + RECORD_MAP] = doc.header.map;
      }
    }
  }
}
