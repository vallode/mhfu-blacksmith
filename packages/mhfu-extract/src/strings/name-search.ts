/**
 * Searches unpacked game files for the name string tables: the English one
 * for each `NameTable` (strings/names.ts), and the other languages' tables
 * beside it. **Written without a disc** (see README, "Localized text"):
 * the layouts it looks for are the common ones, and it reports every
 * candidate with samples so a real run can pin the right one.
 *
 * Why it's needed: the equipment structs carry no name pointer, and the
 * name tables' addresses aren't documented anywhere vendored, so English
 * names come from the mhp2g-patterns enums. MH-Pointers-Tool (which edits
 * these games' text) describes MH string tables as NUL-separated strings
 * plus 4-byte little-endian pointers, either RAM addresses or file offsets,
 * sometimes reached through a main table of per-table pointers. The EU
 * EBOOT has localized text the JP one doesn't (README, "Region support"),
 * and the EU disc has 57 DATA.BIN entries the JP one lacks, mostly
 * localized text and UI; the JP disc's `message_jpn/str_tbl.pac` is a
 * likely home too.
 *
 * **English table.** For one file and one enum:
 *  1. Find each enum name as a NUL-terminated ASCII string (`FileIndex.ascii`).
 *  2. Vote on the pointer base: for a few distinctive names (unique in the
 *     enum and the file), every u32 word `w` gives a base `w - offset`; the
 *     base under which most of those names are pointed to wins. This works
 *     for RAM addresses (base = the vaddr of file offset 0), plain file
 *     offsets (base 0) and offsets relative to a block (a negative base)
 *     alike, without knowing the load address.
 *  3. Under that base, every word pointing at a found name votes for a
 *     table start `position - index * stride` (strides 4-64: a plain
 *     pointer array, or a name pointer inside a struct).
 *  4. Score the best starts: entry `i` should point at a string equal to
 *     `enum[i]`, or close to it (the enums are hand-transcribed and the
 *     disc spells some names differently).
 *
 * **Other languages.** Same-length arrays whose strings line up with the
 * English ones, looked for where the common layouts put them:
 *  - back to back with the English array (`[table][lang]` arrays);
 *  - pointed to from next to a pointer at the English array (a per-language
 *    or per-table list of table pointers: `[lang][table]` or `[table][lang]`);
 *  - at the same offset in sibling files or `.pac` entries (one file or
 *    package entry per language);
 *  - any run of string pointers in the same file, cut into table-length windows.
 * A window "lines up" when its string lengths correlate with the English
 * ones and trailing markers (`+`, ` G`, ` S`, roman numerals) agree.
 * Each is classified with strings/language.ts and strings/encoding.ts.
 */
import { isPac } from "../models/pac.js";
import {
  decodeText,
  detectEncoding,
  isDecodable,
  type EncodingReport,
  type TextEncoding,
} from "./encoding.js";
import { isPlaceholderName, loadEnums } from "./enums.js";
import { detectLanguage, type Language, type LanguageGuess } from "./language.js";
import type { NameTable } from "./names.js";
import { parseStringPack, placeInPack, type StringPack } from "./string-pack.js";

/** The name tables searched, in report order. */
export const SEARCHED_TABLES: readonly NameTable[] = [
  "ItemID",
  "WepBMID",
  "WepGunID",
  "HeadArmorID",
  "ChestArmorID",
  "ArmArmorID",
  "WaistArmorID",
  "LegArmorID",
  "SkillID",
  "emID",
];

export interface ScanFile {
  /** Path for reports, e.g. `eboot.bin`, `data-bin/_unindexed/45.bin`. */
  name: string;
  buf: Buffer;
  /** Known vaddrs of file offset 0 (ELF segments, an MWo3 `loadBase`), tried besides the voted ones. */
  bases?: number[];
}

const MAX_STRING = 512;

/**
 * The NUL-terminated string at `offset`, without its NUL, or null if
 * there's none: out of range, a control byte before the NUL, or no NUL
 * within 512 bytes. Empty strings are returned (as an empty buffer).
 */
export function stringAt(buf: Buffer, offset: number): Buffer | null {
  if (!Number.isInteger(offset) || offset < 0 || offset >= buf.length) return null;
  const end = Math.min(buf.length, offset + MAX_STRING);
  for (let i = offset; i < end; i++) {
    const b = buf[i]!;
    if (b === 0) return buf.subarray(offset, i);
    if ((b < 0x20 && b !== 0x0a) || b === 0x7f) return null;
  }
  return null;
}

export interface Segment {
  start: number;
  end: number;
  /** "file" or "pac entry N". */
  label: string;
}

/** Lazily built lookups over one file. */
export class FileIndex {
  private wordsCache?: Uint32Array;
  private asciiCache?: Map<string, number[]>;
  private startsCache?: Set<number>;
  private valuesCache?: Set<number>;
  private segmentsCache?: Segment[];
  private packCache?: StringPack | null;

  constructor(readonly file: ScanFile) {}

  get name(): string {
    return this.file.name;
  }

  get buf(): Buffer {
    return this.file.buf;
  }

  /** Every 4-aligned u32, little-endian. */
  get words(): Uint32Array {
    if (!this.wordsCache) {
      const n = Math.floor(this.buf.length / 4);
      const words = new Uint32Array(n);
      for (let j = 0; j < n; j++) words[j] = this.buf.readUInt32LE(j * 4);
      this.wordsCache = words;
    }
    return this.wordsCache;
  }

  u32(offset: number): number {
    return offset % 4 === 0 ? this.words[offset / 4]! : this.buf.readUInt32LE(offset);
  }

  /** The set of every word value. */
  get values(): Set<number> {
    this.valuesCache ??= new Set(this.words);
    return this.valuesCache;
  }

  /** Printable-ASCII strings of 2-128 bytes that start after a NUL (or at 0) and end at one, by text. */
  get ascii(): Map<string, number[]> {
    if (!this.asciiCache) {
      const out = new Map<string, number[]>();
      const buf = this.buf;
      let i = 0;
      while (i < buf.length) {
        if (buf[i] === 0) {
          i++;
          continue;
        }
        const start = i;
        let printable = true;
        while (i < buf.length && buf[i] !== 0) {
          const b = buf[i]!;
          if (b < 0x20 || b > 0x7e) printable = false;
          i++;
        }
        const len = i - start;
        if (printable && i < buf.length && len >= 2 && len <= 128) {
          const text = buf.toString("latin1", start, i);
          const list = out.get(text);
          if (list) list.push(start);
          else out.set(text, [start]);
        }
      }
      this.asciiCache = out;
    }
    return this.asciiCache;
  }

  /** Offsets of every non-empty string (as `stringAt` reads them) that starts after a NUL. */
  get starts(): Set<number> {
    if (!this.startsCache) {
      const out = new Set<number>();
      const buf = this.buf;
      for (let p = 0; p < buf.length; p++) {
        if (buf[p] === 0 || (p > 0 && buf[p - 1] !== 0)) continue;
        const s = stringAt(buf, p);
        if (s && s.length > 0) out.add(p);
      }
      this.startsCache = out;
    }
    return this.startsCache;
  }

  /** The file's message-file table of contents (strings/string-pack.ts), or null. */
  get pack(): StringPack | null {
    if (this.packCache === undefined) this.packCache = parseStringPack(this.buf);
    return this.packCache;
  }

  /** The file, plus each entry if it is a `.pac` package. */
  get segments(): Segment[] {
    if (this.segmentsCache) return this.segmentsCache;
    const out: Segment[] = [{ start: 0, end: this.buf.length, label: "file" }];
    this.segmentsCache = out;
    if (isPac(this.buf)) {
      const count = this.buf.readUInt32LE(0);
      for (let i = 0; i < count; i++) {
        const offset = this.buf.readUInt32LE(4 + i * 8);
        const size = this.buf.readUInt32LE(8 + i * 8);
        if (size > 0) out.push({ start: offset, end: offset + size, label: `pac entry ${i}` });
      }
    }
    return out;
  }
}

/** One enum's English names by index, null for placeholder entries. */
export function enumNames(table: NameTable): (string | null)[] {
  const entries = loadEnums().get(table);
  if (!entries) throw new Error(`name-search: unknown enum table "${table}"`);
  return entries.map((n) => (isPlaceholderName(n) ? null : n.trim() || null));
}

/** Case-, space- and punctuation-insensitive form; keeps "+". */
const loose = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+]/g, "");

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** True if a disc string is the enum's name, allowing for spelling: same letters, or 1-2 edits on longer names. */
export function namesMatch(disc: string, enumName: string): "exact" | "close" | false {
  if (disc === enumName) return "exact";
  const a = loose(disc);
  const b = loose(enumName);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return "close";
  const allowed = b.length >= 10 ? 2 : b.length >= 6 ? 1 : 0;
  return allowed > 0 && editDistance(a, b, allowed) <= allowed ? "close" : false;
}

const STRIDES = Array.from({ length: 16 }, (_, i) => (i + 1) * 4);

export interface TableWindow {
  file: string;
  /** File offset of entry 0's pointer. */
  offset: number;
  /** Bytes between entries' pointers. */
  stride: number;
  /** Pointer value minus file offset (the vaddr of file offset 0 for RAM pointers, 0 for file offsets). */
  base: number;
  count: number;
}

export interface EnglishTable extends TableWindow {
  /** (exact + close) / enum entries with a name. */
  matchRatio: number;
  exact: number;
  close: number;
  considered: number;
  /** The first few entries that don't match, for the report. */
  mismatches: { index: number; expected: string; found: string | null }[];
  /** Each entry's string as read (latin1), null where the pointer leads nowhere. */
  texts: (string | null)[];
  /** Where it sits in a message file (strings/string-pack.ts), when found through one. */
  pack?: { block: number; entry: number };
}

export interface NameCluster {
  file: string;
  /** Distinct enum names found as strings in the file. */
  names: number;
  /** The densest 64 KiB of them: first and last offset, and how many. */
  densest: { from: number; to: number; names: number };
  /** Share of consecutive found entries (by enum index) whose strings are in increasing file order. */
  inEnumOrder: number;
}

function readWindow(idx: FileIndex, w: TableWindow): (Buffer | null)[] {
  const out: (Buffer | null)[] = [];
  for (let i = 0; i < w.count; i++) {
    const at = w.offset + i * w.stride;
    if (at < 0 || at + 4 > idx.buf.length) {
      out.push(null);
      continue;
    }
    out.push(stringAt(idx.buf, idx.u32(at) - w.base));
  }
  return out;
}

export function scoreEnglish(
  idx: FileIndex,
  window: TableWindow,
  names: (string | null)[],
): EnglishTable {
  const raw = readWindow(idx, window);
  const texts = raw.map((b) => (b ? b.toString("latin1") : null));
  let exact = 0;
  let close = 0;
  let considered = 0;
  const mismatches: EnglishTable["mismatches"] = [];
  names.forEach((name, i) => {
    if (name === null) return;
    considered++;
    const found = texts[i] ?? null;
    const m = found === null ? false : namesMatch(found.trim(), name);
    if (m === "exact") exact++;
    else if (m === "close") close++;
    else if (mismatches.length < 8) mismatches.push({ index: i, expected: name, found });
  });
  return {
    ...window,
    matchRatio: considered ? Math.round(((exact + close) / considered) * 1000) / 1000 : 0,
    exact,
    close,
    considered,
    mismatches,
    texts,
  };
}

function cluster(idx: FileIndex, firstOffsets: Map<number, number>): NameCluster {
  const byIndex = [...firstOffsets.entries()].sort((a, b) => a[0] - b[0]);
  const offsets = byIndex.map(([, o]) => o).sort((a, b) => a - b);
  let best = { from: 0, to: 0, names: 0 };
  let lo = 0;
  for (let hi = 0; hi < offsets.length; hi++) {
    while (offsets[hi]! - offsets[lo]! > 0x10000) lo++;
    if (hi - lo + 1 > best.names)
      best = { from: offsets[lo]!, to: offsets[hi]!, names: hi - lo + 1 };
  }
  let increasing = 0;
  for (let k = 1; k < byIndex.length; k++) if (byIndex[k]![1] > byIndex[k - 1]![1]) increasing++;
  return {
    file: idx.name,
    names: byIndex.length,
    densest: best,
    inEnumOrder:
      byIndex.length > 1 ? Math.round((increasing / (byIndex.length - 1)) * 100) / 100 : 0,
  };
}

/** Bases under which the most of `samples` (string offsets) are pointed to, best first. */
export function voteBases(
  idx: FileIndex,
  samples: number[],
  extra: number[] = [],
): { base: number; hits: number }[] {
  const values = idx.values;
  const hitsFor = (base: number) => samples.filter((s) => values.has(s + base)).length;
  const found = new Map<number, number>();
  for (const b of extra) found.set(b, hitsFor(b));
  const anchors = [0, 1, 2, 3]
    .map((k) => samples[Math.floor((k * samples.length) / 4)])
    .filter((s): s is number => s !== undefined);
  for (const anchor of new Set(anchors)) {
    // Every word is a pointer at the anchor under some base; keep the bases
    // under which one of a few other samples is pointed to as well.
    const others = samples.filter((s) => s !== anchor).slice(0, 6);
    const words = idx.words;
    for (let j = 0; j < words.length; j++) {
      const w = words[j]!;
      if (w === 0) continue;
      const base = w - anchor;
      let hit = false;
      for (let k = 0; k < others.length && !hit; k++) hit = values.has(others[k]! + base);
      if (hit && !found.has(base)) found.set(base, hitsFor(base));
    }
  }
  const min = Math.max(3, Math.ceil(samples.length * 0.25));
  return [...found.entries()]
    .filter(([, hits]) => hits >= min)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([base, hits]) => ({ base, hits }));
}

export interface EnglishSearch {
  cluster: NameCluster | null;
  bases: { base: number; hits: number; samples: number }[];
  tables: EnglishTable[];
}

/** Searches one file for `names`' English pointer table. */
export function findEnglishTables(idx: FileIndex, names: (string | null)[]): EnglishSearch {
  const indicesByName = new Map<string, number[]>();
  names.forEach((n, i) => {
    if (n !== null) indicesByName.set(n, [...(indicesByName.get(n) ?? []), i]);
  });
  const occurrences = new Map<string, number[]>();
  const firstOffsets = new Map<number, number>();
  for (const [name, indices] of indicesByName) {
    const offs = idx.ascii.get(name);
    if (!offs) continue;
    occurrences.set(name, offs);
    for (const i of indices) firstOffsets.set(i, offs[0]!);
  }
  if (occurrences.size < 5) {
    return {
      cluster: occurrences.size ? cluster(idx, firstOffsets) : null,
      bases: [],
      tables: [],
    };
  }

  // Distinctive names: one enum entry, one string in the file.
  let distinct = [...occurrences.entries()]
    .filter(([n, offs]) => offs.length === 1 && indicesByName.get(n)!.length === 1 && n.length >= 6)
    .map(([n, offs]) => ({ index: indicesByName.get(n)![0]!, offset: offs[0]! }))
    .sort((a, b) => a.index - b.index);
  if (distinct.length < 3) {
    distinct = [...occurrences.entries()]
      .filter(([n, offs]) => offs.length <= 2 && indicesByName.get(n)!.length === 1)
      .map(([n, offs]) => ({ index: indicesByName.get(n)![0]!, offset: offs[0]! }))
      .sort((a, b) => a.index - b.index);
  }
  const step = Math.max(1, Math.floor(distinct.length / 24));
  const samples = distinct
    .filter((_, k) => k % step === 0)
    .slice(0, 24)
    .map((d) => d.offset);
  const bases = samples.length >= 3 ? voteBases(idx, samples, [0, ...(idx.file.bases ?? [])]) : [];

  const tables: EnglishTable[] = [];
  for (const { base } of bases.slice(0, 3)) {
    const targets = new Map<number, string>();
    for (const [name, offs] of occurrences) for (const o of offs) targets.set(o + base, name);
    const votes = new Map<number, number>();
    const words = idx.words;
    for (let j = 0; j < words.length; j++) {
      const name = targets.get(words[j]!);
      if (name === undefined) continue;
      for (const i of indicesByName.get(name)!) {
        for (const stride of STRIDES) {
          const start = j * 4 - i * stride;
          if (start < 0) continue;
          const key = stride * 2 ** 32 + start;
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
      }
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    for (const [key] of best) {
      const stride = Math.floor(key / 2 ** 32);
      const offset = key - stride * 2 ** 32;
      // A table near the end of a file may be shorter than the enum: keep the
      // entries that fit (the result's `enumCount` still shows the full length).
      const count = Math.min(names.length, Math.floor((idx.buf.length - 4 - offset) / stride) + 1);
      if (count < 1) continue;
      tables.push(scoreEnglish(idx, { file: idx.name, offset, stride, base, count }, names));
    }
  }
  tables.sort((a, b) => b.matchRatio - a.matchRatio || b.exact - a.exact || a.stride - b.stride);
  return {
    cluster: cluster(idx, firstOffsets),
    bases: bases.slice(0, 5).map((b) => ({ ...b, samples: samples.length })),
    tables: tables.filter((t, k) => tables.findIndex((u) => sameWindow(t, u)) === k).slice(0, 3),
  };
}

const sameWindow = (a: TableWindow, b: TableWindow): boolean =>
  a.file === b.file && a.offset === b.offset && a.stride === b.stride && a.base === b.base;

export interface LanguageTable extends TableWindow {
  /** How this window was found. */
  via: string;
  /** Share of entries pointing at a non-empty string. */
  valid: number;
  /** Share of entries (both sides non-empty) equal to the English string. */
  identical: number;
  /** Pearson correlation of string lengths with the English entries. */
  lengthCorrelation: number;
  /** Share of English entries ending in a marker (`+`, ` G`, ` II`, ...) whose entry ends the same, or null with too few markers. */
  markerAgreement: number | null;
  /** 0-1: how well the window lines up with the English table. */
  alignment: number;
  encoding: EncodingReport;
  guess: LanguageGuess;
  /** Each entry decoded in `encoding.encoding`, null where the pointer leads nowhere. */
  texts: (string | null)[];
}

const MARKER = /(\+{1,2}|\s(?:[IVX]{1,4}|[A-Z]|\d{1,2}))$/;

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

/** Reads and classifies a candidate window against the English table's strings. */
export function evaluateLanguageWindow(
  idx: FileIndex,
  window: TableWindow,
  english: (string | null)[],
  via: string,
): LanguageTable {
  const raw = readWindow(idx, window);
  const nonEmpty = raw.filter((b): b is Buffer => b !== null && b.length > 0);
  const encoding = detectEncoding(nonEmpty);
  const texts = raw.map((b) => (b === null ? null : decodeText(b, encoding.encoding)));
  const xs: number[] = [];
  const ys: number[] = [];
  let both = 0;
  let identical = 0;
  let markers = 0;
  let markersAgree = 0;
  english.forEach((en, i) => {
    const t = texts[i];
    if (!en || !t) return;
    both++;
    if (t === en) identical++;
    xs.push([...en].length);
    ys.push([...t].length);
    const m = MARKER.exec(en.trim());
    if (m) {
      markers++;
      if (t.trim().endsWith(m[1]!.trim())) markersAgree++;
    }
  });
  const lengthCorrelation = round(pearson(xs, ys));
  const markerAgreement = markers >= 10 ? round(markersAgree / markers) : null;
  const alignment = round(
    0.6 * Math.max(0, lengthCorrelation) +
      0.4 * (markerAgreement ?? Math.max(0, lengthCorrelation)),
  );
  return {
    ...window,
    via,
    valid: round(nonEmpty.length / window.count),
    identical: both ? round(identical / both) : 0,
    lengthCorrelation,
    markerAgreement,
    alignment,
    encoding,
    guess: detectLanguage(texts.filter((t): t is string => !!t)),
    texts,
  };
}

/** Share of a window's entries pointing at a non-empty string under `base` (quick: no decoding). */
function validShare(
  idx: FileIndex,
  offset: number,
  stride: number,
  count: number,
  base: number,
): number {
  let ok = 0;
  for (let i = 0; i < count; i++) {
    const at = offset + i * stride;
    if (at < 0 || at + 4 > idx.buf.length) return 0;
    const s = stringAt(idx.buf, idx.u32(at) - base);
    if (s && s.length > 0) ok++;
  }
  return ok / count;
}

/**
 * The base under which a window's pointers lead to strings, for a window
 * whose pointers may use another base than the English table's (offsets
 * relative to another file or package entry). Candidates come from the
 * first non-zero pointer against every string start in the file.
 */
export function inferBase(
  idx: FileIndex,
  offset: number,
  stride: number,
  count: number,
): number | null {
  const firstWords: number[] = [];
  for (let i = 0; i < count && firstWords.length < 6; i++) {
    const at = offset + i * stride;
    if (at + 4 > idx.buf.length) return null;
    const w = idx.u32(at);
    if (w !== 0) firstWords.push(w);
  }
  if (firstWords.length < 4) return null;
  // Pointers into one table's strings stay within a file's length of each other.
  const lo = Math.min(...firstWords);
  const hi = Math.max(...firstWords);
  if (hi - lo > idx.buf.length) return null;
  const starts = idx.starts;
  const w0 = firstWords[0]!;
  const candidates: number[] = [];
  for (const x of starts) {
    const base = w0 - x;
    let ok = 0;
    for (let k = 1; k < firstWords.length; k++) if (starts.has(firstWords[k]! - base)) ok++;
    if (ok >= firstWords.length - 2) candidates.push(base);
  }
  let best: number | null = null;
  let bestShare = 0;
  for (const base of candidates.slice(0, 16)) {
    const share = validShare(idx, offset, stride, Math.min(count, 64), base);
    if (share > bestShare) {
      best = base;
      bestShare = share;
    }
  }
  return bestShare >= 0.9 ? best : null;
}

/** Minimum share of an other-language window's entries that must lead to a string. */
const MIN_VALID = 0.9;

/**
 * Candidate other-language tables for `english` (found in `files`), best
 * aligned first. English copies (identical strings) are kept, flagged by
 * `identical`, since they show the layout too.
 */
export function findLanguageTables(
  english: EnglishTable,
  indexes: FileIndex[],
  limit = 8,
): LanguageTable[] {
  const home = indexes.find((i) => i.name === english.file)!;
  const { offset, stride, base, count } = english;
  const span = (count - 1) * stride + 4;
  const seen = new Set<string>([`${home.name}:${offset}:${stride}:${base}`]);
  const windows: { idx: FileIndex; window: TableWindow; via: string }[] = [];
  const consider = (idx: FileIndex, at: number, b: number | null, via: string) => {
    if (b === null || at < 0 || at + span > idx.buf.length) return;
    const key = `${idx.name}:${at}:${stride}:${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (validShare(idx, at, stride, Math.min(count, 64), b) < MIN_VALID) return;
    if (validShare(idx, at, stride, count, b) < MIN_VALID) return;
    windows.push({ idx, window: { file: idx.name, offset: at, stride, base: b, count }, via });
  };

  // Message files: the same block and entry in each language's file.
  if (english.pack && home.pack) {
    const { block, entry } = english.pack;
    for (const idx of indexes) {
      const pack = idx.pack;
      if (idx === home || !pack || pack.blocks.length !== home.pack.blocks.length) continue;
      const b = pack.blocks[block]!;
      const note = b.count === home.pack.blocks[block]!.count ? "" : ", entry count differs";
      consider(
        idx,
        b.offset + entry * 4,
        -b.offset,
        `message file block ${block}, entry ${entry}, in ${idx.name}${note}`,
      );
    }
  }

  // [table][lang]: arrays back to back, maybe with a count or terminator between.
  for (let k = -8; k <= 8; k++) {
    if (k === 0) continue;
    for (const slack of [0, 4, -4, 8, -8, 16, -16]) {
      consider(
        home,
        offset + k * count * stride + slack,
        base,
        `back to back (${k > 0 ? "+" : ""}${k} tables${slack ? `, ${slack > 0 ? "+" : ""}${slack} bytes` : ""})`,
      );
    }
  }

  // [lang][table] or [table][lang] lists of table pointers next to one at the
  // English array. The list may hold the array's address (under the English
  // base) or its file offset, as MH2-style main tables do; there each table's
  // strings are relative to the table itself (base = -offset), so a
  // neighbour is tried under the English base, relative to itself, and with
  // an inferred base.
  const words = home.words;
  const listTargets = new Set([offset + base, offset].filter((v) => v > 0));
  const hits: number[] = [];
  for (let q = 0; q < words.length && hits.length <= 64; q++) {
    if (listTargets.has(words[q]!)) hits.push(q);
  }
  // A value that common is data, not a pointer to this table.
  let inferred = 0;
  if (hits.length <= 64) {
    for (const q of hits) {
      for (let j = -32; j <= 32; j++) {
        const w = words[q + j];
        if (j === 0 || w === undefined || w === 0) continue;
        const via = `table pointer list at 0x${(q * 4).toString(16)} (${j > 0 ? "+" : ""}${j} words from the English one)`;
        consider(home, w - base, base, via);
        if (base <= 0 && w < home.buf.length) {
          const before = windows.length;
          consider(home, w, base, via);
          consider(home, w, -w, via);
          if (windows.length === before && inferred++ < 32) {
            consider(home, w, inferBase(home, w, stride, count), `${via} (base inferred)`);
          }
        }
      }
    }
  }

  // One file or package entry per language: the same place in a sibling.
  // The smallest segment holding the whole table, else the one it starts in.
  const smallest = (fits: (seg: Segment) => boolean) =>
    home.segments.filter(fits).sort((a, b) => a.end - a.start - (b.end - b.start))[0];
  const homeSegment =
    smallest((seg) => seg.start <= offset && offset + span <= seg.end) ??
    smallest((seg) => seg.start <= offset && offset < seg.end);
  const rel = homeSegment ? offset - homeSegment.start : 0;
  for (const idx of homeSegment ? indexes : []) {
    for (const seg of idx.segments) {
      if (seg.label === "file" && homeSegment!.label !== "file") continue;
      if (seg.label !== "file" && homeSegment!.label === "file") continue;
      const at = seg.start + rel;
      if (at + span > seg.end) continue;
      const where = `same offset as the English table in ${idx.name}${seg.label === "file" ? "" : ` ${seg.label}`}`;
      const bases = [base, ...(idx.file.bases ?? []), 0];
      const before = windows.length;
      for (const b of bases) consider(idx, at, b, where);
      if (windows.length === before)
        consider(idx, at, inferBase(idx, at, stride, count), `${where} (base inferred)`);
    }
  }

  // Runs of string pointers in the English table's file, cut into table-length windows.
  if (stride === 4) {
    let runStart = -1;
    let added = 0;
    for (let j = 0; j <= words.length && added < 64; j++) {
      const s = j < words.length ? stringAt(home.buf, words[j]! - base) : null;
      const ok = s !== null && s.length > 0;
      if (ok && runStart < 0) runStart = j;
      if (!ok && runStart >= 0) {
        const len = j - runStart;
        if (len >= count * MIN_VALID) {
          for (let k = 0; (k + 1) * count <= len + count * (1 - MIN_VALID); k++) {
            consider(home, (runStart + k * count) * 4, base, "run of string pointers");
            added++;
          }
          consider(home, (j - count) * 4, base, "run of string pointers (end)");
        }
        runStart = -1;
      }
    }
  }

  const ranked = windows
    .map(({ idx, window, via }) => evaluateLanguageWindow(idx, window, english.texts, via))
    .sort((a, b) => b.alignment - a.alignment || b.valid - a.valid);
  // A window a few entries off a better one reads the same strings shifted: drop it.
  const kept: LanguageTable[] = [];
  for (const t of ranked) {
    const shifted = kept.some(
      (k) => k.file === t.file && k.base === t.base && Math.abs(k.offset - t.offset) < span / 2,
    );
    if (!shifted) kept.push(t);
  }
  return kept.slice(0, limit);
}

/** Thresholds for writing a language's names without review. */
export const CONFIDENT = {
  englishMatch: 0.95,
  valid: 0.95,
  alignment: 0.5,
  maxIdentical: 0.8,
  languageConfidence: 0.25,
} as const;

/** Why a table isn't confident enough to write, or null if it is. */
export function confidenceProblem(english: EnglishTable, table: LanguageTable): string | null {
  const problem = structuralProblem(english, table);
  if (problem) return problem;
  const { language, confidence } = table.guess;
  if (language === null || language === "en")
    return `doesn't read as a language other than English`;
  if (confidence < CONFIDENT.languageConfidence)
    return `language guess ${language} has confidence ${confidence}, below ${CONFIDENT.languageConfidence}`;
  return null;
}

/** `confidenceProblem` without the language guess: whether the table itself lines up. */
export function structuralProblem(english: EnglishTable, table: LanguageTable): string | null {
  if (english.matchRatio < CONFIDENT.englishMatch)
    return `English table matches the enum on ${english.matchRatio}, below ${CONFIDENT.englishMatch}`;
  if (table.valid < CONFIDENT.valid) return `only ${table.valid} of entries lead to a string`;
  if (table.alignment < CONFIDENT.alignment)
    return `alignment ${table.alignment} is below ${CONFIDENT.alignment}`;
  if (table.identical >= CONFIDENT.maxIdentical)
    return `${table.identical} of entries are the English text`;
  if (!isDecodable(table.encoding.encoding))
    return `encoding ${table.encoding.encoding} can't be decoded`;
  return null;
}

const fromMessageFile = (t: LanguageTable) => t.via.startsWith("message file");

/**
 * Each message file's language, from the guesses for every table found in
 * it: a file is one language throughout, and its whole set of tables reads
 * as that language far more surely than one table of short names does
 * (French waist armor guessed 0.24, Italian leg armor read as German, on
 * the EU disc). A file needs three tables and 60% of the guesses' weight.
 */
export function messageFileLanguages(results: readonly NameTableResult[]): Map<string, Language> {
  const votes = new Map<string, Map<Language, number>>();
  const tables = new Map<string, number>();
  for (const r of results) {
    for (const t of r.languages) {
      const { language, confidence } = t.guess;
      if (!fromMessageFile(t) || language === null) continue;
      const byLang = votes.get(t.file) ?? new Map<Language, number>();
      byLang.set(language, (byLang.get(language) ?? 0) + confidence);
      votes.set(t.file, byLang);
      tables.set(t.file, (tables.get(t.file) ?? 0) + 1);
    }
  }
  const out = new Map<string, Language>();
  for (const [file, byLang] of votes) {
    const total = [...byLang.values()].reduce((a, b) => a + b, 0);
    const [language, weight] = [...byLang.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (language !== "en" && (tables.get(file) ?? 0) >= 3 && total > 0 && weight / total >= 0.6) {
      out.set(file, language);
    }
  }
  return out;
}

/**
 * Settles each result's languages by its message files' language
 * (`messageFileLanguages`): a message-file table that lines up is that
 * file's language whatever its own guess, and a table is never kept under
 * a language its file isn't. Notes each table this changes.
 */
export function settleByFileLanguage(results: NameTableResult[]): void {
  const fileLanguage = messageFileLanguages(results);
  for (const r of results) {
    const best = r.english[0];
    if (!best) continue;
    for (const [language, t] of Object.entries(r.confident) as [Language, LanguageTable][]) {
      const actual = fileLanguage.get(t.file);
      if (actual && actual !== language) delete r.confident[language];
    }
    for (const t of r.languages) {
      const language = fileLanguage.get(t.file);
      if (!language || !fromMessageFile(t) || structuralProblem(best, t)) continue;
      const current = r.confident[language];
      if (current === t || (current && fromMessageFile(current))) continue;
      r.confident[language] = t;
      r.notes = r.notes.filter((n) => !n.startsWith(`Two ${language} candidates`));
      if (t.guess.language !== language || t.guess.confidence < CONFIDENT.languageConfidence) {
        r.notes.push(
          `${language} from ${t.file}, the ${language} message file (its own guess: ${t.guess.language ?? "none"} ${t.guess.confidence}).`,
        );
      }
    }
  }
}

export interface NameTableResult {
  table: NameTable;
  enumCount: number;
  clusters: NameCluster[];
  /** Voted pointer bases, per file where English names were found. */
  bases: { file: string; base: number; hits: number; samples: number }[];
  english: EnglishTable[];
  languages: LanguageTable[];
  /** Languages whose table passed `confidenceProblem`, with that table. */
  confident: Partial<Record<Language, LanguageTable>>;
  notes: string[];
}

/** The result for a table whose search threw: no candidates, and the error as a note. */
export function failedResult(table: NameTable, message: string): NameTableResult {
  return {
    table,
    enumCount: enumNames(table).length,
    clusters: [],
    bases: [],
    english: [],
    languages: [],
    confident: {},
    notes: [`Search failed (please include this in your report): ${message}`],
  };
}

/** English candidates read through a message file's table of contents (any alignment). */
function packTables(idx: FileIndex, names: (string | null)[]): EnglishTable[] {
  const pack = idx.pack;
  if (!pack) return [];
  return placeInPack(idx.buf, pack, names, 2).map(({ block, entry }) => {
    const b = pack.blocks[block]!;
    const count = Math.min(names.length, b.count - entry);
    const window = {
      file: idx.name,
      offset: b.offset + entry * 4,
      stride: 4,
      base: -b.offset,
      count,
    };
    return { ...scoreEnglish(idx, window, names), pack: { block, entry } };
  });
}

/** Runs the whole search for one name table over `indexes`. */
export function searchNameTable(table: NameTable, indexes: FileIndex[]): NameTableResult {
  const names = enumNames(table);
  const clusters: NameCluster[] = [];
  const bases: NameTableResult["bases"] = [];
  const english: EnglishTable[] = [];
  for (const idx of indexes) {
    const found = findEnglishTables(idx, names);
    if (found.cluster) clusters.push(found.cluster);
    for (const b of found.bases) bases.push({ file: idx.name, ...b });
    english.push(...found.tables);
    english.push(...packTables(idx, names));
  }
  clusters.sort((a, b) => b.names - a.names);
  // On a tie, prefer the window read through a message file: it knows where
  // the other languages are. Then drop the same window found both ways.
  english.sort(
    (a, b) =>
      b.matchRatio - a.matchRatio || b.exact - a.exact || Number(!!b.pack) - Number(!!a.pack),
  );
  for (let k = english.length - 1; k > 0; k--) {
    if (english.findIndex((t) => sameWindow(t, english[k]!)) < k) english.splice(k, 1);
  }
  const notes: string[] = [];
  const best = english[0];
  if (!best) {
    notes.push(
      clusters.length
        ? `English names found as strings (best: ${clusters[0]!.names} in ${clusters[0]!.file}), but no pointer table leads to them.`
        : "No English names found as NUL-terminated strings in any scanned file (compressed text, another encoding, or a JP disc).",
    );
    return {
      table,
      enumCount: names.length,
      clusters,
      bases,
      english,
      languages: [],
      confident: {},
      notes,
    };
  }
  if (best.count < names.length) {
    notes.push(
      `The best English table is cut off by the end of ${best.file} after ${best.count} of ${names.length} entries.`,
    );
  }
  const languages = findLanguageTables(best, indexes);
  const confident: NameTableResult["confident"] = {};
  const ambiguous = new Set<Language>();
  // `languages` is sorted best-aligned first, so the first table per language wins.
  for (const lang of languages) {
    if (confidenceProblem(best, lang)) continue;
    const language = lang.guess.language!;
    const other = confident[language];
    if (!other) confident[language] = lang;
    else if (other.alignment - lang.alignment < 0.05 && !ambiguous.has(language)) {
      ambiguous.add(language);
      notes.push(
        `Two ${language} candidates line up about equally (0x${other.offset.toString(16)} in ${other.file}, 0x${lang.offset.toString(16)} in ${lang.file}); not writing ${language} names.`,
      );
    }
  }
  for (const language of ambiguous) delete confident[language];
  return { table, enumCount: names.length, clusters, bases, english, languages, confident, notes };
}

/** The table's names in one confident language, by enum index (null: missing, a placeholder, or the English text). */
export function translatedNames(
  result: NameTableResult,
  language: Language,
): (string | null)[] | null {
  const table = result.confident[language];
  const english = result.english[0];
  if (!table || !english) return null;
  const names = enumNames(result.table);
  return names.map((name, i) => {
    const t = table.texts[i]?.trim();
    if (!name || !t || isPlaceholderName(t) || t === english.texts[i]?.trim()) return null;
    return t;
  });
}

/** Encodings seen across a result's language tables, for the summary line. */
export function encodingsOf(result: NameTableResult): TextEncoding[] {
  return [...new Set(result.languages.map((l) => l.encoding.encoding))];
}
