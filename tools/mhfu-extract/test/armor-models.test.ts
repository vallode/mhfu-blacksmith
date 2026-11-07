import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ARMOR_MODEL_LAYOUT, armorModelPath } from "../src/tables/armor-models.js";
import { loadFileList } from "../src/container/filelist.js";

test("armor model layout counts match the site's equipment ID lists", () => {
  const ids = JSON.parse(readFileSync(new URL("../../../data/equipment-ids.json", import.meta.url), "utf-8")) as Record<string, unknown[]>;
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
