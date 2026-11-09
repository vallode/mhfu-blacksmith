import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "../../mhfu-extract/src/container/image.js";
import { parseOvl } from "../../mhfu-extract/src/container/ovl.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { ESSENTIALS, findShops } from "../src/shuffles/shops.js";
import {
  buildFixtureDisc,
  buildLobbyTask,
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
