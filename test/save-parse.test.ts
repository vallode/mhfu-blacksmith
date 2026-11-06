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
  (JSON.parse(fs.readFileSync(path.join(root, "data/items.json"), "utf-8")).items as ItemRecord[]).map(
    (i) => [i.id, i]
  )
);
const name = (id: number) => items.get(id)?.name;

test("decrypts both layers and finds the two hunters", async () => {
  const r = ok(await parse("us"));
  assert.equal(r.decrypted, true);
  const [a, b, c] = r.characters;
  assert.equal(c, null, "slot 3 is empty");
  assert.deepEqual(
    [a, b].map((h) => h && [h.name, h.sex, h.zenny, h.equipTotal, h.itemChest.length, h.itemPouch.length]),
    [
      ["Gideon", "Female", 1223209, 79, 914, 15],
      ["MEARO", "Female", 9999999, 16, 999, 14],
    ]
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
    ]
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
  assert.deepEqual([...placeholders].sort((x, y) => x - y), [128, 465, 875]);
});
