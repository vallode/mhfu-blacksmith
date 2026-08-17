import assert from "node:assert/strict";
import { test } from "node:test";
import { MHP2G_EU_RESOLVER, MHP2G_JP_RESOLVER, MHP2G_PROFILE } from "../src/games/mhp2g.js";
import { JP_TABLE_ADDRESSES, tableOffset } from "../src/tables/offsets.js";
import { TableResolutionError } from "../src/tables/resolver.js";

test("MHP2G_PROFILE.resolverForRegion('jp') matches tableOffset() exactly for every known table", () => {
  const resolver = MHP2G_PROFILE.resolverForRegion("jp");
  assert.ok(resolver);
  for (const table of Object.keys(JP_TABLE_ADDRESSES)) {
    assert.equal(resolver.resolve(table), tableOffset(table as keyof typeof JP_TABLE_ADDRESSES));
  }
  assert.equal(resolver, MHP2G_JP_RESOLVER);
});

test("MHP2G_PROFILE.resolverForRegion('us') is null — no US disc available to derive addresses/signatures from", () => {
  assert.equal(MHP2G_PROFILE.resolverForRegion("us"), null);
});

test("MHP2G_PROFILE declares every JP table in its tables list, with entry shape for the ones we know", () => {
  const names = MHP2G_PROFILE.tables.map((t) => t.name);
  for (const table of Object.keys(JP_TABLE_ADDRESSES)) assert.ok(names.includes(table), `missing ${table}`);

  const wepBm = MHP2G_PROFILE.tables.find((t) => t.name === "weaponsBlademaster");
  assert.deepEqual(wepBm, { name: "weaponsBlademaster", entrySize: 24, count: 1150 });

  // Multi-section table: entrySize known, but no single fixed count.
  const equipCreate = MHP2G_PROFILE.tables.find((t) => t.name === "equipmentCreate");
  assert.equal(equipCreate?.entrySize, 26);
  assert.equal(equipCreate?.count, undefined);
});

// The following two tests pin down real, byte-for-byte-verified EU findings
// from this session's signature-discovery work — see README's "Region
// support" section for the full writeup. Each signature and its resulting
// offset were derived from, and independently re-confirmed unique against,
// a real decrypted EU EBOOT (Monster Hunter Freedom Unite (Europe),
// ULES01213) via `pspdecrypt` against the actual EU disc image (not
// fabricated). We can't ship the 1.9MB EBOOT dump itself, so — following the
// same pattern as ovl.test.ts's "known real hitzone/reward bytes" tests —
// these embed the exact real signature bytes in a small synthetic buffer at
// the exact real file offset found on the real disc, so the test exercises
// the genuine, validated bytes/offsets without needing the actual ISO.

test("MHP2G_EU_RESOLVER resolves the real weaponClassModifiers signature at its real EU file offset (0x139170)", () => {
  // Real bytes: 11 u32s = [480, 120, 520, 230, 140, 120, 140, 480, 520, 230, 120],
  // byte-identical to the JP EBOOT (confirming this data is region-independent).
  // JP's static offset is 0x1366b8, so this is a real +0x2ab8 shift — the
  // exact shift documented in README for this table.
  const realOffset = 0x139170;
  const signatureBytes = Buffer.from(
    "e00100007800000008020000e60000008c000000780000008c000000e001000008020000e600000078000000",
    "hex"
  );
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);

  assert.equal(MHP2G_EU_RESOLVER.resolve("weaponClassModifiers", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves the real itemTable signature at its real EU file offset (0x19b74c)", () => {
  // Real bytes: itemTable[0] (the dummy "None" item entry), byte-identical
  // to the JP EBOOT. JP's static offset is 0x1987ec, so this is a real
  // +0x2f60 shift — a *different* shift than weaponClassModifiers' +0x2ab8,
  // which is the core finding this whole mechanism exists to handle (a
  // single per-region constant does not work).
  const realOffset = 0x19b74c;
  const signatureBytes = Buffer.from("0000000104ff000000000000000000000000000000000100", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);

  assert.equal(MHP2G_EU_RESOLVER.resolve("itemTable", buf), realOffset);
});

test("MHP2G_EU_RESOLVER throws a clear 'not validated yet' error for an unsupported table, rather than guessing", () => {
  assert.throws(
    () => MHP2G_EU_RESOLVER.resolve("weaponsBlademaster", Buffer.alloc(10)),
    (err: unknown) => {
      assert.ok(err instanceof TableResolutionError);
      assert.match(err.message, /no signature registered/);
      return true;
    }
  );
});
