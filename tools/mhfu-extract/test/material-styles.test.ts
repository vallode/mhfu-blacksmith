import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStyleIndex, loadStyleOverrides, restyleItem } from "../src/build/material-styles.js";
import type { SiteIndex } from "../src/build/ids.js";

const IDS: Record<string, number> = { "fire wyvern claw": 543, "firewyvern claw": 543, "brute bone": 294, "elder bone": 287, ticket: 381 };
const site = { itemIdOf: (name: string) => IDS[name.toLowerCase()] ?? null } as unknown as SiteIndex;
const mat = (name: string, type: string, color: string) => ({ name, amount: 1, type, color });

const byContext = new Map([
  [
    "armor" as const,
    [
      { create_mats: [mat("FireWyvern Claw", "bone", "white"), mat("FireWyvern Claw", "bone", "white"), mat("Brute Bone", "bone", "white")] },
      { create_mats: [mat("Elder Bone", "bone", "white"), mat("Ticket", "bone", "white")] },
    ],
  ],
  ["weapon" as const, [{ create_mats: [mat("Fire Wyvern Claw", "claw", "red")], improve_mats: [mat("Elder Bone", "bone", "slate")] }]],
]);

test("styles skip the bone/white placeholder when an item has any other style", () => {
  const styleOf = buildStyleIndex(byContext, site, new Map());
  assert.deepEqual(styleOf(543), { type: "claw", color: "red" });
  assert.deepEqual(styleOf(287), { type: "bone", color: "slate" });
  // Real bones keep bone/white when it's their only style.
  assert.deepEqual(styleOf(294), { type: "bone", color: "white" });
  assert.equal(styleOf(999), undefined);
});

test("overrides win over committed styles", () => {
  const styleOf = buildStyleIndex(byContext, site, new Map([[381, { type: "ticket", color: "orange" }]]));
  assert.deepEqual(styleOf(381), { type: "ticket", color: "orange" });
});

test("restyleItem rewrites styles in place, keeping names, amounts and key order", () => {
  const styleOf = buildStyleIndex(byContext, site, new Map());
  const changes: string[] = [];
  const item = { name: "Helm", create_mats: [mat("FireWyvern Claw", "bone", "white"), mat("Brute Bone", "bone", "white")], skills: null };
  const out = restyleItem(item, site, styleOf, (m, after) => changes.push(`${m.name} -> ${after.type}/${after.color}`));
  assert.deepEqual(out.create_mats, [mat("FireWyvern Claw", "claw", "red"), mat("Brute Bone", "bone", "white")]);
  assert.deepEqual(Object.keys((out.create_mats as object[])[0]!), ["name", "amount", "type", "color"]);
  assert.deepEqual(changes, ["FireWyvern Claw -> claw/red"]);
  // Nothing to change returns the same object.
  assert.equal(restyleItem(out, site, styleOf, () => {}), out);
});

test("every committed override uses an icon type the site has a mask for", () => {
  const masks = new Set(["herb", "seed", "meat", "bone", "ore", "fish", "hide", "sac", "claw", "scale", "pelt", "insect", "fluid", "part", "egg", "ticket", "bait", "webbing", "mushroom", "shell", "heavenly", "stone", "coin", "ukwn"]);
  const colors = new Set(["blue", "cyan", "gray", "green", "orange", "pink", "red", "slate", "white", "yellow"]);
  for (const [id, style] of loadStyleOverrides()) {
    assert.ok(masks.has(style.type), `override ${id}: no icon mask for "${style.type}"`);
    assert.ok(colors.has(style.color), `override ${id}: no colour token "${style.color}"`);
  }
});
