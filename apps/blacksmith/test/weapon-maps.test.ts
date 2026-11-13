/**
 * The weapon trees written by scripts/generate-maps.ts (content/blacksmith),
 * checked against the crafting data.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { WEAPON_TYPES } from "../src/lib/constants";
import type { WeaponTreeNode } from "../src/lib/types";

const contentDir = path.resolve(__dirname, "..", "content", "blacksmith");

const readTree = (type: string) =>
  (
    JSON.parse(fs.readFileSync(path.join(contentDir, type, "map.json"), "utf-8")) as {
      map: WeaponTreeNode[];
    }
  ).map;

interface Row {
  node: WeaponTreeNode;
  parent?: WeaponTreeNode;
}

/** Every row of a tree, top to bottom, with the row it is nested under. */
const rows = (nodes: WeaponTreeNode[], parent?: WeaponTreeNode): Row[] =>
  nodes.flatMap((node) => [{ node, parent }, ...rows(node.children ?? [], node)]);

describe("weapon trees", () => {
  it("lists a weapon with several parents once in full, and as an alias under the rest", () => {
    const tree = readTree("great-sword");
    const scythes = rows(tree).filter(({ node }) => node.slug === "killer-s-scythe");
    assert.deepEqual(
      scythes.map(({ node, parent }) => [parent?.name, !!node.alias, !!node.children?.length]),
      [
        ["Great Pincer", false, true],
        ["Blue Claw Blade", true, false],
      ],
    );
  });

  it("lists every weapon once, apart from alias rows, which have no children", () => {
    for (const type of WEAPON_TYPES) {
      const listed = new Set<string>();
      for (const { node } of rows(readTree(type))) {
        if (node.alias) {
          assert.equal(node.children, undefined, `${type}: ${node.name}`);
          continue;
        }
        const key = `${node.type}/${node.slug}`;
        assert.ok(!listed.has(key), `${type}: ${node.name} is listed twice`);
        listed.add(key);
      }
    }
  });
});
