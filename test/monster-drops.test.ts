/** The drop-table text helpers (lib/monster-drops.ts) on the shapes found in data/monsters. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatRank, parseDropSource, splitDropQuantity } from "../src/lib/monster-drops";

describe("formatRank", () => {
  test("title-cases and joins hyphenated ranks", () => {
    assert.equal(formatRank("low rank"), "Low Rank");
    assert.equal(formatRank("high-rank"), "High Rank");
    assert.equal(formatRank("g-rank"), "G Rank");
    assert.equal(formatRank("1-2 star guild"), "1-2 Star Guild");
  });
});

describe("parseDropSource", () => {
  test("carves with a count", () => {
    assert.deepEqual(parseDropSource("body carves (x4)"), { title: "Body carves", count: 4 });
    assert.deepEqual(parseDropSource("tail carve (x1)"), { title: "Tail carve", count: 1 });
  });

  test("plain sources", () => {
    assert.deepEqual(parseDropSource("capture"), { title: "Capture" });
    assert.deepEqual(parseDropSource("break back fin"), { title: "Break back fin" });
  });

  test("colon and dash notes", () => {
    assert.deepEqual(parseDropSource("shiny drop : fished out, using frog as bait"), {
      title: "Shiny drop",
      note: "fished out, using frog as bait",
    });
    assert.deepEqual(parseDropSource("break shell - gravios skull"), {
      title: "Break shell",
      note: "gravios skull",
    });
    assert.deepEqual(parseDropSource("tail carves (x2) - cut when hp < 25%"), {
      title: "Tail carves",
      count: 2,
      note: "cut when hp < 25%",
    });
  });

  test("count in the middle and parenthesised remarks", () => {
    assert.deepEqual(parseDropSource("live carving : when playing dead (x3)"), {
      title: "Live carving",
      count: 3,
      note: "when playing dead",
    });
    assert.deepEqual(parseDropSource("shiny drop ( killed )"), {
      title: "Shiny drop",
      note: "killed",
    });
    assert.deepEqual(parseDropSource("shiny drop : ko-ed (hammer, hh, crag s)"), {
      title: "Shiny drop",
      note: "ko-ed; hammer, hh, crag s",
    });
  });
});

describe("splitDropQuantity", () => {
  test("splits a trailing xN", () => {
    assert.deepEqual(splitDropQuantity("Plesioth Scale x2"), ["Plesioth Scale", 2]);
    assert.deepEqual(splitDropQuantity("HvyPiscineFang x1"), ["HvyPiscineFang", 1]);
  });

  test("leaves names without one", () => {
    assert.deepEqual(splitDropQuantity("Wyvern Tears"), ["Wyvern Tears", undefined]);
    assert.deepEqual(splitDropQuantity("Lg Lobstershell"), ["Lg Lobstershell", undefined]);
  });
});
