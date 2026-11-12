import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { buildMessageFile, readMessageFile } from "mhfu-extract/src/strings/messages.js";
import { Edits } from "../src/edits.js";
import type { GameData } from "../src/game/load.js";
import { loadGame } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import {
  carryChanges,
  measureLayout,
  rewriteCarryDescriptions,
  rewriteCarryLimit,
} from "../src/shuffles/descriptions.js";
import type { ItemTable } from "../src/shuffles/shops.js";
import { buildFixtureDisc, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

const EU = { width: 26, lines: 3 };

test("the carry limit is the description's last number, on its last line", () => {
  assert.equal(
    rewriteCarryLimit(
      "Piercing round that causes\nmultiple hits to monsters.\nMax 60 shots.",
      60,
      45,
      EU,
    ),
    "Piercing round that causes\nmultiple hits to monsters.\nMax 45 shots.",
  );
  // Clust S names its bomb count first: only the last number is the limit.
  assert.equal(
    rewriteCarryLimit(
      "Splits into 3 bombs upon\nimpact. Beware of friendly\nfire. Max 3 shots.",
      3,
      4,
      EU,
    ),
    "Splits into 3 bombs upon\nimpact. Beware of friendly\nfire. Max 4 shots.",
  );
  assert.equal(rewriteCarryLimit("Max 60 shots.", 50, 45, EU), null, "not the old limit");
  assert.equal(
    rewriteCarryLimit("Use 5 worms to raise soil\nfertility.", 5, 7, EU),
    null,
    "not on the last line",
  );
  assert.equal(rewriteCarryLimit("A small rock.", 10, 12, EU), null, "no number");
});

test("a longer number is wrapped again, or the word after it goes", () => {
  assert.equal(
    rewriteCarryLimit(
      "Tremendously powerful and\nshot, penetrates and\nexplodes it. Max 9 shots.",
      9,
      10,
      EU,
    ),
    "Tremendously powerful and\nshot, penetrates and\nexplodes it. Max 10 shots.",
    "still fits as it is",
  );
  assert.equal(
    rewriteCarryLimit("Short text.\nFairly short. Max 9 shots.", 9, 10, EU),
    "Short text. Fairly short.\nMax 10 shots.",
    "26 wide already: wrapped again into the room the first line has",
  );
  // EU's Crag S Lv3, every line full.
  assert.equal(
    rewriteCarryLimit(
      "Tremendously powerful and\nstunning shot. Penetrates\nand explodes. Max 9 shots.",
      9,
      10,
      EU,
    ),
    "Tremendously powerful and\nstunning shot. Penetrates\nand explodes. Max 10.",
  );
  assert.equal(
    rewriteCarryLimit(
      "Durchschuss-\nmunition. Mehrfachtreffer\nfür Monster. Max. 9 Schuss.",
      9,
      10,
      EU,
    ),
    "Durchschuss-\nmunition. Mehrfachtreffer\nfür Monster. Max. 10.",
    "a hand-hyphenated line stays as it is",
  );
});

test("the layout is the widest and longest of the game's own descriptions", () => {
  assert.deepEqual(measureLayout(["ab\nabcd", "a\nb\nc", "~C03abc~C00"]), { width: 4, lines: 3 });
});

test("carry changes compare the vanilla and edited item tables", () => {
  const table: ItemTable = { base: 0, count: 4, priceField: 12 };
  const vanilla = Buffer.alloc(4 * 24);
  vanilla[1 * 24 + 3] = 60;
  vanilla[2 * 24 + 3] = 99;
  const edited = Buffer.from(vanilla);
  edited[2 * 24 + 3] = 72;
  assert.deepEqual(carryChanges(vanilla, edited, table), [{ id: 2, from: 99, to: 72 }]);
});

/** A str_tbl with 23 tables: items 0-3 named and described in table 1 and 2. */
function strTbl(descriptions: string[], pad = 64): Buffer {
  const tables = Array.from({ length: 23 }, () => [Buffer.from("x")]);
  tables[1] = descriptions.map((_, i) => Buffer.from(`Item ${i}`));
  tables[2] = descriptions.map((d) => Buffer.from(d, "utf8"));
  const built = buildMessageFile(tables);
  return Buffer.concat([built, Buffer.alloc(pad, 0xaa)]);
}

const LANGUAGES: Record<number, string[]> = {
  19: [
    "dummy",
    "A small rock.",
    "Piercing round that causes\nmultiple hits to monsters.\nMax 60 shots.",
    "Max 9 shots.",
  ],
  20: [
    "dummy",
    "Un caillou.",
    "Balle perçante causant des\nimpacts multiples aux\nmonstres. Max 60 mun.",
    "Max 9 mun.",
  ],
  21: [
    "dummy",
    "Ein Stein.",
    "Durchschussmunition für\nMehrfachtreffer auf\nMonster. Max. 60 Schuss.",
    "Max. 9 Schuss.",
  ],
  22: [
    "dummy",
    "Un sasso.",
    "Proiettile perforante che\nprovoca ferite multiple.\nMassimo 60 colpi.",
    "Massimo 9 colpi.",
  ],
  23: [
    "dummy",
    "Una piedra.",
    "Disparo perforador que\ncausa varios alcances a\nmonstruos. Disp. máx. 60.",
    "Disp. máx. 9.",
  ],
};

function stubGame(files: Map<number, Buffer>, region: GameData["region"] = "eu") {
  const table: ItemTable = { base: 0, count: 4, priceField: 12 };
  const eboot = Buffer.alloc(4 * 24);
  eboot[2 * 24 + 3] = 60;
  eboot[3 * 24 + 3] = 9;
  const game = {
    region,
    eboot,
    dataBin: { read: (index: number) => files.get(index)! },
  } as unknown as GameData;
  return { game, table };
}

test("EU: carry limits are rewritten in all five str_tbl files, and nothing else in them", () => {
  const files = new Map(Object.entries(LANGUAGES).map(([i, d]) => [Number(i), strTbl(d)]));
  const { game, table } = stubGame(files);
  const edits = new Edits(game);
  edits.eboot()[2 * 24 + 3] = 45;
  edits.eboot()[3 * 24 + 3] = 10;
  const report = rewriteCarryDescriptions(game, table, edits)!;
  assert.deepEqual(
    report.lines.map((l) => l.text),
    ["Book of Combos 2: says 45 (was 60)", "Book of Combos 3: says 10 (was 9)"],
  );
  const read = (index: number) =>
    readMessageFile(edits.dataFile(index))![2]!.strings.map((s) => s.bytes.toString("utf8"));
  assert.equal(
    read(19)[2],
    "Piercing round that causes\nmultiple hits to monsters.\nMax 45 shots.",
  );
  assert.equal(
    read(20)[2],
    "Balle perçante causant des\nimpacts multiples aux\nmonstres. Max 45 mun.",
  );
  assert.equal(
    read(23)[2],
    "Disparo perforador que\ncausa varios alcances a\nmonstruos. Disp. máx. 45.",
  );
  assert.equal(read(21)[3], "Max. 10 Schuss.");
  for (const [index, descriptions] of Object.entries(LANGUAGES)) {
    const now = edits.dataFile(Number(index));
    assert.equal(now.length, files.get(Number(index))!.length, "same size on the disc");
    const tables = readMessageFile(now)!;
    assert.deepEqual(
      tables[2]!.strings.slice(0, 2).map((s) => s.bytes.toString("utf8")),
      descriptions.slice(0, 2),
    );
    assert.equal(tables[22]!.strings[0]!.bytes.toString(), "x", "later tables still read");
  }
});

test("EU: a file with no room for the longer text is left alone, and the spoiler says so", () => {
  const files = new Map(Object.entries(LANGUAGES).map(([i, d]) => [Number(i), strTbl(d, 0)]));
  const { game, table } = stubGame(files);
  const edits = new Edits(game);
  edits.eboot()[3 * 24 + 3] = 10;
  const report = rewriteCarryDescriptions(game, table, edits)!;
  assert.match(report.notes.join(" "), /Not rewritten: the en text would outgrow its file/);
  assert.equal(edits.files.size, 0);
  assert.deepEqual(report.lines, []);
});

test("JP: carry limits change but the text isn't known, so the spoiler says the descriptions are old", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  const result = randomize(
    game,
    settingsWith("q", [], { "shops.stacks": true, "shops.stackSpread": 0.5 }),
  );
  const report = result.reports.find((r) => r.title === "Item descriptions");
  assert.match(report!.notes.join(" "), /only the EU disc's text is known/);
  assert.equal(result.edits.files.size, 0, "no message file edited");
  source.close();
});
