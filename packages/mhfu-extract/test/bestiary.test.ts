import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestiaryEntryFor,
  BestiaryError,
  descriptionText,
  readBestiary,
} from "../src/monsters/bestiary.js";
import type { MessageTable } from "../src/strings/messages.js";
import { JP_BASE_ADDRESS } from "../src/tables/offsets.js";
import { emitMonsters, type MonsterTables } from "../src/emit/monsters.js";
import { fixtureReader } from "./helpers.js";

const at = (vaddr: number) => vaddr - JP_BASE_ADDRESS;

/**
 * A zero-filled EBOOT with the crown table at its EU address: Rathian's
 * entry (27) with Gold and Pink Rathian, Yian Kut-Ku's (22) with Blue Yian
 * Kut-Ku, and the rest one monster each.
 */
function bestiaryFixture(tweak?: (buf: Buffer) => void) {
  const { buf, reader } = fixtureReader(0x08a00000 - JP_BASE_ADDRESS);
  const special = new Map([
    [27, [1, 42, 37]],
    [22, [6, 38]],
  ]);
  const taken = new Set([...special.values()].flat());
  const singles = Array.from({ length: 90 }, (_, id) => id).filter((id) => !taken.has(id));
  let groups = at(0x089f0000);
  for (let i = 0; i < 62; i++) {
    const emIds = special.get(i) ?? [singles.shift()!];
    const entry = at(0x08930bdc) + i * 14;
    buf.writeUInt8(i, entry);
    buf.writeUInt8(emIds[0]!, entry + 3);
    buf.writeUInt32LE(groups + JP_BASE_ADDRESS, at(0x0899bf40) + emIds[0]! * 4);
    for (const id of [...emIds, 0xff]) buf.writeUInt8(id, groups++);
  }
  tweak?.(buf);
  return reader;
}

function messages(count = 62): MessageTable {
  return {
    offset: 0,
    strings: Array.from({ length: count }, (_, i) => ({
      offset: 0,
      bytes: Buffer.from(
        i === 27 ? "Female version of the\nRathalos wyvern. Unlike \nits male" : `Text ${i}`,
      ),
    })),
  };
}

test("descriptionText turns the text box's line breaks into spaces", () => {
  assert.equal(
    descriptionText(Buffer.from("known to \ninhabit the\nsnowy mountains.")),
    "known to inhabit the snowy mountains.",
  );
});

test("readBestiary gives each entry its emID group and description", () => {
  const reader = bestiaryFixture();
  const entries = readBestiary(reader, JP_BASE_ADDRESS, messages());
  assert.equal(entries.length, 62);
  assert.deepEqual(entries[27], {
    emIds: [1, 42, 37],
    description: "Female version of the Rathalos wyvern. Unlike its male",
  });
  assert.equal(bestiaryEntryFor(entries, 37), entries[27]);
  assert.equal(bestiaryEntryFor(entries, 38)?.description, "Text 22");
  assert.equal(bestiaryEntryFor(entries, 89), undefined);
});

test("readBestiary rejects a table that isn't the monster list", () => {
  assert.throws(
    () => readBestiary(bestiaryFixture(), JP_BASE_ADDRESS, messages(61)),
    BestiaryError,
  );
  // Entry 5 names Pink Rathian, already in Rathian's group.
  const repeated = bestiaryFixture((buf) => {
    buf.writeUInt8(37, at(0x08930bdc) + 5 * 14 + 3);
    buf.writeUInt32LE(buf.readUInt32LE(at(0x0899bf40) + 1 * 4) + 2, at(0x0899bf40) + 37 * 4);
  });
  assert.throws(
    () => readBestiary(repeated, JP_BASE_ADDRESS, messages()),
    /entry 27.s emID group \[1, 42, 37\] is wrong/,
  );
  const misnumbered = bestiaryFixture((buf) => buf.writeUInt8(9, at(0x08930bdc) + 3 * 14));
  assert.throws(() => readBestiary(misnumbered, JP_BASE_ADDRESS, messages()), /isn't numbered 3/);
});

test("emitMonsters writes a subspecies' description from its base monster's entry", () => {
  const tables = {
    chunks: [],
    carves: [],
    capBreak: [],
    bestiary: [{ emIds: [6, 38], description: "A bird wyvern." }],
  } as unknown as MonsterTables;
  const chunk = {
    baseHp: 1,
    tolerances: Object.fromEntries(
      ["paralysis", "sleep", "ko", "poison", "unknown"].map((k) => [k, { initial: 0xffff }]),
    ),
    hitzones: null,
  };
  (tables.chunks as unknown[])[38] = chunk;
  const out = emitMonsters(tables)["monsters/bird-wyvern.json"] as {
    monsters: { name: string; description?: string }[];
  };
  assert.equal(out.monsters.find((m) => m.description)?.description, "A bird wyvern.");
});
