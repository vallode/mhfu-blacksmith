/**
 * `extract --raw`: a numbers-only dump of each quest's reward tables and
 * header, for decoding `RewardTBL.Unkn1`/`Unkn2` (which reward pool a table
 * is, and how often it's rolled) without shipping disc bytes.
 *
 * Per quest: the file path, the parsed header fields, all 32 header u32
 * words, every `RewardTBL` entry raw (`unkn1`, `unkn2`, items pointer) with
 * its items as `[chance, itemId, amount]`, the large monsters as
 * `[monsterId, quantity, power, stage]` and the quest script packets as
 * `[opcode, arg1, arg2, arg3]` (s16). No names or strings.
 *
 * For decoding monster size (README "Quests (.mib)"): every large and small
 * monster record whole, as its 15 u32 words (`largeMonsterRecords`,
 * `smallMonsterRecords`), so `Attr1`/`Attr2` and the `DynamicData` words
 * can be lined up with the header's `MonSizeModifier` (`headerWords[14]`)
 * and `Unkn4`/`Unkn5`/`Unkn7` (`header.unknownFlags`).
 *
 * `objectives` decodes the header's two objective slots (0x28 and 0x30,
 * the hexpat's `UnknPTR3`-`Unkn3`, `headerWords[10..13]`).
 *
 * For quest text space: `entrySize` (the DATA.BIN entry, sector padding
 * included, when known) and `strings`, the text's layout as offsets and
 * byte lengths (`readStringLayout`), still without the text itself.
 */
import { BinaryReader } from "../binary/reader.js";
import {
  readObjectives,
  readStringLayout,
  type ParsedQuest,
  type QuestObjective,
  type QuestHeader,
  type QuestStringLayout,
} from "../quests/parser.js";

export interface QuestRawEntry {
  path: string;
  size: number;
  /** The DATA.BIN entry's size (payload, cipher header and sector padding), if known. */
  entrySize: number | null;
  header: QuestHeader;
  headerWords: number[];
  rewards: { unkn1: number; unkn2: number; itemsPtr: number; items: number[][] }[];
  largeMonsters: number[][];
  script: number[][];
  /** Each `LargeMonData` record (60 bytes) as 15 u32 words, in file order. */
  largeMonsterRecords: number[][];
  /** Each `SmallMonData` record (60 bytes) as 15 u32 words, in file order. */
  smallMonsterRecords: number[][];
  strings: QuestStringLayout;
  /** The header's two objective slots (0x28, 0x30; `headerWords[10..13]`), decoded. */
  objectives: QuestObjective[];
}

const HEADER_SIZE = 128;
const SCRIPT_PACKET_SIZE = 8;
const MON_RECORD_SIZE = 60;
/** No real list comes close; stops runaway reads of a damaged file. */
const MAX_ENTRIES = 256;

function recordWords(reader: BinaryReader, at: number): number[] {
  const words: number[] = [];
  for (let i = 0; i < MON_RECORD_SIZE; i += 4) words.push(reader.u32(at + i));
  return words;
}

/** Large and small monster records, each once, following parser.ts's tables. */
function readMonsterRecords(
  reader: BinaryReader,
  header: QuestHeader,
): { large: number[][]; small: number[][] } {
  const size = reader.buf.length;
  const fits = (at: number, n: number) => at > 0 && at + n <= size;
  const seen = new Set<number>();
  const records = (ptr: number, out: number[][]) => {
    for (let i = 0, at = ptr; i < MAX_ENTRIES && fits(at, MON_RECORD_SIZE); i++) {
      if (reader.u16(at) === 0xffff) break;
      if (!seen.has(at)) out.push(recordWords(reader, at));
      seen.add(at);
      at += MON_RECORD_SIZE;
    }
  };
  const large: number[][] = [];
  const small: number[][] = [];
  for (let t = 0, at = header.largeMonPtr; t < MAX_ENTRIES && fits(at, 16); t++, at += 16) {
    if (reader.u16(at) === 0) break;
    records(reader.u32(at + 12), large);
  }
  for (let i = 0, at = header.smallMonPtr; i < MAX_ENTRIES && fits(at, 4); i++, at += 4) {
    if (reader.u16(at) === 0) break;
    for (let t = 0, table = reader.u32(at); t < MAX_ENTRIES && fits(table, 16); t++, table += 16) {
      if (reader.u32(table) === 0) break;
      records(reader.u32(table + 12), small);
    }
  }
  return { large, small };
}

function readScript(reader: BinaryReader, header: QuestHeader): number[][] {
  const { questScriptPtr: start, suppliesPtr: end } = header;
  if (start === 0 || end <= start || end > reader.buf.length) return [];
  const packets: number[][] = [];
  for (let off = start; off + SCRIPT_PACKET_SIZE <= end; off += SCRIPT_PACKET_SIZE) {
    packets.push([reader.s16(off), reader.s16(off + 2), reader.s16(off + 4), reader.s16(off + 6)]);
  }
  return packets;
}

export function dumpQuestRaw(
  path: string,
  payload: Buffer,
  parsed: ParsedQuest,
  entrySize: number | null = null,
): QuestRawEntry {
  const reader = new BinaryReader(payload);
  const headerWords: number[] = [];
  for (let off = 0; off + 4 <= Math.min(HEADER_SIZE, payload.length); off += 4) {
    headerWords.push(reader.u32(off));
  }
  const records = readMonsterRecords(reader, parsed.header);
  return {
    path,
    size: payload.length,
    entrySize,
    header: parsed.header,
    headerWords,
    rewards: parsed.rewards.map((t) => ({
      unkn1: t.unkn1,
      unkn2: t.unkn2,
      itemsPtr: t.itemsPtr,
      items: t.items.map((i) => [i.chance, i.itemId, i.amount]),
    })),
    largeMonsters: parsed.largeMonsters.map((m) => [m.monsterId, m.quantity, m.power, m.stage]),
    script: readScript(reader, parsed.header),
    largeMonsterRecords: records.large,
    smallMonsterRecords: records.small,
    strings: readStringLayout(reader, parsed.header),
    objectives: readObjectives(reader),
  };
}
