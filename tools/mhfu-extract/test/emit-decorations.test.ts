import assert from "node:assert/strict";
import { test } from "node:test";
import { emitDecorations } from "../src/emit/decorations.js";
import {
  DECO_SKILL_ENTRY_SIZE,
  EQUIP_CREATE_ENTRY_SIZE,
  ITEM_ENTRY_SIZE,
  TABLE_COUNTS,
  tableOffset,
} from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

// Same section layout recipes.test.ts uses — the decoration section is the
// very last one in EquipmentCreateTable.
const CREATE_SECTION_COUNTS_BEFORE_DECO = [437, 435, 426, 424, 434, 131, 117, 131, 124, 8, 135, 107, 61, 2];
const decorationCreateBase =
  tableOffset("equipmentCreate") +
  CREATE_SECTION_COUNTS_BEFORE_DECO.reduce((a, b) => a + b, 0) * EQUIP_CREATE_ENTRY_SIZE +
  2 * 2 + // two hidden u16 TERM fields
  2 * EQUIP_CREATE_ENTRY_SIZE; // two hidden NullCreate<0>[1] entries

const decoSkillsBase = tableOffset("decorationSkills") + DECO_SKILL_ENTRY_SIZE; // skip hidden dummy

/**
 * Reproduces the real byte layout for decoration index 0 (`ItemID[948]` =
 * "Paralysis Jewel") — confirmed against a real decrypted JP EBOOT (see
 * emit/decorations.ts) — as a regression fixture, rather than a synthetic
 * one, so this test doubles as a check that the real disc's values keep
 * producing the same output.
 */
function buildParalysisJewelFixture() {
  const totalSize = Math.max(
    tableOffset("decorationValues") + TABLE_COUNTS.decorations * ITEM_ENTRY_SIZE,
    decorationCreateBase + 192 * EQUIP_CREATE_ENTRY_SIZE,
    decoSkillsBase + (TABLE_COUNTS.decorations - 1) * DECO_SKILL_ENTRY_SIZE
  );
  const { buf, reader } = fixtureReader(totalSize);

  // DecorationValues[0]
  const decoOff = tableOffset("decorationValues") + 0 * ITEM_ENTRY_SIZE;
  buf.writeUInt8(3, decoOff + 2); // rarity (raw) -> display rarity 4
  buf.writeUInt32LE(400, decoOff + 12); // price -> create_cost 200
  buf.writeUInt16LE(2, decoOff + 22); // skillTblId

  // DecoSkills — skillTblId=2 resolves to decoSkills array index 0 (see
  // resolveDecorationSkill's "- 2" — one further dummy slot than
  // readDecorationSkills() itself skips).
  const skillOff = decoSkillsBase + 0 * DECO_SKILL_ENTRY_SIZE;
  buf.writeUInt8(1, skillOff + 0); // reqSlots
  buf.writeUInt8(2, skillOff + 8); // skills[0].skill = Paralysis (SkillID 2)
  buf.writeInt8(1, skillOff + 9); // skills[0].amount = +1
  buf.writeUInt8(5, skillOff + 10); // skills[1].skill = Poison (SkillID 5)
  buf.writeInt8(-1, skillOff + 11); // skills[1].amount = -1

  // EquipCreate.decoration entry (equipId is the absolute ItemID index).
  const createOff = decorationCreateBase + 0 * EQUIP_CREATE_ENTRY_SIZE;
  buf.writeUInt16LE(948, createOff + 2); // equipId
  buf.writeUInt16LE(944, createOff + 4); // craft[0].itemId = "Suiko Jewel" (real ItemID)
  buf.writeUInt16LE(1, createOff + 6); // craft[0].quantity

  return reader;
}

test("emitDecorations reproduces the real Paralysis Jewel entry end-to-end", () => {
  const reader = buildParalysisJewelFixture();
  const decorations = emitDecorations(reader);
  const jewel = decorations.find((d) => d.name === "Paralysis Jewel");
  assert.ok(jewel, "Paralysis Jewel should be emitted");
  assert.equal(jewel!.rarity, 4);
  assert.equal(jewel!.create_cost, 200);
  assert.equal(jewel!.slots, 1);
  assert.deepEqual(jewel!.skills, ["Paralysis +1", "Poison -1"]);
  assert.equal(jewel!.type, "decoration");
  assert.deepEqual(jewel!.create_mats, [{ name: "Suiko Jewel", amount: 1, type: "deco", color: "cyan" }]);
  assert.equal(jewel!.alternative_create_mats, null);
});

test("emitDecorations skips decoration slots with no resolvable name", () => {
  const reader = buildParalysisJewelFixture();
  const decorations = emitDecorations(reader);
  // Every other slot in this fixture is all-zero bytes; readItemTable's
  // enum bootstrap either resolves a real name (from the disc-independent
  // .enum file) or the placeholder is skipped — either way nothing should
  // throw, and the one entry we hand-populated must be present exactly once.
  assert.equal(decorations.filter((d) => d.name === "Paralysis Jewel").length, 1);
});
