/** The equipment collection awards (lib/collection.ts). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  armorCollectionAward,
  weaponCollectionAward,
  ARTISAN_HAMMER_AWARD,
  ARTISAN_MITTEN_AWARD,
} from "../src/lib/collection";
import type { EquipSlot } from "../src/lib/save-store";
import type { EquipRef, EquipmentIds } from "../src/lib/schema";

/** A type's table with a ref at each index, and null elsewhere. */
function table(size: number, refs: Record<number, EquipRef>): (EquipRef | null)[] {
  const out: (EquipRef | null)[] = Array(size).fill(null);
  for (const [id, ref] of Object.entries(refs)) out[Number(id)] = ref;
  return out;
}

/**
 * The first ID of each Artisan's Hammer class, with the weapon type its group
 * resolves to. The IDs and classes are from ARTISAN_WEAPONS.
 */
const FIRST_IDS: [number, number, number, string][] = [
  [5, 944, 2, "SnS One"], // Sword and Shield
  [5, 677, 0, "GS One"], // Great Sword
  [5, 814, 6, "Lance One"],
  [5, 1095, 4, "Hammer One"],
  [5, 945, 3, "DB One"],
  [6, 172, 8, "LBG One"],
  [6, 238, 9, "HBG One"],
  [5, 678, 1, "LS One"],
  [6, 289, 10, "Bow One"],
  [5, 815, 7, "GL One"],
  [5, 1096, 5, "HH One"],
];

const melee = table(
  1151,
  Object.fromEntries(
    FIRST_IDS.filter(([type]) => type === 5).map(([, id, group, name]) => [
      id,
      [group, name, 10, name.toLowerCase().replaceAll(" ", "-")],
    ]),
  ),
);
const ranged = table(
  354,
  Object.fromEntries(
    FIRST_IDS.filter(([type]) => type === 6).map(([, id, group, name]) => [
      id,
      [group, name, 10, name.toLowerCase().replaceAll(" ", "-")],
    ]),
  ),
);

const ids: EquipmentIds = [
  table(10, { 0: [0, "Legs", 9, "legs"] }), // leggings
  table(10, {
    0: [0, "Helm A", 9, "helm-a"],
    1: [0, "Helm B", 10, "helm-b"],
    2: [0, "Helm C", 8, "helm-c"],
    3: [0, "Helm D", 9, "helm-d"],
  }), // helmet
  table(10, {}), // plate
  table(10, {}), // gauntlets
  table(10, {}), // waist
  melee,
  ranged,
];

// A second and third Great Sword from the Artisan's list, for the missing list.
melee[675] = [0, "GS Two", 9, "gs-two"];
melee[668] = [0, "GS Three", 8, "gs-three"];

const slots: EquipSlot[] = [
  // Great Sword: three box slots, two of the same weapon.
  { type: 5, id: 677 },
  { type: 5, id: 677 },
  { type: 5, id: 675 },
  // Sword and Shield: four copies of one weapon: the award counts each slot.
  { type: 5, id: 944 },
  { type: 5, id: 944 },
  { type: 5, id: 944 },
  { type: 5, id: 944 },
  // Head: three rarity 9+ pieces, one rarity 8, and an unreadable ID.
  { type: 1, id: 0 },
  { type: 1, id: 1 },
  { type: 1, id: 1 },
  { type: 1, id: 2 },
  { type: 1, id: 99 },
  // Legs: five copies of one rarity 9 piece.
  { type: 0, id: 0 },
  { type: 0, id: 0 },
  { type: 0, id: 0 },
  { type: 0, id: 0 },
  { type: 0, id: 0 },
];

describe("weaponCollectionAward", () => {
  const award = weaponCollectionAward(slots, ids);
  const group = (category: string) => award.groups.find((g) => g.category === category)!;

  test("has one group per weapon class, in the site's order", () => {
    assert.equal(award.index, ARTISAN_HAMMER_AWARD);
    assert.equal(award.total, 11);
    assert.deepEqual(
      award.groups.map((g) => g.category),
      [
        "great-sword",
        "long-sword",
        "sword-and-shield",
        "dual-blades",
        "hammer",
        "hunting-horn",
        "lance",
        "gunlance",
        "light-bowgun",
        "heavy-bowgun",
        "bow",
      ],
    );
  });

  test("counts box slots: two copies of a listed weapon are two", () => {
    assert.deepEqual(
      [group("great-sword").owned, group("great-sword").needed, group("great-sword").missing],
      [3, 4, 1],
    );
    assert.deepEqual(
      [
        group("sword-and-shield").owned,
        group("sword-and-shield").needed,
        group("sword-and-shield").missing,
      ],
      [4, 4, 0],
    );
    assert.equal(group("sword-and-shield").missingPieces.length, 0);
    assert.equal(award.done, 1);
    assert.equal(award.pieces, 7);
  });

  test("lists eligible pieces not in the box, rarest first", () => {
    assert.deepEqual(
      group("great-sword").missingPieces.map((p) => p.name),
      ["GS Three"],
    );
    assert.equal(group("great-sword").missingPieces[0]!.href, "/blacksmith/great-sword/gs-three/");
    assert.equal(group("great-sword").href, "/blacksmith/great-sword/");
  });
});

describe("armorCollectionAward", () => {
  const award = armorCollectionAward(slots, ids);
  const group = (category: string) => award.groups.find((g) => g.category === category)!;

  test("has one group per armor slot, in the site's order", () => {
    assert.equal(award.index, ARTISAN_MITTEN_AWARD);
    assert.equal(award.total, 5);
    assert.deepEqual(
      award.groups.map((g) => g.category),
      ["helmet", "plate", "gauntlets", "waist", "leggings"],
    );
  });

  test("counts rarity 9+ box slots, duplicates included", () => {
    assert.deepEqual(
      [group("helmet").owned, group("helmet").needed, group("helmet").missing],
      [3, 5, 2],
    );
    assert.deepEqual([group("leggings").owned, group("leggings").missing], [5, 0]);
    assert.equal(award.done, 1);
    assert.equal(award.pieces, 8);
  });

  test("lists rarity 9+ pieces not in the box", () => {
    assert.deepEqual(
      group("helmet").missingPieces.map((p) => [p.name, p.rarity]),
      [["Helm D", 9]],
    );
    assert.equal(group("helmet").missingPieces[0]!.href, "/armorsmith/helmet/low-rank/helm-d/");
  });
});
