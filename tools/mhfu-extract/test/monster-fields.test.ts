import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fieldsAgree, toSite, type FieldContext, type FieldSpec } from "../src/build/fields.js";
import { loadSiteIndex } from "../src/build/ids.js";
import { monsterIdOf, parseDropSlot } from "../src/overlay/monsters.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const ctx: FieldContext = {
  site: loadSiteIndex(DATA),
  spellings: { skill: () => undefined, material: () => undefined },
  materialContext: "decoration",
};
const HITZONES: FieldSpec = { field: "hitzones", kind: "hitzones" };
const DROPS: FieldSpec = { field: "drops", kind: "drops" };

// Item IDs (data/items.json).
const GIAPREY_SCALE = 340;
const GIAPREY_HIDE = 342;
const SM_MONSTER_BONE = 281;
const SCREAMER = 266;

const site = (hitzones: unknown, drops?: unknown) => ({ name: "Giaprey", hitzones, drops });

test("hitzones agree by number, on the parts the disc has", () => {
  const committed = {
    all: {
      cut: "80",
      bash: "80",
      shot: "80",
      fir: "50",
      wtr: "15",
      thn: "30",
      ice: "5",
      drg: "10",
      ko: "100",
    },
    tail: {
      cut: "1",
      bash: "1",
      shot: "1",
      fir: "1",
      wtr: "1",
      thn: "1",
      ice: "1",
      drg: "1",
      ko: "1",
    },
  };
  const disc = {
    all: { cut: 80, bash: 80, shot: 80, fir: 50, wtr: 15, thn: 30, ice: 5, drg: 10, ko: 100 },
  };
  // "tail" has no disc counterpart (the overlay doesn't map it) and is ignored.
  assert.equal(fieldsAgree(HITZONES, committed, disc, ctx), true);
  assert.equal(fieldsAgree(HITZONES, committed, { all: { ...disc.all, ice: 15 } }, ctx), false);
});

test("hitzones toSite rewrites only the differing parts, as strings in committed order", () => {
  const head = {
    cut: "80",
    bash: "70",
    shot: "60",
    fir: "0",
    wtr: "15",
    thn: "20",
    ice: "15",
    drg: "35",
    ko: "100",
  };
  const chest = {
    cut: "30",
    bash: "15",
    shot: "20",
    fir: "15",
    wtr: "5",
    thn: "5",
    ice: "10",
    drg: "10",
    ko: "0",
  };
  const committed = { head, chest };
  const disc = {
    chest: { cut: 10, bash: 15, shot: 20, fir: 15, wtr: 5, ice: 10, thn: 5, drg: 10, ko: 0 },
    head: { cut: 80, bash: 70, shot: 60, fir: 0, wtr: 15, ice: 15, thn: 20, drg: 35, ko: 100 },
  };
  const after = toSite(HITZONES, disc, site(committed), ctx) as Record<
    string,
    Record<string, string>
  >;
  assert.deepEqual(Object.keys(after), ["head", "chest"]);
  assert.equal(after.head, head); // unchanged part keeps its object
  assert.deepEqual(Object.keys(after.chest!), Object.keys(chest));
  assert.deepEqual(after.chest, { ...chest, cut: "10" });
});

test("drops agree as multisets of (item, chance, amount), on the groups the disc has", () => {
  const committed = {
    "low-rank": {
      "body carves (x1)": [
        { name: "Giaprey Hide", chance: "30%" },
        { name: "Giaprey Scale", chance: "52%" },
        { name: "Sm Monster Bone", chance: "18%" },
      ],
      "not on the disc": [{ name: "Giaprey Scale", chance: "100%" }],
    },
    "only on the site": { capture: [{ name: "Screamer x2", chance: "100%" }] },
  };
  const disc = {
    "low-rank": {
      "body carves (x1)": [
        { itemId: GIAPREY_SCALE, name: "Giaprey Scale", chance: 52, amount: 1 },
        { itemId: GIAPREY_HIDE, name: "Giaprey Hide", chance: 30, amount: 1 },
        { itemId: SM_MONSTER_BONE, name: "Sm Monster Bone", chance: 18, amount: 1 },
      ],
    },
  };
  assert.equal(fieldsAgree(DROPS, committed, disc, ctx), true);
  const changed = structuredClone(disc);
  changed["low-rank"]["body carves (x1)"][0]!.chance = 50;
  assert.equal(fieldsAgree(DROPS, committed, changed, ctx), false);
});

test("drop amounts come from the site's xN suffix", () => {
  const committed = { "low rank": { capture: [{ name: "Screamer x2", chance: "100%" }] } };
  const disc = (amount: number) => ({
    "low rank": { capture: [{ itemId: SCREAMER, name: "Screamer", chance: 100, amount }] },
  });
  assert.equal(fieldsAgree(DROPS, committed, disc(2), ctx), true);
  assert.equal(fieldsAgree(DROPS, committed, disc(1), ctx), false);
});

test("drops toSite keeps committed order and spelling, drops missing items and appends new ones", () => {
  const untouched = [{ name: "Giaprey Scale", chance: "100%" }];
  const committed = {
    "low-rank": {
      "body carves (x1)": [
        { name: "Giaprey Hide", chance: "30%" },
        { name: "GIAPREY SCALE", chance: "50%" },
        { name: "Screamer", chance: "20%" },
      ],
      "shiny drop": untouched,
    },
  };
  const disc = {
    "low-rank": {
      "body carves (x1)": [
        { itemId: GIAPREY_SCALE, name: "Giaprey Scale", chance: 52, amount: 1 },
        { itemId: GIAPREY_HIDE, name: "Giaprey Hide", chance: 30, amount: 1 },
        { itemId: SM_MONSTER_BONE, name: "Sm Monster Bone", chance: 18, amount: 1 },
      ],
      "shiny drop": [{ itemId: GIAPREY_SCALE, name: "Giaprey Scale", chance: 100, amount: 1 }],
    },
  };
  const after = toSite(DROPS, disc, site({}, committed), ctx) as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(after["low-rank"]!["body carves (x1)"], [
    { name: "Giaprey Hide", chance: "30%" },
    { name: "GIAPREY SCALE", chance: "52%" },
    { name: "Sm Monster Bone", chance: "18%" },
  ]);
  assert.equal(after["low-rank"]!["shiny drop"], untouched);
});

test("drops toSite writes amounts as xN when the disc has amounts other than one", () => {
  const committed = { "high rank": { capture: [{ name: "Screamer", chance: "100%" }] } };
  const disc = {
    "high rank": { capture: [{ itemId: SCREAMER, name: "Screamer", chance: 100, amount: 2 }] },
  };
  const after = toSite(DROPS, disc, site({}, committed), ctx) as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(after["high rank"]!.capture, [{ name: "Screamer x2", chance: "100%" }]);
  assert.equal(fieldsAgree(DROPS, after, disc, ctx), true);
});

test("the monster overlay maps site names to emIDs and parses drop slots", () => {
  assert.equal(monsterIdOf("Rathian"), 1);
  assert.equal(monsterIdOf("Giaprey"), 35);
  assert.equal(monsterIdOf("Scarred Yian Garuga"), 40); // enum: One-Ear Yian Garuga
  assert.equal(monsterIdOf("Terra Shogun Ceanataur"), 87); // enum: Terra Shogun Ceanatur
  assert.equal(monsterIdOf("Not A Monster"), null);
  assert.deepEqual(parseDropSlot("body/low"), { kind: "body", rank: "low" });
  assert.deepEqual(parseDropSlot("break:2/g"), { kind: "break", breakType: 2, rank: "g" });
});
