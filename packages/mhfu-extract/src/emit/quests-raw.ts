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
 */
import { BinaryReader } from "../binary/reader.js";
import type { ParsedQuest, QuestHeader } from "../quests/parser.js";

export interface QuestRawEntry {
  path: string;
  size: number;
  header: QuestHeader;
  headerWords: number[];
  rewards: { unkn1: number; unkn2: number; itemsPtr: number; items: number[][] }[];
  largeMonsters: number[][];
  script: number[][];
}

const HEADER_SIZE = 128;
const SCRIPT_PACKET_SIZE = 8;

function readScript(reader: BinaryReader, header: QuestHeader): number[][] {
  const { questScriptPtr: start, suppliesPtr: end } = header;
  if (start === 0 || end <= start || end > reader.buf.length) return [];
  const packets: number[][] = [];
  for (let off = start; off + SCRIPT_PACKET_SIZE <= end; off += SCRIPT_PACKET_SIZE) {
    packets.push([reader.s16(off), reader.s16(off + 2), reader.s16(off + 4), reader.s16(off + 6)]);
  }
  return packets;
}

export function dumpQuestRaw(path: string, payload: Buffer, parsed: ParsedQuest): QuestRawEntry {
  const reader = new BinaryReader(payload);
  const headerWords: number[] = [];
  for (let off = 0; off + 4 <= Math.min(HEADER_SIZE, payload.length); off += 4) {
    headerWords.push(reader.u32(off));
  }
  return {
    path,
    size: payload.length,
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
  };
}
