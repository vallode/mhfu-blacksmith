import assert from "node:assert/strict";
import { test } from "node:test";
import { spotValue } from "../src/lib/hitzone-pick";
import { hitDamage, weightedHitzone } from "../src/lib/motion-values";

const LANCE = { cut: 100, impact: 72 };
const HAMMER = { cut: 0, impact: 100 };
const SNS = { cut: 112, impact: 0 };

test("a hit uses the larger of the part's weighted cut and impact values", () => {
  assert.equal(weightedHitzone({ cut: 45, bash: 70 }, LANCE), 50.4);
  assert.equal(weightedHitzone({ cut: 60, bash: 70 }, LANCE), 60);
  assert.equal(weightedHitzone({ cut: 80, bash: 30 }, HAMMER), 30);
  assert.equal(weightedHitzone({ cut: 50, bash: 50 }, SNS), 56);
});

test("a part's value is the hand-set value that deals the same damage", () => {
  assert.equal(spotValue({ cut: 45, bash: 70 }, LANCE), 50.4);
  assert.equal(spotValue({ cut: 60, bash: 70 }, LANCE), 60);
  assert.equal(spotValue({ cut: 80, bash: 30 }, SNS), 80);
  assert.equal(spotValue({ cut: 80, bash: 30 }, HAMMER), 30);
  // A hand-set value stands for both columns.
  for (const w of [LANCE, SNS, HAMMER]) {
    const part = { cut: 45, bash: 70 };
    const shown = spotValue(part, w);
    assert.equal(weightedHitzone({ cut: shown, bash: shown }, w), weightedHitzone(part, w));
  }
});

test("damage rounds each hit down", () => {
  // 200 × 48 × 1.25 × 50.4 / 10000
  assert.equal(hitDamage(200, 48, 1.25, 50.4), 60);
});
