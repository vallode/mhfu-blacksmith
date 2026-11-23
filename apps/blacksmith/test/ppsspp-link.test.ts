/**
 * The PPSSPP link's hunter check and search (src/lib/ppsspp-link.ts), and the
 * save worker's parse of one hunter block, against the fixture save's first
 * hunter: the game keeps the loaded hunter in RAM as that same block.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import type { WorkerResult } from "../src/hooks/useSaveWorker";
import { HUNTER_SIZE, findHunters, looksLikeHunter, regionForGame } from "../src/lib/ppsspp-link";

const root = path.resolve(__dirname, "..");
const SAVE = path.join(root, "test/fixtures/MHP2NDG.BIN");
const FIRST_HUNTER = 0x1000;

type Message = WorkerResult | { ok: false; error: string };
type Handler = (e: {
  data: { buffer: ArrayBuffer; region: string; block?: boolean };
}) => Promise<void>;

let onmessage: Handler;
let lastMessage: Message | null = null;
let plaintext: Uint8Array;

const arrayBuffer = (b: Uint8Array) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function post(data: Parameters<Handler>[0]["data"]): Promise<WorkerResult> {
  lastMessage = null;
  await onmessage({ data });
  const m = lastMessage as Message | null;
  assert.ok(m, "worker posted no result");
  assert.equal(m.ok, true, m.ok ? "" : m.error);
  return m as WorkerResult;
}

before(async () => {
  (globalThis as unknown as { self: object }).self = {
    postMessage: (m: Message) => {
      lastMessage = m;
    },
  };
  await import("../public/javascript/save-worker.js");
  onmessage = (globalThis as unknown as { self: { onmessage: Handler } }).self.onmessage;
  const { decryptPSPLayer, decryptGameLayer } = await import("../public/javascript/save-cipher.js");
  const game = await decryptPSPLayer(arrayBuffer(fs.readFileSync(SAVE)), "na");
  plaintext = new Uint8Array(await decryptGameLayer(game, "na"));
});

const hunterBlock = () => plaintext.slice(FIRST_HUNTER, FIRST_HUNTER + HUNTER_SIZE);

test("a save's hunter block looks like a hunter; an empty one doesn't", () => {
  assert.equal(looksLikeHunter(hunterBlock()), true);
  assert.equal(looksLikeHunter(new Uint8Array(HUNTER_SIZE)), false);
  const renamed = hunterBlock();
  renamed[0] = 0x01; // a control character can't be typed into a name
  assert.equal(looksLikeHunter(renamed), false);
});

test("findHunters finds the block in a stretch of memory", () => {
  const memory = new Uint8Array(0x200000);
  for (let i = 0; i < memory.length; i += 97) memory[i] = i & 0xff;
  memory.set(hunterBlock(), 0x40000);
  assert.deepEqual(findHunters(memory), [0x40000]);
});

test("the worker parses a hunter block as the save's first slot", async () => {
  const fromFile = await post({ buffer: arrayBuffer(fs.readFileSync(SAVE)), region: "us" });
  const fromBlock = await post({ buffer: arrayBuffer(hunterBlock()), region: "us", block: true });
  assert.equal(fromBlock.characters.length, 1);
  assert.ok(fromFile.characters[0]);
  assert.deepEqual(fromBlock.characters[0], fromFile.characters[0]);
});

test("the worker refuses a block of the wrong size", async () => {
  lastMessage = null;
  await onmessage({ data: { buffer: new ArrayBuffer(16), region: "us", block: true } });
  const m = lastMessage as Message | null;
  assert.equal(m?.ok, false);
});

test("regionForGame", () => {
  assert.equal(regionForGame("ULJM05500"), "jp");
  assert.equal(regionForGame("ULES01213"), "us");
  assert.equal(regionForGame("ULUS10391"), "us");
});
