import assert from "node:assert/strict";
import { test } from "node:test";
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  CHOICE_TOTAL,
  ROOT_TABLES,
  AREA_TIMES_CAP,
  AREA_TIMES_OFFSET,
  ENGAGED_FRAMES_OFFSET,
  favourAttacks,
  findChoices,
  keepInReach,
  keepMonstersInReach,
  leanTowardsAttacks,
  leanTowardsReach,
  lengthenAreaTimes,
  lengthenEngagement,
  readAreaTimes,
  makeMonstersAggressive,
  matchesAttackData,
  parseMixed,
  rerollWeights,
  weightHash,
  scriptOverlay,
  splitWeights,
} from "../src/shuffles/monster-ai.js";
import { MONSTER_ATTACKS } from "../src/shuffles/monster-attacks.js";
import { MONSTER_REACH } from "../src/shuffles/monster-reach.js";
import { MONSTER_CHUNK_SIZE } from "mhfu-extract/src/monsters/hitzones.js";
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

test("keeping in reach makes taking off rarer and landing likelier, keeps 32 and every move possible", () => {
  const before = [4, 12, 8, 8];
  const after = keepInReach(before, "L--B", 3);
  assert.equal(
    after.reduce((s, w) => s + w, 0),
    CHOICE_TOTAL,
  );
  assert.ok(after[0]! < before[0]!, "takeoff rarer");
  assert.ok(after[3]! > before[3]!, "landing likelier");
  // The other moves keep their odds against each other.
  assert.ok(Math.abs(after[1]! / after[2]! - 12 / 8) < 0.2);
  // An entry at 1 stays possible, one at 0 stays impossible.
  assert.deepEqual(keepInReach([1, 31], "L-", 8), [1, 31]);
  assert.equal(keepInReach([0, 16, 16], "L-L", 8)[0], 0);
  // With no flight or burrow in it, a choice keeps its weights.
  assert.deepEqual(keepInReach([8, 4, 14, 6], "----", 8), [8, 4, 14, 6]);
  // Rarely leans further than less.
  assert.ok(keepInReach([16, 16], "L-", 8)[0]! < keepInReach([16, 16], "L-", 3)[0]!);
});

test("reach data is applied to the edited weights, so it stacks after aggression", () => {
  const { buf, ovl, root } = script();
  const choices = findChoices(ovl, [root]);
  const known = { choices: 2, hash: weightHash(choices), mixed: "0:-A-L 1:L-" };
  leanTowardsAttacks(choices, buf, { ...known, mixed: "0:-A-A 1:-A" }, 2);
  const leaned = findChoices(ovl, [root]).map((c) => c.weights);
  leanTowardsReach(choices, buf, known, 3);
  assert.deepEqual(
    findChoices(ovl, [root]).map((c) => c.weights),
    [keepInReach(leaned[0]!, "-A-L", 3), keepInReach(leaned[1]!, "L-", 3)],
  );
});

test("the reach data reads: every mixed choice mixes leaving or coming back with other moves", () => {
  let total = 0;
  for (const [name, known] of Object.entries(MONSTER_REACH)) {
    // The same scripts the attack data was made from: the same choices and vanilla weights.
    assert.equal(known.choices, MONSTER_ATTACKS[name]?.choices, name);
    assert.equal(known.hash, MONSTER_ATTACKS[name]?.hash, name);
    for (const [index, kinds] of parseMixed(known.mixed)) {
      assert.ok(index < known.choices, `${name} ${index}`);
      assert.match(kinds, /^(?:[L-]+|[B-]+)$/);
      assert.ok(/[LB]/.test(kinds) && kinds.includes("-"), `${name} ${index}`);
      total++;
    }
  }
  assert.equal(total, 534);
});

test("a large monster keeps after a lost hunter longer; capped, and species without a time left alone", () => {
  const tableAt = 0x40;
  const buf = Buffer.alloc(tableAt + 90 * MONSTER_CHUNK_SIZE);
  const time = (emId: number) => tableAt + emId * MONSTER_CHUNK_SIZE + ENGAGED_FRAMES_OFFSET;
  buf.writeInt16LE(1800, time(11));
  buf.writeInt16LE(900, time(27));
  buf.writeInt16LE(20000, time(75));
  buf.writeInt16LE(1800, time(16));
  const changed = lengthenEngagement(buf, tableAt, [11, 27, 75, 11, 33, 0, 90], 4);
  assert.deepEqual(changed, [
    { emId: 11, before: 1800, after: 7200 },
    { emId: 27, before: 900, after: 3600 },
    { emId: 75, before: 20000, after: 0x7fff },
  ]);
  assert.equal(buf.readInt16LE(time(11)), 7200, "once, though listed twice");
  assert.equal(buf.readInt16LE(time(16)), 1800, "not listed, not changed");
  assert.equal(buf.readInt16LE(time(33)), 0);
});

test("a disc the reach data wasn't made from keeps its flights, with a warning in the log line", () => {
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
  const known = { "em01.ovl": { choices: 2, hash: "00000000", mixed: "1:L-" } };
  const table = Buffer.alloc(90 * MONSTER_CHUNK_SIZE);
  table.writeInt16LE(1800, MONSTER_CHUNK_SIZE + ENGAGED_FRAMES_OFFSET);
  const gameTask = {
    index: 0,
    ovl: { reader: { buf: table }, isOwnVaddr: () => false },
  } as unknown as LoadedOverlay;
  const edits = { overlay: (f: LoadedOverlay) => (f === gameTask ? table : ovl.reader.buf) };
  const before = findChoices(ovl, [root]).map((c) => c.weights);
  const report = keepMonstersInReach(
    "rarely",
    edits as unknown as Edits,
    scripts,
    gameTask,
    [1],
    String,
    { data: known, tableAt: 0 },
  );
  assert.deepEqual(
    findChoices(ovl, [root]).map((c) => c.weights),
    before,
  );
  // The engagement time doesn't depend on the scripts, so it still changes.
  assert.equal(table.readInt16LE(MONSTER_CHUNK_SIZE + ENGAGED_FRAMES_OFFSET), 7200);
  assert.match(
    report.summary ?? "",
    /^Monster reach: 0 choices, 1 species stay longer, 0 area-time lists \(1 species' not found\); warning: flights and burrows left alone.*em01\.ovl$/,
  );
});

test("an area-time list reads as stage and frame pairs ending in the default", () => {
  const list = (pairs: number[][]) => {
    const b = Buffer.alloc(pairs.length * 4 + 8);
    pairs.forEach(([k, v], i) => {
      b.writeInt16LE(k!, i * 4);
      b.writeInt16LE(v!, i * 4 + 2);
    });
    return b;
  };
  assert.deepEqual(
    readAreaTimes(
      list([
        [32, 3600],
        [1142, 5400],
        [-1, 9000],
      ]),
      0,
    ),
    [
      { at: 2, bonus: true },
      { at: 6, bonus: false },
      { at: 10, bonus: true },
    ],
  );
  assert.deepEqual(readAreaTimes(list([[-1, 1800]]), 0), [{ at: 2, bonus: true }]);
  assert.equal(
    readAreaTimes(
      list([
        [32, 0],
        [-1, 9000],
      ]),
      0,
    ),
    null,
    "a time of 0",
  );
  assert.equal(
    readAreaTimes(
      list([
        [5000, 60],
        [-1, 9000],
      ]),
      0,
    ),
    null,
    "not a stage",
  );
  assert.equal(readAreaTimes(list([[32, 3600]]), 0), null, "no default");
});

test("area times grow once per shared list, capped below the game's bonus, never shorter", () => {
  const tableAt = 0x40;
  const listAt = tableAt + 90 * MONSTER_CHUNK_SIZE;
  const buf = Buffer.alloc(listAt + 0x40);
  const BASE = 0x09000000;
  // Rathian and Rathalos share one list, and Kut-Ku points at its tail;
  // Yama Tsukami points at nothing that reads.
  for (const em of [1, 11]) {
    buf.writeUInt32LE(BASE + listAt, tableAt + em * MONSTER_CHUNK_SIZE + AREA_TIMES_OFFSET);
  }
  buf.writeUInt32LE(BASE + listAt + 8, tableAt + 6 * MONSTER_CHUNK_SIZE + AREA_TIMES_OFFSET);
  buf.writeUInt32LE(BASE + 4, tableAt + 58 * MONSTER_CHUNK_SIZE + AREA_TIMES_OFFSET);
  [32, 3600, 37, 10800, 99, 32000, 1142, 8000, -1, 9000].forEach((v, i) =>
    buf.writeInt16LE(v, listAt + i * 2),
  );
  const gameTask = {
    index: 0,
    ovl: {
      reader: { buf },
      isOwnVaddr: (v: number) => v - BASE >= 0 && v - BASE < buf.length,
      vaddrToOffset: (v: number) => v - BASE,
    },
  } as unknown as LoadedOverlay;
  const edited = Buffer.from(buf);
  const edits = { overlay: () => edited } as unknown as Edits;
  const { lists, missing } = lengthenAreaTimes(
    edits,
    gameTask,
    new Map(),
    tableAt,
    [1, 6, 11, 58],
    4,
  );
  assert.deepEqual(lists, [
    { emIds: [1, 11], before: 9000, after: AREA_TIMES_CAP },
    { emIds: [6], before: 9000, after: AREA_TIMES_CAP },
  ]);
  assert.deepEqual(missing, [58]);
  const at = (i: number) => edited.readInt16LE(listAt + i * 4 + 2);
  assert.equal(at(0), 14400);
  assert.equal(at(1), AREA_TIMES_CAP, "scaled once, though two lists hold it");
  assert.equal(at(2), 32000, "already above the cap: left as it was");
  assert.equal(at(3), 32000, "no minutes added here, so it may pass the cap");
  // The game's bonus (up to 3 minutes) still fits in the s16 countdown.
  assert.ok(AREA_TIMES_CAP + 3 * 1800 <= 0x7fff);
});

test("area times are found in the overlay with the monster's scripts, never another", () => {
  const tableAt = 0;
  const chunks = Buffer.alloc(90 * MONSTER_CHUNK_SIZE);
  const EM = 0x09d00000;
  // Rathian's (em01) list is in em01.ovl; Diablos's (em14) pointer is at the
  // same address, but em14.ovl, which holds its scripts, has nothing there.
  for (const em of [1, 14]) {
    chunks.writeUInt32LE(EM + 0x10, tableAt + em * MONSTER_CHUNK_SIZE + AREA_TIMES_OFFSET);
  }
  const overlay = (index: number, words: number[]) => {
    const buf = Buffer.alloc(0x40);
    words.forEach((v, i) => buf.writeInt16LE(v, 0x10 + i * 2));
    return {
      index,
      ovl: {
        reader: { buf },
        isOwnVaddr: (v: number) => v - EM >= 0 && v - EM < buf.length,
        vaddrToOffset: (v: number) => v - EM,
      },
    } as unknown as LoadedOverlay;
  };
  const gameTask = {
    index: 0,
    ovl: { reader: { buf: chunks }, isOwnVaddr: () => false },
  } as unknown as LoadedOverlay;
  const em01 = overlay(1, [-1, 9000]);
  const em14 = overlay(14, []);
  const edited = new Map<number, Buffer>();
  const edits = {
    overlay: (f: LoadedOverlay) => {
      if (!edited.has(f.index)) edited.set(f.index, Buffer.from(f.ovl.reader.buf));
      return edited.get(f.index)!;
    },
  } as unknown as Edits;
  const own = new Map([
    [1, em01],
    [14, em14],
  ]);
  const { lists, missing } = lengthenAreaTimes(edits, gameTask, own, tableAt, [1, 14], 2);
  assert.deepEqual(lists, [{ emIds: [1], before: 9000, after: 18000 }]);
  assert.deepEqual(missing, [14], "em01.ovl reads there, but isn't Diablos's");
  assert.deepEqual([...edited.keys()], [1]);
});
