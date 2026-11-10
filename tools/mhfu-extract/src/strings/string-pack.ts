/**
 * The EU disc's message files: one per language, the same layout in each
 * (`_unindexed/19.bin` English, `20.bin` French, `21.bin` German, `22.bin`
 * Italian and `message_jpn/str_tbl.pac` Spanish, from a `find-names` run
 * on ULES01213).
 *
 *   u32 toc[n]      offset of each block; toc[0] is the first block, right
 *                   after the table, so it is also the table's size (0x64)
 *   block:
 *     u32 entry[m]  offset of each string, relative to the block's start;
 *                   the first string follows the array
 *     strings       NUL-terminated UTF-8
 *
 * Blocks are packed back to back with no padding, so most start at an odd
 * offset; the pointer-table search, which reads aligned words, only found
 * the few that happen to be aligned (head, chest and leg armor). Reading
 * the table of contents finds every block in every language, and the same
 * block and entry holds the same string in each.
 */
import { stringAt } from "./name-search.js";

export interface StringPackBlock {
  /** File offset of the block (where its entry array starts). */
  offset: number;
  /** Entry count. */
  count: number;
}

export interface StringPack {
  blocks: StringPackBlock[];
}

/** The most blocks a table of contents is taken to have (0x64 bytes: 25 on the EU disc). */
const MAX_BLOCKS = 1024;

/**
 * Reads `buf`'s table of contents, or null if it doesn't have one: the first
 * word must be a plausible table size, and every block offset must lie
 * inside the file, in order.
 */
export function parseStringPack(buf: Buffer): StringPack | null {
  if (buf.length < 16) return null;
  const tocSize = buf.readUInt32LE(0);
  if (tocSize < 8 || tocSize % 4 !== 0 || tocSize / 4 > MAX_BLOCKS || tocSize >= buf.length) {
    return null;
  }
  const n = tocSize / 4;
  const offsets: number[] = [];
  for (let k = 0; k < n; k++) {
    const off = buf.readUInt32LE(k * 4);
    if (off < tocSize || off >= buf.length) return null;
    if (k > 0 && off < offsets[k - 1]!) return null;
    offsets.push(off);
  }
  const blocks: StringPackBlock[] = [];
  for (let k = 0; k < n; k++) {
    const start = offsets[k]!;
    const end = k + 1 < n ? offsets[k + 1]! : buf.length;
    blocks.push({ offset: start, count: entryCount(buf, start, end) });
  }
  // A table of contents whose blocks hold no strings is something else.
  const strings = blocks.reduce((sum, b) => sum + b.count, 0);
  return strings > 0 ? { blocks } : null;
}

/**
 * Entries in the block at `start` (ending by `end`): the array runs until
 * the first string it points at. Zero for a block whose first word doesn't
 * lead to a string inside it.
 */
function entryCount(buf: Buffer, start: number, end: number): number {
  let firstString = end;
  let count = 0;
  for (let at = start; at + 4 <= firstString; at += 4) {
    const rel = buf.readUInt32LE(at);
    const target = start + rel;
    if (rel === 0) {
      count++;
      continue;
    }
    if (target < at + 4 || target >= end) break;
    firstString = Math.min(firstString, target);
    count++;
  }
  if (count === 0) return 0;
  // Sanity: the first entry leads to a string.
  const first = buf.readUInt32LE(start);
  return first !== 0 && stringAt(buf, start + first) === null ? 0 : count;
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
