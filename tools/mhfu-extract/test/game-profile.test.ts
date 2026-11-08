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
  // armorValuePointers itself is deliberately NOT registered (it's a
  // pointer table — see tables/armor.ts's doc comment); the per-slot
  // armorValuesHead/etc names are what's actually resolvable for EU.
  assert.throws(
    () => MHP2G_EU_RESOLVER.resolve("armorValuePointers", Buffer.alloc(10)),
    (err: unknown) => {
      assert.ok(err instanceof TableResolutionError);
      assert.match(err.message, /no signature registered/);
      return true;
    }
  );
});

// The following tests pin down every remaining real, byte-for-byte-verified
// EU finding from this session's follow-up signature-discovery work — see
// README's "Region support" section for the full writeup. Same methodology
// as the two tests above: real signature bytes (copied verbatim from the
// real decrypted EU EBOOT) embedded in a small synthetic buffer at the real
// file offset found on the real disc.

test("MHP2G_EU_RESOLVER resolves weaponsBlademaster at its real EU file offset (0x158580)", () => {
  const realOffset = 0x158580;
  const signatureBytes = Buffer.from(
    "0000000000000000000000000000000000000000000000000a00050050c300000002be00000000000000000000410000",
    "hex"
  );
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("weaponsBlademaster", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves weaponsGunner at its real EU file offset (0x15f150)", () => {
  const realOffset = 0x15f150;
  const signatureBytes = Buffer.from("0b0000000000000000000000000000000000000200000000ffffffff", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("weaponsGunner", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves decorationSkills at its real EU file offset (0x175f98)", () => {
  const realOffset = 0x175f98;
  const signatureBytes = Buffer.from("010f0000000000000000000000000000", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("decorationSkills", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves sharpnessTable at its real EU file offset (0x1775c0)", () => {
  const realOffset = 0x1775c0;
  const signatureBytes = Buffer.from("50006e00dc0040017c01ae01c201", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("sharpnessTable", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves modelToWeaponType at its real EU file offset (0x176a3c)", () => {
  const realOffset = 0x176a3c;
  const signatureBytes = Buffer.from("07000302020003040000000500010007", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("modelToWeaponType", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves equipmentCreate at its real EU file offset (0x139dcc)", () => {
  const realOffset = 0x139dcc;
  const signatureBytes = Buffer.from("0101fc004a010100000000000000000000000000000000000000", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("equipmentCreate", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves equipmentUpgrade at its real EU file offset (0x14df5c)", () => {
  const realOffset = 0x14df5c;
  const signatureBytes = Buffer.from(
    "ff0000000000000000000000000000000000000000000000ff00000000000000000000000000000000000000000000000000000000000000",
    "hex"
  );
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("equipmentUpgrade", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves decorationValues at its real EU file offset (0x1a102c)", () => {
  const realOffset = 0x1a102c;
  const signatureBytes = Buffer.from("00000363002b040000000000900100002800000000000200", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("decorationValues", buf), realOffset);
});

// The next three tables (bowgunShotTable, bowChargeTable, dualAttributeWeapons)
// have no reader/consumer in tables/*.ts today (see games/mhp2g.ts's
// MHP2G_EMIT_TABLES doc comment) — validated as reference examples only.

test("MHP2G_EU_RESOLVER resolves bowgunShotTable at its real EU file offset (0x176cac)", () => {
  const realOffset = 0x176cac;
  const signatureBytes = Buffer.from("0606090303030404040101010101010303030301030303010301030102020101", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("bowgunShotTable", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves bowChargeTable at its real EU file offset (0x1773ec)", () => {
  const realOffset = 0x1773ec;
  const signatureBytes = Buffer.from("0000010600010206", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("bowChargeTable", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves dualAttributeWeapons at its real EU file offset (0x177d0c)", () => {
  const realOffset = 0x177d0c;
  const signatureBytes = Buffer.from("630380000c000200080064038000100002001400", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("dualAttributeWeapons", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves bowgunModTable to its BGModLevel data pool, not BGModTable's own (pointer) address", () => {
  // bowgunModTable's *declared* address holds pointers (region-dependent),
  // like armorValuePointers — see eu-signatures.ts's doc comment. The
  // registered signature instead targets the pointed-to data pool, whose
  // real EU offset is 0x17781c.
  const realOffset = 0x17781c;
  const signatureBytes = Buffer.from("000000003333333f3333b33f000000409a9989403d0ab73f", "hex");
  const buf = Buffer.alloc(realOffset + signatureBytes.length);
  signatureBytes.copy(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("bowgunModTable", buf), realOffset);
});

test("MHP2G_EU_RESOLVER resolves every armorValues<Slot> directly, bypassing armorValuePointers' pointer indirection", () => {
  const slots: [string, number, string][] = [
    ["armorValuesHead", 0x161808, "000000000f00000000000000000000000000000000000000000000000000000000000000000000000f0011000f0000002c0100000202000000000100060b0e0e13131c0002003402130229013c0244fe"],
    ["armorValuesChest", 0x165c28, "000000000f0000000000000000000000000000000000000000000000000000000000000000000000060024000f0000002c0100000202000000000000060b0e0e13131c0002003402130229023b0244ff"],
    ["armorValuesArm", 0x169dc8, "000000000f0000000000000000000000000000000000000000000000000000000000000000000000060023000f0000002c0100000202000000000100060b0e0e13131c0002003403130229023d020000"],
    ["armorValuesWaist", 0x16de00, "000000000f0000000000000000000000000000000000000000000000000000000000000000000000060019000f0000002c0100000202000000000000060b0e0e13131c0003003403130229013b0344fe"],
    ["armorValuesLeg", 0x171de8, "000000000f000000000000000000000000000000000000000000000000000000000000000000000006001a000f0000002c0100000202000000000100060b0e0e13131c0002003403130229023d020000"],
  ];
  for (const [table, realOffset, hex] of slots) {
    const signatureBytes = Buffer.from(hex, "hex");
    const buf = Buffer.alloc(realOffset + signatureBytes.length);
    signatureBytes.copy(buf, realOffset);
    assert.equal(MHP2G_EU_RESOLVER.resolve(table, buf), realOffset, `${table} mismatch`);
  }
});
