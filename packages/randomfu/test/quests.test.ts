import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import { Edits } from "../src/edits.js";
import { gatheringYields } from "mhfu-extract/src/quests/gathering.js";
import { loadGame, type GameData } from "../src/game/load.js";
import {
  deliveryTarget,
  isQuestItem,
  readSupplySlots,
  readTerms,
  rewriteGoal,
  TICKS_PER_MINUTE,
} from "../src/game/quest-fields.js";
import { randomize } from "../src/randomize.js";
import { Rng } from "../src/rng.js";
import { collectDeliveries, shuffleDeliveries } from "../src/shuffles/deliveries.js";
import {
  addSupplies,
  collectSupplyRuns,
  shuffleSupplies,
  type SupplyContext,
} from "../src/shuffles/supplies.js";
import { buildFixtureDisc, buildQuestPayload, FIXTURE_QUESTS, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: null });
  return { game, close: () => source.close() };
}

const SEEDS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const byId = (game: GameData, id: number) =>
  game.quests.find((q) => q.parsed.header.questId === id)!;
const supplies = (payload: Buffer) => readSupplySlots(payload).map((s) => [s.itemId, s.amount]);
/** A supply list's runs of identical entries, as "item x amount". */
const runsOf = (list: number[][]) =>
  list.map((e) => e.join("x")).filter((e, i, all) => i === 0 || all[i - 1] !== e);
const goals = (payload: Buffer) => {
  const parsed = parseQuest(payload);
  const table = parsed.header.stringPtrTbl;
  return Array.from({ length: 7 }, (_, i) => {
    const block = payload.readUInt32LE(table + i * 4);
    const goal = payload.readUInt32LE(block + 4);
    return payload.toString("utf8", goal, payload.indexOf(0, goal));
  });
};

test("supply boxes: stacks move within their tier; quest items, the Paw Pass and training stay", async () => {
  const { game, close } = await load();
  const low1 = [1001, 10102];
  const vanilla = new Map(
    game.quests.map((q) => [q.parsed.header.questId, supplies(q.file.payload)]),
  );
  let moved = false;
  for (const seed of SEEDS) {
    for (const keepEssentials of [true, false]) {
      const s = settingsWith(seed, ["supplies"], { "supplies.keepEssentials": keepEssentials });
      const result = randomize(game, s);
      const now = (id: number) => supplies(result.edits.questNow(byId(game, id)));
      for (const q of game.quests) {
        const id = q.parsed.header.questId;
        assert.equal(now(id).length, vanilla.get(id)!.length, `quest ${id} keeps its length`);
        // The end marker (item 0, then the quest ID) stays.
        const payload = result.edits.questNow(q);
        const end = payload.readUInt32LE(8) + vanilla.get(id)!.length * 4;
        assert.equal(payload.readUInt16LE(end), 0);
        assert.equal(payload.readUInt16LE(end + 2), id);
      }
      // Low Rank 1★ boxes trade stacks: runs of identical entries move as one.
      assert.deepEqual(
        low1.flatMap((id) => runsOf(now(id))).sort(),
        low1.flatMap((id) => runsOf(vanilla.get(id)!)).sort(),
      );
      assert.deepEqual(now(1001)[2], now(1001)[3], "the two Tuna Bait stacks stay one run");
      if (keepEssentials)
        assert.deepEqual(now(1001).slice(0, 2), [
          [863, 1],
          [863, 1],
        ]);
      // Low Rank 2★: its only other stack has nowhere to go; the ticket always stays.
      assert.deepEqual(now(10101), [
        [927, 1],
        [142, 4],
      ]);
      assert.deepEqual(now(20001), [[997, 1]], "Training School");
      if (JSON.stringify(now(1001)) !== JSON.stringify(vanilla.get(1001))) moved = true;
    }
  }
  assert.ok(moved, "some seed moves a Low Rank 1★ stack");
  close();
});

test("supply boxes from the same rank never hold quest items", async () => {
  const { game, close } = await load();
  for (const seed of SEEDS) {
    for (const pool of ["rank"]) {
      const s = settingsWith(seed, ["supplies"], { "supplies.pool": pool });
      const result = randomize(game, s);
      for (const id of [1001, 10102, 2001]) {
        const before = supplies(byId(game, id).file.payload);
        const after = supplies(result.edits.questNow(byId(game, id)));
        after.forEach(([item], i) => {
          if (before[i]![0] === 863) assert.deepEqual(after[i], before[i], "the Map stays");
          else assert.ok(item !== 863 && item !== 927, `${seed} ${pool}: quest ${id} got ${item}`);
        });
      }
    }
  }
  close();
});

test("adding to supply boxes keeps them and appends random stacks where there's room", async () => {
  const { game, close } = await load();
  const largestQuest = Math.max(...game.quests.map((q) => q.file.payload.length));
  const largestBox = Math.max(...game.quests.map((q) => readSupplySlots(q.file.payload).length));
  const room = new Map<number, number>();
  for (const seed of SEEDS) {
    const result = randomize(game, settingsWith(seed, ["supplies"], { "supplies.pool": "add" }));
    for (const q of game.quests) {
      const id = q.parsed.header.questId;
      const before = q.file.payload;
      const after = result.edits.questNow(q);
      if (id === 20001 || after.length === before.length) {
        assert.ok(after.equals(before), `quest ${id} unchanged`);
        room.set(id, 0);
        continue;
      }
      // The old bytes are all still there; only the supply pointer changed.
      assert.ok(after.subarray(12, before.length).equals(before.subarray(12)));
      assert.ok(after.subarray(0, 8).equals(before.subarray(0, 8)));
      const ptr = after.readUInt32LE(8);
      assert.ok(ptr >= before.length && ptr % 4 === 0, "the box moved to the end");
      assert.ok(after.length <= Math.min(largestQuest, q.file.capacity));
      const box = supplies(after);
      const old = supplies(before);
      assert.deepEqual(box.slice(0, old.length), old, "keeps its own stacks, in order");
      const added = box.slice(old.length);
      assert.ok(added.length >= 1 && added.length <= 4 && box.length <= largestBox);
      const oldItems = new Set(old.map(([item]) => item));
      const addedItems = added.map(([item]) => item!);
      assert.equal(new Set(addedItems).size, addedItems.length, "no item added twice");
      for (const [item, amount] of added) {
        assert.ok(!oldItems.has(item!), `${id}: ${item} was in the box already`);
        assert.ok(item !== 863 && item !== 927 && amount! >= 1, `${id}: added ${item} x${amount}`);
      }
      // The same end marker.
      assert.equal(after.readUInt16LE(ptr + box.length * 4), 0);
      assert.equal(after.readUInt16LE(ptr + box.length * 4 + 2), id);
      room.set(id, added.length);
    }
  }
  assert.equal(room.get(1001), 0, "1001 has the largest box already");
  assert.equal(room.get(10102), 0, "10102 is the largest quest already");
  assert.equal(room.get(10101), 3, "up to the largest box's 5 stacks");
  assert.equal(room.get(2001), 4);
  close();
});

test("no supply mode gives a delivery quest the item it asks for", async () => {
  const { game, close } = await load();
  const context = (deliveries: Map<number, number>, extra: Partial<SupplyContext> = {}) => ({
    bands: new Map(),
    allItems: [],
    usualAmount: () => 1,
    deliveryItem: (q: { parsed: { header: { questId: number } } }) =>
      deliveries.get(q.parsed.header.questId),
    ...extra,
  });
  const boxOf = (edits: Edits, id: number) =>
    readSupplySlots(edits.questNow(byId(game, id))).map((s) => s.itemId);
  let swapped = false;
  for (const seed of SEEDS) {
    // Adding: 2001 has room for 4 and only 241 to 245 to draw from, 241 being its target.
    const added = new Edits(game);
    addSupplies(
      game.quests,
      context(new Map([[2001, 241]]), { allItems: [240, 241, 242, 243, 244, 245] }),
      new Rng(seed),
      added,
    );
    assert.deepEqual(boxOf(added, 2001).sort(), [240, 242, 243, 244, 245]);

    // The rank pool: 2001's only High Rank choices are its target and 242.
    const ranked = new Edits(game);
    const highRuns = collectSupplyRuns(game.quests, () => false).filter(
      (r) => r.quest.parsed.header.questId === 2001,
    );
    shuffleSupplies(
      highRuns,
      { pool: "rank", keepEssentials: true },
      context(new Map([[2001, 241]]), {
        bands: new Map([
          [241, "high"],
          [242, "high"],
        ]),
      }),
      new Rng(seed),
      ranked,
    );
    assert.ok(!boxOf(ranked, 2001).includes(241), `${seed}: rank pool`);

    // Permuting: 10102 must not get 1001's 140 stacks; the tier keeps its stacks.
    const permuted = new Edits(game);
    const lowRuns = collectSupplyRuns(game.quests, (_, item) => isQuestItem(item)).filter((r) =>
      [1001, 10102].includes(r.quest.parsed.header.questId),
    );
    shuffleSupplies(
      lowRuns,
      { pool: "supplies", keepEssentials: true },
      context(new Map([[10102, 140]])),
      new Rng(seed),
      permuted,
    );
    const box10102 = boxOf(permuted, 10102);
    assert.ok(!box10102.includes(140), `${seed}: permutation`);
    const runsNow = [1001, 10102].flatMap((id) =>
      runsOf(supplies(permuted.questNow(byId(game, id)))),
    );
    assert.deepEqual(runsNow.sort(), ["140x3", "141x2", "143x2", "144x1", "863x1"].sort());
    if (boxOf(permuted, 1001).includes(143) || boxOf(permuted, 1001).includes(144)) swapped = true;
  }
  assert.ok(swapped, "some seed still moves stacks between the two boxes");
  close();
});

test("rewriteGoal leaves a string another field shows", () => {
  const payload = buildQuestPayload(FIXTURE_QUESTS.find((q) => q.questId === 10102)!);
  const table = payload.readUInt32LE(96);
  const block = payload.readUInt32LE(table);
  const goal = payload.readUInt32LE(block + 4);
  // The fail condition (field 2) shows the English goal string too.
  payload.writeUInt32LE(goal, block + 8);
  const text = payload.toString("utf8", goal, payload.indexOf(0, goal));
  const ok = rewriteGoal(payload, "Deliver X x1");
  const fail = payload.readUInt32LE(block + 8);
  assert.equal(payload.toString("utf8", fail, payload.indexOf(0, fail)), text);
  if (ok) assert.notEqual(payload.readUInt32LE(block + 4), goal, "the goal points elsewhere");
});

test("quest terms: money and time limits move within their spreads", async () => {
  const { game, close } = await load();
  const spread = 0.5;
  const timeSpread = 0.3;
  for (const seed of SEEDS) {
    const s = settingsWith(seed, ["quest-money", "time-limits"], {
      "terms.moneySpread": spread,
      "terms.timeSpread": timeSpread,
    });
    const result = randomize(game, s);
    for (const q of game.quests) {
      const id = q.parsed.header.questId;
      const before = readTerms(q.file.payload);
      const after = readTerms(result.edits.questNow(q));
      if (id === 20001) {
        assert.deepEqual(after, before, "Training School");
        continue;
      }
      for (const key of ["fee", "reward", "penalty"] as const) {
        assert.equal(after[key] % 10, 0, `${id} ${key} in steps of 10z`);
        if (before[key] === 0) assert.equal(after[key], 0);
        else {
          assert.ok(after[key] >= before[key] * (1 - spread) - 10, `${id} ${key} low`);
          assert.ok(after[key] <= before[key] * (1 + spread) + 10, `${id} ${key} high`);
        }
      }
      assert.ok(after.fee <= after.reward, "the fee never exceeds the reward");
      // The penalty keeps its share of the reward.
      assert.ok(Math.abs(after.penalty / after.reward - before.penalty / before.reward) < 0.02);
      const minutes = after.timeLimit / TICKS_PER_MINUTE;
      assert.ok(Number.isInteger(minutes));
      assert.ok(minutes >= 20 && minutes <= 50, `${id}: ${minutes} min, within the disc's range`);
      const was = before.timeLimit / TICKS_PER_MINUTE;
      assert.ok(
        Math.abs(minutes - was) <= Math.ceil(was * timeSpread),
        `${id}: ${was} -> ${minutes}`,
      );
    }
  }
  // Money alone leaves time limits, and the other way round.
  const money = randomize(game, settingsWith("a", ["quest-money"]));
  const time = randomize(game, settingsWith("a", ["time-limits"]));
  for (const q of game.quests) {
    const before = readTerms(q.file.payload);
    assert.equal(readTerms(money.edits.questNow(q)).timeLimit, before.timeLimit);
    assert.equal(readTerms(time.edits.questNow(q)).reward, before.reward);
  }
  close();
});

test("deliveries ask for something the quest's own points give, and say so in every language", async () => {
  const { game, close } = await load();
  const quest = byId(game, 10102);
  assert.deepEqual(
    collectDeliveries(game.quests).map((d) => d.quest.parsed.header.questId),
    [10102],
    "the Paw Pass Ticket quest (10101) isn't one: its ticket is in the supply box",
  );
  assert.deepEqual(
    [...gatheringYields(quest.file.payload, quest.parsed)],
    [
      [124, 3],
      [125, 3],
      [126, 6],
    ],
  );
  const picked = new Set<number>();
  for (const seed of SEEDS) {
    const result = randomize(game, settingsWith(seed, ["deliveries"]));
    const payload = result.edits.questNow(quest);
    const target = deliveryTarget(payload)!;
    picked.add(target.itemId);
    assert.ok([124, 125].includes(target.itemId), "another item from its gathering points");
    // 4 of 6 before, so 2 of 3 now.
    assert.equal(target.amount, 2);
    const name = target.itemId === 124 ? "Tranq S" : "Paint S";
    assert.deepEqual(goals(payload), Array(7).fill(`Deliver ${name} x2`));
    assert.equal(payload.length, quest.file.payload.length);
    assert.equal(parseQuest(payload).strings!.title, "Fixture Delivery");
    // Nothing else in the header moved.
    const header = (b: Buffer) => Buffer.concat([b.subarray(0, 112), b.subarray(116, 0x80)]);
    assert.ok(header(payload).equals(header(quest.file.payload)));
    const paw = result.edits.questNow(byId(game, 10101));
    assert.deepEqual(deliveryTarget(paw), { itemId: 927, amount: 1 });
  }
  assert.deepEqual([...picked].sort(), [124, 125], "both get picked over the seeds");
  close();
});

test("deliveries never ask for what the supply box hands out", async () => {
  const { game, close } = await load();
  const quest = byId(game, 10102);
  for (const seed of SEEDS) {
    const edits = new Edits(game);
    // Item 124 is now in its supply box.
    edits.quest(quest).writeUInt16LE(124, edits.quest(quest).readUInt32LE(8));
    shuffleDeliveries(collectDeliveries(game.quests), new Rng(seed), edits);
    assert.equal(deliveryTarget(edits.questNow(quest))!.itemId, 125);
  }
  close();
});

test("rewriteGoal fills goals in place, points short ones at a long one, or changes nothing", () => {
  const spec = FIXTURE_QUESTS.find((q) => q.questId === 10102)!;
  const payload = buildQuestPayload(spec);
  // "Kurz" has room for 7 bytes: in place.
  const short = Buffer.from(payload);
  assert.ok(rewriteGoal(short, "Abc"));
  assert.deepEqual(goals(short), Array(7).fill("Abc"));
  const block = (b: Buffer, i: number) => b.readUInt32LE(parseQuest(b).header.stringPtrTbl + i * 4);
  const goalPtr = (b: Buffer, i: number) => b.readUInt32LE(block(b, i) + 4);
  assert.notEqual(goalPtr(short, 0), goalPtr(short, 2), "each language kept its own string");

  // Too long for "Kurz": the other languages point at the English string.
  const long = Buffer.from(payload);
  assert.ok(rewriteGoal(long, "Deliver Something x20"));
  assert.deepEqual(goals(long), Array(7).fill("Deliver Something x20"));
  assert.equal(goalPtr(long, 2), goalPtr(long, 0));
  // Only the goal strings and the redirected pointers changed; other strings read as before.
  const strings = parseQuest(long).strings!;
  assert.equal(strings.title, "Fixture Delivery");
  assert.equal(strings.fail, "Fail");

  // Too long for every goal: nothing changes.
  const none = Buffer.from(payload);
  assert.equal(rewriteGoal(none, "x".repeat(60)), false);
  assert.ok(none.equals(payload));
});

test("the new shuffles keep to their own random streams", async () => {
  const { game, close } = await load();
  const all = settingsWith("z", ["supplies", "quest-money", "time-limits", "deliveries"]);
  const both = randomize(game, all);
  const alone = (name: Parameters<typeof settingsWith>[1][number]) =>
    randomize(game, settingsWith("z", [name]));
  const supplyOnly = alone("supplies");
  const moneyOnly = alone("quest-money");
  const timeOnly = alone("time-limits");
  for (const q of game.quests) {
    const now = both.edits.questNow(q);
    assert.deepEqual(supplies(now), supplies(supplyOnly.edits.questNow(q)));
    const terms = readTerms(now);
    const money = readTerms(moneyOnly.edits.questNow(q));
    assert.deepEqual(
      [terms.fee, terms.reward, terms.penalty],
      [money.fee, money.reward, money.penalty],
    );
    assert.equal(terms.timeLimit, readTerms(timeOnly.edits.questNow(q)).timeLimit);
  }
  // Deliveries follow the supply box (never one of its items), so compare without one.
  const quest = byId(game, 10102);
  assert.deepEqual(
    deliveryTarget(
      randomize(game, settingsWith("z", ["quest-money", "deliveries"])).edits.questNow(quest),
    ),
    deliveryTarget(alone("deliveries").edits.questNow(quest)),
  );
  close();
});

test("a written disc reads back with the new supplies, terms and target", async () => {
  for (const pool of ["supplies", "add"]) await writeAndReadBack(pool);
});

async function writeAndReadBack(pool: string): Promise<void> {
  const { game, close } = await load();
  const s = settingsWith("w", ["supplies", "quest-money", "time-limits", "deliveries"], {
    "supplies.pool": pool,
  });
  const result = randomize(game, s);
  if (pool === "add") {
    assert.ok(
      [...result.edits.quests.values()].some((e) => e.payload.length > e.quest.file.payload.length),
    );
  }
  const out = path.join(tempDir(), "out.iso");
  writeFileSync(out, buildFixtureDisc());
  const { openPatchableImage } = await import("../src/disc/node-file.js");
  const { writeEdits } = await import("../src/write.js");
  const image = openPatchableImage(out);
  writeEdits(image, game, result.edits);
  image.close();
  const { source, iso } = openDiscImage(out);
  const after = await loadGame(source, iso, { eboot: null });
  for (const q of after.quests) {
    const expected = result.edits.questNow(game.quests.find((g) => g.index === q.index)!);
    assert.ok(q.file.payload.equals(expected), `${pool}: quest ${q.parsed.header.questId}`);
  }
  assert.equal(after.dataBin.fileCount, game.dataBin.fileCount);
  source.close();
  close();
}
