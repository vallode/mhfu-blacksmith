import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Tier } from "../src/lib/min-rank";
import { countRows, pruneTree } from "../src/lib/tree-visibility";
import type { WeaponTreeNode } from "../src/lib/types";

const low = (stars: number): Tier => ({ rank: "low-rank", stars });
const high = (stars: number): Tier => ({ rank: "high-rank", stars });
const node = (
  slug: string,
  min_rank: WeaponTreeNode["min_rank"],
  children?: WeaponTreeNode[],
): WeaponTreeNode => ({ slug, name: slug, type: "t", min_rank, children });

const hrefOf = (n: WeaponTreeNode) => `/t/${n.slug}/`;
const progress: Tier = { rank: "low-rank", stars: 4 };

/** The slugs in tree order, each indented by depth. */
const outline = (nodes: WeaponTreeNode[], depth = 0): string[] =>
  nodes.flatMap((n) => [`${"-".repeat(depth)}${n.slug}`, ...outline(n.children ?? [], depth + 1)]);

describe("pruneTree", () => {
  it("leaves the tree alone when nothing is chosen", () => {
    const tree = [node("a", high(9))];
    assert.equal(pruneTree(tree, null, { hrefOf }), tree);
  });

  it("hides a row that is out of reach along with everything below it", () => {
    const tree = [node("a", low(1), [node("b", low(3)), node("c", high(7), [node("d", high(8))])])];
    assert.deepEqual(outline(pruneTree(tree, progress, { hrefOf })), ["a", "-b"]);
  });

  it("keeps a row below a hidden one that can be made another way, in the hidden row's place", () => {
    const tree = [
      node("a", low(1), [
        node("b", high(7), [
          node("c", low(2), [node("e", low(4))]), // forged from scratch
          node("d", high(8)),
        ]),
      ]),
    ];
    const pruned = pruneTree(tree, progress, { hrefOf });
    assert.deepEqual(outline(pruned), ["a", "-c", "--e"]);
    // c is still upgraded from b, which it no longer sits under.
    assert.equal(pruned[0].children![0].parentHref, "/t/b/");
    assert.equal(pruned[0].children![0].children![0].parentHref, undefined);
  });

  it("promotes through several hidden rows, pointing at the real parent", () => {
    const tree = [node("a", high(7), [node("b", high(8), [node("c", low(1))])])];
    const pruned = pruneTree(tree, progress, { hrefOf });
    assert.deepEqual(outline(pruned), ["c"]);
    assert.equal(pruned[0].parentHref, "/t/b/");
  });

  it("keeps the row the page is on, and never hides a row of unknown rank", () => {
    const tree = [node("a", high(7)), node("b", undefined), node("c", high(9))];
    assert.deepEqual(outline(pruneTree(tree, progress, { hrefOf, keepSlug: "c" })), ["b", "c"]);
  });

  it("does not change the tree it was given", () => {
    const tree = [node("a", low(1), [node("b", high(7))])];
    pruneTree(tree, progress, { hrefOf });
    assert.equal(countRows(tree), 2);
    assert.equal(tree[0].children!.length, 1);
  });
});
