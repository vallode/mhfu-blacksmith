import assert from "node:assert/strict";
import { test } from "node:test";
import { packHitzoneMonster, partHitzones, unpackHitzoneMonster } from "../src/lib/hitzone-pick";
import {
  explosionHitDamage,
  loadsShot,
  shotDamage,
  shotHitDamage,
  shotPower,
  type ShotValue,
} from "../src/lib/shots";
import type { Weapon } from "../src/lib/types";

const ZONE = { shot: 45, fire: 10, water: 30, thunder: 0, ice: 20, dragon: 35 };
const NORMAL_2: ShotValue = { shot: 1, ammo: "Normal S", level: 2, motion_value: 12 };
const PIERCE_1: ShotValue = { shot: 3, ammo: "Pierce S", level: 1, motion_value: 10, hits: 3 };
const FLAME: ShotValue = {
  shot: 15,
  ammo: "Flame S",
  level: 1,
  motion_value: 7,
  element: { type: "fire", value: 45, attack_scaled: true },
};
const DRAGON: ShotValue = {
  shot: 19,
  ammo: "Dragon S",
  level: 1,
  motion_value: 1,
  hits: 5,
  element: { type: "dragon", value: 64 },
};

test("a shot's power is its value × true attack / 100, truncated and held to 1–255", () => {
  assert.equal(shotPower(230, 12), 27); // 27.6
  assert.equal(shotPower(10, 6), 1);
  assert.equal(shotPower(1000, 45), 255);
});

test("a hit is its power × the shot hitzone × the bowgun multiplier, plus its element", () => {
  // trunc(27 × 0.45 × 1.15) = trunc(13.97)
  assert.equal(shotHitDamage(230, NORMAL_2, ZONE, 1.15), 13);
  // trunc(16 × 0.45 × 1.15) = 8, then fire trunc(trunc(45 × 2.3) × 0.10) = trunc(10.3)
  assert.equal(shotHitDamage(230, FLAME, ZONE, 1.15), 8 + 10);
  // Dragon S keeps its element whatever the attack: trunc(64 × 0.35) = 22.
  assert.equal(shotHitDamage(230, DRAGON, ZONE, 1.15), 1 + 22);
  assert.equal(shotHitDamage(400, DRAGON, ZONE, 1.15), 2 + 22);
});

test("a shot's damage is every hit's", () => {
  assert.equal(shotDamage(230, PIERCE_1, ZONE, 1.15), 3 * shotHitDamage(230, PIERCE_1, ZONE, 1.15));
});

const CRAG_1: ShotValue = {
  shot: 9,
  ammo: "Crag S",
  level: 1,
  motion_value: 3,
  explosion: { power: 20, element: { type: "fire", value: 30 } },
};
const CLUST_1: ShotValue = {
  shot: 12,
  ammo: "Clust S",
  level: 1,
  motion_value: 6,
  explosion: { power: 32, attack_scaled: true, hits: 3, element: { type: "fire", value: 2 } },
};

test("an explosion's power ignores the shot hitzone; Clust S's bomblets scale with attack", () => {
  // Crag S: 20 whatever the attack, then fire trunc(30 × 0.10) = 3.
  assert.equal(explosionHitDamage(230, CRAG_1.explosion!, ZONE), 23);
  assert.equal(explosionHitDamage(400, CRAG_1.explosion!, { ...ZONE, shot: 160 }), 23);
  // A bomblet: trunc(32 × 2.3) = 73, fire trunc(2 × 0.10) = 0.
  assert.equal(explosionHitDamage(230, CLUST_1.explosion!, ZONE), 73);
});

test("a Crag or Clust S's damage is its hit and then its explosions", () => {
  // trunc(trunc(3 × 2.3) × 0.45 × 1.15) = 3, then 23.
  assert.equal(shotDamage(230, CRAG_1, ZONE, 1.15), 3 + 23);
  // trunc(13 × 0.45 × 1.15) = 6, then 3 bomblets of 73.
  assert.equal(shotDamage(230, CLUST_1, ZONE, 1.15), 6 + 3 * 73);
});

test("a bowgun loads a shot when its level's capacity is above 0", () => {
  const gun = {
    ammo: [{ name: "Normal S", capacity: [6, 0, 0] }],
    element_ammo: [{ name: "Flame S", capacity: [3] }],
  } as unknown as Weapon;
  assert.equal(loadsShot(gun, { ...NORMAL_2, level: 1 }), true);
  assert.equal(loadsShot(gun, NORMAL_2), false);
  assert.equal(loadsShot(gun, FLAME), true);
  assert.equal(loadsShot(gun, DRAGON), false);
});

test("a part's hitzones carry its shot and element columns", () => {
  assert.deepEqual(
    partHitzones({
      cut: "95",
      bash: "90",
      shot: "90",
      fir: "10",
      wtr: "30",
      thn: "0",
      ice: "10",
      drg: "35",
    }),
    { cut: 95, bash: 90, shot: 90, fire: 10, water: 30, thunder: 0, ice: 10, dragon: 35 },
  );
});

test("hitzones.json's packed parts unpack to the same monster", () => {
  const monster = {
    category: "flying-wyvern" as const,
    slug: "rathalos",
    name: "Rathalos",
    parts: [
      {
        part: "head",
        cut: 95,
        bash: 90,
        shot: 90,
        fire: 10,
        water: 30,
        thunder: 0,
        ice: 10,
        dragon: 35,
      },
    ],
  };
  assert.deepEqual(unpackHitzoneMonster(packHitzoneMonster(monster)), monster);
});
