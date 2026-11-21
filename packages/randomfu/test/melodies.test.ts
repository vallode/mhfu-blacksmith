import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { readMessageFile } from "mhfu-extract/src/strings/messages.js";
import type { MelodyTable } from "mhfu-extract/src/tables/horn.js";
import { Edits } from "../src/edits.js";
import type { GameData } from "../src/game/load.js";
import { loadGame } from "../src/game/load.js";
import { checkPage, stringCount } from "../src/hints/bookshelf.js";
import {
  LESSON_FILES_EU,
  noteText,
  rewriteLesson,
  SONGBOOK_ARTICLES_EU,
  songbookStrings,
} from "../src/hints/songbook.js";
import { randomize } from "../src/randomize.js";
import { Rng } from "../src/rng.js";
import {
  collectSongs,
  effectName,
  noteSetOrder,
  SELF_IMPROVEMENT,
  shuffleSongs,
  songsOf,
} from "../src/shuffles/melodies.js";
import {
  buildFixtureDisc,
  FIXTURE_SONGS,
  GAME_TASK_INDEX,
  messageFile,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

const FILE = path.join(tempDir(), "disc.iso");
writeFileSync(FILE, buildFixtureDisc());

async function withGame<T>(run: (game: GameData) => T): Promise<T> {
  const { source, iso } = openDiscImage(FILE);
  try {
    return run(await loadGame(source, iso));
  } finally {
    source.close();
  }
}

const songs = (on: boolean, changes = {}) =>
  settingsWith("songs", [], { "songs.enabled": on, ...changes });

/** Each song's effect byte in `task`. */
const effectsIn = (task: Buffer, table: MelodyTable) =>
  table.songs.map((_, i) => task[table.effectsOffset + i]!);

const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b);

test("the songs are read from game_task.ovl: notes in playing order and effects", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    assert.equal(table.songs.length, FIXTURE_SONGS.length);
    table.songs.forEach((song, i) => {
      assert.deepEqual(song.notes, FIXTURE_SONGS[i]!.notes);
      assert.equal(song.optional, FIXTURE_SONGS[i]!.optional ?? null);
      assert.equal(song.effectId, FIXTURE_SONGS[i]!.effect);
    });
  });
});

test("songs trade effects: the same effects, notes untouched, Self-Improvement kept", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const vanilla = game.gameTask.ovl.reader.buf;
    const result = randomize(game, songs(true));
    const task = result.edits.files.get(GAME_TASK_INDEX)!;
    const after = effectsIn(task, table);
    const before = table.songs.map((s) => s.effectId);
    assert.deepEqual(sorted(after), sorted(before));
    assert.ok(
      after.some((e, i) => e !== before[i]),
      "some song plays a new effect",
    );
    assert.equal(after[0], SELF_IMPROVEMENT);
    assert.equal(after[1], SELF_IMPROVEMENT);
    // Only the effect bytes change in the song table.
    assert.ok(
      vanilla
        .subarray(table.offset, table.effectsOffset)
        .equals(task.subarray(table.offset, table.effectsOffset)),
    );

    const report = result.reports.find((r) => r.title === "Hunting horn songs")!;
    assert.equal(report.lines.filter((l) => l.where === "Songs").length, table.songs.length);
    assert.match(report.lines[0]!.text, /^White-White: Self-Improvement \(unchanged\)$/);
    assert.match(report.summary!, /^Hunting horn songs: \d+ of 32 songs play a new effect$/);
    // The fixture is a JP disc: no bookshelf or lesson text to rewrite.
    assert.ok(report.notes.some((n) => /only known on the EU disc/.test(n)));
  });
});

test("songs as long: effects only trade between songs of as many notes", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    for (const seed of ["a", "b", "c"]) {
      const result = randomize(
        game,
        settingsWith(seed, [], { "songs.enabled": true, "songs.mix": "length" }),
      );
      const after = effectsIn(result.edits.files.get(GAME_TASK_INDEX)!, table);
      for (const length of [2, 3, 4]) {
        const of = (effects: readonly number[]) =>
          sorted(
            table.songs.filter((s) => s.notes.length === length).map((s) => effects[s.index]!),
          );
        assert.deepEqual(
          of(after),
          of(table.songs.map((s) => s.effectId)),
          `${seed}: ${length} notes`,
        );
      }
    }
  });
});

test("without keeping it, Self-Improvement can move", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const moved = ["a", "b", "c", "d", "e"].some((seed) => {
      const result = randomize(
        game,
        settingsWith(seed, [], { "songs.enabled": true, "songs.keepSelfImprovement": false }),
      );
      const after = effectsIn(result.edits.files.get(GAME_TASK_INDEX)!, table);
      return after[0] !== SELF_IMPROVEMENT || after[1] !== SELF_IMPROVEMENT;
    });
    assert.ok(moved);
  });
});

test("off, the songs are left alone", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const result = randomize(game, songs(false));
    const task = result.edits.files.get(GAME_TASK_INDEX);
    if (task)
      assert.deepEqual(
        effectsIn(task, table),
        table.songs.map((s) => s.effectId),
      );
    assert.ok(!result.reports.some((r) => r.title === "Hunting horn songs"));
  });
});

/** Made-up note sets: three white, two purple, one twice. */
const NOTE_SETS = [
  ["w", "b", "r"],
  ["p", "y", "g"],
  ["w", "y", "a"],
  ["p", "b", "r"],
  ["w", "g", "r"],
  ["w", "b", "r"],
];

test("note sets list white first, then purple, each once", () => {
  assert.deepEqual(
    noteSetOrder(NOTE_SETS).map((s) => s.join("")),
    ["wbr", "wya", "wgr", "pyg", "pbr"],
  );
});

test("the spoiler lists each set of horn notes with the effects it plays", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const edits = new Edits(game);
    const { effects, report } = shuffleSongs(
      table,
      { mix: "any", keepSelfImprovement: true },
      new Rng("songs"),
      edits,
      game.gameTask,
      NOTE_SETS,
    );
    const byNotes = report.lines.filter((l) => l.where === "By horn notes");
    assert.equal(byNotes.length, 5);
    const own = songsOf(table.songs, ["w", "b", "r"]).map((s) => effectName(effects[s.index]!));
    assert.equal(byNotes[0]!.text, `White, Blue, Red: ${own.join(", ")}`);
    assert.ok(own[0] === "Self-Improvement");
  });
});

test("the songbook lists every song once by effect, and each set's songs on its page", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const effects = table.songs.map((s) => s.effectId).reverse();
    const texts = songbookStrings("x".repeat(80), table, effects, NOTE_SETS);
    assert.equal(texts.length, stringCount(SONGBOOK_ARTICLES_EU));
    for (const page of texts) checkPage(page);
    const [first, second] = [SONGBOOK_ARTICLES_EU[0]!, SONGBOOK_ARTICLES_EU[1]!];
    assert.equal(texts[0], "Hunting Horn Sheet Music");
    assert.equal(texts[1 + first.pages], "Hunting Horn Sheet Music at a Glance");

    const plain = (t: string) => t.replace(/~C\d\d/g, "");
    const byEffect = texts.slice(2, 1 + first.pages).join("\n");
    for (const song of table.songs) {
      const line = plain(`${noteText(song.notes)} ${effectName(effects[song.index]!)}`);
      assert.ok(plain(byEffect).split("\n").includes(line), line);
    }
    const glance = texts.slice(2 + first.pages);
    assert.equal(glance.length, second.pages);
    // The intro, then one page per set (wbr first), then blanks.
    assert.ok(plain(glance[0]!).endsWith(`♪♪\u3000\u3000 ${effectName(effects[1]!)}`));
    const wbr = plain(glance[1]!).split("\n");
    const expected = songsOf(table.songs, ["w", "b", "r"]).filter(
      (s) => !s.notes.every((n) => n === "w"),
    );
    assert.equal(wbr.length, 1 + Math.min(expected.length, 7));
    assert.equal(glance[6], "");
  });
});

test("the songbook says how many songs a set has past a page", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const all = ["w", "p", "b", "y", "r", "g", "a"];
    const many = songsOf(table.songs, all).filter((s) => !s.notes.every((n) => n === "w"));
    assert.ok(many.length > 7);
    const texts = songbookStrings(
      "s",
      table,
      table.songs.map((s) => s.effectId),
      [all],
    );
    const page = texts
      .at(-21)!
      .replace(/~C\d\d/g, "")
      .split("\n");
    assert.equal(page.length, 8);
    assert.equal(page[7], `and ${many.length - 6} more`);
  });
});

test("the Training School lesson names its songs' new effects, keeping its own lines", async () => {
  await withGame((game) => {
    const table = collectSongs(game.gameTask);
    const lesson = (lines: string) => {
      const strings = Array<string>(299).fill("");
      strings[298] = `A treat!\n\n~C03${lines}`;
      return messageFile([strings]);
    };
    const files = new Map(
      LESSON_FILES_EU.map((f, i) => [
        f,
        lesson(
          i === 4
            ? "x"
            : "White - White: Increase foot speed and many more words than before\nBlue - Blue - Red: Light Wind has no effect\nRed - Blue - White: Increase Max Health +10",
        ),
      ]),
    );
    const eu = {
      ...game,
      region: "eu",
      dataBin: { ...game.dataBin, read: (i: number) => files.get(i) ?? game.dataBin.read(i) },
    } as GameData;
    // The fixture has no blue-blue-red song: the lesson is left alone.
    assert.match(
      rewriteLesson(
        eu,
        new Edits(eu),
        table,
        table.songs.map((s) => s.effectId),
      ),
      /no bbr song/,
    );

    const withSongs: MelodyTable = {
      ...table,
      songs: [
        ...table.songs.slice(0, 1),
        { index: 1, notes: ["b", "b", "r"], optional: null, effectId: 5 },
        { index: 2, notes: ["r", "b", "w"], optional: null, effectId: 7 },
      ],
    };
    const edits = new Edits(eu);
    const note = rewriteLesson(eu, edits, withSongs, [0, 7, 14]);
    // The last file's text is too short for the new lines.
    assert.match(note, /Not in file 4780/);
    const text = readMessageFile(edits.files.get(4776)!)![0]!.strings[298]!.bytes.toString("utf8");
    assert.equal(
      text,
      `A treat!\n\n~C03White - White: Self-Improvement\nBlue - Blue - Red: ${effectName(7)}\nRed - Blue - White: ${effectName(14)}`,
    );
    assert.ok(!edits.files.has(4780));
  });
});
