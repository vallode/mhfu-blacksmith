/**
 * Hunting horn note sets and melodies (vallode/mhfu-blacksmith#14, #32).
 *
 * Neither table is in the vendored hexpats. Both were found with
 * `extract --raw`'s `raw/melodies.json` (emit/melody-raw.ts) on the EU disc
 * and are located by their shape, not by address, so they read the same way
 * from any region.
 *
 * **Note sets** (EBOOT, EU file offset 0x1b63cc): 20 entries of 3 bytes,
 * indexed by a horn's `WepBMValue.NoteGLType`, followed by `ff ff ff ff`.
 * Each byte is a note colour (`NOTE_COLOURS`), the first always white or
 * purple. On the EU disc this table gives the committed notes of all 95
 * horns.
 *
 * **Melodies** (`game_task.ovl`, EU file offset 0x1aca38): one 4-byte entry
 * per song, its notes stored last-played first and zero-padded, then an
 * all-zero entry. Right after it is one byte per song: the song's effect
 * ID, non-decreasing from 0 (a few effects have two songs, e.g. Defense Up
 * [Hi]). Three songs (white-white, purple-purple, yellow-yellow-yellow)
 * store one more note than they need, its byte flagged `0x80`; the site's
 * combos for those songs are the unflagged notes, so the flagged note is
 * dropped (`optional`).
 */
import type { BinaryReader } from "../binary/reader.js";

/** Note colour codes, as the site writes them (`--color-note-*`), by raw byte value. */
export const NOTE_COLOURS: Readonly<Record<number, string>> = {
  1: "w",
  2: "p",
  3: "b",
  4: "y",
  5: "r",
  6: "g",
  7: "a",
};

export const NOTE_SET_COUNT = 20;
const NOTE_SET_SIZE = 3;
const NOTE_SET_TERMINATOR = Buffer.from("ffffffff", "hex");

const SONG_SIZE = 4;
const SONG_OPTIONAL_FLAG = 0x80;
/** Fewest songs a candidate melody table needs (the EU disc has 47). */
const MIN_SONGS = 30;

export class HornTableError extends Error {}

function isNote(byte: number): boolean {
  return byte >= 1 && byte <= 7;
}

function isNoteSetAt(buf: Buffer, offset: number): boolean {
  for (let i = 0; i < NOTE_SET_COUNT; i++) {
    const a = buf[offset + i * NOTE_SET_SIZE]!;
    const b = buf[offset + i * NOTE_SET_SIZE + 1]!;
    const c = buf[offset + i * NOTE_SET_SIZE + 2]!;
    if (a !== 1 && a !== 2) return false;
    if (!isNote(b) || !isNote(c)) return false;
    if (a === b || b === c || a === c) return false;
  }
  return true;
}

/** File offset of the note-set table. Throws unless exactly one table has its shape. */
export function findNoteSetTable(buf: Buffer): number {
  const span = NOTE_SET_COUNT * NOTE_SET_SIZE;
  const matches: number[] = [];
  for (
    let at = buf.indexOf(NOTE_SET_TERMINATOR, span);
    at !== -1;
    at = buf.indexOf(NOTE_SET_TERMINATOR, at + 1)
  ) {
    if (isNoteSetAt(buf, at - span)) matches.push(at - span);
  }
  if (matches.length !== 1) {
    throw new HornTableError(
      `Expected one hunting horn note-set table, found ${matches.length} (${matches.map((m) => `0x${m.toString(16)}`).join(", ")}).`,
    );
  }
  return matches[0]!;
}

/** Each note set's three notes as colour codes, indexed by `NoteGLType`. */
export function readHornNoteSets(reader: BinaryReader): string[][] {
  const base = findNoteSetTable(reader.buf);
  const sets: string[][] = [];
  for (let i = 0; i < NOTE_SET_COUNT; i++) {
    const notes: string[] = [];
    for (let k = 0; k < NOTE_SET_SIZE; k++) {
      notes.push(NOTE_COLOURS[reader.u8(base + i * NOTE_SET_SIZE + k)]!);
    }
    sets.push(notes);
  }
  return sets;
}

export interface Song {
  /** Position in the melody table. */
  index: number;
  /** Notes in playing order, colour codes, without the optional note. */
  notes: string[];
  /** The note flagged `0x80`, if any (see the module comment). */
  optional: string | null;
  effectId: number;
}

/** A song entry's notes in playing order, or null if the 4 bytes aren't a song. */
function songAt(buf: Buffer, offset: number): { notes: string[]; optional: string | null } | null {
  const bytes = [...buf.subarray(offset, offset + SONG_SIZE)];
  const length = bytes.indexOf(0) === -1 ? SONG_SIZE : bytes.indexOf(0);
  if (length < 2 || bytes.slice(length).some((b) => b !== 0)) return null;
  const notes: string[] = [];
  let optional: string | null = null;
  for (const byte of bytes.slice(0, length).reverse()) {
    const colour = NOTE_COLOURS[byte & ~SONG_OPTIONAL_FLAG];
    if (!colour) return null;
    if (byte & SONG_OPTIONAL_FLAG) {
      if (optional !== null) return null;
      optional = colour;
    } else notes.push(colour);
  }
  return notes.length >= 2 ? { notes, optional } : null;
}

/** Effect IDs right after the table: non-decreasing from 0, one per song. */
function effectIdsAt(buf: Buffer, offset: number, count: number): number[] | null {
  if (offset + count > buf.length) return null;
  const ids = [...buf.subarray(offset, offset + count)];
  if (ids[0] !== 0) return null;
  for (let i = 1; i < count; i++) {
    const step = ids[i]! - ids[i - 1]!;
    if (step !== 0 && step !== 1) return null;
  }
  return ids;
}

/**
 * Every song in `buf` (a decrypted `game_task.ovl`). Throws unless exactly
 * one table has the melody table's shape.
 */
export function readMelodyTable(reader: BinaryReader): Song[] {
  const buf = reader.buf;
  const found: Song[][] = [];
  for (let start = 0; start + SONG_SIZE * (MIN_SONGS + 1) <= buf.length; start += SONG_SIZE) {
    // Only the start of a run, so each table is seen once.
    if (start >= SONG_SIZE && songAt(buf, start - SONG_SIZE)) continue;
    const songs: { notes: string[]; optional: string | null }[] = [];
    let at = start;
    for (let song = songAt(buf, at); song; song = songAt(buf, at)) {
      songs.push(song);
      at += SONG_SIZE;
    }
    if (songs.length < MIN_SONGS || buf.readUInt32LE(at) !== 0) continue;
    const ids = effectIdsAt(buf, at + SONG_SIZE, songs.length);
    if (!ids) continue;
    found.push(songs.map((s, index) => ({ index, ...s, effectId: ids[index]! })));
  }
  if (found.length !== 1) {
    throw new HornTableError(`Expected one hunting horn melody table, found ${found.length}.`);
  }
  return found[0]!;
}

/** The songs a horn with `notes` can play: those using only its colours, in table order. */
export function songsForNotes(songs: Song[], notes: string[]): Song[] {
  const have = new Set(notes);
  return songs.filter((s) => s.notes.every((n) => have.has(n)));
}
