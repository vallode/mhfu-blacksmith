/**
 * The quest board: `mission_jpn/level1.mib` to `level11.mib`, `levelx.mib`
 * and `levela.mib`. They aren't encrypted beyond DATA.BIN's own cipher (the
 * quest cipher's checks fail on them, which is why mhfu-extract sets them
 * aside), and they hold what the board and the Quest Details screen show:
 * on the EU disc, quest 10109's title and goal are in `level2.mib` and
 * `level3.mib`, and editing the quest file's own text didn't change the
 * screen (mhfu-extract `quest-text-scan`).
 *
 * Layout, read from the EU files:
 *
 *   u32 record[n]        file offset of each record; n = record[0] / 4
 *   record:
 *     0x34 bytes         a copy of the quest header's display section
 *                        (quest file 0x4c-0x7f): quest type, fee, reward,
 *                        penalty, time limit, then at +0x14 a u32 file offset
 *                        of its `LangPTRs`, +0x18 u16 quest ID, +0x1a stars,
 *                        +0x1c map, +0x24 u16 TargetID, +0x26 u16 TargetNum
 *     strings, `StringPTRs` blocks and `LangPTRs`, as in a quest file but
 *     with offsets from the start of the board file
 *
 * A quest can have a record in more than one file.
 */
import type { QuestHeader } from "mhfu-extract/src/quests/parser.js";

export const BOARD_PATHS = [
  ...Array.from({ length: 11 }, (_, i) => `mission_jpn/level${i + 1}.mib`),
  "mission_jpn/levelx.mib",
  "mission_jpn/levela.mib",
];

/** The copied header section's size: the record's strings start after it. */
export const RECORD_HEADER_SIZE = 0x34;
export const RECORD_STRINGS = 0x14;
export const RECORD_QUEST_ID = 0x18;
export const RECORD_TARGET_ID = 0x24;

export interface BoardRecord {
  /** File offset of the record. */
  offset: number;
  questId: number;
  /** File offset of its `LangPTRs`. */
  stringPtrTbl: number;
}

export interface BoardFile {
  /** DATA.BIN index. */
  index: number;
  path: string;
  data: Buffer;
  records: BoardRecord[];
}

/** The file's records, or null if it isn't laid out like a board file. */
export function readBoardRecords(buf: Buffer): BoardRecord[] | null {
  if (buf.length < 4) return null;
  const first = buf.readUInt32LE(0);
  if (first < 4 || first % 4 !== 0 || first > buf.length) return null;
  const records: BoardRecord[] = [];
  for (let i = 0; i < first / 4; i++) {
    const offset = buf.readUInt32LE(i * 4);
    if (offset < first || offset + RECORD_HEADER_SIZE > buf.length) return null;
    const stringPtrTbl = buf.readUInt32LE(offset + RECORD_STRINGS);
    if (stringPtrTbl !== 0 && (stringPtrTbl < offset || stringPtrTbl + 28 > buf.length))
      return null;
    records.push({ offset, questId: buf.readUInt16LE(offset + RECORD_QUEST_ID), stringPtrTbl });
  }
  return records;
}

/** A record as the header `readQuestText` reads strings through. */
export function recordHeader(record: BoardRecord): QuestHeader {
  return { stringPtrTbl: record.stringPtrTbl } as QuestHeader;
}
