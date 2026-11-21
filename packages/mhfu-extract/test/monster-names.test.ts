import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { StringTable } from "game-data";
import { renameMonsters } from "../src/build/monster-names.js";
import type { MessageTable } from "../src/strings/messages.js";
import {
  discMonsterNames,
  MonsterNameError,
  readMonsterNames,
  siteMonsterNames,
  type MonsterNameOverlay,
} from "../src/strings/monster-names.js";
import { loadEnums, lookupName } from "../src/strings/enums.js";
import { JP_BASE_ADDRESS } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

const TABLE = ["", "NO DATA", "Rathian", "Fatalis", "dummy", "Pink Rathian", "Plum D.Hermitaur"];

function messages(): MessageTable {
  return {
    offset: 0,
    strings: TABLE.map((s) => ({ offset: 0, bytes: Buffer.from(s) })),
  };
}

/** The EU name index table: emID 0 "NO DATA", 1 Rathian, 2 Fatalis, 10 dummy, 36 Fatalis, 37 Pink Rathian, 86 Plum. */
function namesFixture() {
  const { buf, reader } = fixtureReader(0x08a00000 - JP_BASE_ADDRESS);
  const at = 0x089ac710 - JP_BASE_ADDRESS;
  const index: Record<number, number> = { 0: 1, 1: 2, 2: 3, 10: 4, 36: 3, 37: 5, 86: 6 };
  for (const [emId, i] of Object.entries(index)) buf.writeUInt16LE(i, at + Number(emId) * 2);
  return reader;
}

const crimson: MonsterNameOverlay = {
  id: 36,
  name: "Crimson Fatalis",
  disc: "Fatalis",
  reason: "test",
};

test("readMonsterNames reads each emID's name, without the game's placeholders", () => {
  const names = readMonsterNames(namesFixture(), JP_BASE_ADDRESS, messages());
  assert.equal(names.length, 90);
  assert.equal(names[0], null); // "NO DATA"
  assert.equal(names[10], null); // "dummy"
  assert.equal(names[29], null); // index 0
  assert.equal(names[37], "Pink Rathian");
  assert.equal(names[86], "Plum D.Hermitaur");
  assert.equal(names[36], "Fatalis");
});

test("siteMonsterNames names apart the monsters the game calls alike", () => {
  const disc = readMonsterNames(namesFixture(), JP_BASE_ADDRESS, messages());
  const names = siteMonsterNames(disc, [
    crimson,
    { id: 29, name: "Rocks", disc: null, reason: "" },
  ]);
  assert.equal(names[2], "Fatalis");
  assert.equal(names[36], "Crimson Fatalis");
  assert.equal(names[29], "Rocks");
  assert.throws(() => siteMonsterNames(disc, []), /emIDs 2 and 36 are both "Fatalis"/);
});

test("siteMonsterNames rejects overlay entries the disc no longer needs", () => {
  const disc = readMonsterNames(namesFixture(), JP_BASE_ADDRESS, messages());
  assert.throws(
    () => siteMonsterNames(disc, [{ ...crimson, disc: "Red Fatalis" }]),
    /emID 36 is "Fatalis" on the disc, not "Red Fatalis"/,
  );
  assert.throws(
    () =>
      siteMonsterNames(disc, [
        crimson,
        { id: 37, name: "Rose Rathian", disc: "Pink Rathian", reason: "" },
      ]),
    MonsterNameError,
  );
});

test("renameMonsters renames data/mhfu/strings monsters and reports each change", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "monster-names-"));
  try {
    mkdirSync(path.join(dir, "mhfu", "strings"), { recursive: true });
    const file = path.join(dir, "mhfu", "strings", "en.json");
    writeFileSync(
      file,
      JSON.stringify({ monster: { "1": "Rathian", "86": "Plum Daimyo Hermitaur" } }),
    );
    const names = { "1": "Rathian", "86": "Plum D.Hermitaur", "87": "Terra S.Ceanataur" };

    assert.deepEqual(renameMonsters(dir, names, true), [
      { id: 86, before: "Plum Daimyo Hermitaur", after: "Plum D.Hermitaur" },
    ]);
    assert.match(readFileSync(file, "utf-8"), /Plum Daimyo Hermitaur/); // dry run

    renameMonsters(dir, names);
    // Only monsters the site has are renamed.
    assert.deepEqual(JSON.parse(readFileSync(file, "utf-8")).monster, {
      "1": "Rathian",
      "86": "Plum D.Hermitaur",
    });
    assert.deepEqual(renameMonsters(dir, names), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("discMonsterNames reads the name table, or gives null without one", () => {
  assert.equal(discMonsterNames(namesFixture(), null), null);
  assert.equal(discMonsterNames(namesFixture(), []), null);
  const names = discMonsterNames(namesFixture(), [messages()], [crimson]);
  assert.equal(names?.[36], "Crimson Fatalis");
  assert.equal(names?.[86], "Plum D.Hermitaur");
});

test("data/mhfu/strings keeps monster.enum's spellings, for extracts that name monsters by it (JP)", () => {
  const strings = StringTable.read(
    fileURLToPath(new URL("../../../data", import.meta.url)),
    "mhfu",
  );
  const enums = loadEnums();
  for (const [id, name] of Object.entries(strings.doc.monster ?? {})) {
    const spelling = lookupName(enums, "emID", Number(id));
    if (spelling === null || spelling === name) continue;
    assert.ok(
      strings.aliases("monster", id)?.includes(spelling),
      `emID ${id} "${name}": add "${spelling}" to aliases.monster`,
    );
  }
});
