/**
 * A quest's text: where its strings are, and writing new ones back within
 * the bytes they already use.
 *
 * `header.stringPtrTbl` points at `LangPTRs`, seven u32 pointers to
 * `StringPTRs` blocks, each six u32 pointers to NUL-terminated UTF-8
 * strings: title, goal, fail, details, monsters, client (mhfu-extract
 * `quests/parser.ts`, `readStringLayout`). The seven slots follow the game's
 * language IDs (`LanguageId` in the MHP2G decomp's `data_manager.hpp`):
 * Japanese, English, German, French, Spanish, Italian, Korean. On the EU
 * disc the Japanese and Korean slots hold English; on the JP disc every
 * slot points at the same Japanese block.
 *
 * Writing never changes the payload's size. A string that is no longer
 * than before is written where it was. Otherwise the quest's strings are
 * repacked: the "text area" is the strings' own bytes, merged into runs
 * where only a few zero bytes (alignment) separate them, and every string
 * is written back to back within its run, identical strings once (the JP
 * disc shows the game reads shared strings), and the block pointers are
 * updated. If anything else could be in that area (overlapping strings,
 * a pointer table inside it), nothing is repacked.
 */
import { BinaryReader } from "../../../mhfu-extract/src/binary/reader.js";
import {
  readStringLayout,
  STRING_FIELDS,
  type QuestHeader,
  type StringField,
} from "../../../mhfu-extract/src/quests/parser.js";

export { STRING_FIELDS, type StringField };

/** The language of each `LangPTRs` slot, by the game's language ID. */
export const SLOT_LANGUAGES = [
  "Japanese",
  "English",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Korean",
] as const;

export interface TextBlock {
  /** Offset of the `StringPTRs` block. */
  offset: number;
  /** The `LangPTRs` slots that point at it. */
  slots: number[];
  /** Each field's string offset (0 if unset). */
  pointers: number[];
  /** Each field's text ("" if unset). */
  texts: string[];
}

export interface QuestText {
  blocks: TextBlock[];
  /** Why the text can't be moved, if it can't; strings can still be rewritten in place. */
  unmovable: string | null;
  /** Runs of the payload the strings may be repacked into. */
  runs: { start: number; end: number }[];
}

/** At most this many zero bytes between two strings join them into one run. */
const MAX_GAP = 3;

export function readQuestText(payload: Buffer, header: QuestHeader): QuestText {
  const reader = new BinaryReader(payload);
  const layout = readStringLayout(reader, header);
  const blocks: TextBlock[] = layout.strings.map((s) => ({
    offset: s.block,
    slots: layout.blocks.flatMap((b, i) => (b === s.block ? [i] : [])),
    pointers: s.pointers,
    texts: s.pointers.map((ptr, i) =>
      ptr === 0 ? "" : payload.toString("utf8", ptr, ptr + s.lengths[i]!),
    ),
  }));

  const ranges = new Map<number, number>();
  for (const s of layout.strings) {
    s.pointers.forEach((ptr, i) => {
      if (ptr !== 0) ranges.set(ptr, ptr + s.lengths[i]! + 1);
    });
  }
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const runs: QuestText["runs"] = [];
  let unmovable: string | null = sorted.length === 0 ? "no text" : null;
  for (const [start, end] of sorted) {
    const last = runs[runs.length - 1];
    if (last && start < last.end) {
      unmovable = "strings overlap";
      break;
    }
    const gap = last ? payload.subarray(last.end, start) : null;
    if (last && gap!.length <= MAX_GAP && gap!.every((b) => b === 0)) last.end = end;
    else runs.push({ start, end });
  }
  const tables = [
    [layout.table, layout.table + 28],
    ...blocks.map((b) => [b.offset, b.offset + 24]),
  ];
  if (
    !unmovable &&
    runs.some((r) => r.start < 0x80 || tables.some(([s, e]) => s! < r.end && r.start < e!))
  ) {
    unmovable = "the strings share bytes with the header or a pointer table";
  }
  return { blocks, unmovable, runs: unmovable ? [] : runs };
}

const encoded = (text: string) => Buffer.byteLength(text, "utf8") + 1;

/**
 * Writes new texts (by string offset) into `payload`, within the bytes the
 * quest's strings use. Returns false, changing nothing, if they don't fit.
 */
export function writeQuestText(
  payload: Buffer,
  text: QuestText,
  changes: ReadonlyMap<number, string>,
): boolean {
  const current = new Map<number, string>();
  for (const block of text.blocks) {
    block.pointers.forEach((ptr, i) => {
      if (ptr !== 0) current.set(ptr, changes.get(ptr) ?? block.texts[i]!);
    });
  }
  const original = new Map<number, number>();
  for (const block of text.blocks) {
    block.pointers.forEach((ptr, i) => {
      if (ptr !== 0) original.set(ptr, encoded(block.texts[i]!));
    });
  }

  // In place, when nothing grows.
  if ([...changes].every(([ptr, t]) => encoded(t) <= original.get(ptr)!)) {
    for (const [ptr, t] of changes) {
      payload.fill(0, ptr, ptr + original.get(ptr)!);
      payload.write(t, ptr, "utf8");
    }
    return true;
  }
  if (text.unmovable) return false;

  // Repack each run in address order; a string already written is shared.
  const placed = new Map<string, number>();
  const moved = new Map<number, number>();
  const writes: { at: number; text: string }[] = [];
  for (const run of text.runs) {
    let cursor = run.start;
    for (const [ptr, t] of [...current].sort((a, b) => a[0] - b[0])) {
      if (ptr < run.start || ptr >= run.end) continue;
      const at = placed.get(t);
      if (at !== undefined) {
        moved.set(ptr, at);
        continue;
      }
      if (cursor + encoded(t) > run.end) return false;
      writes.push({ at: cursor, text: t });
      placed.set(t, cursor);
      moved.set(ptr, cursor);
      cursor += encoded(t);
    }
  }
  for (const run of text.runs) payload.fill(0, run.start, run.end);
  for (const { at, text: t } of writes) payload.write(t, at, "utf8");
  for (const block of text.blocks) {
    block.pointers.forEach((ptr, i) => {
      if (ptr !== 0) payload.writeUInt32LE(moved.get(ptr)!, block.offset + i * 4);
    });
  }
  return true;
}
