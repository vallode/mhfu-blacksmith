import assert from "node:assert/strict";
import { test } from "node:test";
import { fitGuides } from "../src/hints/guides.js";
import { COLOURS, compact, paint, STYLE } from "../src/hints/style.js";
import { width } from "../src/hints/bookshelf.js";

test("paint colours text and goes back to white; white needs no code", () => {
  assert.equal(paint(COLOURS.red, "Fire"), "~C19Fire~C00");
  assert.equal(paint(COLOURS.white, "plain"), "plain");
  assert.equal(width(paint(STYLE.heading, "ab")), 2, "codes take no room");
});

test("compact keeps only the codes something shows", () => {
  // Spaces don't show a colour; one colour in a row needs one code.
  assert.equal(compact("~C19Fire★★★~C00 ~C17Water★~C00"), "~C19Fire★★★ ~C17Water★~C00");
  assert.equal(compact("~C06a~C00~C06b~C00"), "~C06ab~C00");
  assert.equal(compact("plain ~C00text"), "plain text");
  assert.equal(compact("~C05~C10x~C00"), "~C10x~C00", "a code nothing follows is dropped");
  // A line that starts in colour says so, whatever the line before left.
  assert.equal(compact("~C03a\n~C03b~C00"), "~C03a\n~C03b~C00");
  assert.equal(compact("~C03a~C00\nb"), "~C03a\n~C00b");
  assert.equal(compact("a\nb"), "a\nb", "white lines carry no codes");
});

test("guides share their room in order, leaving the later ones their smallest", () => {
  /** A plan whose text is `full` bytes, or its smallest, `least`, when that won't fit. */
  const plan = (full: number, least: number) => ({
    fit: (bytes: number) => {
      const size = bytes >= full ? full : least;
      return { texts: ["x".repeat(size - 1)], report: { title: "", notes: [], lines: [] } };
    },
  });
  const sizes = (room: number) =>
    fitGuides([plan(100, 50), plan(200, 150)], room).map((b) => b.texts[0]!.length + 1);
  assert.deepEqual(sizes(300), [100, 200]);
  assert.deepEqual(sizes(260), [100, 150], "the first takes all it needs");
  assert.deepEqual(sizes(240), [50, 150], "but leaves the second its smallest");
});
