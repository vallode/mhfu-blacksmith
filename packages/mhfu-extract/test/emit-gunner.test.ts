import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emitBowCoatingBonuses,
  emitBowShots,
  emitBowgunAmmo,
  emitGunnerDetails,
  emitRapidFire,
  type GunnerTables,
} from "../src/emit/gunner.js";
import type { BowgunModLevel } from "../src/tables/gunner.js";
import type { GunnerWeapon } from "../src/tables/weapons.js";

// Real EU values for Chain Blitz (WepGunID 2): BGShotTable row 8 and its
// ShotCoatings flags, with the committed site lists they produce.
const SHOT_ROW_8 = [
  3, 6, 9, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 3, 3, 3, 1, 3, 1, 3, 1, 2, 2, 1, 1,
];
const CHAIN_BLITZ_COATINGS = 4117926475;

const chainBlitz: GunnerWeapon = {
  index: 2,
  modelId: 90,
  rarity: 0,
  rangedPhysxTbl: 0,
  price: 1200,
  attack: 90,
  defense: 0,
  recoilCharge: 2,
  slots: 0,
  affinity: 0,
  sortOrder: 2,
  bulletCharge: 8,
  eleType: 0,
  eleValue: 0,
  reload: 2,
  unkn1: 0,
  shotCoatings: CHAIN_BLITZ_COATINGS,
};

const level = (attackIncrease: number): BowgunModLevel => ({
  attackIncrease,
  speed: 0,
  distanceDeviation: 0,
  dropoffSpeed: 0,
  horizontalDeviation: 0,
  efxTiming: 0,
});

const tables: GunnerTables = {
  shots: Array.from({ length: 58 }, (_, i) => (i === 8 ? SHOT_ROW_8 : new Array(32).fill(0))),
  charges: Array.from({ length: 117 }, (_, i) => (i === 29 ? [6, 6, 7, 2] : [0, 0, 0, 0])),
  mods: [[0, 10, 20, 30, 50].map(level), [], [], []],
  rapidFire: new Map([[2, 0x1]]),
};

test("emitBowgunAmmo masks shot table capacities by the gun's ShotCoatings bits", () => {
  const ammo = emitBowgunAmmo(SHOT_ROW_8, CHAIN_BLITZ_COATINGS);
  assert.deepEqual(ammo.ammo, [
    { name: "Normal S", capacity: [3, 6, 0] },
    { name: "Pierce S", capacity: [2, 0, 0] },
    { name: "Pellet S", capacity: [2, 0, 0] },
    { name: "Crag S", capacity: [1, 0, 0] },
    { name: "Clust S", capacity: [1, 0, 0] },
  ]);
  assert.deepEqual(ammo.status_ammo, [
    { name: "RecovS", capacity: [3, 3] },
    { name: "PoisnS", capacity: [3, 0] },
    { name: "Para S", capacity: [3, 0] },
    { name: "SleepS", capacity: [3, 0] },
  ]);
  assert.deepEqual(ammo.element_ammo, [
    { name: "Flame S", capacity: [2] },
    { name: "Water S", capacity: [0] },
    { name: "ThunderS", capacity: [2] },
    { name: "Freeze S", capacity: [0] },
    { name: "Dragon S", capacity: [0] },
  ]);
  assert.deepEqual(ammo.misc_ammo, [
    { name: "Tranq S", capacity: [2] },
    { name: "Paint S", capacity: [2] },
    { name: "Demon S", capacity: [1] },
    { name: "Armor S", capacity: [1] },
  ]);
});

test("emitRapidFire names each ammo once, in bit order", () => {
  assert.equal(emitRapidFire(undefined), null);
  assert.equal(emitRapidFire(0x1), "Normal S Lv1");
  // Azure Sakura (0x12) and Felyne Ragdoll (0x8001).
  assert.equal(emitRapidFire(0x12), "Normal S Lv2|Pierce S Lv1");
  assert.equal(emitRapidFire(0x8001), "Normal S Lv1|Flaming S");
  // Absolute Bow: bits 14 and 15 are both Flaming S.
  assert.equal(emitRapidFire(0x74020), "Pierce S Lv1|Flaming S|Water S|Thunder S|Freeze S");
});

test("emitGunnerDetails maps reload, recoil, max attack and rapid fire for a light bowgun", () => {
  const details = emitGunnerDetails(chainBlitz, "light-bowgun", 120, tables);
  assert.equal(details.reload, "Normal");
  assert.equal(details.recoil, "Moderate");
  // (90 + 50) * 1.2: the committed attack 108 plus 60.
  assert.equal(details.max_attack, 168);
  assert.equal(details.rapid_fire, "Normal S Lv1");
  assert.ok(!("coatings" in details));

  const heavy = emitGunnerDetails(
    { ...chainBlitz, reload: 0, recoilCharge: 5 },
    "heavy-bowgun",
    120,
    tables,
  );
  assert.equal(heavy.reload, "VerySlow");
  assert.equal(heavy.recoil, "VeryWeak");
  assert.equal(heavy.rapid_fire, null);
});

test("emitBowShots takes RecoilCharge + 1 charge levels, at most four", () => {
  // Queen Blaster I: BowChargeTable row 29, RecoilCharge 3.
  assert.deepEqual(emitBowShots([6, 6, 7, 2], 3), [
    { name: "Sctr", level: "2" },
    { name: "Sctr", level: "2" },
    { name: "Sctr", level: "3" },
    { name: "Rapd", level: "3" },
  ]);
  // Akantor Bow: RecoilCharge 2 shows three.
  assert.deepEqual(emitBowShots([7, 12, 3, 13], 2), [
    { name: "Sctr", level: "3" },
    { name: "Prce", level: "3" },
    { name: "Rapd", level: "4" },
  ]);
  assert.equal(emitBowShots([1, 11, 12, 12], 4)!.length, 4);
});

test("bow coating bonuses come from ShotCoatings bits 7-9", () => {
  // Queen Blaster (198), Swordfish Bow (378) and Wing Bow (626).
  assert.deepEqual(emitBowCoatingBonuses(198), [{ name: "Poison", attack: "Add" }]);
  assert.deepEqual(emitBowCoatingBonuses(378), [{ name: "Paralysis", attack: "Add" }]);
  assert.deepEqual(emitBowCoatingBonuses(626), [{ name: "Sleep", attack: "Add" }]);
  assert.deepEqual(emitBowCoatingBonuses(66), []);

  const bow = emitGunnerDetails(
    { ...chainBlitz, bulletCharge: 29, recoilCharge: 3, shotCoatings: 198 },
    "bow",
    120,
    tables,
  );
  assert.deepEqual(bow.coatings, ["poison", "power", "paint"]);
  assert.equal((bow.shots as unknown[]).length, 4);
  assert.ok(!("ammo" in bow));
});
