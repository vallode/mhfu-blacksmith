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
  rank: number;
  spawn: number;
  supplyCond: number;
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
    rank: reader.u8(68),
    spawn: reader.u8(69),
    supplyCond: reader.u8(70),
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
  items: RewardItem[];
}

/**
 * RewardTBL[] @ header.rewardsPtr, 8 bytes/entry (terminated when the next
 * entry's first u16 == 0xFFFF), each with its own RewardItem[] (6
 * bytes/entry, terminated by chance == 0xFFFF).
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
    tables.push({ items });
    off += 8;
  }
  return tables;
}

export interface MonsterSpawn {
  /** Index into emID. */
  monsterId: number;
  quantity: number;
  power: number;
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
  monsters: MonsterSpawn[];
}

function readSmallMonsterTablesAt(reader: BinaryReader, ptr: number): SmallMonsterTable[] {
  const tables: SmallMonsterTable[] = [];
  let off = ptr;
  while (reader.u32(off) !== 0) {
    const stageId = reader.u16(off);
    const dataPtr = reader.u32(off + 12);
    tables.push({ stageId, monsters: readSmallMonsterData(reader, dataPtr) });
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

/** The first populated language slot's strings, or null if none are set. */
export function readPrimaryQuestStrings(
  reader: BinaryReader,
  header: QuestHeader,
): QuestStrings | null {
  const all = readQuestStrings(reader, header);
  for (const slot of LANG_SLOTS) {
    const strings = all[slot];
    if (strings) return strings;
  }
  return null;
}

export interface ParsedQuest {
  header: QuestHeader;
  supplies: SupplyItem[];
  rewards: RewardTable[];
  largeMonsters: (MonsterSpawn & { stage: number })[];
  smallMonsters: SmallMonsterTable[];
  strings: QuestStrings | null;
}

/** Parses every struct this module knows about from a decrypted `.mib` payload. */
export function parseQuest(payload: Buffer): ParsedQuest {
  const reader = new BinaryReader(payload);
  const header = readQuestHeader(reader);
  return {
    header,
    supplies: readSupplies(reader, header),
    rewards: readRewards(reader, header),
    largeMonsters: readLargeMonsters(reader, header),
    smallMonsters: readSmallMonsters(reader, header),
    strings: readPrimaryQuestStrings(reader, header),
  };
}
