import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { compareTiers, STAGES } from "../src/lib/min-rank";
import { loadMinRanks, type Recipes } from "../scripts/lib/min-rank-data";
import { DATA_DIR } from "../src/lib/paths";

const dataDir = DATA_DIR;
const ranks = loadMinRanks(dataDir);

const readList = (dir: string, file: string, field: string) =>
  (
    JSON.parse(fs.readFileSync(path.join(dataDir, dir, file), "utf-8")) as Record<string, unknown[]>
  )[field] as ({ name: string } & Recipes)[];

describe("min rank over the real data", () => {
  it("finds a route for every weapon and armor piece", () => {
    for (const file of fs.readdirSync(path.join(dataDir, "weapons")))
      for (const w of readList("weapons", file, "weapons"))
        assert.ok(ranks.weapon(file.replace(/\.json$/, ""), w.name), `${file}: ${w.name}`);
    for (const file of fs.readdirSync(path.join(dataDir, "armor")))
      for (const p of readList("armor", file, "armor"))
        assert.ok(ranks.armor(p), `${file}: ${p.name}`);
  });

  it("never needs more than the last stage the selector offers", () => {
    const last = STAGES.at(-1)!;
    for (const file of fs.readdirSync(path.join(dataDir, "weapons")))
      for (const w of readList("weapons", file, "weapons")) {
        const needs = ranks.weapon(file.replace(/\.json$/, ""), w.name)!;
        assert.ok(compareTiers(needs, last) <= 0, `${file}: ${w.name}`);
      }
    for (const file of fs.readdirSync(path.join(dataDir, "armor")))
      for (const p of readList("armor", file, "armor"))
        assert.ok(compareTiers(ranks.armor(p)!, last) <= 0, `${file}: ${p.name}`);
  });

  it("finds a route for every decoration, within the last stage", () => {
    const last = STAGES.at(-1)!;
    const { decorations } = JSON.parse(
      fs.readFileSync(path.join(dataDir, "decorations.json"), "utf-8"),
    ) as { decorations: ({ name: string } & Recipes)[] };
    for (const d of decorations) {
      const needs = ranks.decoration(d);
      assert.ok(needs, d.name);
      assert.ok(compareTiers(needs, last) <= 0, d.name);
    }
  });

  it("treats materials only decorations use as gathered (Power Seed)", () => {
    const deco = (name: string) =>
      (
        JSON.parse(fs.readFileSync(path.join(dataDir, "decorations.json"), "utf-8")) as {
          decorations: ({ name: string } & Recipes)[];
        }
      ).decorations.find((d) => d.name === name)!;
    // Suiko Jewel + Power Seed + Kut-Ku Scale; Power Seed is a quest reward
    // only from High Rank, but it's gathered.
    assert.equal(ranks.decoration(deco("Attack Jewel"))?.rank, "low-rank");
    assert.equal(ranks.decoration(deco("Strongest Jewel"))?.rank, "g-rank");
  });

  it("places starter, high-rank and G-rank gear", () => {
    assert.equal(ranks.weapon("great-sword", "Buster Sword")?.rank, "low-rank");
    assert.equal(ranks.weapon("great-sword", "Blushing Dame G")?.rank, "g-rank");
    // Upgrades from a weapon in another type's tree.
    assert.ok(ranks.weapon("dual-blades", "Rouge Flames"));
  });
});
