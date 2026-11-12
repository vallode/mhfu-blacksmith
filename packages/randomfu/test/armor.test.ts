import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { ARMOR_SLOTS, type ArmorSlot } from "mhfu-extract/src/tables/armor.js";
import { EQUIP_CREATE_ENTRY_SIZE } from "mhfu-extract/src/tables/offsets.js";
import { equipmentCreateLayout } from "mhfu-extract/src/tables/recipes.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { formatSpoiler } from "../src/spoiler.js";
import {
  buildFixtureDisc,
  buildLobbyTask,
  FIXTURE_ARMOR,
  FIXTURE_STORE_LISTS,
  FIXTURE_ARMOR_CREATE,
  FIXTURE_RECIPES,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  return { game, close: () => source.close() };
}

/** Every armor create entry the fixture fills: [slot, entry index]. */
const ENTRIES: [ArmorSlot, number][] = [
  ...FIXTURE_RECIPES.map((r): [ArmorSlot, number] => ["head", r.index]),
  ...Object.entries(FIXTURE_ARMOR_CREATE).flatMap(([slot, entries]) =>
    entries.map(([entry]): [ArmorSlot, number] => [slot as ArmorSlot, entry]),
  ),
];

/** Offsets of the armor create entries' `equipId` fields: the only bytes the shuffle may change. */
function equipIdOffsets(eboot: Buffer): Set<number> {
  const layout = equipmentCreateLayout(new BinaryReader(eboot));
  const out = new Set<number>();
  for (const slot of ARMOR_SLOTS) {
    for (let i = 0; i < layout[slot].count; i++) {
      const at = layout[slot].offset + i * EQUIP_CREATE_ENTRY_SIZE + 2;
      out.add(at);
      out.add(at + 1);
    }
  }
  return out;
}

/** Each filled entry's piece and the rest of its bytes (materials and all). */
function entries(eboot: Buffer): { slot: ArmorSlot; piece: number; rest: string }[] {
  const layout = equipmentCreateLayout(new BinaryReader(eboot));
  return ENTRIES.map(([slot, entry]) => {
    const at = layout[slot].offset + entry * EQUIP_CREATE_ENTRY_SIZE;
    const bytes = Buffer.from(eboot.subarray(at, at + EQUIP_CREATE_ENTRY_SIZE));
    bytes.writeUInt16LE(0, 2);
    return { slot, piece: eboot.readUInt16LE(at + 2), rest: bytes.toString("hex") };
  });
}

const piece = (slot: ArmorSlot, index: number) =>
  FIXTURE_ARMOR.find((a) => a.slot === slot && a.index === index);

/** σ per slot, read off the create entries; checks it's one consistent permutation. */
function substitution(before: Buffer, after: Buffer): Map<string, number> {
  const was = entries(before);
  const now = entries(after);
  const sigma = new Map<string, number>();
  was.forEach((e, i) => {
    const key = `${e.slot}:${e.piece}`;
    assert.equal(now[i]!.rest, e.rest, `${e.slot} entry ${i} keeps its materials`);
    assert.equal(sigma.get(key) ?? now[i]!.piece, now[i]!.piece, `${key}: one substitution`);
    sigma.set(key, now[i]!.piece);
  });
  for (const slot of ARMOR_SLOTS) {
    const from = [...sigma].filter(([k]) => k.startsWith(`${slot}:`));
    const pieces = (xs: number[]) => xs.sort((a, b) => a - b);
    assert.deepEqual(
      pieces(from.map(([, v]) => v)),
      pieces(from.map(([k]) => Number(k.split(":")[1]))),
      `${slot}: a permutation of the pieces the smithy makes`,
    );
  }
  return sigma;
}

test("armor: each place gets a piece of the same slot, rarity, hunter type and sex", async () => {
  const { game, close } = await load();
  const before = game.eboot!;
  const editable = equipIdOffsets(before);
  const moved = new Set<string>();
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const result = randomize(game, settingsWith(seed, ["armor"]));
    const after = result.edits.eboot();
    const sigma = substitution(before, after);
    for (const [key, to] of sigma) {
      const [slot, index] = key.split(":") as [ArmorSlot, string];
      const from = piece(slot, Number(index))!;
      const now = piece(slot, to)!;
      assert.equal(now.rarity, from.rarity, `${key} -> ${to}: rarity`);
      assert.equal(now.hunterType, from.hunterType, `${key} -> ${to}: hunter type and sex`);
      if (to !== from.index) moved.add(`${key}->${to}`);
    }
    // Left alone: piece 9 (in no create entry) and pieces 10 and 11 (no HunterType bits).
    const head = [...sigma].filter(([k]) => k.startsWith("head:")).map(([, v]) => v);
    assert.ok(!head.includes(9), "a piece no create entry makes never gets a place");
    assert.equal(sigma.get("head:10"), 10);
    assert.equal(sigma.get("head:11"), 11);
    assert.equal(sigma.get("head:7"), 7, "the only female-only piece of its rarity stays");

    // Nothing but create entries' equipIds changes (prices, stats, unused entries, weapons).
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) assert.ok(editable.has(i), `byte ${i} changed`);
    }
    const report = result.reports.find((r) => r.title === "Armor progression")!;
    const changed = [...sigma].filter(([k, v]) => Number(k.split(":")[1]) !== v);
    assert.equal(
      report.lines.filter((l) => !l.where.startsWith("Armor store")).length,
      changed.length,
      "one spoiler line per moved piece",
    );
  }
  // Every exchangeable pair moves in some seed.
  for (const pair of ["head:6->8", "head:3->4", "chest:1->3", "chest:2->4", "leg:1->2"]) {
    assert.ok(moved.has(pair), pair);
  }
  close();
});

test("armor: the spoiler lists places by slot and rarity; output is deterministic", async () => {
  const { game, close } = await load();
  const s = settingsWith("spoiler", ["armor"]);
  const a = randomize(game, s);
  const b = randomize(game, s);
  assert.equal(formatSpoiler(game, s, a), formatSpoiler(game, s, b));
  assert.ok(a.edits.eboot().equals(b.edits.eboot()));

  const report = a.reports.find((r) => r.title === "Armor progression")!;
  const places = report.lines.filter((l) => !l.where.startsWith("Armor store"));
  assert.ok(
    report.lines.slice(places.length).every((l) => l.where.startsWith("Armor store")),
    "the store after the places",
  );
  const order = ["Head", "Chest", "Arms", "Waist", "Legs"];
  const keys = places.map((l) => {
    const [slot, rarity] = l.where.split(", rarity ");
    return order.indexOf(slot!) * 100 + Number(rarity);
  });
  assert.deepEqual(
    keys,
    [...keys].sort((x, y) => x - y),
    "grouped by slot, then rarity",
  );
  assert.ok(places.length > 0);
  assert.ok(places.every((l) => / -> /.test(l.text)));
  close();
});

test("armor draws its own random stream: other shuffles give the same result with it on", async () => {
  const { game, close } = await load();
  for (const seed of ["x", "y"]) {
    const alone = randomize(game, settingsWith(seed, ["armor"]));
    const all = randomize(game, settingsWith(seed, ["armor", "weapons", "recipes"]));
    const weaponsOnly = randomize(game, settingsWith(seed, ["weapons"]));
    // Same pieces in every place (the recipe shuffle changes materials, not pieces).
    assert.deepEqual(
      entries(all.edits.eboot()).map((e) => e.piece),
      entries(alone.edits.eboot()).map((e) => e.piece),
    );
    const lines = (r: typeof all, title: string) => r.reports.find((x) => x.title === title)!.lines;
    assert.deepEqual(lines(all, "Weapon progression"), lines(weaponsOnly, "Weapon progression"));
    assert.deepEqual(lines(all, "Armor progression"), lines(alone, "Armor progression"));
    assert.deepEqual(all.problems, []);
  }
  close();
});

test("armor: the smithy's store sells the piece now in each sold piece's places", async () => {
  const { game, close } = await load();
  const { storeAt } = buildLobbyTask();
  const slotOf: Record<number, ArmorSlot> = {
    0: "leg",
    1: "head",
    2: "chest",
    3: "arm",
    4: "waist",
  };
  const storeIn = (buf: Buffer, name: string) =>
    FIXTURE_STORE_LISTS[name]!.map((_, k) => [
      buf.readUInt16LE(storeAt[name]! + k * 4),
      buf.readUInt16LE(storeAt[name]! + k * 4 + 2),
    ]);
  let movedAny = false;
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const result = randomize(game, settingsWith(seed, ["armor"]));
    const sigma = substitution(game.eboot!, result.edits.eboot());
    const lobby = result.edits.overlay(game.lobbyTask);
    const expected = FIXTURE_STORE_LISTS.armor!.map(([category, id]) => [
      category,
      sigma.get(`${slotOf[category]}:${id}`) ?? id,
    ]);
    assert.deepEqual(storeIn(lobby, "armor"), expected, seed);
    assert.equal(storeIn(lobby, "armor")[2]![1], 9, "a piece the smithy doesn't make stays");
    assert.deepEqual(storeIn(lobby, "weapons2"), FIXTURE_STORE_LISTS.weapons2, "weapons untouched");
    if (expected.some(([, id], k) => id !== FIXTURE_STORE_LISTS.armor![k]![1])) movedAny = true;
    const lines = result.reports
      .find((r) => r.title === "Armor progression")!
      .lines.filter((l) => l.where.startsWith("Armor store"));
    assert.equal(lines.length, 3);
  }
  assert.ok(movedAny, "some seed changes what the store sells");
  close();
});
