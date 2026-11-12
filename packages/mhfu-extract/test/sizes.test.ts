import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crownsFor,
  questSize,
  readSizeTables,
  SizeTableError,
  sizeChances,
  sizeRange,
} from "../src/monsters/sizes.js";
import { JP_BASE_ADDRESS } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

/** The EU disc's tier tables (EBOOT 0x089A8164 and the 7 tables it points into). */
const TIER_PICK = [0, 1, 2, 2, ...Array(19).fill(3), ...Array(6).fill(4), 5, 5, 6];
const TIERS = [
  [75, 76, 76, 77, 77, 77, 77, ...Array(8).fill(78), ...Array(17).fill(79)],
  [80, 81, 81, 82, 82, 82, 82, ...Array(8).fill(83), ...Array(17).fill(84)],
  [85, 86, 87, 88, 88, 89, 89, 90, 90, 90, 91, 91, 91, 92, 92, 92, 92, 93, 93, 93, 93, 93].concat(
    Array(10).fill(94),
  ),
  [
    95,
    96,
    96,
    97,
    97,
    98,
    98,
    98,
    99,
    99,
    99,
    99,
    ...Array(8).fill(100),
    101,
    101,
    101,
    101,
  ].concat([102, 102, 102, 103, 103, 104, 104, 105]),
  [...Array(10).fill(106), ...Array(5).fill(107), 108, 108, 108, 108, 109, 109, 109].concat([
    110, 110, 110, 111, 111, 112, 112, 113, 114, 115,
  ]),
  [...Array(17).fill(116), ...Array(8).fill(117), 118, 118, 118, 118, 119, 119, 120],
  [...Array(17).fill(121), ...Array(8).fill(122), 123, 123, 123, 123, 124, 124, 125],
];
const VARIATION = [100, 100, 100, 105, 100, 115, 95, 114, 85, 125];

/**
 * A zero-filled EBOOT with the size tables at their EU addresses: the real
 * roll tables, Rathalos' crown entry (with Silver and Azure Rathalos),
 * Giadrome's, 29 more filler entries and three fixed-size quests.
 */
function sizeFixture() {
  const { buf, reader } = fixtureReader(0x08a00000 - JP_BASE_ADDRESS);
  const at = (vaddr: number) => vaddr - JP_BASE_ADDRESS;
  TIER_PICK.forEach((t, i) => buf.writeUInt8(t, at(0x089a8164) + i));
  TIERS.forEach((tier, t) => {
    const vaddr = 0x089a8068 + t * 32;
    buf.writeUInt32LE(vaddr, at(0x089a8148) + t * 4);
    tier.forEach((p, i) => buf.writeUInt8(p, at(vaddr) + i));
  });
  VARIATION.forEach((v, i) => buf.writeUInt8(v, at(0x089a7ea4) + i));

  // Each crown entry's emID group, ending 0xff, in a scratch area.
  let groups = at(0x089f0000);
  const crown = (index: number, emIds: number[], silver: number, gold: number, mini: number) => {
    const entry = at(0x08930bdc) + index * 14;
    buf.writeUInt8(index, entry);
    buf.writeUInt8(emIds[0]!, entry + 3);
    buf.writeInt16LE(silver, entry + 4);
    buf.writeInt16LE(gold, entry + 6);
    buf.writeInt16LE(mini, entry + 8);
    buf.writeUInt32LE(groups + JP_BASE_ADDRESS, at(0x0899bf40) + emIds[0]! * 4);
    for (const id of [...emIds, 0xff]) buf.writeUInt8(id, groups++);
  };
  crown(15, [77], 119, 123, 90);
  crown(28, [11, 41, 49], 114, 127, 90);
  for (let i = 0; i < 29; i++) crown(30 + i, [20 + i], 110, 120, 90);
  // Entry 0 (Felyne) has no crowns.
  buf.writeUInt8(9, at(0x08930bdc) + 3);

  buf.writeFloatLE(738.4, at(0x0899c760) + 77 * 4);
  buf.writeFloatLE(1629.4, at(0x0899c760) + 11 * 4);
  const fixed = (i: number, flag: number, questId: number) => {
    buf.writeUInt16LE(flag, at(0x089a8624) + i * 6);
    buf.writeUInt16LE(questId, at(0x089a8624) + i * 6 + 4);
  };
  fixed(0, 322, 10104);
  fixed(1, 356, 3106);
  fixed(2, 351, 2227);
  return reader;
}

test("readSizeTables reads the roll, variation and crown tables", () => {
  const t = readSizeTables(sizeFixture(), JP_BASE_ADDRESS);
  assert.deepEqual(t.tierPick, TIER_PICK);
  assert.deepEqual(t.tiers, TIERS);
  assert.deepEqual(t.variation, [
    [100, 100],
    [100, 105],
    [100, 115],
    [95, 114],
    [85, 125],
  ]);
  assert.equal(t.crowns.length, 31);
  assert.deepEqual(t.crowns[1], { emIds: [11, 41, 49], mini: 90, silver: 114, gold: 127 });
  assert.ok(Math.abs(t.baseSizes[11]! - 1629.4) < 0.001);
});

test("crownsFor finds a subspecies' shared entry", () => {
  const t = readSizeTables(sizeFixture(), JP_BASE_ADDRESS);
  assert.deepEqual(crownsFor(t, 49)?.emIds, [11, 41, 49]);
  assert.equal(crownsFor(t, 9), undefined);
});

test("readSizeTables maps fixed-size quests to their flag, null for the one that always rolls", () => {
  const t = readSizeTables(sizeFixture(), JP_BASE_ADDRESS);
  assert.equal(t.fixedSizeQuests.get(10104), 322);
  assert.equal(t.fixedSizeQuests.get(3106), null);
  assert.equal(t.fixedSizeQuests.get(2227), 351);
});

test("readSizeTables throws on an EBOOT without the EU tables", () => {
  const { reader } = fixtureReader(0x08a00000 - JP_BASE_ADDRESS);
  assert.throws(() => readSizeTables(reader, JP_BASE_ADDRESS), SizeTableError);
});

test("questSize rounds toward zero, as the game's divide by 100 does", () => {
  assert.equal(questSize(105, 119), 124);
  assert.equal(questSize(98, 85), 83);
  assert.equal(questSize(130, 125), 162);
});

test("sizeRange clamps the roll by the quest's variation, then applies its modifier", () => {
  const t = readSizeTables(sizeFixture(), JP_BASE_ADDRESS);
  assert.deepEqual(sizeRange(t, 100, 0), { min: 100, max: 100 });
  assert.deepEqual(sizeRange(t, 130, 4), { min: 110, max: 162 });
  assert.deepEqual(sizeRange(t, 174, 2), { min: 174, max: 200 });
});

test("sizeChances gives each size's chance from the 32 x 32 roll", () => {
  const t = readSizeTables(sizeFixture(), JP_BASE_ADDRESS);
  const fixed = sizeChances(t, 105, 0);
  assert.deepEqual([...fixed], [[105, 1]]);

  const wide = sizeChances(t, 100, 4);
  const total = [...wide.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  const atMost = (n: number) => [...wide].filter(([s]) => s <= n).reduce((a, [, p]) => a + p, 0);
  // 85 takes every roll of 85 or less: tiers 0-1 whole, and tier 2's first slot.
  assert.equal(wide.get(85), 2 / 32 + (2 / 32) * (1 / 32));
  assert.equal(atMost(90), 84 / 1024);
  assert.equal(wide.get(125), 1 / 1024);
});
