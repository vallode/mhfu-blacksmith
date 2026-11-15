/**
 * Guesses how a set of raw game strings is encoded, for text whose encoding
 * hasn't been confirmed on a disc (the EU name tables, see
 * strings/name-search.ts).
 *
 * Quest text is UTF-8 on both discs (README, "Quests (.mib)"), and
 * MH-Pointers-Tool, which edits the MH games' string tables, supports only
 * Shift-JIS and UTF-8. Older European releases sometimes used a single-byte
 * code page or a custom font table for accented letters instead, so this
 * reports which one a table looks like rather than assuming:
 *
 * - `ascii`: no byte above 0x7f (English, or a language written without
 *   accents in this table).
 * - `utf-8`: every string with high bytes is valid UTF-8.
 * - `shift-jis`: valid Shift-JIS lead/trail pairs (the JP disc, if its
 *   names aren't UTF-8 like its quest text).
 * - `latin1`: single high bytes in the Latin-1 letter range (0xc0-0xff)
 *   inside words, decoded as windows-1252.
 * - `unknown-8bit`: anything else, e.g. a custom font table. Not decoded;
 *   `highBytes` lists each byte with a sample so the mapping can be worked
 *   out by hand.
 */

import { TextDecoder } from "node:util";

export type TextEncoding = "ascii" | "utf-8" | "shift-jis" | "latin1" | "unknown-8bit";

export interface HighByteSample {
  /** The byte, as two hex digits. */
  byte: string;
  count: number;
  /** One string containing it, with every high byte written `{xx}`. */
  sample: string;
}

export interface EncodingReport {
  encoding: TextEncoding;
  /** Strings with at least one byte above 0x7f. */
  stringsWithHighBytes: number;
  strings: number;
  /** The most common high bytes (lead bytes only for multi-byte encodings), most frequent first. */
  highBytes: HighByteSample[];
}

/** `bytes` with every byte above 0x7f written as `{xx}`, for reports. */
export function escapeHighBytes(bytes: Buffer): string {
  let out = "";
  for (const b of bytes)
    out += b >= 0x80 ? `{${b.toString(16).padStart(2, "0")}}` : String.fromCharCode(b);
  return out;
}

const hasHighByte = (bytes: Buffer): boolean => bytes.some((b) => b >= 0x80);

function isValidUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** True if every high byte starts a valid Shift-JIS pair (or is a half-width katakana). */
function isValidShiftJis(bytes: Buffer): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b < 0x80 || (b >= 0xa1 && b <= 0xdf)) continue;
    const lead = (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc);
    const t = bytes[i + 1];
    if (!lead || t === undefined || t < 0x40 || t === 0x7f || t > 0xfc) return false;
    i++;
  }
  return true;
}

/**
 * Most decoded non-ASCII characters are kana or kanji. Single-byte European
 * text often forms valid Shift-JIS pairs too (a high byte, then a letter),
 * but they decode to full-width symbols and letters, not Japanese.
 */
function mostlyJapanese(strings: Buffer[]): boolean {
  const decoder = new TextDecoder("shift_jis");
  let nonAscii = 0;
  let japanese = 0;
  for (const bytes of strings) {
    for (const ch of decoder.decode(bytes)) {
      if (ch.charCodeAt(0) < 0x80) continue;
      nonAscii++;
      if (/[\u3040-\u30ff\u4e00-\u9fff]/u.test(ch)) japanese++;
    }
  }
  return nonAscii > 0 && japanese / nonAscii >= 0.5;
}

const isAsciiLetter = (b: number | undefined): boolean =>
  b !== undefined && ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a));

/**
 * Latin-1 letters (0xc0-0xff without × and ÷) next to an ASCII letter or
 * another high byte: accented letters inside words. A custom font table puts
 * its letters elsewhere (often 0x80-0xbf), which fails this.
 */
function looksLatin1(strings: Buffer[]): boolean {
  let high = 0;
  let letterLike = 0;
  for (const bytes of strings) {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b < 0x80) continue;
      high++;
      const inRange = b >= 0xc0 && b !== 0xd7 && b !== 0xf7;
      const prev = bytes[i - 1];
      const next = bytes[i + 1];
      const inWord =
        isAsciiLetter(prev) || isAsciiLetter(next) || (prev ?? 0) >= 0x80 || (next ?? 0) >= 0x80;
      if (inRange && inWord) letterLike++;
    }
  }
  return high > 0 && letterLike / high >= 0.9;
}

function highByteHistogram(strings: Buffer[], encoding: TextEncoding): HighByteSample[] {
  const counts = new Map<number, { count: number; sample: Buffer }>();
  for (const bytes of strings) {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b < 0x80) continue;
      const entry = counts.get(b) ?? { count: 0, sample: bytes };
      entry.count++;
      counts.set(b, entry);
      // Skip a multi-byte character's continuation bytes.
      if (encoding === "utf-8") while (((bytes[i + 1] ?? 0) & 0xc0) === 0x80) i++;
      else if (encoding === "shift-jis" && !(b >= 0xa1 && b <= 0xdf)) i++;
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
    .slice(0, 16)
    .map(([b, { count, sample }]) => ({
      byte: b.toString(16).padStart(2, "0"),
      count,
      sample: escapeHighBytes(sample),
    }));
}

/** Which encoding `strings` (raw bytes, without their NUL) are most likely in. */
export function detectEncoding(strings: Buffer[]): EncodingReport {
  const withHigh = strings.filter(hasHighByte);
  let encoding: TextEncoding;
  if (withHigh.length === 0) encoding = "ascii";
  else if (withHigh.filter(isValidUtf8).length >= withHigh.length * 0.98) encoding = "utf-8";
  else if (
    withHigh.filter(isValidShiftJis).length >= withHigh.length * 0.98 &&
    mostlyJapanese(withHigh)
  )
    encoding = "shift-jis";
  else if (looksLatin1(withHigh)) encoding = "latin1";
  else encoding = "unknown-8bit";
  return {
    encoding,
    stringsWithHighBytes: withHigh.length,
    strings: strings.length,
    highBytes: highByteHistogram(withHigh, encoding),
  };
}

const DECODERS: Partial<Record<TextEncoding, TextDecoder>> = {
  ascii: new TextDecoder("utf-8"),
  "utf-8": new TextDecoder("utf-8"),
  "shift-jis": new TextDecoder("shift_jis"),
  latin1: new TextDecoder("windows-1252"),
};

/**
 * `bytes` as text in `encoding`. An `unknown-8bit` string is returned with
 * its high bytes escaped (`{xx}`), which is fine for reports and language
 * guesses but must never be written to a locale file.
 */
export function decodeText(bytes: Buffer, encoding: TextEncoding): string {
  const decoder = DECODERS[encoding];
  return decoder ? decoder.decode(bytes) : escapeHighBytes(bytes);
}

/** Encodings `decodeText` turns into real text. */
export function isDecodable(encoding: TextEncoding): boolean {
  return encoding !== "unknown-8bit";
}
