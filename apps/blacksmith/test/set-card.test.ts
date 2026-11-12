/**
 * Shared-set card images (lib/set-card.ts): every sprite a set can ask for is
 * one the build makes, and real sets render to a PNG of the card's size with
 * satori and resvg, as the Worker draws them.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";
import { ARMOR_SLOTS } from "../src/lib/constants";
import { emptyBuild, withDecoration, withPiece, type BuildSet } from "../src/lib/set-build";
import {
  CARD,
  cardSpriteSources,
  SET_CARD_FONT,
  SET_CARD_FONT_PATH,
  setCardTree,
  spriteName,
  type CardNode,
} from "../src/lib/set-card";
import { loadShippedSetData } from "./helpers/set-data";

const { data } = loadShippedSetData();
const sources = cardSpriteSources();
const names = new Set(sources.map((s) => s.name));

/** Sprites as the build makes them, but each a recognisable stand-in. */
const sprites = Object.fromEntries(sources.map((s) => [s.name, `data:,${s.name}`]));

/** The sprite names a card draws. */
function spritesUsed(node: CardNode | string | number | null | false): string[] {
  if (!node || typeof node !== "object") return [];
  const own = node.props.src ? [node.props.src.replace("data:,", "")] : [];
  const children = node.props.children;
  const list = Array.isArray(children) ? children : [children ?? null];
  return [...own, ...list.flatMap((c) => spritesUsed(c as CardNode))];
}

/** A full G-rank set with a decoration of every colour that fits. */
function fullSet(hunterType: BuildSet["hunterType"]): BuildSet {
  let set = emptyBuild(hunterType, "Male", 3);
  for (const slot of ARMOR_SLOTS) {
    const p = data.pieces
      .filter((x) => x.slot === slot && x.rank === "g-rank" && x.slots === 3)
      .sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0))[0];
    set = withPiece(set, slot, p);
  }
  const ones = data.decorations.filter((d) => d.slots === 1);
  for (const bin of ["weapon", ...ARMOR_SLOTS] as const) {
    for (let i = 0; i < 3; i++) set = withDecoration(set, bin, ones[(i * 7) % ones.length]);
  }
  return set;
}

describe("set card sprites", () => {
  it("has a sprite for every armor piece's slot and rarity", () => {
    for (const p of data.pieces) assert.ok(names.has(spriteName(p.slot, p.rarity)), p.href);
  });

  it("has a sprite for every decoration's colour", () => {
    for (const d of data.decorations) {
      assert.ok(names.has(spriteName("decoration", null, d.color)), d.href);
    }
  });

  it("only draws sprites the build makes", () => {
    for (const set of [fullSet("Blademaster"), fullSet("Gunner"), emptyBuild()]) {
      const used = spritesUsed(setCardTree(set, data.trees, sprites, "data:,frame"));
      assert.ok(used.length > 0);
      for (const name of used) assert.ok(name === "frame" || names.has(name), name);
    }
  });

  it("finds every sprite's image", () => {
    for (const s of sources) {
      assert.ok(fs.existsSync(path.join(process.cwd(), "public/images", s.file)), s.file);
    }
  });
});

describe("set card rendering", () => {
  const font = fs.readFileSync(path.join(process.cwd(), "public", SET_CARD_FONT_PATH));
  // A 1×1 transparent PNG for every image: the layout is what's under test.
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const blank = Object.fromEntries(sources.map((s) => [s.name, pixel]));

  before(async () => {
    await initWasm(fs.readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
  });

  it("draws a full set as a PNG of the card's size", async () => {
    const tree = setCardTree(fullSet("Blademaster"), data.trees, blank, pixel);
    const svg = await satori(tree as never, {
      width: CARD.width,
      height: CARD.height,
      fonts: [{ name: SET_CARD_FONT, data: font, weight: 400, style: "normal" }],
    });
    const png = new Resvg(svg).render();
    assert.equal(png.width, CARD.width);
    assert.equal(png.height, CARD.height);
    assert.deepEqual(
      [...png.asPng().subarray(1, 4)],
      [..."PNG"].map((c) => c.charCodeAt(0)),
    );
  });
});
