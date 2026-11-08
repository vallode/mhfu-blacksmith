/**
 * `extract --raw`: candidate hunting horn note-set and melody tables
 * (vallode/mhfu-blacksmith#14, #32). Numbers only.
 *
 * Each horn's `WepBMValue.NoteGLType` byte is presumably an index into a
 * table of three-note sets somewhere in the EBOOT or an overlay. We don't
 * know where, so this searches every file for a strided table whose entry
 * `NoteGLType` holds that horn's committed notes under one consistent
 * colour -> byte mapping (`findNoteSetTables`). Each hit, and the bytes
 * around it (where a melody table is likely to sit), go to
 * `raw/melodies.json` for offline correlation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BinaryReader } from "../binary/reader.js";
import { readBlademasterWeapons, readModelToWeaponType } from "../tables/weapons.js";
import type { TableAddressResolver } from "../tables/resolver.js";

/** One horn's raw `NoteGLType` and its committed notes, e.g. `["w","a","b"]`. */
export interface HornNotes {
  noteType: number;
  notes: string[];
}

export interface NoteSetTableHit {
  file: string;
  /** File offset of entry 0 (can be negative if the table starts at a later index). */
  base: number;
  stride: number;
  /** Byte position within the entry of the first, second and third note. */
  positions: [number, number, number];
  /** Colour letter -> raw byte value. */
  mapping: Record<string, number>;
  /** How many distinct `NoteGLType` values the hit agrees on. */
  matched: number;
}

export interface ByteWindow {
  file: string;
  offset: number;
  bytes: number[];
}

export interface ComboBlock {
  file: string;
  /** Offset of a `COMBO_BLOCK`-byte block. */
  offset: number;
  /** Distinct melody note sequences (as mapped bytes) found in the block. */
  combos: number;
}

export interface MelodyRawDump {
  /** Distinct `NoteGLType` -> notes pairs used for the search. */
  noteSets: { noteType: number; notes: string[]; horns: number }[];
  hits: NoteSetTableHit[];
  /** Per hit mapping, the blocks densest in known melody note sequences. */
  comboBlocks: ComboBlock[];
  windows: ByteWindow[];
}

const MAX_STRIDE = 16;
const MAX_HITS = 40;
const WINDOW_BEFORE = 0x800;
const WINDOW_AFTER = 0x1000;
const COMBO_BLOCK = 0x400;
const TOP_COMBO_BLOCKS = 4;

/**
 * Blocks of `buf` holding the most distinct melody note sequences (each
 * colour replaced by its mapped byte), for locating the melody table.
 */
export function findComboBlocks(
  file: string,
  buf: Buffer,
  mapping: Record<string, number>,
  combos: string[][],
): ComboBlock[] {
  const needles = new Map<string, Buffer>();
  for (const combo of combos) {
    if (combo.length < 3 || combo.some((n) => mapping[n] === undefined)) continue;
    needles.set(combo.join(""), Buffer.from(combo.map((n) => mapping[n]!)));
  }
  const perBlock = new Map<number, Set<string>>();
  for (const [key, needle] of needles) {
    for (let at = buf.indexOf(needle); at !== -1; at = buf.indexOf(needle, at + 1)) {
      const block = Math.floor(at / COMBO_BLOCK) * COMBO_BLOCK;
      const found = perBlock.get(block) ?? new Set<string>();
      found.add(key);
      perBlock.set(block, found);
    }
  }
  return [...perBlock.entries()]
    .map(([offset, found]) => ({ file, offset, combos: found.size }))
    .sort((a, b) => b.combos - a.combos || a.offset - b.offset)
    .slice(0, TOP_COMBO_BLOCKS);
}

/** Most common notes per `NoteGLType` (a site typo shouldn't sink a whole entry). */
export function noteSetsByType(horns: HornNotes[]): MelodyRawDump["noteSets"] {
  const byType = new Map<number, Map<string, number>>();
  for (const h of horns) {
    if (h.notes.length !== 3) continue;
    const counts = byType.get(h.noteType) ?? new Map<string, number>();
    const key = h.notes.join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    byType.set(h.noteType, counts);
  }
  return [...byType.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([noteType, counts]) => {
      const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const horns = [...counts.values()].reduce((sum, c) => sum + c, 0);
      return { noteType, notes: best.split(""), horns };
    });
}

/**
 * Searches `buf` for strided tables of note sets. A hit needs every
 * distinct `NoteGLType` to agree, with one injective colour -> byte map
 * shared by all three note positions.
 */
export function findNoteSetTables(
  file: string,
  buf: Buffer,
  sets: { noteType: number; notes: string[] }[],
): NoteSetTableHit[] {
  const hits: NoteSetTableHit[] = [];
  if (sets.length < 3) return hits;
  const minType = Math.min(...sets.map((s) => s.noteType));
  const maxType = Math.max(...sets.map((s) => s.noteType));
  const prepared = prepare(sets, minType);
  const bij = new Bijection();

  for (let stride = 3; stride <= MAX_STRIDE; stride++) {
    const span = (maxType - minType) * stride + stride;
    for (let start = 0; start + span <= buf.length; start++) {
      // Per note slot k, the byte positions j whose values map consistently.
      // Slot by slot, giving up as soon as one has no candidate.
      const candidates: number[][] = [];
      for (let k = 0; k < 3; k++) {
        const slot: number[] = [];
        for (let j = 0; j < stride; j++) {
          if (consistentSlot(buf, start, stride, j, k, prepared, bij)) slot.push(j);
        }
        if (slot.length === 0) break;
        candidates.push(slot);
      }
      if (candidates.length < 3) continue;
      for (const j0 of candidates[0]!) {
        for (const j1 of candidates[1]!) {
          for (const j2 of candidates[2]!) {
            if (j0 === j1 || j1 === j2 || j0 === j2) continue;
            const mapping = sharedMapping(buf, start, stride, [j0, j1, j2], prepared, bij);
            if (!mapping) continue;
            hits.push({
              file,
              base: start - minType * stride,
              stride,
              positions: [j0, j1, j2],
              mapping,
              matched: sets.length,
            });
            if (hits.length >= MAX_HITS) return hits;
          }
        }
      }
    }
  }
  return hits;
}

const COLOURS = "abgprwy";

/** Reusable lookup state for the consistency checks (stamped, so no clearing). */
class Bijection {
  private toByte = new Int16Array(COLOURS.length);
  private toColour = new Int16Array(256);
  private byteStamp = new Uint32Array(COLOURS.length);
  private colourStamp = new Uint32Array(256);
  private stamp = 0;
  size = 0;

  reset(): void {
    this.stamp++;
    this.size = 0;
  }

  /** Records colour <-> value; false if it contradicts an earlier pair. */
  add(colour: number, value: number): boolean {
    const haveByte = this.byteStamp[colour] === this.stamp;
    const haveColour = this.colourStamp[value] === this.stamp;
    if (haveByte && this.toByte[colour] !== value) return false;
    if (haveColour && this.toColour[value] !== colour) return false;
    if (!haveByte) {
      this.byteStamp[colour] = this.stamp;
      this.toByte[colour] = value;
      this.size++;
    }
    this.colourStamp[value] = this.stamp;
    this.toColour[value] = colour;
    return true;
  }

  mapping(): Record<string, number> {
    const out: Record<string, number> = {};
    for (let c = 0; c < COLOURS.length; c++) {
      if (this.byteStamp[c] === this.stamp) out[COLOURS[c]!] = this.toByte[c]!;
    }
    return out;
  }
}

interface PreparedSet {
  /** Entry index relative to the smallest `NoteGLType`. */
  rel: number;
  colours: [number, number, number];
}

function prepare(sets: { noteType: number; notes: string[] }[], minType: number): PreparedSet[] {
  return sets.map((s) => {
    const colours = s.notes.map((n) => COLOURS.indexOf(n));
    if (colours.some((c) => c < 0)) throw new Error(`Unknown note colour in ${s.notes.join("")}`);
    return { rel: s.noteType - minType, colours: colours as [number, number, number] };
  });
}

function consistentSlot(
  buf: Buffer,
  start: number,
  stride: number,
  j: number,
  k: number,
  sets: PreparedSet[],
  bij: Bijection,
): boolean {
  bij.reset();
  for (const s of sets) {
    if (!bij.add(s.colours[k]!, buf[start + s.rel * stride + j]!)) return false;
  }
  // A slot that's one colour everywhere (all-zero padding) proves nothing.
  return bij.size > 1;
}

function sharedMapping(
  buf: Buffer,
  start: number,
  stride: number,
  positions: number[],
  sets: PreparedSet[],
  bij: Bijection,
): Record<string, number> | null {
  bij.reset();
  for (const s of sets) {
    for (let k = 0; k < 3; k++) {
      if (!bij.add(s.colours[k]!, buf[start + s.rel * stride + positions[k]!]!)) return null;
    }
  }
  return bij.mapping();
}

function windowAround(file: string, buf: Buffer, offset: number): ByteWindow {
  const from = Math.max(0, offset - WINDOW_BEFORE);
  const to = Math.min(buf.length, offset + WINDOW_AFTER);
  return { file, offset: from, bytes: [...buf.subarray(from, to)] };
}

/** Runs the search over each named file and collects the windows around the hits. */
export function dumpMelodyRaw(
  files: { name: string; reader: BinaryReader }[],
  horns: HornNotes[],
  melodyCombos: string[][] = [],
): MelodyRawDump {
  const noteSets = noteSetsByType(horns);
  const hits: NoteSetTableHit[] = [];
  for (const { name, reader } of files) {
    hits.push(...findNoteSetTables(name, reader.buf, noteSets));
  }
  // One window per distinct table location (strides of one table overlap).
  const windows: ByteWindow[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const at = hit.base + Math.min(...noteSets.map((s) => s.noteType)) * hit.stride;
    const key = `${hit.file}:${Math.floor(at / 0x400)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const file = files.find((f) => f.name === hit.file)!;
    windows.push(windowAround(hit.file, file.reader.buf, at));
  }
  const comboBlocks: ComboBlock[] = [];
  const mappings = new Set<string>();
  for (const hit of hits) {
    const key = JSON.stringify(hit.mapping);
    if (mappings.has(key)) continue;
    mappings.add(key);
    for (const { name, reader } of files) {
      comboBlocks.push(...findComboBlocks(name, reader.buf, hit.mapping, melodyCombos));
    }
  }
  for (const block of comboBlocks) {
    const key = `${block.file}:${Math.floor(block.offset / 0x400)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const file = files.find((f) => f.name === block.file)!;
    windows.push(windowAround(block.file, file.reader.buf, block.offset));
  }
  return { noteSets, hits, comboBlocks, windows };
}

/** The repo's own `data/` (this file is `tools/mhfu-extract/src/emit/`). */
const REPO_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "data",
);

/**
 * Each disc horn's `NoteGLType` paired with its committed notes, joined by
 * game ID through `data/equipment-ids.json` (the same identity `compare`
 * uses). Horns without committed notes are skipped.
 */
export function hornNotesFromCommitted(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
  dataDir = REPO_DATA_DIR,
): HornNotes[] {
  const ids = JSON.parse(readFileSync(path.join(dataDir, "equipment-ids.json"), "utf-8")) as {
    melee: ({ name: string; type?: string } | null)[];
  };
  const committed = JSON.parse(
    readFileSync(path.join(dataDir, "weapons", "hunting-horn.json"), "utf-8"),
  ) as { weapons: { name: string; notes?: string[] | null }[] };
  const notesByName = new Map(committed.weapons.map((w) => [w.name, w.notes ?? null]));
  const modelToType = readModelToWeaponType(reader, resolver);

  const out: HornNotes[] = [];
  for (const w of readBlademasterWeapons(reader, resolver)) {
    if (modelToType[w.modelId] !== "hunting-horn") continue;
    const entry = ids.melee[w.index];
    const notes = entry ? notesByName.get(entry.name) : null;
    if (notes) out.push({ noteType: w.noteGlType, notes });
  }
  return out;
}

/** Every committed horn melody's note sequence, for `findComboBlocks`. */
export function committedMelodyCombos(dataDir = REPO_DATA_DIR): string[][] {
  const committed = JSON.parse(
    readFileSync(path.join(dataDir, "weapons", "hunting-horn.json"), "utf-8"),
  ) as { weapons: { melodies?: { combo: string[] }[] }[] };
  const seen = new Map<string, string[]>();
  for (const horn of committed.weapons) {
    for (const m of horn.melodies ?? []) seen.set(m.combo.join(""), m.combo);
  }
  return [...seen.values()];
}
