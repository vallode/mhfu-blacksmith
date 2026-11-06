import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlaceholderName, loadEnums, lookupName } from "../src/strings/enums.js";
import { getNameResolver } from "../src/strings/names.js";
import { TABLE_COUNTS } from "../src/tables/offsets.js";

test("loadEnums tolerates the vendor files' declared-vs-actual header mismatch", () => {
  // Every table in the vendored .enum files has a `str Name[N]` header count
  // that disagrees with its actual parsed entry count (an authoring quirk,
  // not a real gap) — this must not throw, and the *parsed* count must match
  // our independently-validated real stat-table counts.
  const enums = loadEnums();
  assert.equal(enums.get("HeadArmorID")?.length, TABLE_COUNTS.headArmor);
  assert.equal(enums.get("ChestArmorID")?.length, TABLE_COUNTS.chestArmor);
  assert.equal(enums.get("ArmArmorID")?.length, TABLE_COUNTS.armArmor);
  assert.equal(enums.get("WaistArmorID")?.length, TABLE_COUNTS.waistArmor);
  assert.equal(enums.get("LegArmorID")?.length, TABLE_COUNTS.legArmor);
  assert.equal(enums.get("WepBMID")?.length, TABLE_COUNTS.weaponsBlademaster);
  assert.equal(enums.get("WepGunID")?.length, TABLE_COUNTS.weaponsGunner);
});

test("lookupName returns null for placeholder/empty-slot names and out-of-range indices", () => {
  const enums = loadEnums();
  assert.equal(lookupName(enums, "HeadArmorID", 0), null); // "－－－－－－" placeholder
  assert.equal(lookupName(enums, "HeadArmorID", 1), "Leather Helm");
  assert.equal(lookupName(enums, "HeadArmorID", 999999), null);
});

test("lookupName throws for an unknown table name", () => {
  const enums = loadEnums();
  assert.throws(() => lookupName(enums, "NotARealTable", 0));
});

test("isPlaceholderName recognizes both full-width and ASCII dash runs", () => {
  assert.equal(isPlaceholderName("－－－－－－"), true);
  assert.equal(isPlaceholderName("---"), true);
  assert.equal(isPlaceholderName("Leather Helm"), false);
});

test("getNameResolver resolves real names end-to-end via the enum bootstrap", () => {
  const resolver = getNameResolver();
  assert.equal(resolver.source, "mhp2g-patterns-enum");
  assert.equal(resolver.resolve("WepBMID", 1), "Carbalite Sword");
  assert.equal(resolver.resolve("HeadArmorID", 0), null);
});
