import assert from "node:assert/strict";
import { test } from "node:test";
import { crownCutoffCm, crownFor, formatChance, possibleCrowns, sizeInCm } from "../src/lib/crowns";

const RATHALOS = { mini: 90, silver: 114, gold: 127 };

test("crownFor gives a size's crown at the thresholds, inclusive", () => {
  assert.equal(crownFor(90, RATHALOS), "mini");
  assert.equal(crownFor(91, RATHALOS), null);
  assert.equal(crownFor(113, RATHALOS), null);
  assert.equal(crownFor(114, RATHALOS), "silver");
  assert.equal(crownFor(126, RATHALOS), "silver");
  assert.equal(crownFor(127, RATHALOS), "gold");
});

test("sizeInCm scales the monster's base size", () => {
  assert.ok(Math.abs(sizeInCm(127, 1629.4) - 2069.338) < 1e-9);
});

test("crownCutoffCm rounds to a tenth the safe way: gold and silver up, mini down", () => {
  // Giadrome: 908.232 and 664.56 cm.
  const giadrome = { mini: 90, silver: 115, gold: 123 };
  assert.equal(crownCutoffCm("gold", giadrome, 738.4), 908.3);
  assert.equal(crownCutoffCm("mini", giadrome, 738.4), 664.5);
  // An exact tenth stays put: 125% of 1024.4 is 1280.5000000000002 in floats.
  assert.equal(crownCutoffCm("gold", { mini: 90, silver: 115, gold: 125 }, 1024.4), 1280.5);
});

test("formatChance rounds to a tenth of a percent", () => {
  assert.equal(formatChance(84 / 1024), "8.2%");
  assert.equal(formatChance(1 / 1024), "0.1%");
  assert.equal(formatChance(0.0001), "<0.1%");
  assert.equal(formatChance(0.5), "50%");
  assert.equal(formatChance(1), "100%");
});

test("possibleCrowns lists the crowns any monster can get, gold first", () => {
  assert.deepEqual(
    possibleCrowns([
      { mini: 0.1, silver: 0, gold: 0 },
      { mini: 0, silver: 0, gold: 0.01 },
    ]),
    ["gold", "mini"],
  );
  assert.deepEqual(possibleCrowns([]), []);
});
