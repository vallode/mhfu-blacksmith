import assert from "node:assert/strict";
import { test } from "node:test";
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  CHOICE_TOTAL,
  ROOT_TABLES,
  favourAttacks,
  findChoices,
  leanTowardsAttacks,
  makeMonstersAggressive,
  matchesAttackData,
  parseMixed,
  rerollWeights,
  weightHash,
  scriptOverlay,
  splitWeights,
} from "../src/shuffles/monster-ai.js";
import { MONSTER_ATTACKS } from "../src/shuffles/monster-attacks.js";
import type { Edits } from "../src/edits.js";
import type { LoadedOverlay } from "../src/game/load.js";
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

test("a monster's scripts go to its own or family overlay first, else the only one that reads", () => {
  const file = (index: number) => ({ index }) as unknown as LoadedOverlay;
  const em17 = file(17);
  const em83 = file(83);
  const em01 = file(1);
  const overlays = new Map([
    [1, em01],
    [17, em17],
    [83, em83],
  ]);
  const both = (f: LoadedOverlay) => f === em17 || f === em83;
  // Basarios (22) and Black Gravios (47) read in em17 and em83; Gravios's em17 is theirs.
  assert.deepEqual(scriptOverlay(22, overlays, both), [17, em17]);
  assert.deepEqual(scriptOverlay(47, overlays, both), [17, em17]);
  // Anyone else reading in two is left alone; reading in one takes that one.
  assert.equal(scriptOverlay(7, overlays, both), null);
  assert.deepEqual(
    scriptOverlay(7, overlays, (f) => f === em83),
    [83, em83],
  );
  // The own overlay wins even when another reads too.
  assert.deepEqual(
    scriptOverlay(1, overlays, () => true),
    [1, em01],
  );
  assert.equal(
    scriptOverlay(1, overlays, () => false),
    null,
  );
});

test("favouring attacks makes them likelier, keeps 32 and keeps every move possible", () => {
  assert.deepEqual(favourAttacks([16, 16], "A-", 4), [26, 6]);
  assert.deepEqual(favourAttacks([16, 16], "A-", 1), [16, 16]);
  for (const factor of [2, 4]) {
    const before = [1, 20, 0, 6, 5];
    const after = favourAttacks(before, "A-A-A", factor);
    assert.equal(
      after.reduce((s, w) => s + w, 0),
      CHOICE_TOTAL,
    );
    before.forEach((w, k) => assert.equal(after[k]! > 0, w > 0));
    assert.ok(after[0]! + after[4]! > before[0]! + before[4]!);
  }
});

test("attack data is applied only to the scripts it was made from", () => {
  const { buf, ovl, root } = script();
  const choices = findChoices(ovl, [root]);
  const known = { choices: 2, hash: weightHash(choices), mixed: "0:-A-A 1:-A" };
  assert.deepEqual(
    parseMixed(known.mixed),
    new Map([
      [0, "-A-A"],
      [1, "-A"],
    ]),
  );
  assert.ok(matchesAttackData(choices, known));
  assert.ok(!matchesAttackData(choices, { ...known, hash: "00000000" }));
  assert.ok(!matchesAttackData(choices.slice(1), known));
  // The same weights with an entry in another place don't match either.
  const moved = choices.map((c, i) => (i ? c : { ...c, weightAt: c.weightAt.map((at) => at + 1) }));
  assert.ok(!matchesAttackData(moved, known));

  assert.deepEqual(
    leanTowardsAttacks(choices, buf, known, 4),
    new Set(choices.map((c) => c.offset)),
  );
  const after = findChoices(ovl, [root]).map((c) => c.weights);
  assert.deepEqual(after, [
    favourAttacks([8, 4, 14, 6], "-A-A", 4),
    favourAttacks([24, 8], "-A", 4),
  ]);
  // It leans the weights as they now are, so applying it twice leans further.
  leanTowardsAttacks(choices, buf, known, 4);
  assert.ok(findChoices(ovl, [root])[1]!.weights[1]! > after[1]![1]!);
});

test("the attack data reads: every mixed choice has attacks and other moves", () => {
  let total = 0;
  for (const [name, known] of Object.entries(MONSTER_ATTACKS)) {
    assert.match(name, /^(game_task|em\d\d)\.ovl$/);
    for (const [index, kinds] of parseMixed(known.mixed)) {
      assert.ok(index < known.choices, `${name} ${index}`);
      assert.match(kinds, /^[A-]+$/);
      assert.ok(kinds.includes("A") && kinds.includes("-"), `${name} ${index}`);
      total++;
    }
  }
  assert.equal(total, 2156);
});

test("a disc the attack data wasn't made from is left alone, with a warning in the log line", () => {
  const { ovl, root } = script();
  const file = { index: 1, ovl } as LoadedOverlay;
  const scripts = {
    files: [
      {
        file,
        name: "em01.ovl",
        roots: [root],
        emIds: [1],
        rootsBy: new Map([[1, [root]]]),
        choices: findChoices(ovl, [root]),
      },
    ],
    unknown: [],
  };
  const known = {
    "em01.ovl": { choices: 2, hash: "00000000", mixed: "1:-A" },
    "em02.ovl": { choices: 1, hash: "00000000", mixed: "0:-A" },
  };
  const report = makeMonstersAggressive("more", {} as Edits, scripts, String, known);
  // em01 doesn't match; em02 isn't among this disc's scripts at all.
  assert.match(
    report.summary ?? "",
    /^Monster aggression: 0 choices; warning: left alone.*em01\.ovl, em02\.ovl$/,
  );
});
