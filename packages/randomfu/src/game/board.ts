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
import { rewriteGoal } from "./quest-fields.js";
import { readQuestText, type QuestText, type Span } from "./quest-text.js";

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
const LANG_PTRS_SIZE = 28;
const STRING_PTRS_SIZE = 24;

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

/**
 * Everything in the board file that isn't `record`'s: the record table and
 * every other record's header copy, `LangPTRs`, `StringPTRs` blocks and
 * strings. A board file holds many quests' text, and the quest file rules
 * for writing it (`writeQuestText`, `rewriteGoal`) only know about one
 * quest's, so these are what they must not touch. Null if another record's
 * text can't be read.
 */
function reservedFor(data: Buffer, board: BoardFile, record: BoardRecord): Span[] | null {
  const spans: Span[] = [[0, data.readUInt32LE(0)]];
  for (const other of board.records) {
    if (other === record) continue;
    spans.push(
      [other.offset, other.offset + RECORD_HEADER_SIZE],
      [other.stringPtrTbl, other.stringPtrTbl + LANG_PTRS_SIZE],
    );
    let text: QuestText;
    try {
      text = readQuestText(data, recordHeader(other), other.offset + RECORD_HEADER_SIZE);
    } catch {
      return null;
    }
    for (const block of text.blocks) {
      spans.push([block.offset, block.offset + STRING_PTRS_SIZE]);
      block.pointers.forEach((ptr, i) => {
        if (ptr !== 0) spans.push([ptr, ptr + Buffer.byteLength(block.texts[i]!) + 1]);
      });
    }
  }
  return spans;
}

export interface RecordText {
  text: QuestText;
  /** The bytes that aren't the record's (`reservedFor`), for `rewriteRecordGoal`. */
  reserved: readonly Span[];
}

/**
 * A record's text, read from `data` (the board file as edited so far),
 * knowing which bytes are other records': `writeQuestText` won't write it
 * where it shares bytes with them, and won't repack it over them. Locked
 * if it, or another record's text, can't be read.
 */
export function readRecordText(data: Buffer, board: BoardFile, record: BoardRecord): RecordText {
  const reserved = reservedFor(data, board, record);
  const floor = record.offset + RECORD_HEADER_SIZE;
  try {
    const text = readQuestText(data, recordHeader(record), floor, reserved ?? []);
    if (reserved) return { text, reserved };
    const why = "another quest's text on its board can't be read";
    return { text: { ...text, locked: why, unmovable: why, runs: [] }, reserved: [] };
  } catch {
    const why = "its text can't be read";
    return {
      text: { blocks: [], locked: why, unmovable: why, runs: [], align: 1 },
      reserved: reserved ?? [],
    };
  }
}

/**
 * Points the record's goal line at `goal` by `rewriteGoal`'s rules (a quest
 * file's), leaving other records' bytes alone. False, changing nothing, if
 * it fits in none of its goal strings.
 */
export function rewriteRecordGoal(
  data: Buffer,
  record: BoardRecord,
  { text, reserved }: RecordText,
  goal: string,
): boolean {
  if (text.locked) return false;
  return rewriteGoal(data, goal, {
    table: record.stringPtrTbl,
    floor: record.offset + RECORD_HEADER_SIZE,
    reserved,
  });
}
