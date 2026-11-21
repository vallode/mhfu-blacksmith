import assert from "node:assert/strict";
import { test } from "node:test";
import { linkBlob } from "../src/blob/link.js";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { HOOK } from "../src/patches/game-hooks.js";
import {
  INSTANCES,
  STONE_ITEMS,
  relicData,
  relicsObjects,
  type RelicOptions,
} from "../src/patches/relic-weapons.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const SAVE = 0x09999c60;
const HUNTER = SAVE + 0x4a0;
const RF = SAVE + 0x666e0;
const TIME = 0x08800100;
const STATS = [0x09d70000, 0x09d80000] as const;
const UPGRADE = [0x09d90000, 0x09da0000] as const;
const CREATE = [0x09db0000, 0x09db0020, 0x09db0040] as const;
const FIRST = [1174, 363];
const SIZE = [24, 28];
const RANGED_CLASSES = new Set([1, 5, 10]);
const CLASSES = 11;

/** randomfu's save data (blob/rf.h): the relic fields' offsets. */
const SD = {
  given: 13,
  queueLen: 14,
  queue: 17,
  seed: 72,
  polished: 138,
  candidate: 204,
  kept: 402,
};

const runtime = () =>
  RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

/** Each rank and class's band: Unpolished Relics in ID order, two donors each. */
const bands = (() => {
  const next = [1150, 354];
  return Array.from({ length: 3 * CLASSES }, (_, b) => {
    const rank = Math.floor(b / CLASSES);
    const side = RANGED_CLASSES.has(b % CLASSES) ? 1 : 0;
    return {
      side,
      rank,
      unpolished: next[side]!++,
      bestAttack: 300 + rank * 100,
      bestElement: 30,
      donorAt: b * 2,
      donors: 2,
    };
  });
})();
const donors = bands.flatMap((_, b) => [20 + b * 2, 21 + b * 2]);
const LONG_SWORD = 7; // a Low Rank melee band
const BOW = 10; // a Low Rank ranged band

function harness(options: Partial<RelicOptions> & { time?: number } = {}) {
  const data = relicData({ stats: STATS, upgrade: UPGRADE, create: CREATE }, bands, donors, FIRST, {
    rolls: "seeded",
    power: "strong",
    runSeed: 0x1234,
    ...options,
  });
  const blob = linkBlob([...runtime(), ...relicsObjects()], BLOB, { rf_time_low: TIME }, Infinity, {
    rf_relic_data: data,
  });
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  let time = options.time ?? 1000;
  cpu.native.set(TIME, () => time++);

  // The donors' records: every byte is the donor's ID, so a copied frame shows whose it is.
  for (const id of donors) {
    for (const side of [0, 1]) cpu.fill(STATS[side]! + id * SIZE[side]!, SIZE[side]!, id);
  }
  const fn = (name: string) => blob.symbols.get(name)!;
  const init = () => cpu.call(fn("rf_init"), [0, SAVE, BLOB]);
  const pad = () => {
    for (let k = 0; k < 8; k++) cpu.call(fn(`rf_hook${HOOK.pad}`), [0]);
  };
  const item = (slot: number, id: number, count: number, at = HUNTER + 0x2f88) => {
    cpu.setU16(at + slot * 4, id);
    cpu.setU16(at + slot * 4 + 2, count);
  };
  const pouch = (slot: number, id: number, count: number) => item(slot, id, count, HUNTER + 0x3f28);
  const weapon = (slot: number, side: number, id: number) => {
    cpu.setU8(HUNTER + 0xa8 + slot * 12 + 1, id ? 5 + side : 0);
    cpu.setU16(HUNTER + 0xa8 + slot * 12 + 2, id);
  };
  const queue = (rank: number) => [
    ...cpu.bytes(RF + SD.queue + rank * 16, cpu.u8(RF + SD.queueLen + rank)),
  ];
  const candidates = (b: number) =>
    [0, 1, 2].map((k) => cpu.u16(RF + SD.candidate + (b * 3 + k) * 2));
  const targets = (side: number, id: number) =>
    [0, 1, 2].map((k) => cpu.u16(UPGRADE[side]! + id * 28 + 16 + k * 2));
  const kept = (side: number, i: number) => {
    const at = RF + SD.kept + (side * INSTANCES + i) * 4;
    return { seed: cpu.u16(at), band: cpu.u8(at + 2), k: cpu.u8(at + 3) };
  };
  const record = (side: number, id: number) =>
    cpu.bytes(STATS[side]! + id * SIZE[side]!, SIZE[side]!);
  const create = (rank: number) => ({
    type: cpu.u8(CREATE[rank]!),
    id: cpu.u16(CREATE[rank]! + 2),
  });
  return {
    cpu,
    fn,
    init,
    pad,
    item,
    pouch,
    weapon,
    queue,
    candidates,
    targets,
    kept,
    record,
    create,
  };
}

test("relic stones queue a class each, and each rank's Create entry makes the front one's Unpolished Relic", () => {
  const h = harness();
  h.item(0, STONE_ITEMS[0], 2);
  h.pouch(3, STONE_ITEMS[0], 1);
  h.item(5, STONE_ITEMS[1], 1);
  h.init();

  const low = h.queue(0);
  assert.equal(low.length, 3, "box and pouch both count");
  assert.equal(h.queue(1).length, 1);
  assert.equal(h.queue(2).length, 0);
  assert.ok(low.every((c) => c < CLASSES));
  for (const rank of [0, 1]) {
    const front = bands[rank * CLASSES + h.queue(rank)[0]!]!;
    assert.deepEqual(h.create(rank), { type: 5 + front.side, id: front.unpolished });
  }

  // One made (or sold): the front stone goes. A new one joins at the back.
  h.pouch(3, 0, 0);
  h.pad();
  assert.deepEqual(h.queue(0), low.slice(1));
  h.item(0, STONE_ITEMS[0], 4);
  h.pad();
  assert.deepEqual(h.queue(0).slice(0, 2), low.slice(1));
  assert.equal(h.queue(0).length, 4);
  const front = bands[h.queue(0)[0]!]!;
  assert.deepEqual(h.create(0), { type: 5 + front.side, id: front.unpolished });
});

test("an Unpolished Relic offers three free instances, rolled on a donor's frame", () => {
  const h = harness();
  const band = bands[LONG_SWORD]!;
  h.weapon(0, 0, band.unpolished);
  h.weapon(1, 0, FIRST[0]!); // an instance someone holds (not a kept relic) isn't offered
  h.init();

  const offer = h.candidates(LONG_SWORD);
  assert.deepEqual(offer, [FIRST[0]! + 1, FIRST[0]! + 2, FIRST[0]! + 3]);
  assert.deepEqual(h.targets(0, band.unpolished), offer, "Improve Weapon lists them");
  for (const id of offer) {
    const rec = h.record(0, id);
    const donor = rec[0]!;
    assert.ok(donors.slice(LONG_SWORD * 2, LONG_SWORD * 2 + 2).includes(donor), `donor ${donor}`);
    for (const k of [0, 1, 3, 8, 9, 19, 20, 21, 22, 23]) assert.equal(rec[k], donor, `byte ${k}`);
    const attack = rec.readUInt16LE(10);
    assert.ok(attack >= 300 * 0.7 && attack <= (300 * (70 + 5 * 9)) / 100, `attack ${attack}`);
    assert.ok(rec[2]! >= 1 && rec[2]! <= 4, `rarity ${rec[2]}`);
    assert.equal(rec.readUInt32LE(4), (rec[2]! + 1) * 1000, "price follows rarity");
    assert.ok(rec[18]! <= 3, "slots");
  }
});

test("a ranged Unpolished Relic offers ranged instances", () => {
  const h = harness();
  const band = bands[BOW]!;
  h.weapon(0, 1, band.unpolished);
  h.init();
  const offer = h.candidates(BOW);
  assert.deepEqual(offer, [FIRST[1]!, FIRST[1]! + 1, FIRST[1]! + 2]);
  assert.deepEqual(h.targets(1, band.unpolished), offer);
  for (const id of offer) {
    const attack = h.record(1, id).readUInt16LE(8);
    assert.ok(attack >= 210 && attack <= 345, `attack ${attack}`);
  }
});

test("improving into a candidate keeps it, frees the other two, and survives a reload", () => {
  const h = harness();
  const band = bands[LONG_SWORD]!;
  h.weapon(0, 0, band.unpolished);
  h.init();
  const [, picked] = h.candidates(LONG_SWORD);
  const seed = h.cpu.u16(RF + SD.seed + LONG_SWORD * 2);
  const stats = h.record(0, picked!);

  h.weapon(0, 0, picked!);
  h.pad();
  assert.deepEqual(h.kept(0, picked! - FIRST[0]!), { seed, band: LONG_SWORD, k: 1 });
  assert.deepEqual(h.candidates(LONG_SWORD), [0, 0, 0]);
  assert.equal(h.cpu.u16(RF + SD.polished + LONG_SWORD * 2), 1);
  assert.equal(h.cpu.u16(RF + SD.seed + LONG_SWORD * 2), 0);

  // Another Unpolished Relic offers anew, around the kept one, from a new seed.
  h.weapon(1, 0, band.unpolished);
  h.pad();
  const next = h.candidates(LONG_SWORD);
  assert.ok(!next.includes(picked!));
  assert.notEqual(h.cpu.u16(RF + SD.seed + LONG_SWORD * 2), seed);
  assert.deepEqual(h.record(0, picked!), stats, "the kept relic's record is left alone");

  // A reload: the tables are vanilla again, and the kept relic and the offer are rolled back in.
  h.cpu.fill(STATS[0] + picked! * 24, 24, 0);
  for (const id of next) h.cpu.fill(STATS[0] + id * 24, 24, 0);
  h.init();
  assert.deepEqual(h.record(0, picked!), stats);
  assert.deepEqual(h.candidates(LONG_SWORD), next);
  assert.deepEqual(h.targets(0, band.unpolished), next);

  // Sold: its instance goes back to the pool at the next load.
  h.weapon(0, 0, 0);
  h.init();
  assert.equal(h.kept(0, picked! - FIRST[0]!).seed, 0);
});

test("seeded rolls follow the run's seed; clock rolls follow the clock", () => {
  const offer = (options: Parameters<typeof harness>[0]) => {
    const h = harness(options);
    h.weapon(0, 0, bands[LONG_SWORD]!.unpolished);
    h.init();
    return h.candidates(LONG_SWORD).map((id) => h.record(0, id).toString("hex"));
  };
  assert.deepEqual(offer({ time: 1 }), offer({ time: 9999 }));
  assert.notDeepEqual(offer({ runSeed: 1 }), offer({ runSeed: 2 }));
  assert.deepEqual(offer({ rolls: "clock", time: 5 }), offer({ rolls: "clock", time: 5 }));
  assert.notDeepEqual(offer({ rolls: "clock", time: 5 }), offer({ rolls: "clock", time: 77777 }));
});

test("a rank's first completed quest always gives one of its stones", () => {
  const h = harness();
  h.init();
  const QUEST = 0x09b00000;
  const HEADER = 0x09b10000;
  h.cpu.setU32(QUEST + 0x126c, HEADER);
  h.cpu.setU8(HEADER + 0x44, 2); // High Rank
  h.cpu.call(h.fn(`rf_hook${HOOK.questFrame}`), [QUEST]);
  h.cpu.setU16(SAVE + 0x390, 7); // a reward already in the first slot
  h.cpu.setU16(SAVE + 0x392, 2);
  h.cpu.call(h.fn(`rf_hook${HOOK.rewards}`), [0]);
  assert.deepEqual([h.cpu.u16(SAVE + 0x394), h.cpu.u16(SAVE + 0x396)], [STONE_ITEMS[1], 1]);
  assert.equal(h.cpu.u8(RF + SD.given), 0b010);
});

test("rewards give no stone without a quest whose rank was read", () => {
  const h = harness();
  h.init();
  h.cpu.call(h.fn(`rf_hook${HOOK.rewards}`), [0]);
  assert.equal(h.cpu.u16(SAVE + 0x390), 0, "no quest frame since the load");
  assert.equal(h.cpu.u8(RF + SD.given), 0);

  const QUEST = 0x09b00000;
  const HEADER = 0x09b10000;
  h.cpu.setU32(QUEST + 0x126c, HEADER);
  h.cpu.setU8(HEADER + 0x44, 5); // G Rank
  h.cpu.call(h.fn(`rf_hook${HOOK.questFrame}`), [QUEST]);
  h.cpu.call(h.fn(`rf_hook${HOOK.rewards}`), [0]);
  assert.equal(h.cpu.u16(SAVE + 0x390), STONE_ITEMS[2]);
  // A second reward roll with no quest frame in between doesn't reuse G Rank.
  h.cpu.setU8(RF + SD.given, 0);
  h.cpu.call(h.fn(`rf_hook${HOOK.rewards}`), [0]);
  assert.equal(h.cpu.u16(SAVE + 0x394), 0);
});

test("past 16 stones, using one still moves the queue on", () => {
  const h = harness();
  h.item(0, STONE_ITEMS[0], 20);
  h.init();
  const queue = h.queue(0);
  assert.equal(queue.length, 16);
  h.item(0, STONE_ITEMS[0], 19);
  h.pad();
  assert.deepEqual(h.queue(0).slice(0, 15), queue.slice(1));
  assert.equal(h.queue(0).length, 16);
  h.item(0, STONE_ITEMS[0], 17);
  h.pad();
  assert.deepEqual(h.queue(0).slice(0, 13), queue.slice(3));
});
