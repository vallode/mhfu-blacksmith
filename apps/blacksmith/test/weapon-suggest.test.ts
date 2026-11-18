import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { decodeWeapon, type Dictionaries, type WeaponBundle } from "../src/lib/schema";
import type { Weapon } from "../src/lib/types";
import { suggestWeapons, weaponTypesFor } from "../src/lib/weapon-suggest";
import { loadShippedSetData } from "./helpers/set-data";

const weapon = (name: string, attack: number, extra: Partial<Weapon> = {}): Weapon => ({
  name,
  slug: name.toLowerCase().replace(/ /g, "-"),
  type: "great-sword",
  attack,
  slots: 0,
  ...extra,
});

describe("weaponTypesFor", () => {
  it("splits the classes by hunter type", () => {
    assert.deepEqual(weaponTypesFor("Gunner"), ["light-bowgun", "heavy-bowgun", "bow"]);
    const blade = weaponTypesFor("Blademaster");
    assert.equal(blade.length, 8);
    assert.ok(blade.includes("great-sword") && !blade.includes("bow"));
  });
});

describe("suggestWeapons", () => {
  const weapons = [
    weapon("No Slots", 1000),
    weapon("One Slot", 900, { slots: 1 }),
    weapon("Two Slots", 800, { slots: 2 }),
    weapon("Three Slots", 700, { slots: 3 }),
    weapon("High Rank", 1200, { slots: 2, min_rank: { rank: "high-rank", stars: 7 } }),
    weapon("G Rank", 1500, { slots: 3, min_rank: { rank: "g-rank", stars: 1 } }),
    weapon("dummy (Test)", 9999, { slots: 3 }),
  ];
  const names = (ws: Weapon[]) => ws.map((w) => w.name);

  it("keeps weapons with room for the search's weapon slots, strongest first", () => {
    assert.deepEqual(names(suggestWeapons(weapons, { slots: 2, rank: "g-rank" })), [
      "G Rank",
      "High Rank",
      "Two Slots",
      "Three Slots",
    ]);
  });

  it("keeps to the search's rank and quest progress", () => {
    assert.deepEqual(names(suggestWeapons(weapons, { slots: 2, rank: "high-rank" })), [
      "High Rank",
      "Two Slots",
      "Three Slots",
    ]);
    assert.deepEqual(
      names(
        suggestWeapons(weapons, {
          slots: 2,
          rank: "g-rank",
          progress: { rank: "high-rank", stars: 6 },
        }),
      ),
      ["Two Slots", "Three Slots"],
    );
  });

  it("counts sharpness: white 1248 beats green 1296", () => {
    const ws = [
      weapon("Green", 1296, { sharpness: [5, 5, 5, 10] }),
      weapon("White", 1248, { sharpness: [5, 5, 5, 5, 5, 5] }),
    ];
    assert.deepEqual(names(suggestWeapons(ws, { slots: 0, rank: "g-rank" })), ["White", "Green"]);
  });

  it("breaks attack ties on affinity, then more slots", () => {
    const tied = [
      weapon("Plain", 500, { slots: 1 }),
      weapon("Sharp", 500, { slots: 1, affinity: "10%" }),
      weapon("Roomy", 500, { slots: 3 }),
    ];
    assert.deepEqual(names(suggestWeapons(tied, { slots: 1, rank: "g-rank" })), [
      "Sharp",
      "Roomy",
      "Plain",
    ]);
  });

  it("finds 3-slot G-rank weapons for every class in the shipped data", () => {
    loadShippedSetData(); // generates the bundles if they're missing
    const dir = path.join(process.cwd(), "public", "data");
    const dict = JSON.parse(
      fs.readFileSync(path.join(dir, "dictionaries.json"), "utf-8"),
    ) as Dictionaries;
    for (const type of [...weaponTypesFor("Blademaster"), ...weaponTypesFor("Gunner")]) {
      const b = JSON.parse(
        fs.readFileSync(path.join(dir, `weapon-${type}.json`), "utf-8"),
      ) as WeaponBundle;
      const all = b.items.map((w) => decodeWeapon(dict, w, b.type));
      const found = suggestWeapons(all, { slots: 3, rank: "g-rank" });
      assert.ok(found.length > 0, type);
      assert.ok(
        found.every((w) => w.slots === 3 && !w.name.startsWith("dummy")),
        type,
      );
    }
  });
});
