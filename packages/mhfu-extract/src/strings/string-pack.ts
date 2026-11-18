/**
 * The EU disc's message files as name tables: one per language, the same
 * layout in each (read by `strings/messages.ts`, which documents it). On
 * ULES01213 the string tables are DATA.BIN 19-23: English, French, German,
 * Italian and Spanish, 23 tables each (unpacked as `_unindexed/19.bin` to
 * `22.bin`, and 23 under the JP file list's name `message_jpn/str_tbl.pac`).
 *
 * Tables are packed with no padding, so most start at an odd offset; the
 * pointer-table search, which reads aligned words, only found the few that
 * happen to be aligned (head, chest and leg armor, and table 0's skill
 * trees and monsters). Read through the header, every table is found in
 * every language, and the same table and entry holds the same string in
 * each.
 */
import { stringAt } from "./name-search.js";
import { readMessageFile } from "./messages.js";

export interface StringPackBlock {
  /** File offset of the table (where its offset list starts). */
  offset: number;
  /** String count. */
  count: number;
}

export interface StringPack {
  blocks: StringPackBlock[];
}

/** `buf`'s tables, or null if it isn't a message file (or holds no strings). */
export function parseStringPack(buf: Buffer): StringPack | null {
  const tables = readMessageFile(buf);
  if (!tables || tables.every((t) => t.strings.length === 0)) return null;
  return { blocks: tables.map((t) => ({ offset: t.offset, count: t.strings.length })) };
}

/** The text of every entry in `block` (null where an entry leads nowhere), as Latin-1 for matching. */
export function blockTexts(buf: Buffer, block: StringPackBlock): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < block.count; i++) {
    const s = stringAt(buf, block.offset + buf.readUInt32LE(block.offset + i * 4));
    out.push(s ? s.toString("latin1") : null);
  }
  return out;
}

export interface PackPlacement {
  block: number;
  /** The block entry that holds the enum's entry 0. */
  entry: number;
  /** Enum names found exactly at their place. */
  votes: number;
}

/**
 * Where in `pack` an enum's names sit: every block and starting entry that
 * puts some enum entry `i` on a string equal to `names[i]`, best first.
 */
export function placeInPack(
  buf: Buffer,
  pack: StringPack,
  names: (string | null)[],
  limit = 3,
): PackPlacement[] {
  const wanted = new Map<string, number[]>();
  names.forEach((name, i) => {
    if (!name) return;
    const list = wanted.get(name);
    if (list) list.push(i);
    else wanted.set(name, [i]);
  });
  const placements: PackPlacement[] = [];
  pack.blocks.forEach((block, b) => {
    const votes = new Map<number, number>();
    blockTexts(buf, block).forEach((text, p) => {
      if (text === null) return;
      for (const i of wanted.get(text) ?? []) {
        const entry = p - i;
        if (entry >= 0) votes.set(entry, (votes.get(entry) ?? 0) + 1);
      }
    });
    for (const [entry, n] of votes) placements.push({ block: b, entry, votes: n });
  });
  return placements
    .filter((p) => p.votes >= 3)
    .sort((a, b) => b.votes - a.votes || a.block - b.block)
    .slice(0, limit);
}
