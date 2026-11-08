/**
 * Compact armor bundle decoding (lib/schema.ts): max defence on items and
 * tree rows.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeArmor, decodeTreeNode, type Dictionaries } from "../src/lib/schema";

const dict = { strings: ["Male/Female"], material_ids: [] } as unknown as Dictionaries;

test("decodeArmor reads both max defences", () => {
  const piece = decodeArmor(
    dict,
    { n: "Hunter's Helm S", s: "h", rk: 1, d: 38, md: 108, mp: 52 },
    "helmet",
  );
  assert.equal(piece.defence, 38);
  assert.equal(piece.max_defence, 108);
  assert.equal(piece.max_defence_pre_ukanlos, 52);
});

test("decodeArmor leaves max defence unset when the bundle has none", () => {
  const piece = decodeArmor(dict, { n: "Old", s: "o", rk: 0, d: 5 }, "helmet");
  assert.equal(piece.max_defence, undefined);
  assert.equal(piece.max_defence_pre_ukanlos, undefined);
});

test("decodeTreeNode carries an armor row's max defence to its children", () => {
  const node = decodeTreeNode({ s: "a", n: "A", d: 110, k: [{ s: "b", n: "B", d: 60 }] }, "helmet");
  assert.equal(node.max_defence, 110);
  assert.equal(node.children?.[0]?.max_defence, 60);
});
