import assert from "node:assert/strict";
import { test } from "node:test";
import { readDualAttributeWeapons } from "../src/tables/dual-attributes.js";
import { MHP2G_EU_RESOLVER } from "../src/games/mhp2g.js";
import { DUAL_ATTRIBUTE_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

/** The first two real `WepDualAttr` entries (Snow Venom, Snow Venom+), as in eu-signatures.ts. */
const REAL_DUAL_ATTRIBUTE_BYTES = Buffer.from(
  "630380000c000200080064038000100002001400",
  "hex",
);

test("readDualAttributeWeapons decodes the real Snow Venom entries (JP static)", () => {
  const base = tableOffset("dualAttributeWeapons");
  const { buf, reader } = fixtureReader(
    base + TABLE_COUNTS.dualAttributeWeapons * DUAL_ATTRIBUTE_ENTRY_SIZE,
  );
  REAL_DUAL_ATTRIBUTE_BYTES.copy(buf, base);

  const table = readDualAttributeWeapons(reader);
  assert.equal(table.length, 15);
  assert.deepEqual(table[0], {
    weaponId: 867,
    attributes: [
      { flag: 0x80, name: "Ice", value: 12 },
      { flag: 0x02, name: "Poison", value: 8 },
    ],
  });
  assert.deepEqual(table[1], {
    weaponId: 868,
    attributes: [
      { flag: 0x80, name: "Ice", value: 16 },
      { flag: 0x02, name: "Poison", value: 20 },
    ],
  });
});

test("readDualAttributeWeapons reads from the EU signature's offset with the EU resolver", () => {
  const realOffset = 0x177d0c;
  const { buf, reader } = fixtureReader(realOffset + 15 * DUAL_ATTRIBUTE_ENTRY_SIZE);
  REAL_DUAL_ATTRIBUTE_BYTES.copy(buf, realOffset);
  const table = readDualAttributeWeapons(reader, MHP2G_EU_RESOLVER);
  assert.equal(table[0]!.weaponId, 867);
  assert.equal(table[1]!.attributes[1].value, 20);
});

test("readDualAttributeWeapons names every EleBitFlag and leaves unknown flags null", () => {
  const base = tableOffset("dualAttributeWeapons");
  const { buf, reader } = fixtureReader(base + 15 * DUAL_ATTRIBUTE_ENTRY_SIZE);
  // Ultimus Celestials-shaped entry: Dragon (0x100) + Thunder (0x40).
  buf.writeUInt16LE(0x100, base + 2);
  buf.writeUInt16LE(0x40, base + 6);
  // Unused (0x08) has no name.
  buf.writeUInt16LE(0x08, base + DUAL_ATTRIBUTE_ENTRY_SIZE + 2);
  const table = readDualAttributeWeapons(reader);
  assert.deepEqual(
    table[0]!.attributes.map((a) => a.name),
    ["Dragon", "Thunder"],
  );
  assert.equal(table[1]!.attributes[0].name, null);
});
