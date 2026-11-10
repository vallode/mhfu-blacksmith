/**
 * Where else a quest's text lives. On the EU disc, rewriting a quest's own
 * strings (`StringPTRs`) doesn't change its "Quest Details" screen, so the
 * game reads that text from another file: probably the per-language
 * `quest_str.pac` files (JP file 4756, `message_jpn/quest_str.pac`; the EU
 * disc has 15 unnamed files at 4776-4790, which fits quest, lobby and arcade
 * strings for five languages).
 *
 * `scanQuestText` searches files for a quest's own strings (UTF-8, as the
 * quest has them) and, for each hit, reports the file, the offset, the
 * `.pac` entry it falls in, and every u32 in the file equal to the string's
 * offset (from the file start or from the entry start): the pointer table
 * that points at it.
 */
import { BinaryReader } from "../binary/reader.js";
import { isPac } from "../models/pac.js";

export interface TextScanFile {
  name: string;
  buf: Buffer;
}

export interface TextNeedle {
  /** e.g. "English goal". */
  label: string;
  text: string;
}

export interface TextPointer {
  /** Offset of the u32 in the file. */
  at: number;
  /** "file" if it holds the file offset, "entry" if the entry-relative one. */
  base: "file" | "entry";
  /** The 8 u32 words from 16 bytes before it, for the table's shape. */
  around: number[];
}

export interface TextHit {
  file: string;
  offset: number;
  /** Whether a NUL follows the string. */
  terminated: boolean;
  /** The `.pac` entry the string falls in, and its offset within that entry. */
  entry: { index: number; start: number; offset: number } | null;
  pointers: TextPointer[];
}

export interface TextScanResult {
  needle: TextNeedle;
  hits: TextHit[];
}

/** Hits past this per needle aren't listed (a short string can be common). */
const MAX_HITS = 20;

function pacEntries(buf: Buffer): { index: number; start: number; end: number }[] {
  if (!isPac(buf)) return [];
  const reader = new BinaryReader(buf);
  const out: { index: number; start: number; end: number }[] = [];
  for (let i = 0; i < reader.u32(0); i++) {
    const start = reader.u32(4 + i * 8);
    const size = reader.u32(8 + i * 8);
    if (size > 0) out.push({ index: i, start, end: start + size });
  }
  return out;
}

/** Every 4-byte-aligned u32 equal to `value`. */
function u32Refs(buf: Buffer, value: number): number[] {
  const out: number[] = [];
  for (let at = 0; at + 4 <= buf.length; at += 4) if (buf.readUInt32LE(at) === value) out.push(at);
  return out;
}

function around(buf: Buffer, at: number): number[] {
  const words: number[] = [];
  for (let o = at - 16; o < at + 16; o += 4) {
    words.push(o >= 0 && o + 4 <= buf.length ? buf.readUInt32LE(o) : -1);
  }
  return words;
}

export function scanQuestText(
  files: readonly TextScanFile[],
  needles: readonly TextNeedle[],
): TextScanResult[] {
  return needles.map((needle) => {
    const bytes = Buffer.from(needle.text, "utf8");
    const hits: TextHit[] = [];
    for (const file of files) {
      if (bytes.length === 0) break;
      const entries = pacEntries(file.buf);
      for (
        let at = file.buf.indexOf(bytes);
        at !== -1 && hits.length < MAX_HITS;
        at = file.buf.indexOf(bytes, at + 1)
      ) {
        const e = entries.find((x) => x.start <= at && at < x.end);
        const entry = e ? { index: e.index, start: e.start, offset: at - e.start } : null;
        const pointers: TextPointer[] = [
          ...u32Refs(file.buf, at).map((p) => ({ at: p, base: "file" as const })),
          ...(entry && entry.offset !== at
            ? u32Refs(file.buf, entry.offset).map((p) => ({ at: p, base: "entry" as const }))
            : []),
        ].map((p) => ({ ...p, around: around(file.buf, p.at) }));
        hits.push({
          file: file.name,
          offset: at,
          terminated: file.buf[at + bytes.length] === 0,
          entry,
          pointers: pointers.slice(0, 8),
        });
      }
    }
    return { needle, hits };
  });
}

const hex = (n: number) => (n < 0 ? "--------" : n.toString(16).padStart(8, "0"));

export function formatTextScan(results: readonly TextScanResult[]): string {
  const out: string[] = [];
  for (const { needle, hits } of results) {
    out.push(`${needle.label} (${Buffer.byteLength(needle.text)} bytes): ${hits.length} hits`);
    for (const h of hits) {
      const entry = h.entry ? `, pac entry ${h.entry.index} +0x${h.entry.offset.toString(16)}` : "";
      out.push(
        `  ${h.file} @0x${h.offset.toString(16)}${entry}${h.terminated ? "" : " (no NUL after)"}`,
      );
      for (const p of h.pointers) {
        out.push(`    pointer (${p.base}) @0x${p.at.toString(16)}: ${p.around.map(hex).join(" ")}`);
      }
    }
  }
  return out.join("\n") + "\n";
}

/** The first 16 u32 words and `.pac` shape of each file, for files no string was found in. */
/** 64 bytes as hex, then as text (printable ASCII, "." otherwise). */
function peek(buf: Buffer, at: number): string {
  const bytes = buf.subarray(at, at + 64);
  const hexes = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const text = [...bytes]
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
    .join("");
  return `@0x${at.toString(16)}: ${hexes}\n    ${text}`;
}

/**
 * Each file's first 16 u32 words, its `.pac` shape, and 64 bytes at the
 * first header word that could be an offset into it (where its strings
 * likely start), to show how text is stored.
 */
export function describeFiles(files: readonly TextScanFile[]): string {
  return (
    files
      .map((f) => {
        const words: number[] = [];
        for (let o = 0; o + 4 <= Math.min(64, f.buf.length); o += 4)
          words.push(f.buf.readUInt32LE(o));
        const pac = pacEntries(f.buf);
        const shape = pac.length > 0 ? `pac, ${pac.length} entries` : "not a pac";
        const first = words.find((w) => w >= 64 && w < f.buf.length);
        const data = first === undefined ? "" : `\n  ${peek(f.buf, first)}`;
        return `${f.name}: ${f.buf.length} bytes, ${shape}\n  ${words.map(hex).join(" ")}${data}`;
      })
      .join("\n") + "\n"
  );
}

/**
 * Single words of the quest's text (6 letters or more: monster names and
 * the like) counted in each file as UTF-8 and as UTF-16LE. If whole strings
 * aren't found but words are, the text is stored differently (wrapped,
 * split up or built from parts); if words aren't found either, it's in
 * another encoding or compressed.
 */
export function scanWords(files: readonly TextScanFile[], needles: readonly TextNeedle[]): string {
  const words = [
    ...new Set(
      needles.flatMap((n) => n.text.split(/[^\p{L}\p{N}'-]+/u).filter((w) => [...w].length >= 6)),
    ),
  ].slice(0, 40);
  const out: string[] = [];
  for (const word of words) {
    for (const encoding of ["utf8", "utf16le"] as const) {
      const bytes = Buffer.from(word, encoding);
      const counts: [string, number][] = [];
      for (const f of files) {
        let n = 0;
        for (let at = f.buf.indexOf(bytes); at !== -1; at = f.buf.indexOf(bytes, at + 1)) n++;
        if (n > 0) counts.push([f.name, n]);
      }
      if (counts.length === 0) continue;
      counts.sort((a, b) => b[1] - a[1]);
      const shown = counts.slice(0, 6).map(([name, n]) => `${name} ×${n}`);
      if (counts.length > 6) shown.push(`… (${counts.length} files)`);
      out.push(`${word} (${encoding}): ${shown.join(", ")}`);
    }
  }
  const missing = words.filter((w) => !out.some((line) => line.startsWith(`${w} (`)));
  if (missing.length > 0) out.push(`Not found in either encoding: ${missing.join(", ")}`);
  return out.join("\n") + "\n";
}
