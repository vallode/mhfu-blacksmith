import assert from "node:assert/strict";
import { test } from "node:test";
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  CHOICE_TOTAL,
  ROOT_TABLES,
  findChoices,
  rerollWeights,
  splitWeights,
} from "../src/shuffles/monster-ai.js";
import { Rng } from "../src/rng.js";

const BASE = 0x09a5f200;

/** A made-up script: a sub-script, then a choice of 4 and a choice of 2, under one root. */
function script() {
  const buf = Buffer.alloc(0x200);
  const at = (o: number, hex: string) => Buffer.from(hex.replace(/\s+/g, ""), "hex").copy(buf, o);
  at(0x80, "05 03 02 00 ff");
  at(
    0x90,
    [
      "80 00 04",
      "80 01 08 82 04 01",
      "80 02 04 05 01 02 00 05 03 05 00",
      "80 03 0e 05 01 01 00",
      "80 04 06 05 00 0c 00",
      "80 ff",
      "80 00 02",
      "80 01 18 05 03 00 00",
      "80 02 08 05 03 07 00",
      "80 ff ff",
    ].join(" "),
  );
  const v = (o: number) => BASE + o;
  // Tables at 0x100: the state table (one entry), then the 82 04 table.
  buf.writeUInt32LE(v(0x90), 0x100);
  buf.writeUInt32LE(0, 0x104);
  buf.writeUInt32LE(v(0x80), 0x108);
  const root = 0x110;
  for (let i = 0; i < ROOT_TABLES; i++) buf.writeUInt32LE(0, root + i * 4);
  buf.writeUInt32LE(v(0x100), root);
  buf.writeUInt32LE(v(0x104), root + (15 + 4) * 4);
  const ovl = {
    loadBase: BASE,
    reader: { buf },
    vaddrToOffset: (x: number) => x - BASE,
    isOwnVaddr: (x: number) => x - BASE >= 0x80 && x - BASE < buf.length,
  } as unknown as OvlFile;
  return { buf, ovl, root: v(root) };
}

test("weighted choices under a root are found with their weights", () => {
  const { ovl, root } = script();
  const choices = findChoices(ovl, [root]);
  assert.deepEqual(
    choices.map((c) => c.weights),
    [
      [8, 4, 14, 6],
      [24, 8],
    ],
  );
  assert.deepEqual(choices[0]!.weightAt, [0x95, 0x9b, 0xa6, 0xad]);
});

test("a choice whose weights don't add up to 32 is left out", () => {
  const { buf, ovl, root } = script();
  buf[0x95] = 9;
  assert.equal(findChoices(ovl, [root]).length, 1);
});

test("splitting keeps the total and the proportions", () => {
  assert.deepEqual(splitWeights([14, 6], 10), [7, 3]);
  assert.deepEqual(splitWeights([0, 4], 3), [0, 3]);
  assert.equal(
    splitWeights([5, 5, 3, 2], 13).reduce((s, w) => s + w, 0),
    13,
  );
});

test("rerolled weights add up to 32; possible entries stay possible, impossible ones stay so", () => {
  const rng = new Rng("ai");
  const spread = 0.95;
  const before = [14, 1, 0, 8, 3, 3, 1, 2];
  for (let i = 0; i < 500; i++) {
    const after = rerollWeights(before, () => 1 - spread + 2 * spread * rng.float());
    assert.equal(
      after.reduce((s, w) => s + w, 0),
      CHOICE_TOTAL,
    );
    before.forEach((w, k) => assert.equal(after[k]! > 0, w > 0));
  }
});

test("with no spread, weights stay as they were", () => {
  assert.deepEqual(
    rerollWeights([12, 7, 7, 2, 4], () => 1),
    [12, 7, 7, 2, 4],
  );
});
