import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "../../mhfu-extract/src/container/image.js";
import { parseOvl } from "../../mhfu-extract/src/container/ovl.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { needsEboot } from "../src/settings.js";
import { ESSENTIALS, findShops, locateItemTable } from "../src/shuffles/shops.js";
import {
  buildFixtureDisc,
  buildLobbyTask,
  FIXTURE_ITEM_PRICES,
  FIXTURE_ITEM_STACKS,
  FIXTURE_SHOP_LISTS,
  FIXTURE_SHOP_TABLES,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

const lobby = buildLobbyTask();

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: null });
  return { game, close: () => source.close() };
}

/** Each named list as it reads in an edited lobby_task.ovl. */
function listsIn(buf: Buffer): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [name, items] of Object.entries(FIXTURE_SHOP_LISTS)) {
    out[name] = items.map((_, i) => buf.readUInt16LE(lobby.listAt[name]! + i * 2));
  }
  return out;
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** `count` pointer tables (each ending in a 0 word) from `at`, and the 0xFFFF-ended lists they point at. */
function readTablesAt(ovl: ReturnType<typeof parseOvl>, at: number, count: number) {
  const r = ovl.reader;
  const lists = new Map<number, { offset: number; items: number[] }>();
  const tables: { lists: number[] }[] = [];
  for (let t = 0; t < count; t++) {
    const offsets: number[] = [];
    for (; r.u32(at) !== 0; at += 4) {
      const offset = ovl.vaddrToOffset(r.u32(at));
      const items: number[] = [];
      for (let p = offset; r.u16(p) !== 0xffff; p += 2) items.push(r.u16(p));
      lists.set(offset, { offset, items });
      offsets.push(offset);
    }
    at += 4;
    tables.push({ lists: offsets });
  }
  return { tables, lists };
}

test("findShops reads every table next to the general store's, and names them", () => {
  const data = findShops(parseOvl(lobby.buf));
  assert.deepEqual(
    data.tables.map((t) => [
      t.name,
      t.lists.map((o) => data.lists.get(o)!.items.length),
      t.special,
    ]),
    [
      ["Village general store", [7, 9, 0], false],
      ["Peddler", [3, 4, 5], false],
      ["Guild Hall store", [4, 5], false],
      ["Sphere and jewel shop", [1, 3], true],
    ],
  );
  assert.equal(data.tables[0]!.at, lobby.tablesAt);
  assert.equal(data.tables.length, FIXTURE_SHOP_TABLES.length);
});

test("each shop swaps its own items consistently; essentials and the special shop stay", async () => {
  const { game, close } = await load();
  for (const seed of ["a", "b", "c"]) {
    const result = randomize(game, settingsWith(seed, ["shops"]));
    const after = listsIn(result.edits.overlay(game.lobbyTask));
    const before = FIXTURE_SHOP_LISTS;

    // Later stages still start with the earlier stage's (swapped) stock.
    assert.deepEqual(after.village2!.slice(0, before.village1!.length), after.village1);
    assert.deepEqual(after.guild2!.slice(0, before.guild1!.length), after.guild1);
    // Lengths, and each group's stock as a whole, are unchanged.
    const group = (l: Record<string, number[]>, names: string[]) =>
      sorted([...new Set(names.flatMap((n) => l[n]!))]);
    assert.deepEqual(
      group(after, ["village1", "village2"]),
      group(before, ["village1", "village2"]),
    );
    const shared = ["granny1", "granny2", "guild1", "guild2"];
    assert.deepEqual(group(after, shared), group(before, shared), "granny and Guild share a list");
    for (const [name, items] of Object.entries(before)) {
      items.forEach((v, i) => {
        if (ESSENTIALS.includes(v))
          assert.equal(after[name]![i], v, `${name}: essential ${v} kept`);
      });
    }
    assert.deepEqual(after.special2, before.special2);
    assert.deepEqual(after.empty, []);
  }
  close();
});

test("mixing across shops and including the special shop", async () => {
  const { game, close } = await load();
  let crossed = false;
  let specialChanged = false;
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const s = settingsWith(seed, ["shops"], {
      "shops.mix": "all",
      "shops.special": true,
      "shops.keepEssentials": false,
    });
    const after = listsIn(randomize(game, s).edits.overlay(game.lobbyTask));
    const village = new Set([...FIXTURE_SHOP_LISTS.village1!, ...FIXTURE_SHOP_LISTS.village2!]);
    if (after.village2!.some((v) => !village.has(v))) crossed = true;
    if (after.special2!.join() !== FIXTURE_SHOP_LISTS.special2!.join()) specialChanged = true;
    // One swap everywhere: the same item maps to the same item in every list.
    const sigma = new Map<number, number>();
    for (const [name, items] of Object.entries(FIXTURE_SHOP_LISTS)) {
      items.forEach((v, i) => {
        const now = after[name]![i]!;
        assert.equal(sigma.get(v) ?? now, now, `${v} maps to one item`);
        sigma.set(v, now);
      });
    }
  }
  assert.ok(crossed, "some village stock comes from other shops");
  assert.ok(specialChanged);
  close();
});

test("shops can sell items from wider pools, consistently across stages", async () => {
  const { game, close } = await load();
  const vanilla = new Set(Object.values(FIXTURE_SHOP_LISTS).flat());
  let outside = 0;
  for (const seed of ["a", "b", "c", "d"]) {
    const s = settingsWith(seed, ["shops"], { "shops.pool": "any" });
    const after = listsIn(randomize(game, s).edits.overlay(game.lobbyTask));
    assert.deepEqual(after.village2!.slice(0, 7), after.village1, "stages stay consistent");
    for (const [name, items] of Object.entries(FIXTURE_SHOP_LISTS)) {
      items.forEach((v, i) => {
        if (ESSENTIALS.includes(v)) assert.equal(after[name]![i], v);
      });
      outside += after[name]!.filter((v) => !vanilla.has(v)).length;
    }
  }
  assert.ok(outside > 0, "some stock comes from outside the shops");

  // Low Rank pool: shop items, or items first found in Low Rank (fixture items 1xx).
  const low = randomize(
    game,
    settingsWith("low", ["shops"], { "shops.pool": "low", "shops.mix": "all" }),
  );
  const sources = low.sources.tiers;
  for (const v of Object.values(listsIn(low.edits.overlay(game.lobbyTask))).flat()) {
    assert.ok(vanilla.has(v) || sources.get(v)?.band === "low", `item ${v} isn't from the pool`);
  }
  close();
});

test("item counts scale every stage of a shop alike, and the lists are rewritten and repointed", async () => {
  const { game, close } = await load();
  for (const seed of ["a", "b", "c", "d", "e"]) {
    const s = settingsWith(seed, ["shops"], { "shops.countSpread": 0.9, "shops.pool": "any" });
    const result = randomize(game, s);
    const edited = parseOvl(result.edits.overlay(game.lobbyTask));
    // Read the edited tables where they are (findShops looks for the vanilla store).
    const data = readTablesAt(edited, lobby.tablesAt, FIXTURE_SHOP_TABLES.length);
    const before = findShops(parseOvl(lobby.buf));
    assert.equal(data.tables.length, before.tables.length);
    const lengths = data.tables.map((t) => t.lists.map((o) => data.lists.get(o)!.items.length));
    const [village, , guild, special] = lengths;
    assert.ok(village![1]! >= village![0]!, "later stages sell at least as much");
    assert.ok(guild![1]! >= guild![0]!);
    assert.equal(village![2], 0, "the empty list stays empty");
    assert.deepEqual(special, [1, 3], "the special shop is untouched");
    for (const list of data.lists.values()) {
      assert.ok(list.items.length <= 9, "no list longer than the longest on the disc");
    }
    // Stage 1's items are all still sold at stage 2.
    const [v1, v2] = data.tables[0]!.lists.map((o) => data.lists.get(o)!.items);
    for (const v of v1!) assert.ok(v2!.includes(v), `stage 2 still sells ${v}`);
    // The shared Guild list is one list, used by both tables.
    assert.equal(data.tables[1]!.lists[2], data.tables[2]!.lists[1]);
  }
  close();
});

test("lists won't be rewritten over anything that isn't a shop list", async () => {
  const { game, close } = await load();
  const buf = game.dataBin.read(game.lobbyTask.index);
  const gap = lobby.listAt.empty! + 2; // the padding after the empty list
  const saved = buf.readUInt16LE(gap);
  buf.writeUInt16LE(0x1234, gap);
  try {
    const s = settingsWith("x", ["shops"], { "shops.countSpread": 0.5 });
    assert.throws(() => randomize(game, s), /something other than shop lists/);
  } finally {
    buf.writeUInt16LE(saved, gap);
    close();
  }
});

test("prices and carry limits: the price field is found on the disc and only shop items change", async () => {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  const table = locateItemTable(game.eboot!, undefined);
  assert.equal(table.priceField, 12);

  const s = settingsWith("p", ["shops"], {
    "shops.prices": true,
    "shops.priceSpread": 0.5,
    "shops.stacks": true,
    "shops.stackSpread": 0.5,
  });
  const result = randomize(game, s);
  const eboot = result.edits.eboot();
  const at = (id: number) => table.base + id * 24;
  let changed = 0;
  for (const [id, price] of FIXTURE_ITEM_PRICES) {
    const now = eboot.readUInt32LE(at(id) + 12);
    assert.ok(
      now >= Math.round(price * 0.5) && now <= Math.round(price * 1.5),
      `${id}: ${price} -> ${now}`,
    );
    if (now !== price) changed++;
    assert.equal(
      eboot.readUInt32LE(at(id) + 8),
      Math.floor(price / 10),
      "the other price field stays",
    );
  }
  assert.ok(changed > 0);
  for (const [id, stack] of FIXTURE_ITEM_STACKS) {
    const now = eboot[at(id) + 3]!;
    assert.ok(now >= 1 && now <= Math.round(stack * 1.5) + 1, `${id}: ${stack} -> ${now}`);
  }
  // Not sold anywhere in the fixture: untouched.
  assert.equal(eboot.readUInt32LE(at(999) + 12), game.eboot!.readUInt32LE(at(999) + 12));

  // Item 300 (sold in the village store's second stage) had no price: it gets one from its
  // rarity (0 here, so 100z), before the variation.
  const plain = randomize(game, settingsWith("p", ["shops"]));
  assert.equal(plain.edits.eboot().readUInt32LE(at(300) + 12), 100);
  assert.match(plain.reports[0]!.notes.join(" "), /\d+ items had no price/);

  // A disc whose prices don't match is refused, not edited.
  const wrong = Buffer.from(game.eboot!);
  wrong.writeUInt32LE(65, at(7) + 12);
  assert.throws(
    () => locateItemTable(wrong, undefined),
    /Couldn't confirm the item table's price field/,
  );
  source.close();
});

test("price and carry limit settings only need the EBOOT when shops are on", () => {
  const off = settingsWith("n", [], { "shops.prices": true });
  assert.equal(needsEboot(off), false);
  assert.equal(needsEboot(settingsWith("n", ["shops"], { "shops.prices": true })), true);
  assert.equal(needsEboot(settingsWith("n", ["shops"])), false);
});
