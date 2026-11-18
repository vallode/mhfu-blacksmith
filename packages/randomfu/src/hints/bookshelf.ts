/**
 * The house bookshelf (Open Bookshelf, Info Magazine) as a place for
 * in-game guides: articles whose text is rewritten and which are made
 * readable from the start. `bestiary.ts` and `almanac.ts` write the guides.
 *
 * Text. The bookshelf's articles are in table 3 of the EU message files
 * 4781-4785 (one per language, `mhfu-extract strings/messages.ts`): each
 * article is a short title string followed by its pages. A page shows up to
 * 8 lines of 46 characters, wrapped by hand, and `~C05`/`~C00` colour text.
 * A guide takes over a run of articles whose strings lie one after another;
 * new text is repacked within the bytes that run uses, and the table's
 * offsets updated, so the file keeps its size. Every article keeps its page
 * count; spare pages are left blank. Guides are in English in every
 * language.
 *
 * Unlocking. `lobby_task.ovl` lists the articles as 16-byte records:
 *
 *   +0  u32 pointer to the title row
 *   +4  u32 pointer to the page rows (the next row)
 *   +8  u16 issue: the Info Magazine issue the article arrives with
 *   +10 u16 an ID (left alone)
 *   +12 u32 page count << 8, plus 1 if the article waits for its issue
 *
 * Rows are four u16 string IDs, zero-filled. The articles a new game can
 * read have issue 0 and the low bit clear, so a guide's records get the
 * same (seen working in PPSSPP).
 */
import { OvlFile } from "mhfu-extract/src/container/ovl.js";
import { readMessageFile } from "mhfu-extract/src/strings/messages.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";

/** The EU message files with the bookshelf text: English, French, German, Italian, Spanish. */
export const BOOKSHELF_FILES_EU = [4781, 4782, 4783, 4784, 4785];
export const BOOKSHELF_TABLE = 3;

export const PAGE_WIDTH = 46;
export const PAGE_LINES = 8;
const ROW_SIZE = 8;
const RECORD_SIZE = 16;

export interface Article {
  /** String ID of the title; its pages are the strings after it. */
  title: number;
  pages: number;
}

/** A line's width in half-width characters: the symbols (★, ◆) count double. */
export function width(line: string): number {
  return [...line.replace(/~C\d\d/g, "")].reduce(
    (n, ch) => n + (ch.charCodeAt(0) > 0x7e ? 2 : 1),
    0,
  );
}

/** Throws unless every line of `page` fits a bookshelf page. */
export function checkPage(page: string): void {
  const lines = page.split("\n");
  if (lines.length > PAGE_LINES) throw new Error(`A guide page has ${lines.length} lines`);
  for (const line of lines) {
    if (width(line) > PAGE_WIDTH) throw new Error(`A guide line is too wide: "${line}"`);
  }
}

/** Joins `items` after `lead`, stopping before the first that would make the line too wide. */
export function fitLine(
  lead: string,
  items: readonly string[],
  fallback: string,
  separator = " ",
): string {
  let line = lead;
  for (const item of items) {
    const next = line === lead ? `${line}${item}` : `${line}${separator}${item}`;
    if (width(next) > PAGE_WIDTH) break;
    line = next;
  }
  return line === lead ? `${lead}${fallback}` : line;
}

/**
 * Shares `count` entries out over places with room for `room[i]` each, as
 * evenly as the room allows, in order, so none is left empty while another
 * has more than its share. Entries beyond the total room are left out.
 */
export function spreadEvenly(count: number, room: readonly number[]): number[] {
  const out: number[] = [];
  let left = Math.min(
    count,
    room.reduce((n, r) => n + r, 0),
  );
  room.forEach((r, i) => {
    const later = room.slice(i + 1).reduce((n, x) => n + x, 0);
    const even = Math.ceil(left / (room.length - i));
    const n = Math.min(r, left, Math.max(left - later, even));
    out.push(n);
    left -= n;
  });
  return out;
}

/** A title from a guide's name and the first letters of the names it covers: "Name A-C". */
export function letterTitle(name: string, names: readonly string[]): string {
  const first = names[0]?.charAt(0);
  const last = names.at(-1)?.charAt(0);
  if (!first) return name;
  return `${name} ${first === last ? first : `${first}-${last}`}`;
}

/** The first page of a guide: its name, the seed, and up to six lines on how to read it. */
export function introPage(name: string, seed: string, lines: readonly string[]): string {
  return [`~C05◆ ${name} ◆~C00`, `Seed: ${[...seed].slice(0, 32).join("")}`, ...lines].join("\n");
}

/**
 * Writes `texts` over strings `first`, `first + 1`, ... of a message
 * file's table, packed back to back within the bytes those strings use now.
 * The strings must lie one after another; returns the bytes used and the
 * room there was. Throws, changing nothing, if they don't fit.
 */
export function repackStrings(
  file: Buffer,
  tableIndex: number,
  first: number,
  texts: readonly (string | Buffer)[],
): { used: number; room: number } {
  const room = runRoom(file, tableIndex, first, texts.length);
  // A Buffer is a string's bytes as they are, kept byte for byte.
  const encoded = texts.map((t) =>
    typeof t === "string" ? Buffer.from(`${t}\0`, "utf8") : Buffer.concat([t, Buffer.alloc(1)]),
  );
  const used = encoded.reduce((n, b) => n + b.length, 0);
  if (used > room.end - room.start) {
    throw new Error(`The new text needs ${used} bytes; there are ${room.end - room.start}`);
  }
  let at = room.start;
  encoded.forEach((b, i) => {
    b.copy(file, at);
    file.writeUInt32LE(at - room.table, room.table + 4 * (first + i));
    at += b.length;
  });
  file.fill(0, at, room.end);
  return { used, room: room.end - room.start };
}

/** Where strings `first` to `first + count - 1` lie: their table, and the bytes they use. */
function runRoom(
  file: Buffer,
  tableIndex: number,
  first: number,
  count: number,
): { table: number; start: number; end: number } {
  const table = readMessageFile(file)?.[tableIndex];
  if (!table) throw new Error(`The message file has no table ${tableIndex}`);
  const strings = table.strings.slice(first, first + count);
  if (strings.length !== count) throw new Error("The message table is too short");
  for (let i = 1; i < strings.length; i++) {
    const prev = strings[i - 1]!;
    if (strings[i]!.offset !== prev.offset + prev.bytes.length + 1) {
      throw new Error(`String ${first + i} doesn't follow the one before it`);
    }
  }
  const last = strings.at(-1)!;
  let end = last.offset + last.bytes.length + 1;
  // A run written before ends in zeros up to the next string: that room is the run's too.
  const next = table.strings[first + count];
  if (next && next.offset > end && file.subarray(end, next.offset).every((b) => b === 0)) {
    end = next.offset;
  }
  return { table: table.offset, start: strings[0]!.offset, end };
}

export interface ArticleRecord {
  /** File offset of the record in the overlay. */
  offset: number;
  title: number;
  pages: number;
  issue: number;
  /** True if the article waits for its issue (the flags' low bit). */
  gated: boolean;
}

/** The overlay's article records whose title is one of `articles`, with that page count. */
export function findArticleRecords(lobby: Buffer, articles: readonly Article[]): ArticleRecord[] {
  const ovl = new OvlFile(lobby);
  const rowAt = (ptr: number) => (ovl.isOwnVaddr(ptr) ? ovl.vaddrToOffset(ptr) : -1);
  const out: ArticleRecord[] = [];
  for (let o = 0x80; o + RECORD_SIZE <= lobby.length; o += 4) {
    const titleRow = rowAt(lobby.readUInt32LE(o));
    if (titleRow < 0 || titleRow + 2 * ROW_SIZE > lobby.length) continue;
    if (rowAt(lobby.readUInt32LE(o + 4)) !== titleRow + ROW_SIZE) continue;
    const title = lobby.readUInt16LE(titleRow);
    const article = articles.find((a) => a.title === title);
    if (!article) continue;
    const flags = lobby.readUInt32LE(o + 12);
    if (flags >>> 8 !== article.pages) continue;
    // A title row holds the title alone; the page rows start with the next string.
    if (lobby.readUInt32LE(titleRow + 2) !== 0 || lobby.readUInt16LE(titleRow + 6) !== 0) continue;
    if (lobby.readUInt16LE(titleRow + ROW_SIZE) !== title + 1) continue;
    out.push({
      offset: o,
      title,
      pages: article.pages,
      issue: lobby.readUInt16LE(o + 8),
      gated: (flags & 1) === 1,
    });
  }
  return out;
}

/** Makes an article readable from the start: issue 0, not waiting for it. */
export function unlockArticle(lobby: Buffer, record: ArticleRecord): void {
  lobby.writeUInt16LE(0, record.offset + 8);
  lobby.writeUInt32LE((lobby.readUInt32LE(record.offset + 12) & ~1) >>> 0, record.offset + 12);
}

/** The strings a run of articles takes: each title and its pages. */
export const stringCount = (articles: readonly Article[]) =>
  articles.reduce((n, a) => n + 1 + a.pages, 0);

/**
 * A guide for this seed, ready to write (`guides.ts`): its articles, and its
 * text at a size. `fit` shrinks the text to take at most `bytes` if it can,
 * else returns the smallest it gets; the report says what it left out.
 */
export interface GuidePlan {
  title: string;
  articles: readonly Article[];
  fit(bytes: number): { texts: string[]; report: ShuffleReport };
}

/** A guide to write: a run of articles, and each one's title then its pages. */
export interface Book {
  articles: readonly Article[];
  texts: readonly string[];
}

/**
 * The strings from the first book's first article to the last book's last
 * page: the run every language repacks, the books' text and the original
 * strings between them packed back to back. Books mustn't overlap.
 */
function shelfSpan(books: readonly (readonly Article[])[]): {
  first: number;
  count: number;
  /** For each string in the span, the book and index it comes from, or null to keep. */
  owner: ({ book: number; index: number } | null)[];
} {
  const order = books
    .map((articles, book) => ({ articles, book, first: articles[0]!.title }))
    .sort((a, b) => a.first - b.first);
  const first = order[0]!.first;
  const last = Math.max(...order.map((b) => b.first + stringCount(b.articles) - 1));
  const owner: ({ book: number; index: number } | null)[] = Array(last - first + 1).fill(null);
  for (const { articles, book, first: at } of order) {
    for (let index = 0; index < stringCount(articles); index++) {
      if (owner[at - first + index]) throw new Error("Two guides share bookshelf strings");
      owner[at - first + index] = { book, index };
    }
  }
  return { first, count: owner.length, owner };
}

/**
 * Checks runs of articles can be rewritten together on this disc. Returns
 * why not, or the bytes their text may take in all, in the language with
 * the least room: the span's bytes less the original strings between the
 * runs, which are kept.
 */
export function shelfRoom(
  game: GameData,
  edits: Edits,
  books: readonly (readonly Article[])[],
): { room: number } | { problem: string } {
  if (game.region !== "eu") return { problem: "the bookshelf text is only known on the EU disc" };
  const all = books.flat();
  const records = findArticleRecords(edits.dataFileNow(game.lobbyTask.index), all);
  if (records.length !== all.length) {
    return { problem: `found ${records.length} of the ${all.length} articles in lobby_task.ovl` };
  }
  const span = shelfSpan(books);
  let room = Infinity;
  for (const index of BOOKSHELF_FILES_EU) {
    try {
      const file = edits.dataFileNow(index);
      const run = runRoom(file, BOOKSHELF_TABLE, span.first, span.count);
      const strings = readMessageFile(file)![BOOKSHELF_TABLE]!.strings;
      const kept = span.owner.reduce(
        (n, o, i) => (o ? n : n + strings[span.first + i]!.bytes.length + 1),
        0,
      );
      room = Math.min(room, run.end - run.start - kept);
    } catch (error) {
      return { problem: `file ${index}: ${(error as Error).message}` };
    }
  }
  return { room };
}

/** The bytes a run of articles has for new text (`shelfRoom` for one run). */
export const bookRoom = (game: GameData, edits: Edits, articles: readonly Article[]) =>
  shelfRoom(game, edits, [articles]);

/** The bytes `texts` take as strings. */
export const textBytes = (texts: readonly string[]) =>
  texts.reduce((n, t) => n + Buffer.byteLength(t, "utf8") + 1, 0);

/**
 * Writes books into every language in one repack, so they share the room
 * their runs and the strings between them have, and unlocks their
 * articles. Returns why it couldn't, changing nothing, or null.
 */
export function writeShelf(game: GameData, edits: Edits, books: readonly Book[]): string | null {
  const check = shelfRoom(
    game,
    edits,
    books.map((b) => b.articles),
  );
  if ("problem" in check) return check.problem;
  for (const book of books) {
    if (book.texts.length !== stringCount(book.articles)) {
      throw new Error(`A book of these articles has ${stringCount(book.articles)} strings`);
    }
  }
  const span = shelfSpan(books.map((b) => b.articles));
  // Repack every language on copies first, so a disc where one doesn't fit is left alone.
  const files = new Map<number, Buffer>();
  for (const index of BOOKSHELF_FILES_EU) {
    const copy = Buffer.from(edits.dataFileNow(index));
    const strings = readMessageFile(copy)![BOOKSHELF_TABLE]!.strings;
    const texts = span.owner.map((o, i) =>
      o ? books[o.book]!.texts[o.index]! : Buffer.from(strings[span.first + i]!.bytes),
    );
    try {
      repackStrings(copy, BOOKSHELF_TABLE, span.first, texts);
    } catch (error) {
      return `file ${index}: ${(error as Error).message}`;
    }
    files.set(index, copy);
  }
  for (const [index, copy] of files) copy.copy(edits.dataFile(index));
  const lobby = edits.overlay(game.lobbyTask);
  for (const record of findArticleRecords(
    lobby,
    books.flatMap((b) => b.articles),
  )) {
    unlockArticle(lobby, record);
  }
  return null;
}

/** Writes one book (`writeShelf`). */
export const writeBook = (
  game: GameData,
  edits: Edits,
  articles: readonly Article[],
  texts: readonly string[],
) => writeShelf(game, edits, [{ articles, texts }]);
