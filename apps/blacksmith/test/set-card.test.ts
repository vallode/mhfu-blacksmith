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
import { GEM_COLORS, RARITY_COLORS, UI_COLORS } from "../src/lib/embed-format";
import {
  emptyBuild,
  evaluateBuild,
  withDecoration,
  withPiece,
  type BuildSet,
} from "../src/lib/set-build";
import {
  CARD,
  cardSpriteSources,
  jewelLabel,
  MAX_SKILLS,
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

describe("set card contents", () => {
  const texts = (node: CardNode | string | number | null | false): string[] => {
    if (node === null || node === false) return [];
    if (typeof node !== "object") return [String(node)];
    const children = node.props.children;
    return (Array.isArray(children) ? children : [children ?? null]).flatMap((c) =>
      texts(c as CardNode),
    );
  };
  const cardText = (set: BuildSet) => texts(setCardTree(set, data.trees, sprites, "data:,frame"));

  it("shortens every jewel's name to fit beside its icon", () => {
    assert.equal(jewelLabel("Attack Jewel"), "Attack");
    assert.equal(jewelLabel("StrongShot Jewel+"), "StrongShot+");
    assert.equal(jewelLabel("SnowblowerJewel+"), "Snowblower+");
    assert.equal(jewelLabel("DivineProtectJwl"), "DivineProtect");
    for (const d of data.decorations) {
      assert.doesNotMatch(jewelLabel(d.name), /Jewel|Jwl/, d.name);
      assert.ok(jewelLabel(d.name).length <= 13, d.name);
    }
  });

  it("always shows bad skills, cutting good ones to make room", () => {
    // One made-up chest piece with the top skill of 9 trees and the worst bad
    // skill of another.
    const withGood = data.trees.filter((t) => t.skills.some((s) => s.points > 0));
    const withBad = data.trees.filter((t) => t.skills.some((s) => s.points < 0));
    const points: Record<string, number> = {};
    for (const t of withGood.slice(0, MAX_SKILLS + 2)) {
      points[t.tree] = Math.max(...t.skills.map((s) => s.points));
    }
    const badTree = withBad.find((t) => !(t.tree in points))!;
    points[badTree.tree] = Math.min(...badTree.skills.map((s) => s.points));
    const plate = { ...fullSet("Blademaster").pieces[1]!, points, torsoUp: false };
    const set = withPiece(emptyBuild(), "plate", plate);

    const skills = evaluateBuild(data, set).skills;
    const bad = skills.filter((s) => s.threshold < 0);
    const good = skills.filter((s) => s.threshold > 0);
    assert.ok(good.length > MAX_SKILLS && bad.length > 0, "the set needs more skills than fit");
    const text = cardText(set);
    for (const s of bad) assert.ok(text.includes(s.name), s.name);
    const shownGood = good.filter((s) => text.includes(s.name)).length;
    assert.equal(shownGood, MAX_SKILLS - bad.length);
    assert.ok(text.includes(`and ${good.length - shownGood} more`));
  });

  it("leaves out jewels in a slot with no piece, as the stats do", () => {
    let set = withPiece(emptyBuild(), "gauntlets", fullSet("Blademaster").pieces[2]!);
    set = withDecoration(
      set,
      "gauntlets",
      data.decorations.find((d) => d.slots === 1)!,
    );
    const jewel = jewelLabel(set.decorations[0].deco.name);
    assert.ok(cardText(set).includes(jewel));
    set = withPiece(set, "gauntlets", null);
    set.decorations = [
      ...set.decorations,
      { deco: data.decorations.find((d) => d.slots === 1)!, bin: "gauntlets" },
    ];
    assert.ok(!cardText(set).includes(jewel));
  });
});

describe("embed colours", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");
  const token = (name: string) =>
    new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1];

  it("match the @theme tokens they copy", () => {
    for (const [name, hex] of Object.entries(UI_COLORS)) assert.equal(token(name), hex, name);
    for (const [r, hex] of Object.entries(RARITY_COLORS)) assert.equal(token(`rarity-${r}`), hex);
    for (const [gem, hex] of Object.entries(GEM_COLORS)) assert.equal(token(`gem-${gem}`), hex);
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
