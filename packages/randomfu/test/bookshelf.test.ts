import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { OvlFile } from "mhfu-extract/src/container/ovl.js";
import { readMessageFile } from "mhfu-extract/src/strings/messages.js";
import {
  addAppearances,
  BESTIARY_NAME,
  bestiaryIntro,
  bestiaryStrings,
  guideScale,
  monsterPage,
  readGuideMonsters,
  type GuideMonster,
} from "../src/hints/bestiary.js";
import {
  checkPage,
  findArticleRecords,
  fitLine,
  letterTitle,
  repackStrings,
  spreadEvenly,
  unlockArticle,
  width,
} from "../src/hints/bookshelf.js";
import { loadGame } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import {
  buildFixtureDisc,
  buildGameTask,
  FIXTURE_TOLERANCES,
  fixtureHitzone,
  fixtureHp,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

/** A message file: u32 count, u32 8, table offsets, then each table's offsets (0xFFFFFFFF-ended) and strings. */
function messageFile(tables: string[][]): Buffer {
  const parts: Buffer[] = [];
  let at = 8 + 4 * tables.length;
  const header = Buffer.alloc(at);
  header.writeUInt32LE(tables.length, 0);
  header.writeUInt32LE(8, 4);
  tables.forEach((strings, t) => {
    header.writeUInt32LE(at, 8 + 4 * t);
    const list = Buffer.alloc(4 * (strings.length + 1));
    let rel = list.length;
    const bytes = strings.map((s) => Buffer.from(`${s}\0`, "utf8"));
    bytes.forEach((b, i) => {
      list.writeUInt32LE(rel, 4 * i);
      rel += b.length;
    });
    list.writeUInt32LE(0xffffffff, 4 * strings.length);
    parts.push(list, ...bytes);
    at += rel;
  });
  return Buffer.concat([header, ...parts, Buffer.alloc(64)]);
}

/** Text without its colour codes. */
const plain = (text: string) => text.replace(/~C\d\d/g, "");

const texts = (file: Buffer, table: number) =>
  readMessageFile(file)![table]!.strings.map((s) => s.bytes.toString("utf8"));

const monster = (name: string, over: Partial<GuideMonster> = {}): GuideMonster => ({
  emId: 1,
  name,
  hp: 65535,
  elements: [
    { name: "Thunder", value: 100 },
    { name: "Dragon", value: 100 },
    { name: "Water", value: 100 },
    { name: "Fire", value: 5 },
  ],
  parts: ["Back-tail/Tail", "Head", "Wings", "Legs", "Body"].map((n) => ({
    name: n,
    cut: 100,
    bash: 100,
    shot: 100,
  })),
  status: { poison: 1000, sleep: 1000, paralysis: 1000, ko: 1000 },
  appears: [],
  ...over,
});

test("guide pages fit the bookshelf's 8 lines of 46 characters, symbols counting double", () => {
  const all = [monster("Terra Shogun Ceanataur"), monster("Kirin", { hp: 100 })];
  const scale = guideScale(all);
  checkPage(bestiaryIntro("x".repeat(80)));
  checkPage(monsterPage(all[0]!, scale));
  const immune = monsterPage(
    monster("Lao-Shan Lung", {
      elements: [{ name: "Fire", value: 5 }],
      status: { poison: null, sleep: null, paralysis: null, ko: null },
    }),
    scale,
  );
  checkPage(immune);
  assert.match(plain(immune), /^Weak to: nothing much$/m);
  assert.match(plain(immune), /^Shrugs off poison, sleep, paralysis and KO$/m);
  assert.equal(width("★★★ ab"), 9);
  assert.equal(width("~C05ab~C00"), 2);
  assert.throws(() => checkPage("x".repeat(47)), /too wide/);
  assert.throws(() => checkPage("★".repeat(24)), /too wide/);
  assert.throws(() => checkPage(Array(9).fill("x").join("\n")), /9 lines/);
});

test("a monster page rates in stars and words, with no numbers", () => {
  const tigrex = monster("Tigrex", {
    hp: 4000,
    elements: [
      { name: "Dragon", value: 30 },
      { name: "Thunder", value: 20 },
      { name: "Water", value: 10 },
      { name: "Fire", value: 5 },
    ],
    parts: [
      { name: "Head", cut: 75, bash: 65, shot: 40 },
      { name: "Neck", cut: 40, bash: 45, shot: 20 },
      { name: "Belly", cut: 25, bash: 25, shot: 19 },
      { name: "Back", cut: 20, bash: 20, shot: 15 },
      { name: "Tail", cut: 10, bash: 10, shot: 10 },
    ],
    status: { poison: 100, sleep: null, paralysis: 300, ko: 200 },
  });
  const others = [100, 200, 300].map((d, i) =>
    monster(`M${i}`, { hp: 1000 * (i + 1), status: { poison: d, sleep: d, paralysis: d, ko: d } }),
  );
  const page = monsterPage(tigrex, guideScale([tigrex, ...others]));
  assert.deepEqual(page.split("\n"), [
    "~C30Tigrex  ~C09Colossal",
    "~C00Weak to: ~C16Dragon★★★ ~C18Thunder★★ ~C17Water★",
    "~C00Head: Cut★★★ Blunt★★★ Shot★★",
    "Neck: Cut★★ Blunt★★★ Shot★",
    "Belly: Cut★ Blunt★ Shot-",
    "Back: Cut★ Blunt★ Shot-",
    "~C23Poison★★★ ~C10Sleep- ~C24Para★ ~C08KO★★",
    "~C10In no Village or Guild quest~C00",
  ]);
  assert.doesNotMatch(plain(page), /\d/, "no numbers, colour codes aside");
});

test("a monster page names the earliest quests it's in per rank", () => {
  const rathalos = monster("Rathalos", {
    appears: [
      { band: "low", stars: 2 },
      { band: "high", stars: 7 },
      { band: "g", stars: 9 },
    ],
  });
  const page = monsterPage(rathalos, guideScale([rathalos]));
  const lines = page.split("\n");
  assert.equal(lines.length, 8);
  assert.equal(lines.at(-1), "~C00Quests: ~C03LR★2 ~C11HR★7 ~C15G★1~C00");
  assert.equal(
    plain(page)
      .split("\n")
      .filter((l) => l.includes("Cut")).length,
    4,
  );

  const m = monster("Kut-Ku", { emId: 11 });
  addAppearances(
    [m, monster("Fatalis", { emId: 12 })],
    new Map([[11, [{ band: "low", stars: 1 }]]]),
  );
  assert.deepEqual(m.appears, [{ band: "low", stars: 1 }]);
});

test("lines leave out what doesn't fit rather than run long", () => {
  assert.equal(
    fitLine("Lead: ", ["a".repeat(30), "b".repeat(20), "c"], "none"),
    `Lead: ${"a".repeat(30)}`,
  );
  assert.equal(fitLine("Lead: ", [], "none"), "Lead: none");
  assert.equal(fitLine("", ["a", "b"], "-", ", "), "a, b");
  const wide = monster("Rajang", {
    elements: ["Thunder", "Dragon", "Water", "Fire"].map((name) => ({ name, value: 40 })),
  });
  const page = monsterPage(wide, guideScale([wide]));
  const weak = plain(page).split("\n")[1]!;
  assert.equal(weak, "Weak to: Thunder★★★ Dragon★★★");
  checkPage(page);
});

test("monsters spread evenly over the articles, the first giving a page to the intro", () => {
  const eu = [12, 11, 8, 9, 7, 7, 8, 6].map((pages, i) => ({ title: i, pages }));
  const spreadMonsters = (n: number, articles: typeof eu) =>
    spreadEvenly(
      n,
      articles.map((a, i) => a.pages - (i === 0 ? 1 : 0)),
    );
  const counts = spreadMonsters(60, eu);
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    60,
  );
  assert.ok(counts.every((n, i) => n > 0 && n <= eu[i]!.pages - (i === 0 ? 1 : 0)));
  assert.deepEqual(spreadMonsters(67, eu), [11, 11, 8, 9, 7, 7, 8, 6], "full");
  assert.deepEqual(spreadMonsters(80, eu), [11, 11, 8, 9, 7, 7, 8, 6], "no more than fits");
  assert.deepEqual(spreadMonsters(3, eu), [1, 1, 1, 0, 0, 0, 0, 0]);
});

test("guide strings: titles by letter, the intro first, blank pages after", () => {
  const ms = ["Akantor", "Basarios", "Congalala", "Diablos"].map((n) => monster(n));
  const articles = [
    { title: 10, pages: 3 },
    { title: 20, pages: 4 },
  ];
  const { texts: out, titles, listed, left } = bestiaryStrings("SEED", ms, articles);
  assert.equal(out.length, 2 + 3 + 4);
  assert.deepEqual(titles, ["RandomFU Bestiary A-B", "RandomFU Bestiary C-D"]);
  assert.equal(out[0], "RandomFU Bestiary A-B");
  assert.match(out[1]!, /◆ RandomFU Bestiary ◆/);
  assert.match(out[2]!, /Akantor/);
  assert.match(out[3]!, /Basarios/);
  assert.equal(out[4], "RandomFU Bestiary C-D");
  assert.match(out[5]!, /Congalala/);
  assert.match(out[6]!, /Diablos/);
  assert.deepEqual(out.slice(7), [" ", " "]);
  assert.deepEqual(
    listed.map((l) => l.map((m) => m.name)),
    [
      ["Akantor", "Basarios"],
      ["Congalala", "Diablos"],
    ],
  );
  assert.deepEqual(left, []);
  assert.equal(letterTitle(BESTIARY_NAME, ["Kirin"]), "RandomFU Bestiary K");
  assert.equal(letterTitle(BESTIARY_NAME, []), "RandomFU Bestiary");

  const many = bestiaryStrings("SEED", [...ms, monster("Fatalis")], [{ title: 10, pages: 3 }]);
  assert.deepEqual(
    many.left.map((m) => m.name),
    ["Congalala", "Diablos", "Fatalis"],
  );
});

test("the scale ranks health in fifths and status in thirds", () => {
  const ms = [1, 2, 3, 4, 5, 6].map((i) =>
    monster(`M${i}`, {
      hp: i * 100,
      status: { poison: i * 10, sleep: null, paralysis: 50, ko: 1 },
    }),
  );
  const scale = guideScale(ms);
  assert.deepEqual(
    ms.map((m) => scale.build(m.hp)),
    ["Frail", "Sturdy", "Tough", "Mighty", "Colossal", "Colossal"],
  );
  assert.deepEqual(
    ms.map((m) => scale.status("poison", m.status.poison)),
    [3, 3, 2, 2, 1, 1],
  );
  assert.equal(scale.status("sleep", null), 0);
  assert.equal(scale.status("paralysis", 50), 3, "all equal: all quickest");
});

test("repackStrings rewrites a run of strings within its bytes", () => {
  const file = messageFile([
    ["a", "b"],
    ["menu", "Title", "page one is long", "page two", "next title"],
  ]);
  const before = Buffer.from(file);
  const result = repackStrings(file, 1, 1, ["T", "a much longer first page", "x"]);
  assert.equal(result.room, "Title page one is long page two ".length);
  assert.equal(result.used, "T a much longer first page x ".length);
  assert.deepEqual(texts(file, 1), ["menu", "T", "a much longer first page", "x", "next title"]);
  assert.deepEqual(texts(file, 0), ["a", "b"]);
  assert.equal(file.length, before.length);

  const copy = Buffer.from(file);
  assert.throws(
    () => repackStrings(copy, 1, 1, ["T", "x".repeat(40), "y"]),
    /needs 45 bytes; there are 32/,
  );
  assert.ok(copy.equals(file), "a failed repack changes nothing");
  assert.throws(() => repackStrings(copy, 1, 3, ["a", "b", "c"]), /too short/);
  assert.throws(() => repackStrings(copy, 5, 0, ["a"]), /no table 5/);

  // A second write gets the whole run back, zeros left by the first included.
  repackStrings(file, 1, 1, ["T", "x", "y"]);
  assert.deepEqual(
    repackStrings(file, 1, 1, ["T", "a much longer first page", "x"]).room,
    result.room,
  );
  assert.deepEqual(texts(file, 1), ["menu", "T", "a much longer first page", "x", "next title"]);

  // Raw bytes are kept as they are: how books share one run around the strings between them.
  const kept = Buffer.from([0xe2, 0x98, 0x85]); // ★
  repackStrings(file, 1, 1, ["A", kept, "B"]);
  assert.deepEqual(texts(file, 1), ["menu", "A", "★", "B", "next title"]);
});

const LOAD = 0x09a5f200;

/** lobby_task.ovl with two articles' rows and records, plus a record whose page count is off. */
function lobbyWithArticles(): Buffer {
  const buf = Buffer.alloc(0x400);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(LOAD, 8);
  buf.writeUInt32LE(LOAD + buf.length, 0x1c);
  buf.write("lobby_task.ovl", 0x20, "latin1");
  const rows = [[10], [11, 12, 13], [20], [21, 22, 23, 24], [25], [30], [31]];
  rows.forEach((row, r) => row.forEach((v, i) => buf.writeUInt16LE(v, 0x100 + r * 8 + i * 2)));
  const record = (at: number, titleRow: number, issue: number, flags: number) => {
    buf.writeUInt32LE(LOAD + 0x100 + titleRow * 8, at);
    buf.writeUInt32LE(LOAD + 0x100 + (titleRow + 1) * 8, at + 4);
    buf.writeUInt16LE(issue, at + 8);
    buf.writeUInt16LE(0xf5, at + 10);
    buf.writeUInt32LE(flags, at + 12);
  };
  record(0x200, 0, 2, (3 << 8) | 1);
  record(0x210, 2, 4, (5 << 8) | 1);
  record(0x220, 5, 7, (9 << 8) | 1); // title 30 with 9 pages: not the article asked for
  return buf;
}

test("article records are found by title and page count, and unlocked", () => {
  const lobby = lobbyWithArticles();
  const articles = [
    { title: 10, pages: 3 },
    { title: 20, pages: 5 },
    { title: 30, pages: 1 },
  ];
  const found = findArticleRecords(lobby, articles);
  assert.deepEqual(
    found.map((r) => [r.offset, r.title, r.pages, r.issue, r.gated]),
    [
      [0x200, 10, 3, 2, true],
      [0x210, 20, 5, 4, true],
    ],
  );
  unlockArticle(lobby, found[1]!);
  assert.equal(lobby.readUInt16LE(0x218), 0);
  assert.equal(lobby.readUInt16LE(0x21a), 0xf5, "the ID is left alone");
  assert.equal(lobby.readUInt32LE(0x21c), 5 << 8);
  assert.deepEqual(
    findArticleRecords(lobby, articles).map((r) => [r.issue, r.gated]),
    [
      [2, true],
      [0, false],
    ],
  );
});

test("monsters are read from game_task.ovl: HP, softest parts, elements, status", () => {
  const task = new OvlFile(buildGameTask());
  const [m] = readGuideMonsters(task, [16, 16]).filter((x) => x.emId === 16);
  assert.ok(m);
  assert.equal(m.hp, fixtureHp(16));
  const sums = m.parts.map((p) => p.cut + p.bash + p.shot);
  assert.deepEqual(
    sums,
    [...sums].sort((a, b) => b - a),
  );
  const rows = Array.from({ length: 7 }, (_, r) => fixtureHitzone(16, 0, r));
  assert.ok(
    m.parts.every((p) =>
      rows.some(([cut, bash, shot]) => cut === p.cut && bash === p.bash && shot === p.shot),
    ),
  );
  assert.ok(m.elements.length > 0);
  const values = m.elements.map((e) => e.value);
  assert.deepEqual(
    values,
    [...values].sort((a, b) => b - a),
  );
  assert.deepEqual(m.status, {
    poison: FIXTURE_TOLERANCES.poison[0],
    sleep: null,
    paralysis: FIXTURE_TOLERANCES.paralysis[0],
    ko: null,
  });
  // Sorted by name; chunks without hitzones are left out.
  const all = readGuideMonsters(task, [1, 2, 16]);
  assert.deepEqual(
    all.map((x) => x.name),
    [...all.map((x) => x.name)].sort((a, b) => a.localeCompare(b)),
  );
});

test("randomize leaves a non-EU disc alone and says why", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  try {
    const game = await loadGame(source, iso, { eboot: null });
    const result = randomize(game, settingsWith("BOOK", [], { "hints.bookshelf": true }));
    const report = result.reports.find((r) => r.title === "Bookshelf monster guide");
    assert.ok(report);
    assert.match(report.notes[0]!, /Not written: .*EU disc/);
    assert.equal(result.edits.files.size, 0);
  } finally {
    source.close();
  }
});
