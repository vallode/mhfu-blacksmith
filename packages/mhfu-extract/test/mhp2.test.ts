import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { runExtractMhp2 } from "../src/cli/extract-mhp2.js";
import {
  checkMhp2Tables,
  MHP2_ARMOR_ENTRY_SIZE,
  MHP2_EU_EBOOT_BYTES,
  MHP2_EU_TABLES as T,
  MHP2_GUNNER_ENTRY_SIZE,
  MHP2_SHARPNESS_ENTRY_SIZE,
  readMhp2Tables,
} from "../src/games/mhp2.js";
import { MHP2_EU_MESSAGE_FILES, readMhp2Text } from "../src/games/mhp2-text.js";

/** A message file (strings/messages.ts) holding these tables of strings. */
function messageFile(tables: string[][]): Buffer {
  const header = Buffer.alloc(8 + tables.length * 4);
  header.writeUInt32LE(tables.length, 0);
  header.writeUInt32LE(8, 4);
  const bodies: Buffer[] = [];
  let at = header.length;
  tables.forEach((strings, t) => {
    header.writeUInt32LE(at, 8 + t * 4);
    const offsets = Buffer.alloc((strings.length + 1) * 4);
    const data = strings.map((s) => Buffer.from(`${s}\0`, "utf8"));
    let rel = offsets.length;
    data.forEach((d, i) => {
      offsets.writeUInt32LE(rel, i * 4);
      rel += d.length;
    });
    offsets.writeUInt32LE(0xffffffff, strings.length * 4);
    const body = Buffer.concat([offsets, ...data]);
    bodies.push(body);
    at += body.length;
  });
  return Buffer.concat([header, ...bodies]);
}

const COUNTS = {
  items: 713,
  blademaster: 601,
  gunner: 171,
  head: 327,
  chest: 311,
  arm: 305,
  waist: 303,
  leg: 311,
};

/**
 * MHF2's message file as message-probe found it: items in tables 1/2, then
 * a pair per equipment kind. Pairs alternate which table holds the names;
 * `accent` marks a non-English file.
 */
function fixtureMessages(accent = ""): Buffer {
  // Entry 0 and unused slots at the end are "Nothing equipped.", as on the disc.
  const pair = (kind: string, n: number, namesFirst: boolean, unusedAtEnd = 0) => {
    const names = Array.from({ length: n }, (_, i) =>
      i === 0 || i >= n - unusedAtEnd ? "Nothing equipped." : `${kind}${accent} ${i}`,
    );
    const descriptions = Array.from(
      { length: n },
      (_, i) => `A longer description of ${kind} ${i}.`,
    );
    return namesFirst ? [names, descriptions] : [descriptions, names];
  };
  return messageFile([
    ["unrelated"],
    ...pair("Item", 960, true),
    ...pair("Sword", 601, true),
    ...pair("Gun", 171, false),
    ...pair("Helm", 327, true),
    ...pair("Mail", 311, true),
    ...pair("Vambraces", 305, true),
    ...pair("Coil", 303, true),
    ...pair("Greaves", 312, true, 2),
  ]);
}

/** A made-up EBOOT the size of the EU one, with a few entries in each MHF2 layout. */
function fixtureEboot(): Buffer {
  const buf = Buffer.alloc(MHP2_EU_EBOOT_BYTES);
  // Model 5 is a hammer (type 2), model 6 a light bowgun (type 5).
  buf[T.modelToWeaponType.offset + 5] = 2;
  buf[T.modelToWeaponType.offset + 6] = 5;

  const bm = T.weaponsBlademaster.offset;
  buf.writeUInt16LE(5, bm + 0);
  buf.writeUInt8(3, bm + 8); // sharpness ID
  buf.writeUInt16LE(100, bm + 10); // attack
  buf.writeUInt16LE(0x1234, bm + 21); // sort order

  const gun = T.weaponsGunner.offset + MHP2_GUNNER_ENTRY_SIZE; // entry 1
  buf.writeUInt16LE(6, gun + 0);
  buf.writeUInt16LE(150, gun + 8); // attack
  buf.writeUInt8(7, gun + 14); // sort order (u8)
  buf.writeUInt8(9, gun + 15); // bullet charge
  buf.writeUInt8(4, gun + 16); // element type
  buf.writeUInt8(18, gun + 17); // element value
  buf.writeUInt32LE(0xabcd, gun + 20); // shot coatings

  const head = T.armorHead.offset + 2 * MHP2_ARMOR_ENTRY_SIZE; // entry 2
  buf.writeUInt8(31, head + 0); // male model
  buf.writeUInt8(32, head + 1); // female model
  buf.writeUInt8(1, head + 2); // hunter type
  buf.writeUInt8(4, head + 3); // rarity
  buf.writeUInt32LE(1200, head + 4); // price
  buf.writeInt8(10, head + 8); // defense
  buf.writeInt8(-2, head + 9); // fire
  buf.writeUInt16LE(77, head + 20); // sort order
  buf.writeUInt8(12, head + 22); // first skill
  buf.writeInt8(-3, head + 23);

  // Sharpness: increasing cumulative thresholds.
  for (let i = 0; i < T.sharpnessTable.count; i++) {
    for (let c = 0; c < 6; c++) {
      buf.writeUInt16LE(
        10 + i + c * 20,
        T.sharpnessTable.offset + i * MHP2_SHARPNESS_ENTRY_SIZE + c * 2,
      );
    }
  }

  // Armor pointers, in MHFU's order (leg, head, chest, arm, waist), with a load base.
  const base = 0x8800000;
  const order = [T.armorLeg, T.armorHead, T.armorChest, T.armorArm, T.armorWaist];
  order.forEach((t, i) => buf.writeUInt32LE(base + t.offset, T.armorValuePointers.offset + i * 4));
  return buf;
}

test("readMhp2Tables reads MHF2's changed gunner, armor and sharpness layouts", () => {
  const tables = readMhp2Tables(new BinaryReader(fixtureEboot()));
  assert.equal(tables.blademaster.length, 601);
  assert.equal(tables.gunner.length, 171);
  assert.deepEqual(
    Object.fromEntries(Object.entries(tables.armor).map(([slot, a]) => [slot, a.length])),
    { head: 327, chest: 311, arm: 305, waist: 303, leg: 311 },
  );
  assert.equal(tables.items.length, 960);
  assert.equal(tables.decorationSkills.length, 123);

  const bm = tables.blademaster[0]!;
  assert.deepEqual(
    [bm.weaponType, bm.attack, bm.sharpnessId, bm.sortOrder],
    ["hammer", 100, 3, 0x1234],
  );

  const gun = tables.gunner[1]!;
  assert.equal(gun.weaponType, "light-bowgun");
  assert.deepEqual(
    [gun.attack, gun.sortOrder, gun.bulletCharge, gun.eleType, gun.eleValue, gun.shotCoatings],
    [150, 7, 9, 4, 18, 0xabcd],
  );

  const head = tables.armor.head[2]!;
  assert.deepEqual(
    [head.maleId, head.femaleId, head.hunterType, head.rarity, head.price, head.defense],
    [31, 32, 1, 4, 1200, 10],
  );
  assert.equal(head.resistances.fire, -2);
  assert.equal(head.sortOrder, 77);
  assert.deepEqual(head.skills[0], { skill: 12, amount: -3 });

  assert.deepEqual(tables.sharpness[1]!.cumulative, {
    red: 11,
    orange: 31,
    yellow: 51,
    green: 71,
    blue: 91,
    white: 111,
  });
});

test("checkMhp2Tables passes the fixture and catches armor pointers that don't fit", () => {
  const buf = fixtureEboot();
  const checks = checkMhp2Tables(new BinaryReader(buf), readMhp2Tables(new BinaryReader(buf)));
  assert.deepEqual(
    checks.filter((c) => !c.ok).map((c) => c.name),
    [],
  );
  assert.match(checks[1]!.detail, /pointer order leg, head, chest, arm, waist/);

  buf.writeUInt32LE(0x1234, T.armorValuePointers.offset);
  const broken = checkMhp2Tables(new BinaryReader(buf), readMhp2Tables(new BinaryReader(buf)));
  assert.equal(broken[1]!.ok, false);
});

test("runExtractMhp2 writes each table and the checks", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mhfu-extract-mhp2-"));
  try {
    const unpacked = path.join(dir, "unpacked");
    const out = path.join(dir, "out");
    mkdirSync(path.join(unpacked, "data-bin", "_unindexed"), { recursive: true });
    writeFileSync(path.join(unpacked, "eboot.bin"), fixtureEboot());
    MHP2_EU_MESSAGE_FILES.forEach((index, i) =>
      writeFileSync(
        path.join(unpacked, "data-bin", "_unindexed", `${index}.bin`),
        fixtureMessages(i === 0 ? "" : "é"),
      ),
    );
    writeFileSync(
      path.join(unpacked, "manifest.json"),
      JSON.stringify({
        game: "mhp2",
        region: "eu",
        discId: "ULES00851",
        isoPath: "",
        fileCount: 0,
        unpackedAt: "",
      }),
    );
    const log = console.log;
    console.log = () => {};
    try {
      const result = await runExtractMhp2({ unpacked, out });
      assert.equal(result.counts["armor-leg.json"], 311);
      // Legs' one extra name is a placeholder, as on the real disc, so it passes.
      assert.deepEqual(
        result.checks.filter((c) => !c.ok).map((c) => c.name),
        [],
      );
      assert.match(
        result.checks.find((c) => c.name === "leg names: one per entry")!.detail,
        /the 1 extra all entry 0's placeholder; 2 entries named like entry 0/,
      );
    } finally {
      console.log = log;
    }
    const gunner = JSON.parse(readFileSync(path.join(out, "weapons-gunner.json"), "utf-8"));
    assert.equal(gunner[1].shotCoatings, 0xabcd);
    assert.equal(gunner[1].name, "Gun 1");
    assert.equal(gunner[1].description, "A longer description of Gun 1.");
    const decorations = JSON.parse(readFileSync(path.join(out, "decoration-values.json"), "utf-8"));
    assert.equal(decorations[2].name, "Item 715");
    const head = JSON.parse(readFileSync(path.join(out, "armor-head.json"), "utf-8"));
    assert.equal(head[2].name, "Helm 2");
    assert.deepEqual([head[0].placeholder, head[2].placeholder], [true, false]);

    writeFileSync(
      path.join(unpacked, "manifest.json"),
      JSON.stringify({
        game: "mhp2",
        region: "jp",
        discId: "ULJM05156",
        isoPath: "",
        fileCount: 0,
        unpackedAt: "",
      }),
    );
    await assert.rejects(runExtractMhp2({ unpacked, out }), /EU disc \(ULES00851\) only/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readMhp2Text picks the English file and the names table of each pair", () => {
  const files = [
    fixtureMessages("é"),
    fixtureMessages(),
    fixtureMessages("é"),
    fixtureMessages("é"),
    fixtureMessages("é"),
  ];
  const result = readMhp2Text(files, COUNTS);
  assert.equal(result.language, 1);
  assert.equal(result.checks[0]!.ok, false); // English wasn't first
  assert.equal(result.text.gunner.nameTable, 6);
  assert.equal(result.text.gunner.names[3], "Gun 3");
  assert.equal(result.text.blademaster.nameTable, 3);
  assert.equal(result.text.items.names.length, 960);
});

test("readMhp2Text fails a name table whose extra names aren't placeholders", () => {
  const files = MHP2_EU_MESSAGE_FILES.map(() => fixtureMessages());
  const result = readMhp2Text(files, { ...COUNTS, leg: 309 });
  const leg = result.checks.find((c) => c.name === "leg names: one per entry")!;
  assert.equal(leg.ok, false);
  assert.match(leg.detail, /312 names \(table 15\) for 309 entries, the 3 extra not placeholders/);
});
