/**
 * `.mib` quest file struct readers, transcribed from `questHeader` and
 * friends in vendor/mhp2g-patterns/patterns/quest.hexpat — MIT, see
 * ../../NOTICE.md.
 *
 * Unlike EBOOT.BIN/.ovl, every pointer field in a decrypted `.mib` is
 * file-relative (no `base_address` rebase) — confirmed empirically:
 * dereferencing every pointer below directly as a byte offset into the
 * plaintext payload (from `mib.ts`'s `decryptQuest()`) resolves to
 * well-formed, mutually-consistent data (e.g. the header's `TargetID`
 * matches the large-monster spawn table's monster, which in turn matches
 * the "Monsters" quest-text string).
 *
 * Quest text is UTF-8 — including on the JP disc, which was unexpected
 * (Shift-JIS would have been the safer assumption for pre-existing PSP
 * titles); confirmed by decoding a real quest's strings and getting
 * coherent Japanese text.
 *
 * Not implemented here (out of scope for now): `QuestScript` (the
 * opcode/bytecode format is marked "TBD" even in the upstream pattern),
 * gathering node locations/items, `UnknPTR2`, and arena sets.
 */
import { BinaryReader } from "../binary/reader.js";

export interface QuestHeader {
  suppliesPtr: number;
  rewardsPtr: number;
  questScriptPtr: number;
  largeMonPtr: number;
  smallMonPtr: number;
  gatheringLocTblPtr: number;
  gatheringItemsPtr: number;
  /** `MonSizeModifier` (u32 @ 56). */
  monSizeModifier: number;
  rank: number;
  spawn: number;
  supplyCond: number;
  /** The hexpat's Unkn4, Unkn5 and Unkn7 (u8 @ 71, 72, 74); raw, meaning unknown. */
  unknownFlags: number[];
  /**
   * The hexpat's Unkn6 (u8 @ 73): which of its monsters' three stat
   * multiplier tables the quest uses (src/monsters/multipliers.ts).
   */
  statTable: number;
  attackRoll: number;
  questType: number;
  fee: number;
  reward: number;
  penalty: number;
  /** Raw tick count — real samples suggest minutes * 1800 (e.g. 90000 = 50 min). */
  timeLimit: number;
  stringPtrTbl: number;
  questId: number;
  questStars: number;
  map: number;
  specialCond: number;
  /** Index into emID — the quest's primary hunt/capture target, when applicable. */
  targetId: number;
  targetNum: number;
  arenaPtr: number;
}

/** questHeader @ 0x00 — 128 bytes total (Visual Data section starts at the fixed 0x4C == VDatPTR). */
export function readQuestHeader(reader: BinaryReader): QuestHeader {
  return {
    suppliesPtr: reader.u32(8),
    rewardsPtr: reader.u32(12),
    questScriptPtr: reader.u32(16),
    largeMonPtr: reader.u32(20),
    smallMonPtr: reader.u32(24),
    gatheringLocTblPtr: reader.u32(28),
    gatheringItemsPtr: reader.u32(36),
    monSizeModifier: reader.u32(56),
    rank: reader.u8(68),
    spawn: reader.u8(69),
    supplyCond: reader.u8(70),
    unknownFlags: [reader.u8(71), reader.u8(72), reader.u8(74)],
    statTable: reader.u8(73),
    attackRoll: reader.u8(75),
    questType: reader.u32(76),
    fee: reader.u32(80),
    reward: reader.u32(84),
    penalty: reader.u32(88),
    timeLimit: reader.u32(92),
    stringPtrTbl: reader.u32(96),
    questId: reader.u16(100),
    questStars: reader.u8(102),
    map: reader.u8(104),
    specialCond: reader.u8(105),
    targetId: reader.u16(112),
    targetNum: reader.u16(114),
    arenaPtr: reader.u32(124),
  };
}

export interface SupplyItem {
  itemId: number;
  amount: number;
}

/** SupplyItem[] @ header.suppliesPtr, 4 bytes/entry, terminated by itemId == 0. */
export function readSupplies(reader: BinaryReader, header: QuestHeader): SupplyItem[] {
  const out: SupplyItem[] = [];
  if (header.suppliesPtr === 0) return out;
  let off = header.suppliesPtr;
  while (reader.u16(off) !== 0) {
    out.push({ itemId: reader.u16(off), amount: reader.u16(off + 2) });
    off += 4;
  }
  return out;
}

export interface RewardItem {
  /** Drop chance as a raw percentage (0-100). */
  chance: number;
  itemId: number;
  amount: number;
}

export interface RewardTable {
  /** `RewardTBL.Unkn1`, the entry's first u16, kept raw. See emit/quests.ts for what it's known to mean. */
  unkn1: number;
  /** `RewardTBL.Unkn2`, the entry's second u16, kept raw. */
  unkn2: number;
  /** File offset of this table's RewardItem[]. */
  itemsPtr: number;
  items: RewardItem[];
}

/**
 * RewardTBL[] @ header.rewardsPtr, 8 bytes/entry (terminated when the next
 * entry's first u16 == 0xFFFF): Unkn1 (u16), Unkn2 (u16) and a pointer to
 * its own RewardItem[] (6 bytes/entry, terminated by chance == 0xFFFF).
 */
export function readRewards(reader: BinaryReader, header: QuestHeader): RewardTable[] {
  const tables: RewardTable[] = [];
  if (header.rewardsPtr === 0) return tables;
  let off = header.rewardsPtr;
  while (reader.u16(off) !== 0xffff) {
    const itemsPtr = reader.u32(off + 4);
    const items: RewardItem[] = [];
    let itemOff = itemsPtr;
    while (reader.u16(itemOff) !== 0xffff) {
      items.push({
        chance: reader.u16(itemOff),
        itemId: reader.u16(itemOff + 2),
        amount: reader.u16(itemOff + 4),
      });
      itemOff += 6;
    }
    tables.push({ unkn1: reader.u16(off), unkn2: reader.u16(off + 2), itemsPtr, items });
    off += 8;
  }
  return tables;
}

export interface MonsterSpawn {
  /** Index into emID. */
  monsterId: number;
  quantity: number;
  power: number;
  /** The hexpat's Attr1/Attr2 (u8 after `power`); raw, meaning unknown. */
  attr1?: number;
  attr2?: number;
}

const LARGE_MON_DATA_ENTRY_SIZE = 60;

function readLargeMonsterData(
  reader: BinaryReader,
  ptr: number,
): (MonsterSpawn & { stage: number })[] {
  const out: (MonsterSpawn & { stage: number })[] = [];
  let off = ptr;
  while (reader.s16(off) !== -1) {
    out.push({
      monsterId: reader.u16(off),
      quantity: reader.u8(off + 4),
      power: reader.u8(off + 5),
      attr1: reader.u8(off + 6),
      attr2: reader.u8(off + 7),
      stage: reader.u16(off + 8),
    });
    off += LARGE_MON_DATA_ENTRY_SIZE;
  }
  return out;
}

/**
 * LargeMonTable[] @ header.largeMonPtr (16 bytes/entry, terminated when the
 * next entry's first u16 == 0), each pointing at its own LargeMonData[]
 * (60 bytes/entry, terminated by monsterId == 0xFFFF). Returns the flattened
 * monster data across every table (the separately-declared "monster list"
 * pointer duplicates the same IDs for asset preloading and isn't exposed).
 */
export function readLargeMonsters(
  reader: BinaryReader,
  header: QuestHeader,
): (MonsterSpawn & { stage: number })[] {
  const out: (MonsterSpawn & { stage: number })[] = [];
  if (header.largeMonPtr === 0) return out;
  let off = header.largeMonPtr;
  while (reader.u16(off) !== 0) {
    const dataPtr = reader.u32(off + 12);
    out.push(...readLargeMonsterData(reader, dataPtr));
    off += 16;
  }
  return out;
}

const SMALL_MON_DATA_ENTRY_SIZE = 60;

function readSmallMonsterData(reader: BinaryReader, ptr: number): MonsterSpawn[] {
  const out: MonsterSpawn[] = [];
  let off = ptr;
  while (reader.u16(off) !== 0xffff) {
    out.push({
      monsterId: reader.u16(off),
      quantity: reader.u8(off + 4),
      power: reader.u8(off + 5),
    });
    off += SMALL_MON_DATA_ENTRY_SIZE;
  }
  return out;
}

export interface SmallMonsterTable {
  /** Index into stageID. */
  stageId: number;
  /** Address of the spawn records; index entries that share it list the same spawns twice. */
  dataPtr: number;
  monsters: MonsterSpawn[];
}

function readSmallMonsterTablesAt(reader: BinaryReader, ptr: number): SmallMonsterTable[] {
  const tables: SmallMonsterTable[] = [];
  let off = ptr;
  while (reader.u32(off) !== 0) {
    const stageId = reader.u16(off);
    const dataPtr = reader.u32(off + 12);
    tables.push({ stageId, dataPtr, monsters: readSmallMonsterData(reader, dataPtr) });
    off += 16;
  }
  return tables;
}

/**
 * SmallMonIndex[] @ header.smallMonPtr — an array of *pointers* (4
 * bytes/entry, terminated when the next entry's low u16 == 0), each
 * pointing at a run of one or more SmallMonTable structs (16 bytes/entry,
 * terminated by a 4-byte zero). Real quests have been seen with several
 * SmallMonIndex entries pointing at the exact same SmallMonTable address —
 * returned as-is (one result per index entry) rather than deduplicated, to
 * stay a faithful transcription of what's on disc.
 */
export function readSmallMonsters(reader: BinaryReader, header: QuestHeader): SmallMonsterTable[] {
  const out: SmallMonsterTable[] = [];
  if (header.smallMonPtr === 0) return out;
  let off = header.smallMonPtr;
  while (reader.u16(off) !== 0) {
    const tablePtr = reader.u32(off);
    out.push(...readSmallMonsterTablesAt(reader, tablePtr));
    off += 4;
  }
  return out;
}

export interface QuestStrings {
  title: string;
  goal: string;
  fail: string;
  details: string;
  monsters: string;
  client: string;
}

/** LangPTRs slot order, matching quest.hexpat's StringPTRTbl field list. */
export const LANG_SLOTS = ["eng1", "eng2", "ger", "fre", "spa", "ita", "eng3"] as const;
export type LangSlot = (typeof LANG_SLOTS)[number];

function readQuestStringsAt(reader: BinaryReader, ptr: number): QuestStrings {
  const readStr = (fieldOffset: number): string => {
    const strPtr = reader.u32(ptr + fieldOffset);
    return strPtr === 0 ? "" : reader.cString(strPtr, 4096, "utf8");
  };
  return {
    title: readStr(0),
    goal: readStr(4),
    fail: readStr(8),
    details: readStr(12),
    monsters: readStr(16),
    client: readStr(20),
  };
}

/**
 * LangPTRs @ header.stringPtrTbl — up to 7 language slots, each a pointer
 * to a StringPTRs block (6 further pointers to individual NUL-terminated
 * UTF-8 strings). Slots with a null pointer are omitted. On the one real JP
 * quest sample checked, every slot aliased the same pointer (Japanese
 * text) — this disc apparently never populated distinct EU-locale text.
 *
 * The slot names (`LANG_SLOTS`) are quest.hexpat's field names. On the EU
 * disc the first slot is confirmed English (the committed `data/quests/`
 * text); which of the other four holds German, French, Spanish and Italian
 * is only the hexpat's word, so `locales` checks each with a language guess
 * (locales/quests.ts).
 */
export function readQuestStrings(
  reader: BinaryReader,
  header: QuestHeader,
): Partial<Record<LangSlot, QuestStrings>> {
  const out: Partial<Record<LangSlot, QuestStrings>> = {};
  if (header.stringPtrTbl === 0) return out;
  const base = header.stringPtrTbl;
  LANG_SLOTS.forEach((slot, i) => {
    const ptr = reader.u32(base + i * 4);
    if (ptr !== 0) out[slot] = readQuestStringsAt(reader, ptr);
  });
  return out;
}

/** The first populated slot of `languages` (from `readQuestStrings`), or null if none are set. */
export function primaryQuestStrings(
  languages: Partial<Record<LangSlot, QuestStrings>>,
): QuestStrings | null {
  for (const slot of LANG_SLOTS) {
    const strings = languages[slot];
    if (strings) return strings;
  }
  return null;
}

/**
 * One of the header's two objective slots (8 bytes at 0x28 and 0x30, the
 * hexpat's unnamed `UnknPTR3`, `Unkn1`, `Unkn2` and `Unkn3`), worked out by
 * comparing quests on the EU disc: `kind` 1 means `id` is a monster (emID),
 * 2 an item; 0 means the slot is unused.
 */
export interface QuestObjective {
  kind: number;
  id: number;
  count: number;
  slot: number;
}

export const OBJECTIVE_OFFSETS = [0x28, 0x30] as const;

export function readObjectives(reader: BinaryReader): QuestObjective[] {
  return OBJECTIVE_OFFSETS.map((at) => ({
    kind: reader.u32(at),
    id: reader.u16(at + 4),
    count: reader.u8(at + 6),
    slot: reader.u8(at + 7),
  }));
}

/** The six strings of a `StringPTRs` block, in order. */
export const STRING_FIELDS = ["title", "goal", "fail", "details", "monsters", "client"] as const;
export type StringField = (typeof STRING_FIELDS)[number];

export interface QuestStringLayout {
  /** File offset of `LangPTRs` (`header.stringPtrTbl`). */
  table: number;
  /** Each language slot's `StringPTRs` block offset (0 if unset), in `LANG_SLOTS` order. */
  blocks: number[];
  /** Per distinct block: its six string offsets and byte lengths (without the NUL). */
  strings: { block: number; pointers: number[]; lengths: number[] }[];
}

/**
 * Where a quest's text lives, as numbers: the language table, its blocks
 * and every string's offset and length. Blocks shared by several slots
 * (the JP disc points them all at one) are listed once.
 */
export function readStringLayout(reader: BinaryReader, header: QuestHeader): QuestStringLayout {
  const table = header.stringPtrTbl;
  const size = reader.buf.length;
  const blocks: number[] = [];
  const strings: QuestStringLayout["strings"] = [];
  if (table === 0 || table + LANG_SLOTS.length * 4 > size) return { table, blocks, strings };
  for (let i = 0; i < LANG_SLOTS.length; i++) blocks.push(reader.u32(table + i * 4));
  for (const block of new Set(blocks)) {
    if (block === 0 || block + STRING_FIELDS.length * 4 > size) continue;
    const pointers = STRING_FIELDS.map((_, i) => reader.u32(block + i * 4));
    const lengths = pointers.map((ptr) => {
      if (ptr === 0 || ptr >= size) return 0;
      let end = ptr;
      while (end < size && reader.buf[end] !== 0) end++;
      return end - ptr;
    });
    strings.push({ block, pointers, lengths });
  }
  return { table, blocks, strings };
}

/** The first populated language slot's strings, or null if none are set. */
export function readPrimaryQuestStrings(
  reader: BinaryReader,
  header: QuestHeader,
): QuestStrings | null {
  return primaryQuestStrings(readQuestStrings(reader, header));
}

export interface ParsedQuest {
  header: QuestHeader;
  supplies: SupplyItem[];
  rewards: RewardTable[];
  largeMonsters: (MonsterSpawn & { stage: number })[];
  smallMonsters: SmallMonsterTable[];
  /** The first populated language slot (English on the EU disc, Japanese on JP), or null. */
  strings: QuestStrings | null;
  /** Every populated language slot, for `locales`. */
  languages: Partial<Record<LangSlot, QuestStrings>>;
}

/** Parses every struct this module knows about from a decrypted `.mib` payload. */
export function parseQuest(payload: Buffer): ParsedQuest {
  const reader = new BinaryReader(payload);
  const header = readQuestHeader(reader);
  const languages = readQuestStrings(reader, header);
  return {
    header,
    supplies: readSupplies(reader, header),
    rewards: readRewards(reader, header),
    largeMonsters: readLargeMonsters(reader, header),
    smallMonsters: readSmallMonsters(reader, header),
    strings: primaryQuestStrings(languages),
    languages,
  };
}
