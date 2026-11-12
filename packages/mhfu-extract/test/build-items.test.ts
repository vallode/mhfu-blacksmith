import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mergeItemStats } from "../src/build/items.js";
import { runBuildData } from "../src/cli/build-data.js";

const committed = {
  $comment: "test",
  items: [
    { id: 1, name: "Book of Combos 1", name_jp: "調合書①入門編", rarity: 4 },
    { id: 7, name: "Potion", name_jp: "回復薬", aliases: ["potion"], rarity: 2 },
    { id: 92, name: "Promo Ticket", name_jp: "券", regions: ["jp"] },
    { id: 128, name: "No Coating", name_jp: "なし", placeholder: true as const },
    { id: 1300, name: "Not On Disc", name_jp: "無" },
  ],
};

const disc = [
  { id: 1, name: "Book of Combos 1", rarity: 4, carry: 1, price: 1000, icon: 36, color: 10 },
  { id: 7, name: "Potion", rarity: 1, carry: 10, price: 66, icon: 24, color: 2 },
  { id: 92, name: "Promo Tkt", rarity: 3, carry: 99, price: 0, icon: 37, color: 4 },
  { id: 128, name: "No Coating", rarity: 1, carry: 255, price: 0, icon: 51, color: 10 },
];

test("mergeItemStats writes the disc's stats by ID and keeps everything else", () => {
  const { content, changes, missing } = mergeItemStats(committed, disc);
  assert.equal(content.$comment, "test");
  assert.deepEqual(content.items, [
    {
      id: 1,
      name: "Book of Combos 1",
      name_jp: "調合書①入門編",
      rarity: 4,
      carry: 1,
      price: 1000,
      icon: 36,
      color: 10,
    },
    {
      id: 7,
      name: "Potion",
      name_jp: "回復薬",
      aliases: ["potion"],
      rarity: 1,
      carry: 10,
      price: 66,
      icon: 24,
      color: 2,
    },
    {
      id: 92,
      name: "Promo Ticket",
      name_jp: "券",
      rarity: 3,
      carry: 99,
      price: 0,
      icon: 37,
      color: 4,
      regions: ["jp"],
    },
    committed.items[3],
    committed.items[4],
  ]);
  // Key order: stats after aliases, before regions.
  assert.deepEqual(Object.keys(content.items[2]!), [
    "id",
    "name",
    "name_jp",
    "rarity",
    "carry",
    "price",
    "icon",
    "color",
    "regions",
  ]);
  assert.deepEqual(
    changes.filter((c) => c.before !== undefined),
    [{ id: 7, name: "Potion", field: "rarity", before: 2, after: 1 }],
  );
  assert.equal(changes.filter((c) => c.before === undefined).length, 13);
  assert.deepEqual(missing, [{ id: 1300, name: "Not On Disc" }]);
});

test("mergeItemStats puts the disc's palette before the items, and keeps it when given none", () => {
  const colors = ["#ffffff", "#ff5d5d"];
  const { content } = mergeItemStats(committed, disc, colors);
  assert.deepEqual(Object.keys(content), ["$comment", "colors", "items"]);
  assert.deepEqual(content.colors, colors);
  assert.deepEqual(mergeItemStats(content, disc).content.colors, colors);
});

test("runBuildData writes item stats into data/items.json, and a second run is a no-op", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mhfu-extract-items-"));
  try {
    const data = path.join(root, "data");
    const extracted = path.join(root, "extracted");
    await mkdir(data);
    await mkdir(extracted);
    await writeFile(path.join(data, "items.json"), `${JSON.stringify(committed, null, 2)}\n`);
    await writeFile(path.join(extracted, "items.json"), JSON.stringify({ items: disc }));

    const report = await runBuildData({ extracted, data, only: ["items"] });
    assert.deepEqual(report.items!.filesWritten, ["items.json"]);
    const written = await readFile(path.join(data, "items.json"), "utf-8");
    assert.ok(written.endsWith("}\n"));
    assert.equal(JSON.parse(written).items[1].price, 66);

    const again = await runBuildData({ extracted, data, only: ["items"] });
    assert.deepEqual(again.items!.filesWritten, []);
    assert.deepEqual(again.items!.changes, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
