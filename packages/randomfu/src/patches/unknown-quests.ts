/**
 * "Unknown Monster?!" investigation quests (`quests.unknown`): one quest
 * for high rank and one for G rank, on the Guild 8★ and G★3 boards (low
 * rank is left for getting used to the randomizer), whose monster,
 * map, size, crowns, difficulty and rewards are rolled again every time it's
 * accepted, by blob code (`blob/unknown-quests.c`, on the code loader and
 * its quest load hook, `game-hooks.ts`). This file builds what the blob
 * reads, from the quests as the other shuffles left them, and adds the
 * quests' board records.
 *
 * What the game does (found on the EU and JP discs):
 *
 * - Each board star has a 0-terminated u16 list of quest IDs, reached from
 *   one EBOOT pointer table (EU 0x089B1E64, JP 0x089AEF28): entries 0-10 a
 *   list per board file, 11-21 the Guild boards per star (G★1-3 are 9-11),
 *   22-32 the Village boards, then subsets. A count function walks them
 *   (EU 0x088552E0). The town copies at most 80 IDs a star, so a list can
 *   take one more by pointing its entry at a longer copy, which the blob
 *   does after every load: the lists are packed, with no room to grow.
 * - The town shows a quest from its record in the star's `levelN.mib`
 *   (`board.ts`), found by quest ID; `addBoardRecord` adds one.
 * - The game keeps clear flags for some IDs no quest on the disc uses
 *   (EU table 0x0899C0A8): Village 10512 (6★), Guild 2237 (8★) and 3234
 *   (G★3) are three of them, so clearing these quests is remembered. The
 *   Village one is unused.
 * - Quest files are read and decrypted into a 0x6800-byte buffer by a loader
 *   (`game-hooks.ts`) that maps the ID to its file. The blob swaps the new
 *   ID for a template quest's before the call and edits the decrypted quest
 *   after it; new rewards and text go after its end, within the buffer.
 *
 * - The header's `spawn` byte (0x45) is where the hunter starts: 0 base
 *   camp, 1 a random area (most high and G rank Guild quests), 2 only on
 *   arena-like maps. Each roll takes one of the values the quests on the
 *   template's map use.
 *
 * Accepting rolls; departing loads the quest again (the game reads it from
 * disc once more) and gets the same roll. Only the person accepting rolls,
 * so in ad-hoc play the others' quest differs: solo only, for now.
 */
import { Writer } from "mhfu-extract/src/quests/document.js";
import { parseQuest, type RewardTable } from "mhfu-extract/src/quests/parser.js";
import { decodeObjects } from "../blob/link.js";
import { UNKNOWN_QUESTS_OBJECTS } from "../blob/unknown-quests-object.js";
import type { Edits } from "../edits.js";
import { addBoardRecord } from "../game/board-add.js";
import { RECORD_HEADER_SIZE, RECORD_QUEST_ID, align } from "../game/board.js";
import type { GameData, LoadedQuest } from "../game/load.js";
import { FEE, PENALTY, QUEST_TYPE, REWARD } from "../game/quest-fields.js";
import { POWER_OFFSET, readSpawns, type QuestSpawns } from "../game/spawns.js";
import { BANDS, questTier, type Band } from "../game/tiers.js";
import { monsterNames, type MonsterNames } from "../names.js";
import type { ShuffleReport, SpoilerLine } from "../shuffles/shuffle.js";
import { habitat, type MultiplierSetOf } from "../shuffles/quest-monsters.js";
import { findImports } from "./code-loader.js";
import { findQuestLoadSites, type QuestLoadSites } from "./game-hooks.js";
import { codeSegment, findUnique, hiLo, maskWord, type Segment } from "./mips.js";

export interface UnknownSlot {
  band: Band;
  /** A quest ID the game keeps a clear flag for, that no quest uses. */
  id: number;
  board: "guild" | "village";
  /** The board's star list (1-11; Guild 9-11 are G★1-3). */
  star: number;
  /** The header's star byte. */
  stars: number;
  level: string;
}

export const UNKNOWN_SLOTS: readonly UnknownSlot[] = [
  { band: "high", id: 2237, board: "guild", star: 8, stars: 8, level: "mission_jpn/level8.mib" },
  { band: "g", id: 3234, board: "guild", star: 11, stars: 11, level: "mission_jpn/level11.mib" },
];

/** The list pointer table's groups: per board file, Guild per star, Village per star. */
const LIST_GROUP = { guild: 11, village: 22 } as const;
export const listIndex = (slot: UnknownSlot) => LIST_GROUP[slot.board] + slot.star - 1;

/**
 * The board lists' count function (EU 0x088552E0), masked, up to the `lui`
 * of the pointer table; the `addiu` follows, then `LIST_COUNT_TAIL`.
 */
export const LIST_COUNT_SIGNATURE = [
  0x27bdffe0, 0xafbf0000, 0xafb30000, 0xafb20000, 0xafb10000, 0xafb00000, 0x00809821, 0x00008021,
  0x00009021, 0x324200ff, 0x00021880, 0x3c020000,
];
const LIST_COUNT_TAIL = [
  0x00431021, 0x8c510000, 0x96250000, 0x50a00022, 0x26420001, 0x24020000, 0x50a2001b, 0x26310002,
  0x24020000, 0x10a20017,
];
const LIST_TABLE_ENTRIES = 33;
/** The town copies at most 80 quests of a star's list. */
const BOARD_MAX = 80;

const SYSTEM_TIME_LOW_NID = 0x369ed59d;

/** questType bits (the decomp's MissionFlag). */
const SLAYING = 1 << 0;
const HUNTING = 1 << 2;
/** Fortress, Paw Pass, marathon, epic, tutorial and training quests aren't plain hunts. */
const SPECIAL = (1 << 18) | (1 << 19) | (1 << 21) | (1 << 22) | (1 << 23) | (1 << 24);
/** Urgent and key quests move the story on (the blob clears them). */
const STORY = (1 << 25) | (1 << 26);

/** Reward table kinds (`RewardTable.unkn1`). */
const MAIN = 0x8000;
const EXTRA = 0x8001;
/** An elder dragon's quests add a table for slaying it. */
const SLAIN = 1;
/** The loader's buffer: the quest and the rewards and text the blob adds after it. */
const QUEST_MAX = 0x6800;

/** The quests' text, on the board and in the quest. */
const TEXT = {
  title: "Unknown Monster?!",
  goal: "Hunt the ",
  fail: "Reward Zero\nTime Over",
  details:
    "Hunters keep reporting a\nmonster no one can name.\nFind out what it is and\n" +
    "hunt it down. It's never\nthe same twice, so come\nprepared for anything!",
  client: "Guild Researcher",
  unknown: "???",
};

const utf8 = (text: string) => Buffer.byteLength(text, "utf8");

/** The bytes `write_rewards` (blob/unknown-quests.c) writes for a set. */
export const rewardBytes = (set: readonly RewardTable[]) =>
  align(set.length * 8 + 4 + set.reduce((n, t) => n + t.items.length * 6 + 6, 0));

/** The bytes `write_text` writes with `name`: the strings, then StringPTRs and LangPTRs. */
export const textBytes = (name: string) =>
  align(
    [TEXT.title, TEXT.goal + name, TEXT.fail, TEXT.details, name, TEXT.client].reduce(
      (n, text) => n + utf8(text) + 1,
      0,
    ),
  ) +
  6 * 4 +
  7 * 4;

export interface Template {
  quest: LoadedQuest;
  payload: Buffer;
  map: number;
  species: number;
  /** Payload offsets of every species field (records and preload list). */
  speciesAt: number[];
  levelAt: number[];
  /** The `spawn` header values (where the hunter starts) a roll picks from. */
  starts: number[];
}

export interface Choice {
  species: number;
  level: [number, number];
  /** Reward sets, each a quest's tables; none keeps the template's. */
  rewards: RewardTable[][];
}

export interface SlotTables {
  slot: UnknownSlot;
  templates: { template: Template; choices: Choice[] }[];
  fee: number;
  reward: number;
  penalty: number;
  size: [number, number];
  /** The highest size variation (`SIZE_VARIATIONS`) the rank's quests use. */
  crowns: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const percentile = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 100;
const push = <K, V>(map: Map<K, V[]>, key: K, value: V) =>
  (map.get(key) ?? map.set(key, []).get(key)!).push(value);

interface Seen {
  quest: LoadedQuest;
  band: Band;
  payload: Buffer;
  parsed: ReturnType<typeof parseQuest>;
  spawns: QuestSpawns;
}

/** Every slot's templates and rolls, from the quests as `edits` has them. */
export function unknownTables(
  quests: readonly LoadedQuest[],
  edits: Edits,
  setOf: MultiplierSetOf,
  monsterName: MonsterNames,
): SlotTables[] {
  const all: Seen[] = quests.flatMap((quest) => {
    const tier = questTier(quest.parsed);
    if (!tier) return [];
    const payload = edits.questNow(quest);
    const parsed = parseQuest(payload);
    return [
      { quest, band: tier.band, payload, parsed, spawns: readSpawns(payload, parsed.header) },
    ];
  });

  // Where each monster is met: any Village or Guild quest, any rank.
  const onMap = new Map<number, Set<number>>();
  // Where the hunter starts (the header's `spawn`) on each map, by day and night apart.
  const startsOn = new Map<number, Set<number>>();
  for (const { parsed, spawns } of all) {
    const map = habitat(parsed.header.map);
    for (const { monsterId } of spawns.large) {
      (onMap.get(map) ?? onMap.set(map, new Set()).get(map)!).add(monsterId);
    }
    const starts = startsOn.get(parsed.header.map) ?? new Set();
    startsOn.set(parsed.header.map, starts.add(parsed.header.spawn));
  }

  const kinds = (rewards: RewardTable[], allowed: number[]) =>
    rewards.some((t) => t.unkn1 === MAIN) && rewards.every((t) => allowed.includes(t.unkn1));
  const speciesOf = (q: Seen) => new Set(q.spawns.large.map((s) => s.monsterId));
  const inRank = (band: Band) => all.filter((q) => q.band === band && q.parsed.header.rank !== 0);

  // Rewards by rank: each quest that's only that monster gives a set; a
  // monster met only alongside others gets those quests' main tables.
  const rewards = new Map<string, RewardTable[][]>();
  const shared = new Map<string, RewardTable[][]>();
  for (const band of BANDS) {
    for (const q of inRank(band)) {
      const species = speciesOf(q);
      if (species.size === 1 && kinds(q.parsed.rewards, [MAIN, EXTRA, SLAIN])) {
        push(rewards, `${band}:${[...species][0]!}`, q.parsed.rewards);
      } else if (species.size > 1) {
        const main = q.parsed.rewards.filter((t) => t.unkn1 === MAIN);
        if (main.length === 1) for (const em of species) push(shared, `${band}:${em}`, main);
      }
    }
  }
  // A monster this rank never gives rewards for gets a lower rank's, then the template's.
  const rewardsFor = (band: Band, em: number): RewardTable[][] => {
    for (const b of BANDS.slice(0, BANDS.indexOf(band) + 1).reverse()) {
      const found = rewards.get(`${b}:${em}`) ?? shared.get(`${b}:${em}`);
      if (found) return found;
    }
    return [];
  };

  return UNKNOWN_SLOTS.map((slot) => {
    const ranked = inRank(slot.band);

    // Templates: plain hunts of one large monster.
    const templates: Template[] = [];
    for (const q of ranked) {
      const { header } = q.parsed;
      const species = speciesOf(q);
      if (species.size !== 1) continue;
      if (!(header.questType & (HUNTING | SLAYING)) || header.questType & SPECIAL) continue;
      if (q.spawns.large.some((s) => s.quantity !== 1) || header.targetNum !== 1) continue;
      if (!kinds(q.parsed.rewards, [MAIN, EXTRA])) continue;
      templates.push({
        quest: q.quest,
        payload: q.payload,
        map: header.map,
        species: [...species][0]!,
        speciesAt: [...q.spawns.large, ...q.spawns.loads].map((s) => s.offset),
        levelAt: q.spawns.large.map((s) => s.offset + POWER_OFFSET),
        starts: [...(startsOn.get(header.map) ?? [])].sort((a, b) => a - b),
      });
    }

    // Levels: what this rank's quests near the slot's star give each multiplier set.
    const near = ranked.filter((q) => q.parsed.header.questStars >= slot.stars - 1);
    const levels = new Map<string, number[]>();
    for (const q of near.length > 0 ? near : ranked) {
      for (const s of q.spawns.large) {
        push(levels, `${setOf(s.monsterId)}:${q.parsed.header.statTable}`, s.power);
      }
    }

    const sizes = ranked.map((q) => q.parsed.header.monSizeModifier & 0xff);
    const money = near.filter((q) => (q.parsed.header.questType & HUNTING) !== 0);
    return {
      slot,
      templates: templates.flatMap((template) => {
        const set = setOf(template.species);
        const species = [...(onMap.get(habitat(template.map)) ?? [])].filter(
          (em) => setOf(em) === set,
        );
        // A stat table no quest near the star uses keeps the template's levels.
        const range = levels.get(`${set}:${template.quest.parsed.header.statTable}`) ?? [
          ...template.levelAt.map((at) => template.payload[at]!),
        ];
        const level: [number, number] = [Math.min(...range), Math.max(...range)];
        const choices = species
          .sort((a, b) => a - b)
          .flatMap((em) => {
            // What the blob writes after the quest must stay inside the loader's buffer.
            const room =
              QUEST_MAX -
              align(template.payload.length) -
              Math.max(textBytes(monsterName(em)), textBytes(TEXT.unknown));
            if (room < 0) return [];
            const rewards = rewardsFor(slot.band, em).filter((r) => rewardBytes(r) <= room);
            return [{ species: em, level, rewards }];
          });
        return choices.length > 0 ? [{ template, choices }] : [];
      }),
      fee: median(money.map((q) => q.parsed.header.fee)),
      reward: median(money.map((q) => q.parsed.header.reward)),
      penalty: median(money.map((q) => q.parsed.header.penalty)),
      size: [percentile(sizes, 0.1), percentile(sizes, 0.9)],
      crowns: Math.max(0, ...ranked.map((q) => q.parsed.header.sizeVariation)),
    };
  });
}

/** The board's list pointer table, or why it can't be found. */
export function findListTable(vanillaEboot: Buffer, segment: Segment): number | string {
  const [count] = findUnique(vanillaEboot, segment, [LIST_COUNT_SIGNATURE]);
  if (count == null) return "this EBOOT's quest board lists don't match";
  const at = segment.offset + (count - segment.vaddr);
  const words = (from: number, n: number) =>
    Array.from({ length: n }, (_, k) => vanillaEboot.readUInt32LE(at + (from + k) * 4));
  const [lui, addiu] = words(LIST_COUNT_SIGNATURE.length - 1, 2);
  const tail = words(LIST_COUNT_SIGNATURE.length + 1, LIST_COUNT_TAIL.length).map(maskWord);
  if (addiu! >>> 16 !== 0x2442 || tail.some((w, k) => w !== LIST_COUNT_TAIL[k])) {
    return "this EBOOT's quest board lists don't match";
  }
  return hiLo(lui!, addiu!);
}

/** A u16 list at `vaddr` in the EBOOT, up to its 0. */
function readList(eboot: Buffer, segment: Segment, vaddr: number): number[] | null {
  if (vaddr < segment.vaddr || vaddr >= segment.vaddr + segment.size) return null;
  const ids: number[] = [];
  for (let at = segment.offset + (vaddr - segment.vaddr); ; at += 2) {
    const id = eboot.readUInt16LE(at);
    if (id === 0) return ids;
    ids.push(id);
    if (ids.length > 1000) return null;
  }
}

const SLOT_BYTES = 36;
const DATA_MAGIC = 0x31445155;

/** `struct data` for `blob/unknown-quests.c`; `lists` are the boards' lists' EBOOT addresses. */
export function encodeTables(
  tables: readonly SlotTables[],
  lists: readonly number[],
  monsterName: MonsterNames,
): Buffer {
  const w = new Writer();
  w.fill(0, 16); // struct data, patched at the end
  const slots = w.pos;
  w.fill(0, tables.length * SLOT_BYTES);

  // Monster names, for the quest's goal once it starts: a u16 offset per emID, then the names.
  const species = [
    ...new Set(tables.flatMap((t) => t.templates.flatMap((x) => x.choices.map((c) => c.species)))),
  ];
  const names = w.pos;
  const nameText = new Map(species.map((em) => [em, Buffer.from(`${monsterName(em)}\0`, "utf8")]));
  const count = Math.max(0, ...species) + 1;
  const nameAt = new Array<number>(count).fill(0);
  let next = count * 2;
  for (const [em, text] of nameText) {
    nameAt[em] = next;
    next += text.length;
  }
  for (const offset of nameAt) w.u16(offset);
  for (const text of nameText.values()) w.bytes(text);

  // Reward sets, shared wherever they're the same.
  const sets = new Map<string, number>();
  const setAt = (rewards: RewardTable[]) => {
    const values = [rewards.length];
    for (const t of rewards) {
      values.push(t.unkn1, t.unkn2, t.items.length);
      for (const item of t.items) values.push(item.chance, item.itemId, item.amount);
    }
    const key = values.join(",");
    if (!sets.has(key)) {
      w.align(4);
      sets.set(key, w.pos);
      for (const v of values) w.u16(v);
    }
    return sets.get(key)!;
  };
  const rewardLists = new Map<string, number>();
  const rewardList = (rewards: RewardTable[][]) => {
    const offsets = rewards.map(setAt);
    const key = offsets.join(",");
    if (!rewardLists.has(key)) {
      w.align(4);
      rewardLists.set(key, w.pos);
      for (const offset of offsets) w.u32(offset);
    }
    return rewardLists.get(key)!;
  };

  tables.forEach((t, k) => {
    const text = w.pos;
    w.bytes(
      Buffer.from(
        [TEXT.title, TEXT.goal, TEXT.fail, TEXT.details, TEXT.client, TEXT.unknown]
          .map((s) => `${s}\0`)
          .join(""),
        "utf8",
      ),
    );
    const templates = t.templates.map(({ template, choices }) => {
      const rewardsAt = choices.map((c) => (c.rewards.length > 0 ? rewardList(c.rewards) : 0));
      w.align(4);
      const choiceAt = w.pos;
      choices.forEach((c, n) => {
        w.u8(c.species);
        w.u8(c.level[0]);
        w.u8(c.level[1]);
        w.u8(c.rewards.length);
        w.u32(rewardsAt[n]!);
      });
      const patchAt = w.pos;
      for (const v of [...template.speciesAt, 0, ...template.levelAt, 0]) w.u16(v);
      return { template, choices: choices.length, choiceAt, patchAt };
    });
    w.align(4);
    const templateAt = w.pos;
    for (const { template, choices, choiceAt, patchAt } of templates) {
      w.u16(template.quest.parsed.header.questId);
      w.u16(template.payload.length);
      w.u8(choices);
      w.u8(template.starts.reduce((bits, v) => bits | (1 << v), 0));
      w.fill(0, 2);
      w.u32(choiceAt);
      w.u32(patchAt);
    }
    // struct slot, as u32 words.
    [
      t.slot.id | (t.slot.stars << 16) | (t.crowns << 24),
      listIndex(t.slot) | (t.templates.length << 16),
      templateAt,
      t.fee,
      t.reward,
      t.penalty,
      t.size[0] | (t.size[1] << 8),
      text,
      lists[k]!,
    ].forEach((v, n) => w.patch32(slots + k * SLOT_BYTES + n * 4, v));
  });
  w.align(4);
  [DATA_MAGIC, tables.length, slots, names].forEach((v, n) => w.patch32(n * 4, v));
  return w.done();
}

/** The board record for a slot: the first template's header, with the slot's ID, stars and money. */
function boardRecord(t: SlotTables) {
  const header = Buffer.from(
    t.templates[0]!.template.payload.subarray(0x4c, 0x4c + RECORD_HEADER_SIZE),
  );
  // The record is a copy of the quest header from 0x4C (`recordBase`).
  const field = (offset: number) => offset - 0x4c;
  header.writeUInt32LE((header.readUInt32LE(field(QUEST_TYPE)) & ~STORY) >>> 0, field(QUEST_TYPE));
  header.writeUInt32LE(t.fee, field(FEE));
  header.writeUInt32LE(t.reward, field(REWARD));
  header.writeUInt32LE(t.penalty, field(PENALTY));
  header.writeUInt16LE(t.slot.id, RECORD_QUEST_ID);
  header.writeUInt8(t.slot.stars, RECORD_QUEST_ID + 2);
  return {
    header,
    strings: [
      TEXT.title,
      TEXT.goal + TEXT.unknown,
      TEXT.fail,
      TEXT.details,
      TEXT.unknown,
      TEXT.client,
    ],
  };
}

export interface UnknownQuests {
  /** For `addCodeLoader`. */
  data: Record<string, Buffer>;
  externs: Record<string, number>;
  /** The quest loader's calls, for the hook. */
  questLoad: QuestLoadSites;
  /** Adds the board records, once the code loader is in; the report. */
  finish: (applied: boolean) => ShuffleReport;
}

const TITLE = "Unknown Monster quests";

/**
 * What `quests.unknown` adds, or why it can't be. Everything that can fail
 * is checked here, before the code loader goes in: the board lists and
 * files, the quest loader and its calls, and the timer import.
 */
export function prepareUnknownQuests(
  game: GameData,
  edits: Edits,
  setOf: MultiplierSetOf,
): UnknownQuests | string {
  const vanillaEboot = game.eboot;
  const segment = vanillaEboot ? codeSegment(vanillaEboot) : null;
  if (!vanillaEboot || !segment) return "the EBOOT wasn't loaded";
  const table = findListTable(vanillaEboot, segment);
  if (typeof table === "string") return table;
  const entry = (k: number) =>
    vanillaEboot.readUInt32LE(segment.offset + (table - segment.vaddr) + k * 4);
  const lists = UNKNOWN_SLOTS.map((slot) => entry(listIndex(slot)));
  for (const [k, slot] of UNKNOWN_SLOTS.entries()) {
    const ids =
      listIndex(slot) < LIST_TABLE_ENTRIES ? readList(vanillaEboot, segment, lists[k]!) : null;
    if (!ids) return "this EBOOT's quest board lists don't match";
    if (ids.includes(slot.id)) return `quest ${slot.id} is already on its board`;
    // The town shows the first 80 quests of a star; the blob adds one.
    if (ids.length >= BOARD_MAX) return `the board list for quest ${slot.id} is full`;
  }

  const { gameTask, lobbyTask } = game;
  const questLoad = findQuestLoadSites(
    vanillaEboot,
    segment,
    lobbyTask.ovl.reader.buf,
    lobbyTask.ovl.loadBase,
    gameTask.ovl.reader.buf,
    gameTask.ovl.loadBase,
  );
  if (typeof questLoad === "string") return questLoad;
  const time = findImports(vanillaEboot, segment).get(SYSTEM_TIME_LOW_NID);
  if (time === undefined) return "this EBOOT doesn't import sceKernelGetSystemTimeLow";

  // The disc's own names, which the quest's goal shows.
  const names = monsterNames(game);
  const tables = unknownTables(game.quests, edits, setOf, names);
  const empty = tables.find((t) => t.templates.length === 0);
  if (empty) return `no quest of the ${empty.slot.band} rank can be a template`;
  const data = encodeTables(tables, lists, names);

  const boardFiles: { index: number; data: Buffer }[] = [];
  for (const t of tables) {
    const board = game.boards.find((b) => b.path === t.slot.level);
    if (!board) return `${t.slot.level} wasn't read`;
    if (board.records.some((r) => r.questId === t.slot.id)) {
      return `${t.slot.level} already has quest ${t.slot.id}`;
    }
    const out = addBoardRecord(edits.dataFileNow(board.index), boardRecord(t));
    if (typeof out === "string") return `${t.slot.level}: ${out}`;
    boardFiles.push({ index: board.index, data: out });
  }

  return {
    data: { rf_uq_data: data },
    externs: {
      rf_uq_lists: table,
      rf_uq_default_buf: questLoad.defaultBuffer,
      sceKernelGetSystemTimeLow: time,
    },
    questLoad,
    finish: (applied) => {
      if (!applied) {
        return {
          title: TITLE,
          notes: ["The Unknown Monster quests need the code loader, which isn't in this image."],
          lines: [],
          summary: `${TITLE}: not applied (no code loader)`,
        };
      }
      for (const { index, data: file } of boardFiles) file.copy(edits.dataFile(index));
      return {
        title: TITLE,
        notes: [`${data.length} bytes of tables in the blob.`],
        lines: describeTables(tables, names),
        summary: `${TITLE}: on (${tables.map((t) => `${t.slot.id}: ${t.templates.length} quests`).join(", ")})`,
      };
    },
  };
}

/** Spoiler lines: what each slot can roll. */
export function describeTables(
  tables: readonly SlotTables[],
  monsterName: MonsterNames,
): SpoilerLine[] {
  return tables.map(({ slot, templates }) => {
    const monsters = [...new Set(templates.flatMap((t) => t.choices.map((c) => c.species)))];
    const board = slot.board === "village" ? "Village" : "Guild";
    const star = slot.star > 8 && slot.board === "guild" ? `G★${slot.star - 8}` : `${slot.star}★`;
    return {
      where: `${TEXT.title} (${board} ${star}, quest ${slot.id})`,
      text: `${templates.length} quests to start from, ${monsters.length} monsters: ${monsters.map((em) => monsterName(em)).join(", ")}`,
    };
  });
}

export const unknownQuestsObjects = () => decodeObjects(UNKNOWN_QUESTS_OBJECTS);
