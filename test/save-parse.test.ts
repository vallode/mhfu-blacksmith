/**
 * Parses a real MHFU save (test/fixtures/MHP2NDG.BIN, a US/EU PPSSPP save that
 * still has the PSP hardware layer) through the site's own save worker, and
 * checks every item ID it contains against data/items.json.
 *
 * The worker is loaded as-is: `self` is stubbed so its `onmessage` handler can
 * be called directly and its `postMessage` result captured.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import type { CharacterResult, WorkerResult } from "../src/hooks/useSaveWorker";
import type { ItemRecord } from "../src/lib/items";

const root = path.resolve(__dirname, "..");
const SAVE = path.join(root, "test/fixtures/MHP2NDG.BIN");

type Message = WorkerResult | { ok: false; error: string };
type Handler = (e: { data: { buffer: ArrayBuffer; region: string } }) => Promise<void>;

let onmessage: Handler;
let lastMessage: Message | null = null;
/** The worker's last result (read through a function so TS doesn't narrow it to null). */
const message = (): Message => {
  assert.ok(lastMessage, "worker posted no result");
  return lastMessage;
};

before(async () => {
  (globalThis as unknown as { self: object }).self = {
    postMessage: (m: Message) => {
      lastMessage = m;
    },
  };
  await import("../public/javascript/save-worker.js");
  onmessage = (globalThis as unknown as { self: { onmessage: Handler } }).self.onmessage;
});

async function parse(region: string): Promise<Message> {
  const buf = fs.readFileSync(SAVE);
  const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  lastMessage = null;
  await onmessage({ data: { buffer, region } });
  assert.ok(lastMessage, "worker posted no result");
  return lastMessage;
}

function ok(m: Message): WorkerResult {
  assert.equal(m.ok, true, m.ok ? "" : (m as { error: string }).error);
  return m as WorkerResult;
}

const items = new Map(
  (
    JSON.parse(fs.readFileSync(path.join(root, "data/items.json"), "utf-8")).items as ItemRecord[]
  ).map((i) => [i.id, i]),
);
const name = (id: number) => items.get(id)?.name;

test("decrypts both layers and finds the two hunters", async () => {
  const r = ok(await parse("us"));
  assert.equal(r.decrypted, true);
  const [a, b, c] = r.characters;
  assert.equal(c, null, "slot 3 is empty");
  assert.deepEqual(
    [a, b].map(
      (h) =>
        h && [
          h.name,
          h.sex,
          h.zenny,
          h.playTime,
          h.equipBox.length,
          h.itemChest.length,
          h.itemPouch.length,
        ],
    ),
    [
      ["Gideon", "Female", 1223209, 19087, 79, 914, 15],
      ["MEARO", "Female", 9999999, 2840, 16, 999, 14],
    ],
  );
});

test("EU uses the same keys as US", async () => {
  const us = ok(await parse("us"));
  const eu = ok(await parse("eu"));
  assert.deepEqual(eu.characters, us.characters);
});

test("pouch items resolve to the expected names", async () => {
  const [gideon] = ok(await parse("us")).characters as CharacterResult[];
  assert.deepEqual(
    gideon.itemPouch.map((s) => [name(s.id), s.qty]),
    [
      ["Potion", 10],
      ["Mega Potion", 10],
      ["Power Juice", 5],
      ["Mega Juice", 5],
      ["Cool Drink", 5],
      ["Hot Drink", 5],
      ["Psychoserum", 3],
      ["Max Potion", 2],
      ["Ancient Potion", 1],
      ["Paralyze Thr Knf", 5],
      ["Paintball", 95],
      ["Flash Bomb", 5],
      ["Farcaster", 1],
      ["Whetstone", 20],
      ["Map", 1],
    ],
  );
});

test("every item ID in the save is in data/items.json", async () => {
  const r = ok(await parse("us"));
  for (const h of r.characters) {
    if (!h) continue;
    for (const s of [...h.itemChest, ...h.itemPouch]) {
      assert.ok(items.has(s.id), `${h.name}: item ID ${s.id} is not in data/items.json`);
      assert.ok(s.qty >= 1 && s.qty <= 99, `${h.name}: item ${s.id} has qty ${s.qty}`);
    }
  }
});

test("the only unnamed IDs are the known placeholders", async () => {
  const r = ok(await parse("us"));
  const placeholders = new Set<number>();
  for (const h of r.characters) {
    for (const s of [...(h?.itemChest ?? []), ...(h?.itemPouch ?? [])]) {
      if (items.get(s.id)?.placeholder) placeholders.add(s.id);
    }
  }
  // This save has every item at x99, so the three padding IDs are in it too.
  assert.deepEqual(
    [...placeholders].sort((x, y) => x - y),
    [128, 465, 875],
  );
});

test("the region is detected from the keys, whatever the hint", async () => {
  assert.equal(ok(await parse("us")).region, "us");
  const r = ok(await parse("jp"));
  assert.equal(r.region, "us", "JP keys fail on a US/EU save, so the other keyset is tried");
  assert.deepEqual(
    r.characters.map((h) => h?.name ?? null),
    ["Gideon", "MEARO", null],
  );
});

test("the region is also detected when only the game layer is left", async () => {
  // Strip the PSP hardware layer first (as PPSSPP's default export does).
  const { decryptPSPLayer } = await import("../public/javascript/save-cipher.js");
  const buf = fs.readFileSync(SAVE);
  const gameOnly: ArrayBuffer = await decryptPSPLayer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    "na",
  );
  assert.equal(gameOnly.byteLength, 0x16a100);

  lastMessage = null;
  await onmessage({ data: { buffer: gameOnly.slice(0), region: "us" } });
  assert.deepEqual(
    ok(message()).characters.map((h) => h?.name ?? null),
    ["Gideon", "MEARO", null],
  );

  lastMessage = null;
  await onmessage({ data: { buffer: gameOnly.slice(0), region: "jp" } });
  assert.equal(ok(message()).region, "us");
});

test("a file no region can decrypt says so", async () => {
  const junk = new Uint8Array(0x16a110);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 2654435761) >>> 24;
  lastMessage = null;
  await onmessage({ data: { buffer: junk.buffer, region: "us" } });
  assert.equal(message().ok, false);
  assert.match(
    (message() as { error: string }).error,
    /couldn't be decrypted with any region's keys/,
  );
});

// Equipment box slots resolve through data/equipment-ids.json (by equip type code).
const equipmentIds = JSON.parse(
  fs.readFileSync(path.join(root, "data/equipment-ids.json"), "utf-8"),
) as Record<string, ({ name: string; type?: string } | null)[]>;
const EQUIP_SLOTS = ["leggings", "helmet", "plate", "gauntlets", "waist", "melee", "ranged"];
const equipName = (s: { type: number; id: number }) =>
  equipmentIds[EQUIP_SLOTS[s.type]]?.[s.id]?.name;

test("every equipment box slot resolves to an item", async () => {
  for (const h of ok(await parse("us")).characters) {
    for (const s of h?.equipBox ?? []) {
      assert.ok(equipName(s), `${h!.name}: equip type ${s.type} ID ${s.id} has no item`);
    }
  }
});

test("equipment IDs line up: a starter kit, and whole armor sets across all five slots", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  // A fresh hunter's box: one bone weapon per class plus the Mafumofu set.
  assert.deepEqual(mearo.equipBox.map(equipName), [
    "Bone Blade",
    "Large Bone",
    "Bone Club",
    "Ivory Horn",
    "Longhorn",
    "Bone Gunlance",
    "Bone Kris",
    "Bone Scythe",
    "Shooter's Barrel",
    "Bone Shooter",
    "Hunter's Bow I",
    "Mafumofu Hood",
    "Mafumofu Jacket",
    "Mafumofu Mittens",
    "Mafumofu Coat",
    "Mafumofu Boots",
  ]);
  // Each slot's ID table is separate, so a misaligned table would break these sets up.
  const armor = gideon.equipBox.filter((s) => s.type <= 4).map(equipName);
  for (const set of [
    [
      "Ucamulbas Mask",
      "Ucamulbas Aegis",
      "Ucamulbas Claw",
      "Ucamulbas Cincture",
      "Ucamulbas Hessian",
    ],
    [
      "Empress Crown X",
      "Empress Mail X",
      "Empress Vambraces X",
      "Empress Tasset X",
      "Empress Greaves X",
    ],
    [
      "Dark Akantor Mask",
      "Dark Akantor Aegis",
      "Dark Akantor Claw",
      "DarkAkantor Cincture",
      "Dark Akantor Hessian",
    ],
  ]) {
    for (const piece of set)
      assert.ok(armor.includes(piece), `Gideon's box should include ${piece}`);
  }
});

// Decorations: bytes 6–11 of each equipment slot hold up to three jewel item IDs.
const decorationSlots = new Map(
  (
    JSON.parse(fs.readFileSync(path.join(root, "data/decorations.json"), "utf-8")).decorations as {
      name: string;
      slots: number;
    }[]
  ).map((d) => [d.name, Number(d.slots)]),
);
/** Slot count of an equipment box piece, from data/weapons or data/armor. */
const pieceSlots = (() => {
  const bySlot = new Map<string, Map<string, number>>();
  const add = (key: string, entries: { name: string; slots?: number | string }[]) => {
    const m = bySlot.get(key) ?? new Map<string, number>();
    for (const e of entries) m.set(e.name, Number(e.slots ?? 0));
    bySlot.set(key, m);
  };
  for (const f of fs.readdirSync(path.join(root, "data/weapons"))) {
    const weapons = JSON.parse(
      fs.readFileSync(path.join(root, "data/weapons", f), "utf-8"),
    ).weapons;
    add("melee", weapons);
    add("ranged", weapons);
  }
  for (const slot of ["leggings", "helmet", "plate", "gauntlets", "waist"]) {
    add(
      slot,
      JSON.parse(fs.readFileSync(path.join(root, "data/armor", `${slot}.json`), "utf-8")).armor,
    );
  }
  return (s: { type: number; id: number }) => bySlot.get(EQUIP_SLOTS[s.type])?.get(equipName(s)!);
})();

test("decorations decode as jewel item IDs", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  // This save's only decorations: two Grinder Jewels in each 2-slot Ucamulbas
  // blademaster piece and in Master's Blade G.
  const decorated = gideon.equipBox
    .filter((s) => s.decorations?.length)
    .map((s) => [equipName(s), s.decorations!.map(name)]);
  assert.deepEqual(decorated, [
    ["Ucamulbas Mask", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Aegis", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Claw", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Cincture", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Hessian", ["Grinder Jewel", "Grinder Jewel"]],
    ["Master's Blade G", ["Grinder Jewel", "Grinder Jewel"]],
  ]);
  assert.ok(
    mearo.equipBox.every((s) => s.decorations?.length === 0),
    "MEARO's gear has no decorations",
  );
});

test("every decoration is a known jewel and the jewels fit the piece's slots", async () => {
  for (const h of ok(await parse("us")).characters) {
    for (const s of h?.equipBox ?? []) {
      let used = 0;
      for (const id of s.decorations ?? []) {
        const jewel = name(id);
        assert.ok(
          jewel && decorationSlots.has(jewel),
          `${h!.name}: ${equipName(s)} holds item ${id} (${jewel}), not a decoration`,
        );
        used += decorationSlots.get(jewel)!;
      }
      const slots = pieceSlots(s);
      assert.ok(slots !== undefined, `${equipName(s)}: slot count not found`);
      assert.ok(
        used <= slots,
        `${h!.name}: ${equipName(s)} has ${slots} slots but ${used} slots of jewels`,
      );
    }
  }
});
