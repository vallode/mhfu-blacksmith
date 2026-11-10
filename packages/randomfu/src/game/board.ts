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
 * A quest can have a record in more than one file. Shuffles that change a
 * header field in that range (TargetID, terms, a delivery's item and amount)
 * or the goal line change every record's copy too.
 */
import type { QuestHeader } from "mhfu-extract/src/quests/parser.js";
import { readQuestText, type QuestText } from "./quest-text.js";

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

/**
 * The file's records, or null if none of its table's entries is one. An
 * entry that isn't a record (0, the end of the data, or anything pointing
 * past the file) is skipped: the EU files' tables may end with such a value.
 */
export function readBoardRecords(buf: Buffer): BoardRecord[] | null {
  if (buf.length < 4) return null;
  const first = buf.readUInt32LE(0);
  if (first < 4 || first % 4 !== 0 || first > buf.length) return null;
  const records: BoardRecord[] = [];
  for (let i = 0; i < first / 4; i++) {
    const offset = buf.readUInt32LE(i * 4);
    if (offset < first || offset + RECORD_HEADER_SIZE > buf.length) continue;
    const stringPtrTbl = buf.readUInt32LE(offset + RECORD_STRINGS);
    const questId = buf.readUInt16LE(offset + RECORD_QUEST_ID);
    if (questId === 0 || stringPtrTbl < offset || stringPtrTbl + 28 > buf.length) continue;
    records.push({ offset, questId, stringPtrTbl });
  }
  return records.length > 0 ? records : null;
}

/** A record as the header `readQuestText` reads strings through. */
export function recordHeader(record: BoardRecord): QuestHeader {
  return { stringPtrTbl: record.stringPtrTbl } as QuestHeader;
}

/** Where the record's copy of the quest header starts, in quest file offsets. */
const COPIED_FROM = 0x4c;

/**
 * The offset to read a quest header field's copy at in a board file: add a
 * quest file offset (`FEE`, `TARGET_ID`, ...) from 0x4c to 0x7f to it.
 */
export function recordBase(record: BoardRecord): number {
  return record.offset - COPIED_FROM;
}

export const boardName = (board: BoardFile) => board.path.replace(/^mission_jpn\//, "");

/** A quest's records, on every board it's on. */
export function questRecords(
  boards: readonly BoardFile[],
  questId: number,
): { board: BoardFile; record: BoardRecord }[] {
  return boards.flatMap((board) =>
    board.records.filter((r) => r.questId === questId).map((record) => ({ board, record })),
  );
}

/** A record's text, read from `data` (the board file as edited so far). */
export function readRecordText(data: Buffer, record: BoardRecord): QuestText {
  return readQuestText(data, recordHeader(record), record.offset + RECORD_HEADER_SIZE);
}

/**
 * Whether rewriting `record`'s strings could change another record's: a
 * board file holds many quests' strings, and a quest file's rules for its
 * own text (`writeQuestText`) only know about one. True if another
 * record's string lies in the bytes this record's strings use, or can't be
 * read.
 */
export function sharesStrings(data: Buffer, board: BoardFile, record: BoardRecord): boolean {
  let own: QuestText;
  try {
    own = readRecordText(data, record);
  } catch {
    return true;
  }
  const spans = [
    ...own.runs.map((r) => [r.start, r.end] as const),
    ...own.blocks.flatMap((b) =>
      b.pointers.flatMap((ptr, i) =>
        ptr === 0 ? [] : [[ptr, ptr + Buffer.byteLength(b.texts[i]!) + 1] as const],
      ),
    ),
  ];
  for (const other of board.records) {
    if (other === record) continue;
    let text: QuestText;
    try {
      text = readRecordText(data, other);
    } catch {
      return true;
    }
    for (const block of text.blocks) {
      for (const ptr of block.pointers) {
        if (ptr !== 0 && spans.some(([s, e]) => ptr >= s && ptr < e)) return true;
      }
    }
  }
  return false;
}
