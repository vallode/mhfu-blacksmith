/**
 * Each monster's hitbox file (`public/models/monsters/emNN.hitboxes.json`,
 * written by packages/mhfu-extract `export-site`) names its capsules by the
 * hitzone parts in `data/monsters`. A part renamed in the data without a new
 * export would leave the 3D legend on the old name.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readData } from "game-data";
import { DATA_DIR } from "../src/lib/paths";

const MODELS = path.resolve(__dirname, "..", "public", "models");
const TYPES = fs.readdirSync(path.join(DATA_DIR, "monsters")).filter((f) => f.endsWith(".json"));
/** Monster name -> its model's NN, as the site finds the file (`lib/models.ts`). */
const MODEL_IDS = JSON.parse(
  fs.readFileSync(path.join(MODELS, "manifest", "monsters.json"), "utf8"),
) as Record<string, number>;

interface Capsule {
  row: number;
  parts: string[];
}

test("every hitbox capsule is named by its monster's hitzone parts", () => {
  let files = 0;
  for (const file of TYPES) {
    const { monsters } = readData<{
      monsters: { name: string; hitzones?: Record<string, unknown> }[];
    }>(DATA_DIR, "monsters", file);
    for (const monster of monsters) {
      const nn = MODEL_IDS[monster.name];
      const hitboxes = path.join(
        MODELS,
        "monsters",
        `em${String(nn).padStart(2, "0")}.hitboxes.json`,
      );
      if (nn === undefined || !fs.existsSync(hitboxes)) continue;
      files++;
      const { capsules } = JSON.parse(fs.readFileSync(hitboxes, "utf8")) as { capsules: Capsule[] };
      const parts = new Set(Object.keys(monster.hitzones ?? {}));
      const byRow = new Map<number, string>();
      for (const capsule of capsules) {
        for (const part of capsule.parts) {
          assert.ok(parts.has(part), `${monster.name}: "${part}" isn't one of its hitzone parts`);
        }
        const names = capsule.parts.join(",");
        assert.equal(byRow.get(capsule.row) ?? names, names, `${monster.name} row ${capsule.row}`);
        byRow.set(capsule.row, names);
      }
    }
  }
  assert.ok(files > 0, "no hitbox files found");
});
