/**
 * Adds a record to a quest board file (`level*.mib`, see board.ts). The
 * record table at the start has no spare entry (its 0 end marker sits right
 * before the first record), so everything after it moves 4 bytes and every
 * offset in the file grows by 4: the table's, each record's `LangPTRs`
 * offset, each `LangPTRs` entry and each `StringPTRs` entry. The new record
 * then goes after the last byte any record uses, in the file's sector
 * padding. The file keeps its size.
 *
 * When the padding is too short (EU `level2.mib`), the file is laid out
 * again with each distinct string stored once: the EU files repeat strings
 * a lot (8 KB of `level2.mib`'s 49 KB). Board files 1-11 hold nothing but
 * the table, records, `LangPTRs`, `StringPTRs` and strings (every other
 * byte up to the end of the data is alignment 0s), so that loses nothing.
 */
import { LANG_SLOTS } from "mhfu-extract/src/quests/parser.js";
import {
  RECORD_HEADER_SIZE,
  RECORD_STRINGS,
  align,
  readBoardRecords,
  type BoardRecord,
} from "whetstone/src/game/board.js";

const STRING_FIELDS = 6;

export interface NewRecord {
  /** The 0x34-byte header copy (quest file 0x4c-0x7f); its `LangPTRs` offset is set here. */
  header: Buffer;
  /** Title, goal, fail, details, monsters, client: one block for every language. */
  strings: readonly string[];
}

/** The file with the record added, or why it can't be. */
export function addBoardRecord(file: Buffer, record: NewRecord): Buffer | string {
  const records = readBoardRecords(file);
  if (!records) return "no records";
  const tableEnd = file.readUInt32LE(0);
  const entries = tableEnd / 4;
  // The table must end in exactly one 0 with nothing else in it.
  for (let i = 0; i < entries - 1; i++) {
    if (file.readUInt32LE(i * 4) !== records[i]?.offset) return "the record table isn't plain";
  }
  if (file.readUInt32LE(tableEnd - 4) !== 0) return "the record table doesn't end in 0";

  // Every offset in the file, and the last byte anything uses.
  const langTables = new Set<number>();
  const stringTables = new Set<number>();
  let end = tableEnd;
  for (const r of records) {
    end = Math.max(end, r.offset + RECORD_HEADER_SIZE);
    langTables.add(r.stringPtrTbl);
  }
  for (const lang of langTables) {
    end = Math.max(end, lang + LANG_SLOTS.length * 4);
    for (let k = 0; k < LANG_SLOTS.length; k++) {
      const block = file.readUInt32LE(lang + k * 4);
      if (block !== 0) stringTables.add(block);
    }
  }
  for (const block of stringTables) {
    end = Math.max(end, block + STRING_FIELDS * 4);
    for (let k = 0; k < STRING_FIELDS; k++) {
      const at = file.readUInt32LE(block + k * 4);
      if (at === 0) continue;
      const nul = file.indexOf(0, at);
      if (nul < 0) return "a string runs off the file";
      end = Math.max(end, nul + 1);
    }
  }

  const strings = record.strings.map((s) => Buffer.from(`${s}\0`, "utf8"));
  const at = align(end + 4);
  let size = RECORD_HEADER_SIZE;
  for (const s of strings) size += align(s.length);
  size += STRING_FIELDS * 4 + LANG_SLOTS.length * 4;
  if (at + size > file.length) {
    return relayout(file, records, end, record, strings);
  }

  const out = Buffer.alloc(file.length);
  file.copy(out, tableEnd + 4, tableEnd, end);
  for (let i = 0; i < entries - 1; i++) out.writeUInt32LE(records[i]!.offset + 4, i * 4);
  out.writeUInt32LE(at, (entries - 1) * 4);
  out.writeUInt32LE(0, entries * 4);
  const shift = (offset: number) => {
    const v = out.readUInt32LE(offset + 4);
    if (v !== 0) out.writeUInt32LE(v + 4, offset + 4);
  };
  for (const r of records) shift(r.offset + RECORD_STRINGS);
  for (const lang of langTables) for (let k = 0; k < LANG_SLOTS.length; k++) shift(lang + k * 4);
  for (const block of stringTables) for (let k = 0; k < STRING_FIELDS; k++) shift(block + k * 4);
  // The padding after the data stays as it was.
  file.copy(out, end + 4, end + 4);

  // The new record: header, strings, one StringPTRs block, LangPTRs.
  let p = at + RECORD_HEADER_SIZE;
  record.header.copy(out, at, 0, RECORD_HEADER_SIZE);
  const pointers: number[] = [];
  for (const s of strings) {
    pointers.push(p);
    s.copy(out, p);
    out.fill(0, p + s.length, align(p + s.length));
    p = align(p + s.length);
  }
  const block = p;
  for (const ptr of pointers) (out.writeUInt32LE(ptr, p), (p += 4));
  const lang = p;
  for (let k = 0; k < LANG_SLOTS.length; k++) (out.writeUInt32LE(block, p), (p += 4));
  out.writeUInt32LE(lang, at + RECORD_STRINGS);
  return out;
}

/**
 * The file laid out again with the new record: the table, then each record's
 * header, `LangPTRs` and `StringPTRs` blocks, then every distinct string once.
 * The bytes after the old data (sector padding) stay as they were.
 */
function relayout(
  file: Buffer,
  records: readonly BoardRecord[],
  end: number,
  record: NewRecord,
  newStrings: readonly Buffer[],
): Buffer | string {
  const stringAt = (at: number) => file.subarray(at, file.indexOf(0, at) + 1);
  type Block = (Buffer | null)[];
  type Lang = (Block | null)[];
  const blocks = new Map<number, Block>();
  const langs = new Map<number, Lang>();
  const blockOf = (at: number): Block =>
    blocks.get(at) ??
    blocks
      .set(
        at,
        Array.from({ length: STRING_FIELDS }, (_, k) => {
          const s = file.readUInt32LE(at + k * 4);
          return s === 0 ? null : stringAt(s);
        }),
      )
      .get(at)!;
  const langOf = (at: number): Lang =>
    langs.get(at) ??
    langs
      .set(
        at,
        LANG_SLOTS.map((_, k) => {
          const b = file.readUInt32LE(at + k * 4);
          return b === 0 ? null : blockOf(b);
        }),
      )
      .get(at)!;

  const newBlock: Block = [...newStrings];
  const all = [
    ...records.map((r) => ({
      header: file.subarray(r.offset, r.offset + RECORD_HEADER_SIZE),
      lang: langOf(r.stringPtrTbl),
    })),
    { header: record.header.subarray(0, RECORD_HEADER_SIZE), lang: LANG_SLOTS.map(() => newBlock) },
  ];

  // Headers, LangPTRs and blocks, in record order; then the strings.
  const out = Buffer.from(file);
  out.fill(0, 0, end);
  let p = (all.length + 1) * 4;
  const placed = new Map<object, number>();
  const place = (thing: object, size: number) => {
    if (placed.has(thing)) return false;
    placed.set(thing, p);
    p += size;
    return true;
  };
  const recordAt: number[] = [];
  for (const r of all) {
    recordAt.push(p);
    p += RECORD_HEADER_SIZE;
    if (place(r.lang, LANG_SLOTS.length * 4)) {
      for (const b of r.lang) if (b) place(b, STRING_FIELDS * 4);
    }
  }
  const stringsAt = new Map<string, number>();
  for (const b of new Set(all.flatMap((r) => r.lang))) {
    for (const s of b ?? []) {
      if (!s || stringsAt.has(s.toString("hex"))) continue;
      if (p + s.length > file.length) {
        return `no room, even sharing strings (${p + s.length - file.length} bytes short)`;
      }
      stringsAt.set(s.toString("hex"), p);
      s.copy(out, p);
      p = align(p + s.length);
    }
  }

  all.forEach((r, i) => {
    out.writeUInt32LE(recordAt[i]!, i * 4);
    r.header.copy(out, recordAt[i]!);
    out.writeUInt32LE(placed.get(r.lang)!, recordAt[i]! + RECORD_STRINGS);
  });
  for (const lang of new Set(all.map((r) => r.lang))) {
    lang.forEach((b, k) => out.writeUInt32LE(b ? placed.get(b)! : 0, placed.get(lang)! + k * 4));
    for (const b of lang) {
      if (!b) continue;
      b.forEach((s, k) => {
        const at = s ? stringsAt.get(s.toString("hex")) : 0;
        if (at === undefined) throw new Error("a string wasn't placed");
        out.writeUInt32LE(at, placed.get(b)! + k * 4);
      });
    }
  }
  return out;
}
