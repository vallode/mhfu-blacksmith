import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARMOR_SLOTS } from "../src/lib/constants";
import {
  emptyBuild,
  evaluateBuild,
  validateBuild,
  withDecoration,
  withPiece,
  type BuildSet,
} from "../src/lib/set-build";
import {
  buildCodecTables,
  cleanName,
  CODEC_VERSION,
  decodeRaw,
  decodeSet,
  encodeRaw,
  encodeSet,
  FIELD,
  fromBase64Url,
  MAX_NAME,
  toBase64Url,
  toRaw,
  withoutName,
  type DecodeResult,
} from "../src/lib/set-codec";
import type { Piece } from "../src/lib/set-search";
import { loadShippedSetData } from "./helpers/set-data";

const { data, ids } = loadShippedSetData();
const tables = buildCodecTables(data, ids);

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

/** The parts of a set that a code carries, comparable with deepEqual. */
const shape = (s: BuildSet) => ({
  pieces: s.pieces.map((p) => p?.href ?? null),
  decorations: s.decorations.map((d) => `${d.deco.href}@${d.bin}`),
  weaponSlots: s.weaponSlots,
  hunterType: s.hunterType,
  sex: s.sex,
});

const ok = (r: DecodeResult) => {
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
  return r;
};

const roundTrip = (set: BuildSet) => {
  const r = ok(decodeSet(encodeSet(set, tables), tables));
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(shape(r.set), shape(set));
};

/** Bytes from a list of numbers, as a code. */
const code = (...bytes: number[]) => toBase64Url(Uint8Array.from(bytes));

describe("set codec lookup tables", () => {
  it("gives every armor piece exactly one equipment ID, and every decoration an item ID", () => {
    assert.deepEqual(tables.problems, []);
    assert.equal(tables.pieceGameId.size, data.pieces.length);
    assert.equal(tables.decoByItemId.size, data.decorations.length);
  });

  it("never uses equipment ID 0 (it means an empty slot)", () => {
    for (const id of tables.pieceGameId.values()) assert.ok(id > 0);
  });

  it("matches male and female pieces sold under one name to their own IDs", () => {
    const split = data.pieces.filter((p) => p.href.endsWith("-male/"));
    assert.ok(split.length > 0);
    for (const male of split) {
      const female = data.pieces.find((p) => p.href === male.href.replace("-male/", "-female/"));
      assert.ok(female, male.href);
      assert.notEqual(tables.pieceGameId.get(male.id), tables.pieceGameId.get(female.id));
    }
  });
});

describe("set codec round trip", () => {
  it("every armor piece survives, in its own slot", () => {
    for (const p of data.pieces) {
      const set = withPiece(emptyBuild(), p.slot, p);
      roundTrip(set);
    }
  });

  it("every decoration survives, in every bin", () => {
    const full = ARMOR_SLOTS.reduce(
      (s, slot) =>
        withPiece(
          s,
          slot,
          data.pieces.find((p) => p.slot === slot && p.slots === 3)!,
        ),
      emptyBuild("Gunner", "Female", 3),
    );
    for (const d of data.decorations) {
      for (const bin of ["weapon", ...ARMOR_SLOTS] as const) {
        const set = withDecoration(full, bin, d);
        assert.equal(set.decorations.length, 1, `${d.name} fits 3 slots`);
        roundTrip(set);
      }
    }
  });

  it("keeps empty slots empty", () => {
    let set = emptyBuild("Blademaster", "Male", 1);
    set = withPiece(set, "plate", byName("plate", "Rathalos Mail"));
    set = withPiece(set, "leggings", byName("leggings", "Rathalos Greaves"));
    roundTrip(set);
    const r = ok(decodeSet(encodeSet(set, tables), tables));
    assert.equal(r.set.pieces[0], null);
    assert.equal(r.set.pieces[2], null);
  });

  it("encodes a set with nothing in it as just the version", () => {
    const empty = emptyBuild();
    assert.equal(encodeSet(empty, tables), code(CODEC_VERSION));
    roundTrip(empty);
    roundTrip(emptyBuild("Gunner", "Female", 2));
  });

  it("keeps a full set with 8 decorations to about 40 characters", () => {
    let set = emptyBuild("Blademaster", "Male", 3);
    for (const slot of ARMOR_SLOTS) {
      set = withPiece(
        set,
        slot,
        data.pieces.find((p) => p.slot === slot && p.slots === 3)!,
      );
    }
    const one = data.decorations.filter((d) => d.slots === 1);
    for (const bin of ["weapon", "helmet", "plate", "gauntlets"] as const) {
      set = withDecoration(set, bin, one[0]);
      set = withDecoration(set, bin, one[1]);
    }
    assert.equal(set.decorations.length, 8);
    const s = encodeSet(set, tables);
    assert.ok(s.length <= 48, `${s} is ${s.length} characters`);
    roundTrip(set);
  });
});

describe("set codec golden code", () => {
  // Changing the format (or the IDs) breaks every link already shared. If
  // this fails, bump CODEC_VERSION and keep decoding version 1 instead.
  const GOLDEN = "AQMKqwObA40D3ALPAgQCBwr9ROhC6kKpPKk8";

  it("decodes to the same set", () => {
    const r = ok(decodeSet(GOLDEN, tables));
    assert.deepEqual(r.dropped, []);
    assert.deepEqual(
      r.set.pieces.map((p) => p?.name),
      [
        "Ucamulbas Mask",
        "Ucamulbas Aegis",
        "Diablo Vambraces X",
        "Fatalis Spine Z",
        "Silver Sol Greaves Z",
      ],
    );
    assert.deepEqual(
      r.set.decorations.map((d) => `${d.deco.name}@${d.bin}`),
      [
        "Strongest Jewel@leggings",
        "Fierce Jewel@weapon",
        "Fierce Jewel@plate",
        "Artisan Jewel@helmet",
        "Artisan Jewel@helmet",
      ],
    );
    assert.equal(r.set.weaponSlots, 2);
    assert.equal(r.set.hunterType, "Blademaster");
    assert.equal(r.set.sex, "Male");
    assert.equal(encodeSet(r.set, tables), GOLDEN);
  });

  it("activates the skills it was found for", () => {
    const r = ok(decodeSet(GOLDEN, tables));
    const names = evaluateBuild(data, r.set).skills.map((s) => s.name);
    for (const s of ["Attack Up (Large)", "Sharpness +1"]) assert.ok(names.includes(s), s);
  });
});

describe("set codec errors", () => {
  it("rejects an unknown version", () => {
    const r = decodeSet(code(2, 4, 1), tables);
    assert.deepEqual(r, { ok: false, error: { kind: "version", version: 2 } });
  });

  it("rejects input that isn't base64url", () => {
    for (const bad of ["AQ==", "A", "AQ!x", "AQ x", "%%"]) {
      const r = decodeSet(bad, tables);
      assert.equal(!r.ok && r.error.kind, "malformed", bad);
    }
  });

  it("rejects an empty code", () => {
    const r = decodeSet("", tables);
    assert.equal(!r.ok && r.error.kind, "malformed");
  });

  it("rejects truncated and malformed fields", () => {
    const armor = (FIELD.armor << 1) | 1;
    const cases = [
      [CODEC_VERSION, armor], // key with no length
      [CODEC_VERSION, armor, 10, 1, 2], // length runs past the end
      [CODEC_VERSION, armor, 3, 1, 2, 3], // 3 armor entries, not 5
      [CODEC_VERSION, (FIELD.weaponSlots << 1) | 0, 0x80], // number cut off
      [CODEC_VERSION, (FIELD.weaponSlots << 1) | 0, 0x80, 0x80, 0x80, 0x80, 0x01], // too long
      [CODEC_VERSION, (FIELD.weaponSlots << 1) | 1, 0], // wrong wire type
      [CODEC_VERSION, (FIELD.hunterType << 1) | 0, 7], // no such hunter type
      [CODEC_VERSION, (FIELD.sex << 1) | 0, 2], // no such sex
    ];
    for (const bytes of cases) {
      const r = decodeSet(code(...bytes), tables);
      assert.equal(!r.ok && r.error.kind, "malformed", bytes.join(","));
    }
  });

  it("drops unknown IDs and keeps the rest", () => {
    const helm = byName("helmet", "Rathalos Helm");
    const bytes = encodeRaw({
      armor: [tables.pieceGameId.get(helm.id)!, 9999, 0, 0, 0],
      weaponSlots: 1,
      decorations: [
        { itemId: deco("Attack Jewel").itemId!, bin: 0 },
        { itemId: 1, bin: 1 }, // an item, but not a decoration
        { itemId: deco("Attack Jewel").itemId!, bin: 7 }, // reserved bin
      ],
    });
    const r = ok(decodeSet(toBase64Url(bytes), tables));
    assert.equal(r.set.pieces[0]?.name, "Rathalos Helm");
    assert.equal(r.set.pieces[1], null);
    assert.deepEqual(
      r.set.decorations.map((d) => `${d.deco.name}@${d.bin}`),
      ["Attack Jewel@weapon"],
    );
    assert.deepEqual(r.dropped, [
      { kind: "piece", slot: "plate", gameId: 9999 },
      { kind: "decoration", itemId: 1, bin: "helmet" },
      { kind: "decoration", itemId: deco("Attack Jewel").itemId!, bin: null },
    ]);
  });

  it("is an unknown-ids error when nothing resolves", () => {
    const bytes = encodeRaw({ armor: [9999, 0, 0, 0, 0], weaponSlots: 0, decorations: [] });
    const r = decodeSet(toBase64Url(bytes), tables);
    assert.equal(!r.ok && r.error.kind, "unknown-ids");
  });

  it("never throws on random input", () => {
    let seed = 1;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 2000; i++) {
      const bytes = Array.from({ length: Math.floor(rand() * 40) }, () => Math.floor(rand() * 256));
      if (rand() < 0.8) bytes[0] = CODEC_VERSION;
      assert.doesNotThrow(() => decodeSet(code(...bytes), tables));
      const s = Array.from({ length: Math.floor(rand() * 30) }, () =>
        String.fromCharCode(32 + Math.floor(rand() * 95)),
      ).join("");
      assert.doesNotThrow(() => decodeSet(s, tables));
    }
  });
});

describe("set codec forward compatibility", () => {
  it("skips unknown and reserved tags of both wire types", () => {
    const helm = byName("helmet", "Rathalos Helm");
    const known = encodeRaw({
      armor: [tables.pieceGameId.get(helm.id)!, 0, 0, 0, 0],
      weaponSlots: 2,
      decorations: [],
    });
    const extra = [
      (FIELD.weapon << 1) | 1,
      3,
      0,
      0x96,
      0x01, // reserved weapon field
      (FIELD.query << 1) | 1,
      2,
      0xff,
      0x7f,
      (40 << 1) | 0,
      0xac,
      0x02, // an unknown number
      (41 << 1) | 1,
      0, // an unknown, empty byte field
    ];
    const bytes = Uint8Array.from([known[0], ...extra, ...known.slice(1), ...extra]);
    const r = ok(decodeSet(toBase64Url(bytes), tables));
    assert.equal(r.set.pieces[0]?.name, "Rathalos Helm");
    assert.equal(r.set.weaponSlots, 2);
  });

  it("keeps the last value of a repeated field", () => {
    const tag = (FIELD.weaponSlots << 1) | 0;
    const r = decodeRaw(Uint8Array.from([CODEC_VERSION, tag, 1, tag, 3]));
    assert.ok(r.ok);
    assert.equal(r.raw.weaponSlots, 3);
  });
});

describe("set codec names", () => {
  const set = () => withPiece(emptyBuild(), "plate", byName("plate", "Rathalos Mail"));

  it("carries a set's name, and leaves the set as it was", () => {
    const r = ok(decodeSet(encodeSet(set(), tables, "Rath crit ☆ build"), tables));
    assert.equal(r.name, "Rath crit ☆ build");
    assert.deepEqual(shape(r.set), shape(set()));
  });

  it("leaves the name out when there is none", () => {
    assert.equal(encodeSet(set(), tables, ""), encodeSet(set(), tables));
    assert.equal(encodeSet(set(), tables, "  "), encodeSet(set(), tables));
    assert.equal(ok(decodeSet(encodeSet(set(), tables), tables)).name, undefined);
  });

  it("keeps names to one line of MAX_NAME characters", () => {
    assert.equal(cleanName("  two\nlines\u0000here  "), "two lines here");
    const long = "😀".repeat(MAX_NAME + 5);
    const r = ok(decodeSet(encodeSet(set(), tables, long), tables));
    assert.equal([...r.name!].length, MAX_NAME);
  });

  it("keeps emoji joined with U+200D, but not bidirectional overrides", () => {
    assert.equal(cleanName("🏳️\u200d🌈 build"), "🏳️\u200d🌈 build");
    assert.equal(cleanName("a\u202eb"), "a b");
  });

  it("gives one name-free code per set", () => {
    const plain = encodeSet(set(), tables);
    assert.equal(withoutName(encodeSet(set(), tables, "Rath farming")), plain);
    assert.equal(withoutName(plain), plain);
    assert.equal(withoutName("not a code!"), null);
  });

  it("opens a set whose name isn't valid UTF-8", () => {
    const bytes = encodeRaw(toRaw(set(), tables));
    const tag = (FIELD.name << 1) | 1;
    const r = ok(decodeSet(toBase64Url(Uint8Array.from([...bytes, tag, 2, 0xff, 0x41])), tables));
    assert.equal(r.name, "\ufffdA");
    assert.deepEqual(shape(r.set), shape(set()));
  });
});

describe("base64url", () => {
  it("round trips every length", () => {
    for (let n = 0; n < 12; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 0xff);
      const s = toBase64Url(bytes);
      assert.match(s, /^[A-Za-z0-9_-]*$/);
      assert.deepEqual(fromBase64Url(s), bytes);
      assert.equal(s, Buffer.from(bytes).toString("base64url"));
    }
  });
});

describe("set validation", () => {
  it("warns about pieces the hunter can't wear", () => {
    const gunner = data.pieces.find((p) => p.slot === "gauntlets" && p.hunterType === "Gunner")!;
    const female = data.pieces.find((p) => p.slot === "helmet" && p.sex === "Female")!;
    let set = emptyBuild("Blademaster", "Male");
    set = withPiece(set, "gauntlets", gunner);
    set = withPiece(set, "helmet", female);
    const bins = validateBuild(set).map((w) => w.bin);
    assert.deepEqual(bins, ["helmet", "gauntlets"]);
  });

  it("warns about a piece in another slot", () => {
    const set = emptyBuild();
    set.pieces[0] = byName("plate", "Rathalos Mail");
    assert.equal(validateBuild(set)[0]?.bin, "helmet");
  });

  it("warns about decorations that don't fit or have no piece", () => {
    const set = emptyBuild("Blademaster", "Male", 1);
    set.decorations = [
      { deco: deco("Attack Jewel"), bin: "weapon" },
      { deco: deco("Attack Jewel"), bin: "weapon" },
      { deco: deco("Attack Jewel"), bin: "waist" },
    ];
    const bins = validateBuild(set).map((w) => w.bin);
    assert.deepEqual(bins, ["weapon", "waist"]);
    // The one in the empty waist slot counts for nothing.
    assert.equal(evaluateBuild(data, set).totals["Attack"], 2);
  });

  it("warns about Torso Up with no chest piece", () => {
    const torsoUp = data.pieces.find((p) => p.slot === "helmet" && p.torsoUp)!;
    const set = withPiece(
      emptyBuild(
        torsoUp.hunterType === "Gunner" ? "Gunner" : "Blademaster",
        torsoUp.sex === "Female" ? "Female" : "Male",
      ),
      "helmet",
      torsoUp,
    );
    assert.ok(validateBuild(set).some((w) => /Torso Up/.test(w.message)));
  });

  it("takes decorations off a piece that's swapped for one with fewer slots", () => {
    const three = data.pieces.find((p) => p.slot === "helmet" && p.slots === 3)!;
    const one = data.pieces.find((p) => p.slot === "helmet" && p.slots === 1)!;
    let set = withPiece(emptyBuild(), "helmet", three);
    set = withDecoration(set, "helmet", deco("Attack Jewel"));
    set = withDecoration(set, "helmet", deco("Expert Jewel"));
    set = withPiece(set, "helmet", one);
    assert.deepEqual(
      set.decorations.map((d) => d.deco.name),
      ["Attack Jewel"],
    );
    assert.deepEqual(validateBuild(set), []);
  });
});
