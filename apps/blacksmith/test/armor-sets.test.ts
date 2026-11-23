import assert from "node:assert/strict";
import { test } from "node:test";
import { readData } from "game-data";
import {
  armorGameIds,
  armorSetMatcher,
  matchArmorSets,
  type SetPiece,
} from "../src/lib/armor-sets";
import { ARMOR_SLOTS, type ArmorSlot } from "../src/lib/constants";
import { DATA_DIR } from "../src/lib/paths";
import type { EquipRef } from "../src/lib/schema";

/** Every slot's pieces with their game IDs, as the site matches them. */
function load(): Record<ArmorSlot, SetPiece[]> {
  const ids = readData<Record<string, ({ name: string; sex?: string } | null)[]>>(
    DATA_DIR,
    "equipment-ids.json",
  );
  return Object.fromEntries(
    ARMOR_SLOTS.map((slot) => {
      const { armor } = readData<{ armor: Omit<SetPiece, "id">[] }>(
        DATA_DIR,
        "armor",
        `${slot}.json`,
      );
      // As the site finds them (armor-set-data.ts), from equipment-ids.json's refs.
      const table = (ids[slot] ?? []).map((e) => (e ? ([0, e.name, null] as EquipRef) : null));
      const gameIds = armorGameIds(
        table,
        armor.map((p) => ({ name: p.name, slug: "" })),
      );
      return [slot, armor.map((p, i) => ({ ...p, id: gameIds[i]! }))];
    }),
  ) as Record<ArmorSlot, SetPiece[]>;
}

const pieces = load();
const sets = matchArmorSets(pieces);
const setOf = (slot: ArmorSlot, name: string) =>
  sets[slot][pieces[slot].findIndex((p) => p.name === name)];

test("a Blademaster's helm and a Gunner's cap find their own sets", () => {
  assert.deepEqual(setOf("helmet", "Rathalos Helm"), {
    helmet: "Rathalos Helm",
    plate: "Rathalos Mail",
    gauntlets: "Rathalos Vambraces",
    waist: "Rathalos Tasset",
    leggings: "Rathalos Greaves",
  });
  assert.deepEqual(setOf("helmet", "Rathalos Cap"), {
    helmet: "Rathalos Cap",
    plate: "Rathalos Vest",
    gauntlets: "Rathalos Guards",
    waist: "Rathalos Coat",
    leggings: "Rathalos Leggings",
  });
});

test("every piece of a set finds the same set", () => {
  const set = setOf("plate", "Battle Vest")!;
  for (const slot of ARMOR_SLOTS) assert.deepEqual(setOf(slot, set[slot]!), set);
});

test("Torso Up pieces and cut-short tier names join their sets", () => {
  assert.equal(setOf("plate", "Giaprey Mail")?.waist, "Giaprey Tasset");
  assert.equal(setOf("plate", "Velociprey Vest S")?.leggings, "Velociprey LeggingsS");
});

test("a set's legs needn't share its name", () => {
  assert.equal(setOf("plate", "Chain Mail")?.leggings, "Blue Pants");
});

test("a piece that goes with nothing has no set", () => {
  assert.equal(setOf("helmet", "Protection Piercing"), null);
});

test("most pieces are in a full set", () => {
  const all = ARMOR_SLOTS.flatMap((slot) => sets[slot]);
  const full = all.filter((set) => set && Object.values(set).every(Boolean)).length;
  assert.ok(full / all.length > 0.85, `${full} of ${all.length}`);
});

test("a piece's set asked for alone is the one matched with every other", () => {
  const setOf = armorSetMatcher(pieces);
  const index = pieces.helmet.findIndex((p) => p.name === "Rathalos Cap");
  assert.deepEqual(setOf("helmet", index), sets.helmet[index]);
});

test("game IDs come by slug for pieces sold per sex, else by name", () => {
  const table: (EquipRef | null)[] = [
    null,
    [0, "Leather Helm", 1],
    [0, "Guild Guard Coat", 3, "guild-guard-coat-male", "Male"],
    [0, "Guild Guard Coat", 3, "guild-guard-coat-female", "Female"],
  ];
  assert.deepEqual(
    armorGameIds(table, [
      { name: "Guild Guard Coat", slug: "guild-guard-coat-female" },
      { name: "Leather Helm", slug: "leather-helm" },
      { name: "Unlisted", slug: "unlisted" },
    ]),
    [3, 1, Number.MAX_SAFE_INTEGER],
  );
});
