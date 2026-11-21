import { test } from "node:test";
import assert from "node:assert/strict";
import { readData } from "game-data";
import { DATA_DIR } from "../src/lib/paths";
import { armorVersionKey, groupArmorVersions } from "../src/lib/armor-versions";
import type { ArmorRank } from "../src/lib/constants";

const names = (slot: string, name: string) => {
  const { armor } = readData<{
    armor: { name: string; rank: ArmorRank; rarity: number; sex?: string }[];
  }>(DATA_DIR, "armor", `${slot}.json`);
  const families = groupArmorVersions(armor.map((a) => ({ ...a, slug: "" })));
  return families.find((f) => f.versions.some((v) => v.name === name))?.versions.map((v) => v.name);
};

test("rank suffixes and prefixes share a key", () => {
  assert.equal(armorVersionKey("Rathalos Helm X"), armorVersionKey("Rathalos Helm"));
  assert.equal(armorVersionKey("Silver Sol VestZ"), armorVersionKey("Silver Sol Vest"));
  assert.equal(armorVersionKey("SupremeSteadfastHelm"), armorVersionKey("Steadfast Helm"));
  assert.notEqual(armorVersionKey("Hunter's Vest"), armorVersionKey("Hunter's Ve"));
});

test("versions are grouped across ranks, low rank first", () => {
  assert.deepEqual(names("helmet", "Rathalos Helm S"), [
    "Rathalos Helm",
    "Rathalos Helm S",
    "Rathalos Helm X",
  ]);
  assert.deepEqual(names("helmet", "Garuga Helm S"), [
    "Yian Garuga Helm",
    "Garuga Helm S",
    "Yian Garuga Helm X",
  ]);
});

test("abbreviated names find their versions", () => {
  assert.deepEqual(names("leggings", "RthianHeartLeggingsZ"), [
    "RathianHeartLeggings",
    "RthianHeartLeggingsU",
    "RthianHeartLeggingsZ",
  ]);
  assert.deepEqual(names("gauntlets", "Wht Fatalis Claw Z"), [
    "White Fatalis Claw",
    "Wht Fatalis Claw Z",
  ]);
  assert.deepEqual(names("gauntlets", "Kushala Grasp X"), [
    "Kushala Embrace",
    "Kushala Embrace S",
    "Kushala Grasp X",
  ]);
});

test("pieces of one rank are never versions of each other", () => {
  assert.deepEqual(names("helmet", "Red Lobster Helm"), ["Red Lobster Helm"]);
  assert.deepEqual(names("helmet", "Lobster Helm"), ["Lobster Helm"]);
});
