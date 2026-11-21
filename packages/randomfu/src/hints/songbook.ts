/**
 * The game's own song lists, rewritten when the hunting horn songs are
 * shuffled (`shuffles/melodies.ts`), so they say what each song now plays:
 *
 * - The bookshelf's Hunting Horn Sheet Music and Hunting Horn Sheet Music
 *   at a Glance articles (Melee Weapons Info), strings 356-398 of the
 *   bookshelf table: every song by effect, and the songs of each set of
 *   horn notes. Written with the guides (`guides.ts`), in English in every
 *   language, and readable from the start.
 * - The Training School instructor's three songs at the end of the hunting
 *   horn lesson (table 0, string 298 of the EU message files 4776-4780).
 *   The lesson's lines are kept; the song lines are in English in every
 *   language, within the string's own bytes.
 */
import { readMessageFile } from "mhfu-extract/src/strings/messages.js";
import type { MelodyTable, Song } from "mhfu-extract/src/tables/horn.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import { effectName, NOTE_NAMES, noteSetOrder, songsOf } from "../shuffles/melodies.js";
import {
  checkPage,
  introPage,
  repackStrings,
  stringCount,
  type Article,
  type GuidePlan,
} from "./bookshelf.js";
import { compact, paint, STYLE } from "./style.js";

export const SONGBOOK_NAME = "RandomFU Songbook";

/** Hunting Horn Sheet Music, then Hunting Horn Sheet Music at a Glance. */
export const SONGBOOK_ARTICLES_EU: readonly Article[] = [
  { title: 356, pages: 19 },
  { title: 376, pages: 22 },
];

/** Songs a page lists under its heading. */
const SONGS_PER_PAGE = 7;
/** The longest song: shorter ones are padded so the names line up. */
const MAX_NOTES = 4;
/** A full-width space: as wide as a ♪. */
const NOTE_GAP = "　";

/** A song's notes as coloured ♪, padded to the longest song's width. */
export function noteText(notes: readonly string[]): string {
  const shown = notes.map((n) => paint(STYLE.horn[n] ?? STYLE.horn.w!, "♪")).join("");
  return shown + NOTE_GAP.repeat(Math.max(0, MAX_NOTES - notes.length));
}

const songLine = (song: Song, effect: number) => `${noteText(song.notes)} ${effectName(effect)}`;

/** A song made of one note only, the set's first: every horn with that first note plays it. */
const isGeneral = (song: Song, set: readonly string[]) => song.notes.every((n) => n === set[0]);

/**
 * The two articles' strings, in order: each title, then its pages (blank
 * past the last one used). `effects` is each song's effect, by index.
 */
export function songbookStrings(
  seed: string,
  table: MelodyTable,
  effects: readonly number[],
  noteSets: readonly string[][],
): string[] {
  const [byEffect, byNotes] = SONGBOOK_ARTICLES_EU as [Article, Article];
  const heading = (text: string) => paint(STYLE.heading, text);

  const sorted = [...table.songs].sort(
    (a, b) => effects[a.index]! - effects[b.index]! || a.index - b.index,
  );
  const effectPages: string[] = [
    introPage(SONGBOOK_NAME, seed, [
      "Hunting horn songs play new effects on this",
      "seed. The next pages list every song by its",
      "effect; Sheet Music at a Glance lists the",
      "songs each set of horn notes can play.",
    ]),
  ];
  for (let i = 0; i < sorted.length; i += SONGS_PER_PAGE) {
    const songs = sorted.slice(i, i + SONGS_PER_PAGE);
    effectPages.push(
      [heading("Songs by effect"), ...songs.map((s) => songLine(s, effects[s.index]!))].join("\n"),
    );
  }

  const sets = noteSetOrder(noteSets);
  const firsts = [...new Set(sets.map((s) => s[0]!))];
  const general = firsts.flatMap((first) =>
    table.songs.filter((s) => isGeneral(s, [first])).map((s) => songLine(s, effects[s.index]!)),
  );
  const notesPages: string[] = [
    [
      heading("Songs by horn notes"),
      "A horn plays every song made of its three",
      "notes. One page per set of notes follows.",
      "Every horn also plays its first note's song:",
      ...general,
    ].join("\n"),
  ];
  for (const set of sets) {
    const songs = songsOf(table.songs, set).filter((s) => !isGeneral(s, set));
    const shown = songs.slice(0, SONGS_PER_PAGE);
    const lines = shown.map((s) => songLine(s, effects[s.index]!));
    if (songs.length > shown.length) {
      lines[SONGS_PER_PAGE - 1] = paint(STYLE.note, `and ${songs.length - shown.length + 1} more`);
    }
    notesPages.push([`${heading("Horn notes")} ${noteText(set).trimEnd()}`, ...lines].join("\n"));
  }

  const article = (title: string, pages: string[], count: number) => {
    if (pages.length > count) throw new Error(`${title}: ${pages.length} pages for ${count}`);
    const out = pages.map(compact);
    for (const page of out) checkPage(page);
    return [title, ...out, ...Array<string>(count - out.length).fill("")];
  };
  const texts = [
    ...article("Hunting Horn Sheet Music", effectPages, byEffect.pages),
    ...article("Hunting Horn Sheet Music at a Glance", notesPages, byNotes.pages),
  ];
  if (texts.length !== stringCount(SONGBOOK_ARTICLES_EU)) throw new Error("Songbook string count");
  return texts;
}

/** The songbook for this seed, to write with `writeGuides`: a fixed size. */
export function planSongbook(
  seed: string,
  table: MelodyTable,
  effects: readonly number[],
  noteSets: readonly string[][],
): GuidePlan {
  const title = "Bookshelf sheet music";
  const texts = songbookStrings(seed, table, effects, noteSets);
  return {
    title,
    articles: SONGBOOK_ARTICLES_EU,
    fit: () => ({
      texts,
      report: {
        title,
        notes: [
          "Home > Open Bookshelf > Melee Weapons Info: Hunting Horn Sheet Music lists every song by its new effect, and Hunting Horn Sheet Music at a Glance the songs of each set of horn notes, readable from the start. In English in every language.",
        ],
        lines: [],
      },
    }),
  };
}

/** The EU message files with the Training School's lessons: English, French, German, Italian, Spanish. */
export const LESSON_FILES_EU = [4776, 4777, 4778, 4779, 4780];
const LESSON_TABLE = 0;
/** The hunting horn lesson's last string: three songs after a `~C03`. */
const LESSON_SONGS_STRING = 298;
const LESSON_SONG_START = "~C03";
/** The songs it names, by notes. */
const LESSON_SONGS = [
  ["w", "w"],
  ["b", "b", "r"],
  ["r", "b", "w"],
];

/**
 * Rewrites the instructor's three songs with the effects they now play.
 * Returns a note for the report: what was rewritten, and where it couldn't be.
 */
export function rewriteLesson(
  game: GameData,
  edits: Edits,
  table: MelodyTable,
  effects: readonly number[],
): string {
  if (game.region !== "eu")
    return "The Training School's hunting horn lesson is only known on the EU disc, so it still names the songs' old effects.";
  const lines: string[] = [];
  for (const notes of LESSON_SONGS) {
    const song = table.songs.find((s) => s.notes.join("") === notes.join(""));
    if (!song)
      return `The Training School's hunting horn lesson wasn't changed: no ${notes.join("")} song.`;
    const label = notes.map((n) => NOTE_NAMES[n]).join(" - ");
    lines.push(`${label}: ${effectName(effects[song.index]!)}`);
  }
  const skipped: number[] = [];
  for (const index of LESSON_FILES_EU) {
    const file = edits.dataFileNow(index);
    const string = readMessageFile(file)?.[LESSON_TABLE]?.strings[LESSON_SONGS_STRING];
    const text = string?.bytes.toString("utf8");
    const at = text?.indexOf(LESSON_SONG_START) ?? -1;
    if (!text || at < 0) {
      skipped.push(index);
      continue;
    }
    const next = `${text.slice(0, at)}${LESSON_SONG_START}${lines.join("\n")}`;
    const copy = Buffer.from(file);
    try {
      repackStrings(copy, LESSON_TABLE, LESSON_SONGS_STRING, [next]);
    } catch {
      skipped.push(index);
      continue;
    }
    copy.copy(edits.dataFile(index));
  }
  const done =
    "The Training School's hunting horn lesson names its three songs' new effects, in English in every language.";
  return skipped.length === 0
    ? done
    : `${done} Not in file${skipped.length > 1 ? "s" : ""} ${skipped.join(", ")}: the text wasn't as expected or didn't fit.`;
}
