/**
 * Hunting horn songs (mhfu-extract `tables/horn.ts`). `game_task.ovl` holds
 * the song table: each song a sequence of two to four notes, and right after
 * it one byte per song, the effect it plays. A horn can play every song made
 * of its three notes (its note set, from the EBOOT), so the songs a horn has
 * follow from its notes alone.
 *
 * When a song is played, `game_task` reads its effect byte and jumps on it
 * (EU 0x09bb1248: a 42-case table at 0x09c10b08); the same byte decides
 * which effects reach other hunters and which only the player (EU
 * 0x09a72630, 0x09a868b8). The effect's strength, duration and what playing
 * it again does all go with the effect. So moving effect bytes between songs
 * moves whole effects; the notes, and every horn's notes, stay as they are.
 * Edited in place.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import {
  locateMelodyTable,
  readHornNoteSets,
  type MelodyTable,
  type Song,
} from "mhfu-extract/src/tables/horn.js";
import melodyEffects from "mhfu-extract/src/overlay/melody-effects.json" with { type: "json" };
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Rng } from "../rng.js";
import { permuteWithinGroups, type ShuffleReport, type SpoilerLine } from "./shuffle.js";

export type SongMix = "any" | "length";

/** Self-Improvement (Movement Speed Up): what white-white and purple-purple play. */
export const SELF_IMPROVEMENT = 0;

export const NOTE_NAMES: Readonly<Record<string, string>> = {
  w: "White",
  p: "Purple",
  b: "Blue",
  y: "Yellow",
  r: "Red",
  g: "Green",
  a: "Aqua",
};

/**
 * Effect names as the game's song text has them (mhfu-extract
 * `overlay/melody-effects.json`), but Self-Improvement, which the HUD calls
 * Movement Speed Up and the bookshelf Self-Improvement, and 41, which the
 * HUD calls Supersonic Waves.
 */
const NAME_OVERRIDES: Readonly<Record<number, string>> = {
  [SELF_IMPROVEMENT]: "Self-Improvement",
  41: "Supersonic Waves",
};

const EFFECT_NAMES = new Map(melodyEffects.effects.map((e) => [e.id, e.effect]));

export function effectName(id: number): string {
  return NAME_OVERRIDES[id] ?? EFFECT_NAMES.get(id) ?? `Effect ${id}`;
}

/** "White-White-Red". */
export const notesLabel = (notes: readonly string[]) =>
  notes.map((n) => NOTE_NAMES[n] ?? n).join("-");

/** The song table of a disc's `game_task.ovl`. Throws if it isn't there. */
export function collectSongs(gameTask: LoadedOverlay): MelodyTable {
  try {
    return locateMelodyTable(gameTask.ovl.reader);
  } catch (error) {
    throw new Error(
      `game_task.ovl: the hunting horn songs weren't found (${(error as Error).message})`,
    );
  }
}

/** The EBOOT's note sets by `NoteGLType`, or null if they can't be read. */
export function readNoteSets(eboot: Buffer): string[][] | null {
  try {
    return readHornNoteSets(new BinaryReader(eboot));
  } catch {
    return null;
  }
}

/** The songs a horn with `notes` plays: those made of its notes only, in table order. */
export function songsOf(songs: readonly Song[], notes: readonly string[]): Song[] {
  return songs.filter((s) => s.notes.every((n) => notes.includes(n)));
}

/**
 * Note sets in the bookshelf's order: horns whose first note is white, then
 * purple, each in table order. Sets that appear twice are listed once.
 */
export function noteSetOrder(sets: readonly string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const first of ["w", "p"]) {
    for (const set of sets) {
      if (set[0] !== first || seen.has(set.join(""))) continue;
      seen.add(set.join(""));
      out.push(set);
    }
  }
  for (const set of sets) if (!seen.has(set.join(""))) out.push(set);
  return out;
}

export interface SongOptions {
  mix: SongMix;
  keepSelfImprovement: boolean;
}

/**
 * Moves effects between songs: among all of them, or among songs of as many
 * notes. With `keepSelfImprovement`, the songs that play it keep it.
 * Returns the effect each song now plays, by song index, and the report.
 */
export function shuffleSongs(
  table: MelodyTable,
  options: SongOptions,
  rng: Rng,
  edits: Edits,
  gameTask: LoadedOverlay,
  noteSets: readonly string[][] | null,
): { effects: number[]; report: ShuffleReport } {
  const pinned = (s: Song) => options.keepSelfImprovement && s.effectId === SELF_IMPROVEMENT;
  const effects = permuteWithinGroups(
    table.songs,
    (s) => (pinned(s) ? `pinned ${s.index}` : options.mix === "length" ? `${s.notes.length}` : ""),
    (s) => s.effectId,
    rng,
  );
  const buf = edits.overlay(gameTask);
  effects.forEach((effect, i) => (buf[table.effectsOffset + i] = effect));

  const lines: SpoilerLine[] = table.songs.map((song, i) => ({
    where: "Songs",
    text:
      effects[i] === song.effectId
        ? `${notesLabel(song.notes)}: ${effectName(song.effectId)} (unchanged)`
        : `${notesLabel(song.notes)}: ${effectName(effects[i]!)} (was ${effectName(song.effectId)})`,
  }));
  if (noteSets) {
    for (const set of noteSetOrder(noteSets)) {
      const own = songsOf(table.songs, set).map((s) => effectName(effects[s.index]!));
      lines.push({
        where: "By horn notes",
        text: `${set.map((n) => NOTE_NAMES[n] ?? n).join(", ")}: ${own.join(", ")}`,
      });
    }
  }
  const changed = effects.filter((e, i) => e !== table.songs[i]!.effectId).length;
  const notes = [
    options.mix === "length"
      ? "Each song's effect (strength, duration and what playing it again does) moves to another song of as many notes."
      : "Each song's effect (strength, duration and what playing it again does) moves to another song.",
    "Songs keep their notes and horns keep theirs, so every horn plays the same note sequences as before, with new effects.",
  ];
  if (options.keepSelfImprovement) {
    notes.push("White-White and Purple-Purple still play Self-Improvement, so every horn has it.");
  }
  if (!noteSets) notes.push("The horns' note sets weren't found, so songs aren't listed by horn.");
  return {
    effects,
    report: {
      title: "Hunting horn songs",
      notes,
      lines,
      summary: `Hunting horn songs: ${changed} of ${table.songs.length} songs play a new effect`,
    },
  };
}
