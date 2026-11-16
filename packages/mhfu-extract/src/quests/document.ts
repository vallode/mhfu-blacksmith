/**
 * A quest file (`mission_jpn/m#####.mib`, decrypted) as a document, and back.
 *
 * `parseQuest` reads every byte of a quest into a `QuestDoc`: plain data
 * with no offsets in it, so lists can grow and shrink. `serializeQuest`
 * lays a document out again from nothing, in the order and with the padding
 * the disc's own files use, so an unedited quest comes back byte for byte
 * (all 551 quests of the EU disc do; `questfu roundtrip` checks a disc).
 *
 * Layout, in file order (from `quest.hexpat`, vendor/mhp2g-patterns, MIT,
 * and mhfu-extract's README; the padding and terminators were read off the
 * EU disc):
 *
 *   header            0x80 bytes, pointers relative to the file
 *   text              per language block: its strings (each on a 4-byte
 *                     boundary, length + 2 rounded up to 4), then six
 *                     pointers; then `LangPTRs`, seven block pointers
 *   arena sets        154 bytes each (1 to 5), only on Training School quests,
 *                     padded to 4
 *   script            8-byte packets up to the supplies
 *   supplies          { u16 item, u16 amount }, ending in item 0 (whose
 *                     amount holds the quest ID)
 *   gathering items   { u16 chance, u16 item } lists ending in 0xFFFF 0,
 *                     then one pointer per list (no terminator)
 *   gathering nodes   per area 24-byte nodes ending in an x of -1.0f (a
 *                     whole node), then one pointer per area
 *   rewards           { u16 chance, item, amount } lists ending in 0xFFFF
 *                     and padded to 4, then { u16, u16, pointer } entries
 *                     ending in 0xFFFF and 6 zero bytes
 *   positions         `UnknPTR2`: 16-byte points, then { u16 stage, u16
 *                     count, pointer } ending in 0xFFFF and 6 zero bytes
 *   small monsters    per group its 60-byte spawns (ending in a spawn of
 *                     monster 0xFFFF) and its preload list (four { u16
 *                     monster, u16 0 } slots, unused ones 0xFF); then the area
 *                     lists ({ u16 stage, u16, u32, preload, spawns }, ending
 *                     in 16 bytes whose second u32 is a stamp); then three
 *                     pointers to area lists and a zero
 *   large monsters    per group its spawns and preload list as above, then
 *                     { u32, u32, preload, spawns } ending in 16 zero bytes
 *
 * Anything that doesn't fit throws `QuestFormatError`; callers check a
 * quest round-trips (`checkQuest`) before letting it be edited.
 *
 * Shared by the quest editor (questfu) and randomfu, which rebuilds a quest
 * when a shuffle changes the shape of its lists (moving it to another map).
 * `parser.ts` stays the extractor's lighter read-only view.
 */

export class QuestFormatError extends Error {}

export const HEADER_SIZE = 0x80;
export const MAGIC = 0x47444e32; // "2NDG"
export const SPAWN_SIZE = 60;
/** A spawn group's preload list holds at most this many monsters. */
export const PRELOAD_SLOTS = 4;
export const NODE_SIZE = 24;
export const ARENA_SETS_MAX = 5;
export const ARENA_SET_SIZE = 154;
export const ARENA_EQUIPMENT = 6;
export const ARENA_ITEMS = 20;
export const LANGUAGE_SLOTS = 7;
export const TEXT_FIELDS = ["title", "goal", "fail", "details", "monsters", "client"] as const;
export const SPAWN_SETS = 3;
const NODE_END = 0xbf800000; // -1.0f

/** One of the header's two objective slots (0x28, 0x30). */
export interface Objective {
  /** 0 unused, 1 `id` is a monster, 2 `id` is an item. */
  kind: number;
  id: number;
  count: number;
  slot: number;
}

/** Every header field that isn't a pointer. Names follow mhfu-extract's parser where it has one. */
export interface QuestHeader {
  objectives: [Objective, Objective];
  /** Large monster size, in percent (u32 @ 0x38). */
  sizePercent: number;
  hrpSuccess: number;
  hrpFailure: number;
  rank: number;
  spawn: number;
  supplyCond: number;
  unk47: number;
  unk48: number;
  /** Which of a monster's stat multiplier tables the quest uses (u8 @ 0x49). */
  statTable: number;
  unk4a: number;
  attackRoll: number;
  /** u32 @ 0x4c: the low byte is the kind of quest, the rest flags. */
  questType: number;
  fee: number;
  reward: number;
  penalty: number;
  /** In ticks, 1800 a minute. */
  timeLimit: number;
  questId: number;
  stars: number;
  unk67: number;
  map: number;
  specialCond: number;
  unk6a: number;
  unk6c: number;
  unk6d: number;
  unk6e: number;
  targetId: number;
  targetNum: number;
  unk74: number;
  unk78: number;
}

/** A language's six strings, in `TEXT_FIELDS` order; null where the pointer is 0. */
export type TextBlock = (string | null)[];

export interface QuestText {
  /** For each of the seven language slots, an index into `blocks`, or -1 if unset. */
  slots: number[];
  blocks: TextBlock[];
}

export interface ArenaEquipment {
  unk: number;
  /** 0 legs, 1 head, 2 chest, 3 arms, 4 waist, 5 blademaster weapon, 6 gunner weapon. */
  type: number;
  id: number;
  /** An armor piece's upgrade level; a bowgun's attachment bits; 0 on melee weapons and bows. */
  level: number;
  decorations: [number, number, number];
}

export interface ItemAmount {
  item: number;
  amount: number;
}

export interface ArenaSet {
  players: number;
  pointMultiplier: number;
  equipment: ArenaEquipment[];
  items: ItemAmount[];
}

/** A script packet: opcode and three arguments, all s16. */
export type ScriptPacket = [number, number, number, number];

export interface GatherItem {
  chance: number;
  item: number;
}

/**
 * A gathering item list. A few Training School quests point one table into
 * the middle of another; those are `alias` (the other table's index, and how
 * many of its items to skip) and have no `items` of their own.
 */
export interface GatherTable {
  items: GatherItem[];
  alias?: { of: number; skip: number };
}

export interface GatherNode {
  x: number;
  y: number;
  z: number;
  /** f32 @ +12 (`MaxMineValue` in the hexpat); 50 to 300 on the disc. */
  range: number;
  table: number;
  mostGathers: number;
  /** 0 gather, 3 mine, 4 bug. */
  type: number;
  gathers: number;
}

export interface RewardItem {
  chance: number;
  item: number;
  amount: number;
}

export interface RewardTable {
  /** `RewardTBL.Unkn1`: 0x8000 main, 0x8001 extra, anything else a condition. */
  kind: number;
  /** `RewardTBL.Unkn2`: draws << 8 on a main table. */
  param: number;
  items: RewardItem[];
}

export interface Point {
  rotation: number;
  x: number;
  y: number;
  z: number;
}

export interface PositionSet {
  stage: number;
  points: Point[];
}

/** A monster record (60 bytes), large or small. */
export interface Spawn {
  monster: number;
  /** u16 @ +2: 0 on most records, 1 or 2 on a few large monsters. */
  variant: number;
  quantity: number;
  power: number;
  attr1: number;
  attr2: number;
  /** u16 @ +8: the stage (area) a large monster starts in; 0 on small monsters. */
  stage: number;
  /** u16 @ +10. */
  flag: number;
  /** u32 x 4 @ +12. */
  data1: [number, number, number, number];
  rotation: number;
  x: number;
  y: number;
  z: number;
  /** u32 x 4 @ +44. */
  data2: [number, number, number, number];
}

export interface SpawnGroup {
  /** Monsters to load before the quest starts (emIDs). */
  preload: number[];
  spawns: Spawn[];
}

export interface LargeGroup extends SpawnGroup {
  unk1: number;
  unk2: number;
}

export interface SmallArea {
  stage: number;
  /** Index into `SmallMonsters.groups`. */
  group: number;
}

export interface SmallAreaList {
  areas: SmallArea[];
  /** The second u32 of the list's terminator: a number the disc's quests carry (1123, 9999, ...). */
  stamp: number;
}

export interface SmallMonsters {
  /** The header's three spawn sets: each an index into `lists`. */
  sets: number[];
  lists: SmallAreaList[];
  groups: SpawnGroup[];
}

export interface QuestDoc {
  header: QuestHeader;
  text: QuestText;
  arena: ArenaSet[] | null;
  script: ScriptPacket[];
  supplies: ItemAmount[];
  /** The amount field of the supply list's terminator (the quest ID on the disc). */
  suppliesEnd: number;
  /** By table index; null where the pointer is 0. */
  gatherTables: (GatherTable | null)[];
  /** Per map area, its nodes; null where the area has no list. */
  gatherAreas: (GatherNode[] | null)[];
  rewards: RewardTable[];
  /** `UnknPTR2`; null when the pointer is 0. */
  positions: PositionSet[] | null;
  small: SmallMonsters;
  large: LargeGroup[];
}

// ---------------------------------------------------------------- reading

const MAX_ENTRIES = 1024;

class Reader {
  constructor(readonly buf: Buffer) {}

  private check(at: number, size: number): void {
    if (!Number.isInteger(at) || at < 0 || at + size > this.buf.length) {
      throw new QuestFormatError(
        `read of ${size} bytes at 0x${at.toString(16)} is outside the quest`,
      );
    }
  }
  u8(at: number): number {
    this.check(at, 1);
    return this.buf[at]!;
  }
  u16(at: number): number {
    this.check(at, 2);
    return this.buf.readUInt16LE(at);
  }
  s16(at: number): number {
    this.check(at, 2);
    return this.buf.readInt16LE(at);
  }
  u32(at: number): number {
    this.check(at, 4);
    return this.buf.readUInt32LE(at);
  }
  f32(at: number): number {
    this.check(at, 4);
    return this.buf.readFloatLE(at);
  }
  /** A pointer that must lead somewhere after the header. */
  ptr(at: number): number {
    const value = this.u32(at);
    if (value !== 0 && (value < HEADER_SIZE || value >= this.buf.length)) {
      throw new QuestFormatError(
        `pointer 0x${value.toString(16)} at 0x${at.toString(16)} is outside the quest`,
      );
    }
    return value;
  }
}

function readHeader(r: Reader): QuestHeader {
  if (r.u32(4) !== MAGIC) throw new QuestFormatError("not a quest file (no 2NDG magic)");
  if (r.u32(0) !== 0x4c) throw new QuestFormatError("unexpected visual data pointer");
  const objective = (at: number): Objective => ({
    kind: r.u32(at),
    id: r.u16(at + 4),
    count: r.u8(at + 6),
    slot: r.u8(at + 7),
  });
  return {
    objectives: [objective(0x28), objective(0x30)],
    sizePercent: r.u32(0x38),
    hrpSuccess: r.u32(0x3c),
    hrpFailure: r.u32(0x40),
    rank: r.u8(0x44),
    spawn: r.u8(0x45),
    supplyCond: r.u8(0x46),
    unk47: r.u8(0x47),
    unk48: r.u8(0x48),
    statTable: r.u8(0x49),
    unk4a: r.u8(0x4a),
    attackRoll: r.u8(0x4b),
    questType: r.u32(0x4c),
    fee: r.u32(0x50),
    reward: r.u32(0x54),
    penalty: r.u32(0x58),
    timeLimit: r.u32(0x5c),
    questId: r.u16(0x64),
    stars: r.u8(0x66),
    unk67: r.u8(0x67),
    map: r.u8(0x68),
    specialCond: r.u8(0x69),
    unk6a: r.u16(0x6a),
    unk6c: r.u8(0x6c),
    unk6d: r.u8(0x6d),
    unk6e: r.u16(0x6e),
    targetId: r.u16(0x70),
    targetNum: r.u16(0x72),
    unk74: r.u32(0x74),
    unk78: r.u32(0x78),
  };
}

function readString(r: Reader, at: number): string {
  let end = at;
  while (r.u8(end) !== 0) end++;
  return r.buf.toString("utf8", at, end);
}

function readText(r: Reader): QuestText {
  const table = r.ptr(0x60);
  const text: QuestText = { slots: [], blocks: [] };
  if (table === 0) return { slots: Array.from({ length: LANGUAGE_SLOTS }, () => -1), blocks: [] };
  const pointers = Array.from({ length: LANGUAGE_SLOTS }, (_, i) => r.ptr(table + i * 4));
  const order = [...new Set(pointers.filter((p) => p !== 0))].sort((a, b) => a - b);
  text.slots = pointers.map((p) => order.indexOf(p));
  text.blocks = order.map((block) =>
    TEXT_FIELDS.map((_, i) => {
      const at = r.ptr(block + i * 4);
      return at === 0 ? null : readString(r, at);
    }),
  );
  return text;
}

function readArena(r: Reader, end: number): ArenaSet[] | null {
  const at = r.ptr(0x7c);
  if (at === 0) return null;
  // Nothing counts the sets: they run up to the next section (1 to 5 on the disc).
  const count = Math.floor((end - at) / ARENA_SET_SIZE);
  if (count < 1 || count > ARENA_SETS_MAX)
    throw new QuestFormatError("the arena sets don't fit before the script");
  return readArenaSetsIn(r, at, count);
}

function readArenaSetsIn(r: Reader, at: number, count: number): ArenaSet[] {
  return Array.from({ length: count }, (_, s) => {
    const base = at + s * ARENA_SET_SIZE;
    return {
      players: r.u8(base),
      pointMultiplier: r.u8(base + 1),
      equipment: Array.from({ length: ARENA_EQUIPMENT }, (_, i) => {
        const e = base + 2 + i * 12;
        return {
          unk: r.u8(e),
          type: r.u8(e + 1),
          id: r.u16(e + 2),
          level: r.u16(e + 4),
          decorations: [r.u16(e + 6), r.u16(e + 8), r.u16(e + 10)] as [number, number, number],
        };
      }),
      items: Array.from({ length: ARENA_ITEMS }, (_, i) => {
        const e = base + 2 + ARENA_EQUIPMENT * 12 + i * 4;
        return { item: r.u16(e), amount: r.u16(e + 2) };
      }),
    };
  });
}

/**
 * `count` arena sets from `at` in a decrypted quest, for a reader that
 * doesn't parse the whole file (src/quests/parser.ts).
 */
export function readArenaSetsAt(payload: Buffer, at: number, count: number): ArenaSet[] {
  return readArenaSetsIn(new Reader(payload), at, count);
}

function readScript(r: Reader): ScriptPacket[] {
  const start = r.ptr(0x10);
  const end = r.ptr(0x08);
  if (start === 0) return [];
  if (end < start || (end - start) % 8 !== 0) {
    throw new QuestFormatError("the script doesn't end at the supplies");
  }
  const out: ScriptPacket[] = [];
  for (let at = start; at < end; at += 8) {
    out.push([r.s16(at), r.s16(at + 2), r.s16(at + 4), r.s16(at + 6)]);
  }
  return out;
}

function readSupplies(r: Reader): { supplies: ItemAmount[]; suppliesEnd: number } {
  const start = r.ptr(0x08);
  const supplies: ItemAmount[] = [];
  if (start === 0) return { supplies, suppliesEnd: 0 };
  let at = start;
  for (; r.u16(at) !== 0; at += 4) {
    if (supplies.length > MAX_ENTRIES) throw new QuestFormatError("the supply list doesn't end");
    supplies.push({ item: r.u16(at), amount: r.u16(at + 2) });
  }
  return { supplies, suppliesEnd: r.u16(at + 2) };
}

function readRewards(r: Reader): { rewards: RewardTable[]; starts: number[]; end: number } {
  const start = r.ptr(0x0c);
  const rewards: RewardTable[] = [];
  const starts: number[] = [];
  if (start === 0) return { rewards, starts, end: 0 };
  let at = start;
  for (; r.u16(at) !== 0xffff; at += 8) {
    if (rewards.length > MAX_ENTRIES) throw new QuestFormatError("the reward tables don't end");
    const list = r.ptr(at + 4);
    if (list === 0) throw new QuestFormatError("a reward table has no item list");
    if (starts.includes(list)) throw new QuestFormatError("two reward tables share an item list");
    starts.push(list);
    const items: RewardItem[] = [];
    for (let e = list; r.u16(e) !== 0xffff; e += 6) {
      if (items.length > MAX_ENTRIES) throw new QuestFormatError("a reward list doesn't end");
      items.push({ chance: r.u16(e), item: r.u16(e + 2), amount: r.u16(e + 4) });
    }
    rewards.push({ kind: r.u16(at), param: r.u16(at + 2), items });
  }
  return { rewards, starts, end: at + 8 };
}

function readGathering(
  r: Reader,
  boundaries: number[],
): { gatherTables: (GatherTable | null)[]; gatherAreas: (GatherNode[] | null)[] } {
  const areasAt = r.ptr(0x1c);
  const tablesAt = r.ptr(0x24);
  const next = (at: number) => Math.min(...boundaries.filter((b) => b > at), r.buf.length);

  const gatherAreas: (GatherNode[] | null)[] = [];
  const nodeLists: number[] = [];
  if (areasAt !== 0) {
    const end = next(areasAt);
    for (let at = areasAt; at + 4 <= end; at += 4) {
      const list = r.ptr(at);
      if (list === 0) {
        gatherAreas.push(null);
        continue;
      }
      nodeLists.push(list);
      const nodes: GatherNode[] = [];
      for (let n = list; r.u32(n) !== NODE_END; n += NODE_SIZE) {
        if (nodes.length > MAX_ENTRIES) throw new QuestFormatError("a gathering area doesn't end");
        nodes.push({
          x: r.f32(n),
          y: r.f32(n + 4),
          z: r.f32(n + 8),
          range: r.f32(n + 12),
          table: r.u16(n + 16),
          mostGathers: r.u16(n + 18),
          type: r.u16(n + 20),
          gathers: r.u16(n + 22),
        });
      }
      gatherAreas.push(nodes);
    }
  }

  const gatherTables: (GatherTable | null)[] = [];
  if (tablesAt !== 0) {
    const end = Math.min(next(tablesAt), ...nodeLists.filter((n) => n > tablesAt));
    // Where each list's items start, to spot a table that points into another.
    const spans: { index: number; starts: number[] }[] = [];
    for (let at = tablesAt; at + 4 <= end; at += 4) {
      const list = r.ptr(at);
      if (list === 0) {
        gatherTables.push(null);
        continue;
      }
      const owner = spans.find((s) => s.starts.includes(list));
      if (owner) {
        gatherTables.push({
          items: [],
          alias: { of: owner.index, skip: owner.starts.indexOf(list) },
        });
        continue;
      }
      const items: GatherItem[] = [];
      const starts: number[] = [];
      for (let e = list; r.u16(e) !== 0xffff; e += 4) {
        if (items.length > MAX_ENTRIES) throw new QuestFormatError("a gathering table doesn't end");
        starts.push(e);
        items.push({ chance: r.u16(e), item: r.u16(e + 2) });
      }
      spans.push({ index: gatherTables.length, starts });
      gatherTables.push({ items });
    }
  }
  return { gatherTables, gatherAreas };
}

function readPositions(r: Reader): { positions: PositionSet[] | null; end: number } {
  const start = r.ptr(0x20);
  if (start === 0) return { positions: null, end: 0 };
  const out: PositionSet[] = [];
  let at = start;
  for (; r.u16(at) !== 0xffff; at += 8) {
    if (out.length > MAX_ENTRIES) throw new QuestFormatError("the position table doesn't end");
    const count = r.u16(at + 2);
    const list = r.ptr(at + 4);
    out.push({
      stage: r.u16(at),
      points: Array.from({ length: count }, (_, i) => ({
        rotation: r.u32(list + i * 16),
        x: r.f32(list + i * 16 + 4),
        y: r.f32(list + i * 16 + 8),
        z: r.f32(list + i * 16 + 12),
      })),
    });
  }
  return { positions: out, end: at + 8 };
}

function readSpawns(r: Reader, start: number): Spawn[] {
  const out: Spawn[] = [];
  for (let at = start; r.u16(at) !== 0xffff; at += SPAWN_SIZE) {
    if (out.length > MAX_ENTRIES) throw new QuestFormatError("a monster list doesn't end");
    const words = (from: number) =>
      [r.u32(from), r.u32(from + 4), r.u32(from + 8), r.u32(from + 12)] as [
        number,
        number,
        number,
        number,
      ];
    out.push({
      monster: r.u16(at),
      variant: r.u16(at + 2),
      quantity: r.u8(at + 4),
      power: r.u8(at + 5),
      attr1: r.u8(at + 6),
      attr2: r.u8(at + 7),
      stage: r.u16(at + 8),
      flag: r.u16(at + 10),
      data1: words(at + 12),
      rotation: r.u32(at + 28),
      x: r.f32(at + 32),
      y: r.f32(at + 36),
      z: r.f32(at + 40),
      data2: words(at + 44),
    });
  }
  return out;
}

/** Four { u16 monster, u16 0 } slots; unused ones are 0xFFFFFFFF and come last. */
function readPreload(r: Reader, start: number): number[] {
  const out: number[] = [];
  if (start === 0) throw new QuestFormatError("a spawn group has no preload list");
  for (let i = 0; i < PRELOAD_SLOTS; i++) {
    const value = r.u32(start + i * 4);
    if (value === 0xffffffff) continue;
    if (value > 0xffff || out.length !== i) throw new QuestFormatError("unexpected preload list");
    out.push(value);
  }
  return out;
}

/**
 * The spawn groups stored one after another from `start` up to `end`, with
 * where each one's spawns and preload list are; null if they don't end
 * exactly there. Read this way, not through the tables' pointers, so a
 * group nothing points at (the disc has some) is kept.
 */
function readGroupsBetween(
  r: Reader,
  start: number,
  end: number,
): { group: SpawnGroup; spawns: number; preload: number }[] | null {
  const out: { group: SpawnGroup; spawns: number; preload: number }[] = [];
  let at = start;
  try {
    while (at < end) {
      const spawns = readSpawns(r, at);
      const preloadAt = at + (spawns.length + 1) * SPAWN_SIZE;
      const preload = readPreload(r, preloadAt);
      out.push({ group: { preload, spawns }, spawns: at, preload: preloadAt });
      at = preloadAt + PRELOAD_SLOTS * 4;
      if (out.length > MAX_ENTRIES) return null;
    }
  } catch {
    return null;
  }
  return at === end ? out : null;
}

function readSmall(r: Reader, dataStart: number): { small: SmallMonsters; end: number } {
  const start = r.ptr(0x18);
  const small: SmallMonsters = { sets: [], lists: [], groups: [] };
  if (start === 0) return { small, end: 0 };
  const setPointers: number[] = [];
  let setAt = start;
  for (; r.u32(setAt) !== 0; setAt += 4) {
    if (setPointers.length > MAX_ENTRIES) throw new QuestFormatError("the spawn sets don't end");
    setPointers.push(r.ptr(setAt));
  }
  const listAt = [...new Set(setPointers)].sort((a, b) => a - b);
  small.sets = setPointers.map((p) => listAt.indexOf(p));

  const raw = listAt.map((list) => {
    const areas: { stage: number; preload: number; spawns: number }[] = [];
    let at = list;
    for (; r.u32(at) !== 0; at += 16) {
      if (areas.length > MAX_ENTRIES) throw new QuestFormatError("an area list doesn't end");
      if (r.u16(at + 2) !== 0 || r.u32(at + 4) !== 0) {
        throw new QuestFormatError("an area entry has values where the disc has none");
      }
      areas.push({ stage: r.u16(at), preload: r.ptr(at + 8), spawns: r.ptr(at + 12) });
    }
    if (r.u32(at + 8) !== 0 || r.u32(at + 12) !== 0) {
      throw new QuestFormatError("an area list's terminator isn't empty");
    }
    return { areas, stamp: r.u32(at + 4) };
  });

  const key = (a: { preload: number; spawns: number }) => `${a.spawns}:${a.preload}`;
  const referenced = new Map<string, { preload: number; spawns: number }>();
  for (const list of raw) for (const area of list.areas) referenced.set(key(area), area);
  // In file order, so an unedited quest is written back as it was.
  const stored =
    dataStart && listAt.length > 0 ? readGroupsBetween(r, dataStart, listAt[0]!) : null;
  const index = new Map<string, number>();
  if (stored && [...referenced.keys()].every((k) => stored.some((g) => key(g) === k))) {
    stored.forEach((g, i) => index.set(key(g), i));
    small.groups = stored.map((g) => g.group);
  } else {
    const sorted = [...referenced.values()].sort(
      (a, b) => a.spawns - b.spawns || a.preload - b.preload,
    );
    sorted.forEach((g, i) => index.set(key(g), i));
    small.groups = sorted.map((g) => ({
      preload: readPreload(r, g.preload),
      spawns: readSpawns(r, g.spawns),
    }));
  }
  small.lists = raw.map((list) => ({
    stamp: list.stamp,
    areas: list.areas.map((a) => ({ stage: a.stage, group: index.get(key(a))! })),
  }));
  return { small, end: setAt + 4 };
}

function readLarge(r: Reader): LargeGroup[] {
  const start = r.ptr(0x14);
  const out: LargeGroup[] = [];
  if (start === 0) return out;
  for (let at = start; r.u16(at) !== 0; at += 16) {
    if (out.length > MAX_ENTRIES) throw new QuestFormatError("the large monster table doesn't end");
    out.push({
      unk1: r.u32(at),
      unk2: r.u32(at + 4),
      preload: readPreload(r, r.ptr(at + 8)),
      spawns: readSpawns(r, r.ptr(at + 12)),
    });
  }
  return out;
}

export function parseQuest(payload: Buffer): QuestDoc {
  if (payload.length < HEADER_SIZE) throw new QuestFormatError("too short to be a quest");
  const r = new Reader(payload);
  const header = readHeader(r);
  const { rewards, starts, end: rewardsEnd } = readRewards(r);
  const boundaries = [0x08, 0x0c, 0x10, 0x14, 0x18, 0x1c, 0x20, 0x24, 0x60, 0x7c]
    .map((at) => r.u32(at))
    .concat(starts);
  const { positions, end: positionsEnd } = readPositions(r);
  return {
    header,
    text: readText(r),
    arena: readArena(r, Math.min(...boundaries.filter((b) => b > r.u32(0x7c)), payload.length)),
    script: readScript(r),
    ...readSupplies(r),
    ...readGathering(r, boundaries),
    rewards,
    positions,
    small: readSmall(r, positionsEnd || rewardsEnd).small,
    large: readLarge(r),
  };
}

// ---------------------------------------------------------------- writing

export class Writer {
  private buf = Buffer.alloc(4096);
  pos = 0;

  private room(size: number): void {
    if (this.pos + size <= this.buf.length) return;
    const next = Buffer.alloc(Math.max(this.buf.length * 2, this.pos + size));
    this.buf.copy(next);
    this.buf = next;
  }
  u8(value: number): void {
    this.room(1);
    this.buf.writeUInt8(value & 0xff, this.pos);
    this.pos += 1;
  }
  u16(value: number): void {
    this.room(2);
    this.buf.writeUInt16LE(value & 0xffff, this.pos);
    this.pos += 2;
  }
  u32(value: number): void {
    this.room(4);
    this.buf.writeUInt32LE(value >>> 0, this.pos);
    this.pos += 4;
  }
  f32(value: number): void {
    this.room(4);
    this.buf.writeFloatLE(value, this.pos);
    this.pos += 4;
  }
  fill(value: number, size: number): void {
    this.room(size);
    this.buf.fill(value, this.pos, this.pos + size);
    this.pos += size;
  }
  bytes(data: Buffer): void {
    this.room(data.length);
    data.copy(this.buf, this.pos);
    this.pos += data.length;
  }
  align(to: number, value = 0): void {
    const pad = (to - (this.pos % to)) % to;
    if (pad) this.fill(value, pad);
  }
  patch32(at: number, value: number): void {
    this.buf.writeUInt32LE(value >>> 0, at);
  }
  done(): Buffer {
    return Buffer.from(this.buf.subarray(0, this.pos));
  }
}

function writeHeader(w: Writer, h: QuestHeader): void {
  w.u32(0x4c);
  w.u32(MAGIC);
  w.fill(0, 0x20); // pointers, patched once everything is placed
  for (const o of h.objectives) {
    w.u32(o.kind);
    w.u16(o.id);
    w.u8(o.count);
    w.u8(o.slot);
  }
  w.u32(h.sizePercent);
  w.u32(h.hrpSuccess);
  w.u32(h.hrpFailure);
  for (const v of [
    h.rank,
    h.spawn,
    h.supplyCond,
    h.unk47,
    h.unk48,
    h.statTable,
    h.unk4a,
    h.attackRoll,
  ]) {
    w.u8(v);
  }
  w.u32(h.questType);
  w.u32(h.fee);
  w.u32(h.reward);
  w.u32(h.penalty);
  w.u32(h.timeLimit);
  w.u32(0); // text
  w.u16(h.questId);
  w.u8(h.stars);
  w.u8(h.unk67);
  w.u8(h.map);
  w.u8(h.specialCond);
  w.u16(h.unk6a);
  w.u8(h.unk6c);
  w.u8(h.unk6d);
  w.u16(h.unk6e);
  w.u16(h.targetId);
  w.u16(h.targetNum);
  w.u32(h.unk74);
  w.u32(h.unk78);
  w.u32(0); // arena
}

function writeSpawns(w: Writer, spawns: readonly Spawn[]): number {
  const at = w.pos;
  for (const s of spawns) {
    w.u16(s.monster);
    w.u16(s.variant);
    w.u8(s.quantity);
    w.u8(s.power);
    w.u8(s.attr1);
    w.u8(s.attr2);
    w.u16(s.stage);
    w.u16(s.flag);
    for (const v of s.data1) w.u32(v);
    w.u32(s.rotation);
    w.f32(s.x);
    w.f32(s.y);
    w.f32(s.z);
    for (const v of s.data2) w.u32(v);
  }
  w.u16(0xffff);
  w.fill(0, SPAWN_SIZE - 2);
  return at;
}

function writePreload(w: Writer, preload: readonly number[]): number {
  if (preload.length > PRELOAD_SLOTS) {
    throw new QuestFormatError(
      `a spawn group preloads ${preload.length} monsters; the list holds ${PRELOAD_SLOTS}`,
    );
  }
  const at = w.pos;
  for (const monster of preload) {
    w.u16(monster);
    w.u16(0);
  }
  w.fill(0xff, (PRELOAD_SLOTS - preload.length) * 4);
  return at;
}

export interface SerializeOptions {
  /**
   * Store identical strings once and point every field that has them at the
   * one copy. The EU disc gives every pointer its own string; the JP disc
   * shares them, so the game reads either. Saves room when a quest is full.
   */
  shareStrings?: boolean;
  /**
   * Strings already written, by value, to share with across several calls
   * (a whole quest board): new strings are added to it. Implies sharing.
   */
  pool?: Map<string, number>;
}

/**
 * Each block's strings and its six pointers, then `LangPTRs`. Returns where
 * `LangPTRs` is, or 0 if the document has no text at all.
 */
export function writeText(w: Writer, text: QuestText, options: SerializeOptions = {}): number {
  const shared = options.pool ?? new Map<string, number>();
  const share = options.shareStrings || options.pool !== undefined;
  const blockAt = text.blocks.map((block) => {
    const at = TEXT_FIELDS.map((_, i) => {
      const value = block[i] ?? null;
      if (value === null) return 0;
      const seen = share ? shared.get(value) : undefined;
      if (seen !== undefined) return seen;
      const start = w.pos;
      const bytes = Buffer.from(value, "utf8");
      w.bytes(bytes);
      w.fill(0, Math.ceil((bytes.length + 2) / 4) * 4 - bytes.length);
      shared.set(value, start);
      return start;
    });
    const start = w.pos;
    for (const p of at) w.u32(p);
    return start;
  });
  if (text.blocks.length === 0 && !text.slots.some((s) => s >= 0)) return 0;
  const at = w.pos;
  for (let i = 0; i < LANGUAGE_SLOTS; i++) {
    const block = text.slots[i] ?? -1;
    w.u32(block >= 0 ? (blockAt[block] ?? 0) : 0);
  }
  return at;
}

/** The sets, padded to a 4-byte boundary. */
export function writeArena(w: Writer, arena: readonly ArenaSet[]): void {
  for (const set of arena) {
    w.u8(set.players);
    w.u8(set.pointMultiplier);
    for (let i = 0; i < ARENA_EQUIPMENT; i++) {
      const e = set.equipment[i];
      w.u8(e?.unk ?? 0);
      w.u8(e?.type ?? 0);
      w.u16(e?.id ?? 0);
      w.u16(e?.level ?? 0);
      for (let d = 0; d < 3; d++) w.u16(e?.decorations[d] ?? 0);
    }
    for (let i = 0; i < ARENA_ITEMS; i++) {
      w.u16(set.items[i]?.item ?? 0);
      w.u16(set.items[i]?.amount ?? 0);
    }
  }
  w.align(4);
}

export function serializeQuest(doc: QuestDoc, options: SerializeOptions = {}): Buffer {
  const w = new Writer();
  writeHeader(w, doc.header);

  const textAt = writeText(w, doc.text, options);
  if (textAt) w.patch32(0x60, textAt);
  if (doc.arena) {
    w.patch32(0x7c, w.pos);
    writeArena(w, doc.arena);
  }

  w.patch32(0x10, w.pos);
  for (const packet of doc.script) for (const v of packet) w.u16(v);

  w.patch32(0x08, w.pos);
  for (const s of doc.supplies) {
    w.u16(s.item);
    w.u16(s.amount);
  }
  w.u16(0);
  w.u16(doc.suppliesEnd);

  // Gathering items: the lists, then their pointers.
  const tableAt: number[] = [];
  const itemAt: number[][] = [];
  doc.gatherTables.forEach((table, i) => {
    if (!table) tableAt[i] = 0;
    if (!table || table.alias) return;
    tableAt[i] = w.pos;
    itemAt[i] = table.items.map((_, k) => w.pos + k * 4);
    itemAt[i]!.push(w.pos + table.items.length * 4);
    for (const item of table.items) {
      w.u16(item.chance);
      w.u16(item.item);
    }
    w.u16(0xffff);
    w.u16(0);
  });
  doc.gatherTables.forEach((table, i) => {
    if (!table?.alias) return;
    const at = itemAt[table.alias.of]?.[table.alias.skip];
    if (at === undefined)
      throw new QuestFormatError(`gathering table ${i} aliases one that isn't there`);
    tableAt[i] = at;
  });
  w.patch32(0x24, w.pos);
  for (const at of tableAt) w.u32(at);

  // Gathering nodes: each area's list, then the area pointers.
  const areaAt = doc.gatherAreas.map((nodes) => {
    if (!nodes) return 0;
    const at = w.pos;
    for (const n of nodes) {
      w.f32(n.x);
      w.f32(n.y);
      w.f32(n.z);
      w.f32(n.range);
      w.u16(n.table);
      w.u16(n.mostGathers);
      w.u16(n.type);
      w.u16(n.gathers);
    }
    w.u32(NODE_END);
    w.fill(0, NODE_SIZE - 4);
    return at;
  });
  w.patch32(0x1c, w.pos);
  for (const at of areaAt) w.u32(at);

  // Rewards.
  const rewardAt = doc.rewards.map((table) => {
    const at = w.pos;
    for (const item of table.items) {
      w.u16(item.chance);
      w.u16(item.item);
      w.u16(item.amount);
    }
    w.u16(0xffff);
    w.align(4);
    return at;
  });
  w.patch32(0x0c, w.pos);
  doc.rewards.forEach((table, i) => {
    w.u16(table.kind);
    w.u16(table.param);
    w.u32(rewardAt[i]!);
  });
  w.u16(0xffff);
  w.fill(0, 6);

  if (doc.positions) {
    const at = doc.positions.map((set) => {
      const start = w.pos;
      for (const p of set.points) {
        w.u32(p.rotation);
        w.f32(p.x);
        w.f32(p.y);
        w.f32(p.z);
      }
      return start;
    });
    w.patch32(0x20, w.pos);
    doc.positions.forEach((set, i) => {
      w.u16(set.stage);
      w.u16(set.points.length);
      w.u32(at[i]!);
    });
    w.u16(0xffff);
    w.fill(0, 6);
  }

  // Small monsters.
  const groupAt = doc.small.groups.map((group) => {
    const spawns = writeSpawns(w, group.spawns);
    return { spawns, preload: writePreload(w, group.preload) };
  });
  const listAt = doc.small.lists.map((list, i) => {
    const at = w.pos;
    for (const area of list.areas) {
      const group = groupAt[area.group];
      if (!group) throw new QuestFormatError(`area list ${i} uses a spawn group that isn't there`);
      w.u16(area.stage);
      w.u16(0);
      w.u32(0);
      w.u32(group.preload);
      w.u32(group.spawns);
    }
    w.u32(0);
    w.u32(list.stamp);
    w.u32(0);
    w.u32(0);
    return at;
  });
  w.patch32(0x18, w.pos);
  for (const set of doc.small.sets) {
    const at = listAt[set];
    if (at === undefined)
      throw new QuestFormatError("a spawn set uses an area list that isn't there");
    w.u32(at);
  }
  w.u32(0);

  // Large monsters.
  const largeAt = doc.large.map((group) => {
    const spawns = writeSpawns(w, group.spawns);
    return { spawns, preload: writePreload(w, group.preload) };
  });
  w.patch32(0x14, w.pos);
  doc.large.forEach((group, i) => {
    w.u32(group.unk1);
    w.u32(group.unk2);
    w.u32(largeAt[i]!.preload);
    w.u32(largeAt[i]!.spawns);
  });
  w.fill(0, 16);

  return w.done();
}

export interface QuestCheck {
  /** The document `parseQuest` read, or null if it couldn't. */
  doc: QuestDoc | null;
  /** Rebuilding the unedited document gives the file's own bytes. */
  exact: boolean;
  /** Rebuilding it gives a file that reads as the same document: safe to edit. */
  editable: boolean;
  problem: string | null;
}

/** Reads a quest and checks it survives being rebuilt. */
export function checkQuest(payload: Buffer): QuestCheck {
  let doc: QuestDoc;
  try {
    doc = parseQuest(payload);
  } catch (error) {
    return { doc: null, exact: false, editable: false, problem: String((error as Error).message) };
  }
  try {
    const rebuilt = serializeQuest(doc);
    if (rebuilt.equals(payload)) return { doc, exact: true, editable: true, problem: null };
    const same = JSON.stringify(parseQuest(rebuilt)) === JSON.stringify(doc);
    return {
      doc,
      exact: false,
      editable: same,
      problem: same ? null : "rebuilding the quest changes what it holds",
    };
  } catch (error) {
    return { doc, exact: false, editable: false, problem: String((error as Error).message) };
  }
}
