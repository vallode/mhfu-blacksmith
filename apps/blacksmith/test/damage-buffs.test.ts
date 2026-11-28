import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buffedAffinity,
  buffedAttack,
  hitElement,
  hitElementValue,
  NO_BUFFS,
  rolledAffinity,
  weaponAttributes,
  type Buffs,
} from "../src/lib/damage-buffs";
import { readData } from "game-data";
import { parseBuffs, parseWeaponKey, damageHref } from "../src/lib/damage-store";
import {
  affinityMotion,
  effectiveRaw,
  elementHitDamage,
  moveDamage,
  type MotionMove,
  type StruckZone,
} from "../src/lib/motion-values";
import { DATA_DIR } from "../src/lib/paths";

const buffs = (b: Partial<Buffs>): Buffs => ({ ...NO_BUFFS, ...b });

test("additive buffs add up before the Horn's and low health's multiplies, each truncated", () => {
  assert.equal(buffedAttack(200, NO_BUFFS), 200);
  // 200 + 6 + 9 + 5 + 25 + 20 = 265; × 1.2 = 318; × 1.3 = 413.4 → 413
  const all = buffs({
    powercharm: true,
    powertalon: true,
    demondrug: "Mega Demondrug",
    seed: "Power Pill",
    attackSkill: "up-l",
    hornAttack: "l-again",
    lowHealth: "adrenaline",
  });
  assert.equal(buffedAttack(200, all), 413);
  // 201 × 1.1 = 221.1 → 221, then the spirit glow's +10 goes in before it.
  assert.equal(buffedAttack(201, buffs({ hornAttack: "s" })), 221);
  assert.equal(buffedAttack(191, buffs({ hornAttack: "s" }), { spiritGlow: true }), 221);
  assert.equal(buffedAttack(10, buffs({ attackSkill: "down-l" })), 1);
});

test("affinity takes one skill, then sharpness when above 0", () => {
  assert.equal(buffedAffinity(10, NO_BUFFS, 4), 15);
  assert.equal(buffedAffinity(10, buffs({ affinitySkill: "up-2" }), 6), 40);
  assert.equal(buffedAffinity(-20, buffs({ affinitySkill: "up-1" }), 6), -10);
  assert.equal(buffedAffinity(10, NO_BUFFS, null), 10);
});

test("a critical hit scales the motion value, truncated", () => {
  assert.equal(affinityMotion(19, "critical"), 23);
  assert.equal(affinityMotion(19, "weak"), 14);
  assert.equal(affinityMotion(19, "normal"), 19);
});

test("effective raw weighs true attack by sharpness and affinity, capped at ±100%", () => {
  assert.equal(effectiveRaw(200, 1.25, 0), 250);
  // 200 × 1.25 × (1 + 0.25 × 0.3) = 268.75
  assert.equal(effectiveRaw(200, 1.25, 30), 268.75);
  assert.equal(effectiveRaw(200, 1, -20), 190);
  assert.equal(effectiveRaw(200, 1, 150), 250);
});

test("affinity rolls only above red sharpness, with blue's and white's bonus", () => {
  const expert = buffs({ affinitySkill: "up-1" });
  // Red sharpness and a gunner's melee hit roll none.
  assert.equal(rolledAffinity(20, expert, 0), 0);
  assert.equal(rolledAffinity(20, expert, null), 0);
  assert.equal(rolledAffinity(-20, NO_BUFFS, 0), 0);
  assert.equal(rolledAffinity(20, expert, 3), 30);
  assert.equal(rolledAffinity(20, expert, 4), 35);
  assert.equal(rolledAffinity(20, expert, 5), 40);
  // Negative affinity takes no sharpness bonus.
  assert.equal(rolledAffinity(-20, NO_BUFFS, 5), -20);
  // 300 in white (× 1.3) at 40%: 300 × 1.3 × 1.1 = 429
  assert.equal(Math.round(effectiveRaw(300, 1.3, rolledAffinity(20, expert, 5))), 429);
});

test("element is a tenth of the shown value, scaled by skills and Dual Blades", () => {
  assert.equal(hitElementValue(350, NO_BUFFS), 35);
  // 35 × 1.2 = 42; × 1.2 = 50.4 → 50
  assert.equal(hitElementValue(350, buffs({ elementAttack: true, hornElement: "again" })), 50);
  // 35 × 0.7 = 24.5 → 24; again 16.8 → 16
  assert.equal(hitElementValue(350, NO_BUFFS, { dualBlades: true, row: 40 }), 24);
  assert.equal(hitElementValue(350, NO_BUFFS, { dualBlades: true, row: 101 }), 16);
});

test("element damage is element × hitzone × sharpness, truncated", () => {
  assert.equal(elementHitDamage(35, 30, 1.0625), 11);
  assert.equal(elementHitDamage(35, 0, 1.2), 0);
});

test("a dual-element weapon's hit takes its blade's attribute, a status none", () => {
  const attributes = weaponAttributes([
    { name: "Fire", attack: 300 },
    { name: "Poison", attack: 200 },
  ]);
  assert.deepEqual(hitElement(attributes, NO_BUFFS, { row: 37, blade: 1 }, true), {
    type: "fire",
    value: 21,
  });
  assert.equal(hitElement(attributes, NO_BUFFS, { row: 39, blade: 2 }, true), null);
  const single = weaponAttributes([{ name: "Ice", attack: 200 }]);
  assert.deepEqual(hitElement(single, NO_BUFFS, { row: 39, blade: 2 }, false), {
    type: "ice",
    value: 20,
  });
});

test("a move's damage sums each hit's raw and element", () => {
  const move: MotionMove = {
    move: "combo",
    hitzone_weights: { cut: 100, impact: 0 },
    hits: [
      { row: 1, motion_value: 20, blade: 1 },
      { row: 2, motion_value: 10, blade: 2, count: 2 },
    ],
  };
  const zone: StruckZone = {
    cut: 50,
    bash: 50,
    fire: 30,
    water: 10,
    thunder: 0,
    ice: 0,
    dragon: 0,
  };
  const d = moveDamage(move, {
    attack: 300,
    sharpness: 1.25,
    elementSharpness: 1.0625,
    elementOf: (h) => (h.blade === 1 ? { type: "fire", value: 30 } : { type: "water", value: 30 }),
    zone,
  });
  // Raw: 300 × 20 × 1.25 × 50 / 10000 = 37.5 → 37; 300 × 10 × … = 18.75 → 18, twice.
  // Element: 30 × 0.3 × 1.0625 = 9.5 → 9; 30 × 0.1 × 1.0625 = 3.1 → 3, twice.
  assert.deepEqual(d, { raw: 37 + 18 * 2, element: 9 + 3 * 2 });
});

test("stored buffs keep only known values, and weapon keys round-trip", () => {
  assert.deepEqual(parseBuffs({ seed: "Power Seed", attackSkill: "nope", powercharm: 1 }), {
    ...NO_BUFFS,
    seed: "Power Seed",
  });
  assert.deepEqual(parseWeaponKey("great-sword/buster-sword"), {
    type: "great-sword",
    slug: "buster-sword",
  });
  assert.equal(parseWeaponKey("spoon/x"), null);
  assert.equal(
    damageHref({ type: "great-sword", slug: "buster-sword" }),
    "/damage/?weapon=great-sword/buster-sword",
  );
});

test("a quest's defense scales each hit's sum, the raw part on its own", () => {
  const move: MotionMove = {
    move: "combo",
    hitzone_weights: { cut: 100, impact: 0 },
    hits: [{ row: 1, motion_value: 20, count: 2 }],
  };
  const zone: StruckZone = { cut: 50, bash: 50, fire: 30, water: 0, thunder: 0, ice: 0, dragon: 0 };
  const d = moveDamage(move, {
    attack: 300,
    sharpness: 1.25,
    elementSharpness: 1.0625,
    elementOf: () => ({ type: "fire", value: 30 }),
    zone,
    defense: 0.75,
  });
  // Each hit: raw 37, fire 9; (37 + 9) × 0.75 = 34.5 → 34, raw 37 × 0.75 = 27.75 → 27.
  assert.deepEqual(d, { raw: 27 * 2, element: 7 * 2 });
});

test("the data's Dual Blades combos strike with one blade, then the other", () => {
  // A check on the extractor's hitbox joints: a shifted shape table would
  // break the left-right alternation of the first combo strings.
  const bundle = readData<{ weapons: Record<string, MotionMove[]> }>(
    DATA_DIR,
    "motion-values.json",
  );
  const blades = (move: string) =>
    bundle.weapons["dual-blades"]!.find((m) => m.move === move)!.hits.map((h) => h.blade);
  assert.deepEqual(blades("combo-2"), [1, 2]);
  assert.deepEqual(blades("combo-3"), [1, 2, 1]);
});
