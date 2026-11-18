import assert from "node:assert/strict";
import { test } from "node:test";
import { Rng } from "../src/rng.js";
import { permuteWithinGroups } from "../src/shuffles/shuffle.js";

test("the same seed gives the same numbers", () => {
  const a = new Rng("seed");
  const b = new Rng("seed");
  const xs = Array.from({ length: 50 }, () => a.nextU32());
  assert.deepEqual(
    Array.from({ length: 50 }, () => b.nextU32()),
    xs,
  );
  assert.notDeepEqual(
    Array.from({ length: 50 }, () => new Rng("other").nextU32()),
    xs.slice(0, 50).map(() => xs[0]),
  );
});

test("pinned output, so a code change can't silently change every seed", () => {
  const rng = new Rng("randomfu");
  assert.deepEqual(
    Array.from({ length: 4 }, () => rng.nextU32()),
    PINNED,
  );
});

// xoshiro128** from SHA-256("randomfu"); the generator itself matches the reference (1,2,3,4 -> 11520, 0, 5927040, 70819200).
const PINNED = [2920560324, 912198255, 1405091296, 3778616439];

test("forks are independent of each other and of draws on the parent", () => {
  const a = new Rng("s");
  const forkBefore = a.fork("x").nextU32();
  a.nextU32();
  assert.equal(a.fork("x").nextU32(), forkBefore);
  assert.notEqual(new Rng("s").fork("y").nextU32(), forkBefore);
});

test("int stays in range and shuffle is a permutation", () => {
  const rng = new Rng("range");
  for (let i = 0; i < 1000; i++) {
    const n = 1 + (i % 17);
    const x = rng.int(n);
    assert.ok(x >= 0 && x < n);
  }
  const items = Array.from({ length: 100 }, (_, i) => i);
  const shuffled = rng.shuffle([...items]);
  assert.notDeepEqual(shuffled, items);
  assert.deepEqual(
    [...shuffled].sort((a, b) => a - b),
    items,
  );
});

test("permuteWithinGroups keeps each group's values in that group", () => {
  const slots = Array.from({ length: 60 }, (_, i) => ({ group: i % 3, value: i }));
  const next = permuteWithinGroups(
    slots,
    (s) => String(s.group),
    (s) => s.value,
    new Rng("g"),
  );
  for (const g of [0, 1, 2]) {
    const before = slots.filter((s) => s.group === g).map((s) => s.value);
    const after = next.filter((_, i) => slots[i]!.group === g);
    assert.deepEqual(
      [...after].sort((a, b) => a - b),
      before,
    );
  }
  assert.notDeepEqual(
    next,
    slots.map((s) => s.value),
  );
});
