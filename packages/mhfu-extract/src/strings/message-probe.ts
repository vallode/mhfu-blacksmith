/**
 * Finds a game's message files (strings/messages.ts) among an unpack's
 * files, including inside `.pac` packages, and lines their tables up with
 * the equipment tables by size: a name table has one string per entry, so
 * a table of 601 strings in MHF2 is a candidate for its 601 blademaster
 * weapons. Reports counts only, never the strings themselves.
 */
import { isPac, readPac } from "../models/pac.js";
import { readMessageFile } from "./messages.js";

/** A table size worth naming: what has that many entries. */
export interface KnownCount {
  name: string;
  count: number;
}

export interface ProbedTable {
  index: number;
  strings: number;
  /** Known tables of this size, or one more or fewer (a dummy first or last entry). */
  matches: string[];
}

export interface ProbedMessageFile {
  /** Path within the unpack, plus `#<entry>` for a message file inside a `.pac`. */
  file: string;
  tables: ProbedTable[];
}

function matchesFor(strings: number, known: readonly KnownCount[]): string[] {
  const out: string[] = [];
  for (const k of known) {
    if (strings === k.count) out.push(k.name);
    else if (Math.abs(strings - k.count) === 1)
      out.push(`${k.name}${strings > k.count ? "+1" : "-1"}`);
  }
  return out;
}

/** The message files among `files`, each table annotated with the known counts it matches. */
export function probeMessageFiles(
  files: readonly { name: string; buf: Buffer }[],
  known: readonly KnownCount[],
): ProbedMessageFile[] {
  const out: ProbedMessageFile[] = [];
  const consider = (file: string, buf: Buffer) => {
    const tables = readMessageFile(buf);
    // Random data can pass as a message file with empty tables; real ones hold strings.
    if (!tables || tables.every((t) => t.strings.length === 0)) return;
    out.push({
      file,
      tables: tables.map((t, index) => ({
        index,
        strings: t.strings.length,
        matches: matchesFor(t.strings.length, known),
      })),
    });
  };
  for (const { name, buf } of files) {
    consider(name, buf);
    if (isPac(buf)) {
      for (const entry of readPac(buf)) {
        if (entry.data.length > 0) consider(`${name}#${entry.index}`, entry.data);
      }
    }
  }
  return out;
}
