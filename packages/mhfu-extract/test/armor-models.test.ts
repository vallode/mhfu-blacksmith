import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readData } from "game-data";
import {
  ARMOR_MODEL_LAYOUT,
  armorModelPath,
  readArmorModelIds,
} from "../src/tables/armor-models.js";
import { BinaryReader } from "../src/binary/reader.js";
import { MHP2G_EU_RESOLVER } from "../src/games/mhp2g.js";
import { ARMOR_SLOT_TABLE_NAMES_EU } from "../src/tables/eu-signatures.js";
import { loadFileList } from "../src/container/filelist.js";

test("armor model layout counts match the site's equipment ID lists", () => {
  const ids = readData<Record<string, unknown[]>>(
    fileURLToPath(new URL("../../../data", import.meta.url)),
    "equipment-ids.json",
  );
  for (const [slot, layout] of Object.entries(ARMOR_MODEL_LAYOUT)) {
    assert.equal(layout.count, ids[slot]!.length, slot);
  }
});

test("armorModelPath names real DATA.BIN files", () => {
  const paths = new Set(loadFileList().values());
  // Verified on an EU disc: the last male waist model is used by Dragon Scale X.
  assert.equal(armorModelPath("waist", "m", 296), "player/m/wst/m_wst296.pac");
  for (const slot of Object.keys(ARMOR_MODEL_LAYOUT) as (keyof typeof ARMOR_MODEL_LAYOUT)[]) {
    assert.ok(paths.has(armorModelPath(slot, "m", 1)), slot);
    assert.ok(paths.has(armorModelPath(slot, "f", 1)), slot);
  }
});

test("readArmorModelIds reads each site slot from its own array (EU signature path)", () => {
  // Real EU offsets; each signature is that array's first two real entries.
  const offsets: Record<string, number> = {
    armorValuesHead: 0x161808,
    armorValuesChest: 0x165c28,
    armorValuesArm: 0x169dc8,
    armorValuesWaist: 0x16de00,
    armorValuesLeg: 0x171de8,
  };
  const buf = Buffer.alloc(0x180000);
  for (const [name, off] of Object.entries(offsets))
    ARMOR_SLOT_TABLE_NAMES_EU[name]!.signature.copy(buf, off);
  const ids = readArmorModelIds(new BinaryReader(buf), MHP2G_EU_RESOLVER);
  // Entry 1 of each slot (Leather Helm, ..., Green Pants), from real bytes.
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(ids).map(([slot, e]) => [slot, [e[1]!.maleId, e[1]!.femaleId]]),
    ),
    { helmet: [15, 17], plate: [6, 36], gauntlets: [6, 35], waist: [6, 25], leggings: [6, 26] },
  );
  assert.equal(ids.helmet.length, 436);
  assert.equal(ids.leggings.length, 420);
});
