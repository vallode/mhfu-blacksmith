/** Monster status figures (lib/monster-status): frames in seconds and how long a status lasts. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { statusDuration, ticksToSeconds } from "../src/lib/monster-status";

const poison = {
  initial: 200,
  increase: 75,
  recovery: 10,
  recovery_time: 150,
  damage: 20,
  damage_interval: 150,
  total_time: 1800,
};

test("ticksToSeconds counts 30 frames a second", () => {
  assert.equal(ticksToSeconds(300), 10);
  assert.equal(ticksToSeconds(450), 15);
  assert.equal(ticksToSeconds(100), 3.3);
});

test("poison lasts its whole run", () => {
  assert.equal(statusDuration(poison), 1800);
});

test("other statuses last their duration", () => {
  assert.equal(
    statusDuration({ initial: 1, increase: 0, recovery: 5, recovery_time: 300, duration: 450 }),
    450,
  );
});
