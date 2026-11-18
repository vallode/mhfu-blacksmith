import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readData, RECOIL_LEVELS, RELOAD_LEVELS } from "../src/index.js";

const DATA = fileURLToPath(new URL("../../../data", import.meta.url));

// The site draws recoil and reload arrows from these lists; a level missing
// from them would get no arrows, which reads as the lightest recoil or Normal.
test("every bowgun's recoil and reload is a known level", () => {
  for (const file of ["light-bowgun.json", "heavy-bowgun.json"]) {
    const { weapons } = readData<{ weapons: { id: number; recoil: string; reload: string }[] }>(
      DATA,
      "weapons",
      file,
    );
    assert.ok(weapons.length > 0, file);
    for (const w of weapons) {
      assert.ok(
        (RECOIL_LEVELS as readonly string[]).includes(w.recoil),
        `${file} ${w.id} recoil ${w.recoil}`,
      );
      assert.ok(
        (RELOAD_LEVELS as readonly string[]).includes(w.reload),
        `${file} ${w.id} reload ${w.reload}`,
      );
    }
  }
});
