/**
 * Shared-set link embeds (lib/set-embed.ts): the Worker's slim data gives the
 * same stats as the editor's full search data, and the embed text.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARMOR_SLOTS } from "../src/lib/constants";
import {
  emptyBuild,
  evaluateBuild,
  withDecoration,
  withPiece,
  type BuildSet,
} from "../src/lib/set-build";
import { buildCodecTables, decodeSet, encodeSet } from "../src/lib/set-codec";
import {
  buildSetEmbed,
  embedCodecTables,
  setEmbedData,
  setReader,
  type SetEmbedData,
} from "../src/lib/set-embed";
import { tintFor } from "../src/lib/embed-format";
import type { Piece } from "../src/lib/set-search";
import { loadShippedSetData } from "./helpers/set-data";

const { data, ids } = loadShippedSetData();
const tables = buildCodecTables(data, ids);
/** As the Worker gets it: through JSON. */
const embedData = JSON.parse(JSON.stringify(setEmbedData(data, tables, "test"))) as SetEmbedData;
const read = setReader(embedData);
const embed = (code: string) => {
  const r = read(code);
  return r && buildSetEmbed(r.set, embedData.trees, r.name);
};

const byName = (slot: string, name: string): Piece => {
  const p = data.pieces.find((x) => x.slot === slot && x.name === name);
  assert.ok(p, `${slot} ${name}`);
  return p;
};
const deco = (name: string) => {
  const d = data.decorations.find((x) => x.name === name);
  assert.ok(d, name);
  return d;
};

/** Rathalos (low rank) with Attack Jewels in the weapon and chest. */
function rathalosSet(): BuildSet {
  let set = emptyBuild("Blademaster", "Male", 2);
  for (const [slot, name] of [
    ["helmet", "Rathalos Helm"],
    ["plate", "Rathalos Mail"],
    ["gauntlets", "Rathalos Vambraces"],
    ["waist", "Rathalos Tasset"],
    ["leggings", "Rathalos Greaves"],
  ] as const) {
    set = withPiece(set, slot, byName(slot, name));
  }
  set = withDecoration(set, "weapon", deco("Attack Jewel"));
  set = withDecoration(set, "weapon", deco("Attack Jewel"));
  return set;
}

describe("set embed data", () => {
  it("has every piece and decoration a code can name", () => {
    assert.equal(Object.keys(embedData.pieces).length, tables.pieceByGameId.size);
    assert.equal(Object.keys(embedData.decorations).length, tables.decoByItemId.size);
  });

  it("decodes every piece to the same stats as the full data", () => {
    const slim = embedCodecTables(embedData);
    for (const p of data.pieces) {
      const set = withPiece(emptyBuild(), p.slot, p);
      const r = decodeSet(encodeSet(set, tables), slim);
      assert.ok(r.ok && r.dropped.length === 0, p.href);
      const want = evaluateBuild(data, set);
      const got = evaluateBuild({ ...data, pieces: [], decorations: [] }, r.set);
      assert.deepEqual(
        { defence: got.defence, res: got.res, totals: got.totals, slots: got.freeSlots },
        { defence: want.defence, res: want.res, totals: want.totals, slots: want.freeSlots },
        p.href,
      );
    }
  });

  it("keeps each decoration's gem colour, for the card's icons", () => {
    const slim = embedCodecTables(embedData);
    for (const d of data.decorations) {
      assert.equal(slim.decoByItemId.get(d.itemId!)?.color, d.color, d.href);
    }
  });

  it("counts a Torso Up piece's chest skills again", () => {
    const torsoUp = data.pieces.find((p) => p.torsoUp && p.slot !== "plate");
    assert.ok(torsoUp);
    let set = withPiece(emptyBuild(), "plate", byName("plate", "Rathalos Mail"));
    set = withPiece(set, torsoUp.slot, torsoUp);
    const r = decodeSet(encodeSet(set, tables), embedCodecTables(embedData));
    assert.ok(r.ok);
    assert.ok(r.set.pieces.find((p) => p?.slot === torsoUp.slot)?.torsoUp);
    assert.deepEqual(
      evaluateBuild({ ...data, pieces: [], decorations: [] }, r.set).totals,
      evaluateBuild(data, set).totals,
    );
  });
});

describe("set embeds", () => {
  it("titles an unnamed set with its skills, with everything in the alt text", () => {
    const set = rathalosSet();
    const stats = evaluateBuild(data, set);
    const e = embed(encodeSet(set, tables));
    assert.ok(e);
    const good = stats.skills.filter((s) => s.threshold > 0).map((s) => s.name);
    assert.ok(good.length > 0);
    assert.equal(e.title, good.join(" · "));
    assert.equal(e.author, "Low Rank Blademaster Set");
    const details = e.details.split("\n");
    assert.equal(details[0], `Low Rank Blademaster Set: ${good.join(", ")}`);
    assert.ok(details.some((l) => l.startsWith(`Defense ${stats.defence} · 🔥`)));
    for (const slot of ARMOR_SLOTS) {
      const piece = set.pieces[ARMOR_SLOTS.indexOf(slot)]!;
      assert.ok(
        details.some((l) => l.endsWith(`: ${piece.name}`)),
        piece.name,
      );
      assert.ok(
        !e.description.includes(piece.name),
        "pieces are in the image, not the description",
      );
    }
    assert.ok(details.includes("Weapon slots: ○○—"));
    assert.ok(details.includes("Jewels: Attack Jewel ×2"));
  });

  it("is titled with the set's name when its link has one", () => {
    const set = rathalosSet();
    const e = embed(encodeSet(set, tables, "Rath farming"));
    assert.ok(e);
    assert.equal(e.title, "Rath farming");
    assert.equal(e.author, "Low Rank Blademaster Set");
    assert.equal(e.details.split("\n")[0], "Rath farming");
  });

  it("describes the set's points in each tree that activates a skill", () => {
    const set = rathalosSet();
    const stats = evaluateBuild(data, set);
    const e = buildSetEmbed(set, data.trees);
    assert.ok(e);
    assert.equal(
      e.description,
      stats.skills
        .map((s) => `${s.tree} ${s.points > 0 ? "+" : "−"}${Math.abs(s.points)}`)
        .join(" · "),
    );
  });

  it("says a set with no skills has none", () => {
    const helm = data.pieces.find((p) => p.slot === "helmet" && Object.keys(p.points).length === 0);
    assert.ok(helm, "a helmet with no skill points");
    const e = buildSetEmbed(withPiece(emptyBuild(), "helmet", helm), data.trees);
    assert.ok(e);
    assert.equal(e.description, "No skills");
  });

  it("lists bad skills on their own line of the alt text", () => {
    const set = rathalosSet();
    const bad = evaluateBuild(data, set).skills.filter((s) => s.threshold < 0);
    const e = buildSetEmbed(set, data.trees);
    assert.ok(e);
    const line = e.details.split("\n").find((l) => l.startsWith("Bad skills: "));
    if (bad.length === 0) assert.equal(line, undefined);
    else assert.equal(line, `Bad skills: ${bad.map((s) => s.name).join(", ")}`);
  });

  it("names the highest rank and colours the embed by the rarest piece", () => {
    let set = emptyBuild("Gunner");
    const low = data.pieces.find((p) => p.rank === "low-rank" && p.slot === "helmet")!;
    const g = data.pieces
      .filter((p) => p.rank === "g-rank" && p.slot === "plate")
      .sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0))[0];
    set = withPiece(withPiece(set, "helmet", low), "plate", g);
    const e = buildSetEmbed(set, data.trees);
    assert.ok(e);
    assert.equal(e.author, "G-Rank Gunner Set");
    assert.equal(e.color, tintFor(g.rarity));
  });

  it("has no embed for an empty set or a code that doesn't open", () => {
    assert.equal(embed(encodeSet(emptyBuild(), tables)), null);
    assert.equal(embed("not a code!"), null);
    assert.equal(embed(""), null);
  });

  it("says when a set has no skills", () => {
    const plain = data.pieces.find((p) => Object.keys(p.points).length === 0);
    assert.ok(plain);
    const e = buildSetEmbed(withPiece(emptyBuild(), plain.slot, plain), data.trees);
    assert.equal(e?.title, "No skills");
  });
});
