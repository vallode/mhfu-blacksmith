import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
  tableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import { equipmentCreateLayout, equipmentUpgradeLayout } from "mhfu-extract/src/tables/recipes.js";
import { findRelics, relicTable } from "../src/forge/relics.js";
import { buildEboot } from "./fixtures.js";

/**
 * An EBOOT whose Bone Blade (28) is made at the Great Sword/Long Sword
 * smithy's first entry and upgrades into 30 and 31, 31 back into 28 (a loop)
 * and nowhere else; 29 is made elsewhere and isn't in the line. The
 * Hunter's Bow I (116) is the bow smithy's first entry and upgrades into 117.
 * Model = 200 + ID (melee), 300 + ID (ranged).
 */
function relicEboot(): Buffer {
  const buf = buildEboot([]);
  const reader = new BinaryReader(buf);
  const create = equipmentCreateLayout(reader);
  const upgrade = equipmentUpgradeLayout(reader);
  buf.writeUInt16LE(28, create.greatSwordLongSword.offset + 2);
  buf.writeUInt16LE(29, create.greatSwordLongSword.offset + EQUIP_CREATE_ENTRY_SIZE + 2);
  buf.writeUInt16LE(116, create.bow.offset + 2);
  const upgrades = (family: "blademaster" | "gunner", id: number, targets: number[]) =>
    targets.forEach((t, k) =>
      buf.writeUInt16LE(t, upgrade[family].offset + id * EQUIP_UPGRADE_ENTRY_SIZE + 16 + k * 2),
    );
  upgrades("blademaster", 28, [30]);
  upgrades("blademaster", 30, [31]);
  upgrades("blademaster", 31, [28]);
  upgrades("gunner", 116, [117]);
  for (const id of [28, 29, 30, 31]) {
    buf.writeUInt16LE(200 + id, tableOffset("weaponsBlademaster") + id * WEAPON_BM_ENTRY_SIZE);
  }
  for (const id of [116, 117]) {
    buf.writeUInt16LE(300 + id, tableOffset("weaponsGunner") + id * WEAPON_GUN_ENTRY_SIZE);
  }
  return buf;
}

test("findRelics: each starter's upgrade line, loops and all, and nothing outside it", () => {
  const eboot = relicEboot();
  assert.deepEqual(findRelics(eboot, eboot, undefined), [
    { ranged: false, id: 28, model: 228 },
    { ranged: false, id: 30, model: 230 },
    { ranged: false, id: 31, model: 231 },
    { ranged: true, id: 116, model: 416 },
    { ranged: true, id: 117, model: 417 },
  ]);
});

test("findRelics follows a starter the weapon shuffle moved: the line of what's made in its place", () => {
  const vanilla = relicEboot();
  const shuffled = Buffer.from(vanilla);
  // The shuffle swapped the first two Great Sword/Long Sword entries: 29 is made where 28 was.
  const at = equipmentCreateLayout(new BinaryReader(shuffled)).greatSwordLongSword.offset + 2;
  shuffled.writeUInt16LE(29, at);
  shuffled.writeUInt16LE(28, at + EQUIP_CREATE_ENTRY_SIZE);
  const melee = findRelics(vanilla, shuffled, undefined).filter((r) => !r.ranged);
  assert.deepEqual(melee, [{ ranged: false, id: 29, model: 229 }]);
});

test("relicTable: a count, then each relic's key, sorted", () => {
  const table = relicTable([
    { ranged: true, id: 116, model: 416 },
    { ranged: false, id: 30, model: 230 },
  ]);
  assert.deepEqual(
    [0, 1, 2].map((k) => table.readUInt32LE(k * 4)),
    [2, (30 << 16) | 230, (0x80000000 | (116 << 16) | 416) >>> 0],
  );
});
