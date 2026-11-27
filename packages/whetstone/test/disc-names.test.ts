import assert from "node:assert/strict";
import { test } from "node:test";
import { JP_BASE_ADDRESS } from "mhfu-extract/src/tables/offsets.js";
import {
  MONSTER_NAME_INDEXES,
  MONSTER_NAME_INDEXES_US,
} from "mhfu-extract/src/strings/monster-names.js";
import { readDiscMonsterNames } from "../src/game/load.js";
import { messageFile } from "./fixtures.js";

const NAMES = [
  "",
  "NO DATA",
  "Fatalis",
  "Yian Garuga",
  "Kushala Daora",
  "Rajang",
  "Plum D.Hermitaur",
];
/** emID -> string in NAMES: the base monsters and the subspecies the game names alike. */
const INDEX: Record<number, number> = {
  0: 1,
  2: 2,
  36: 2,
  71: 2,
  78: 3,
  40: 3,
  54: 4,
  60: 4,
  53: 5,
  89: 5,
  86: 6,
};

function eboot(index: Record<number, number> = INDEX, at = MONSTER_NAME_INDEXES): Buffer {
  const buf = Buffer.alloc(0x08a00000 - JP_BASE_ADDRESS);
  for (const [emId, i] of Object.entries(index))
    buf.writeUInt16LE(i, at - JP_BASE_ADDRESS + Number(emId) * 2);
  return buf;
}

const dataBin = (file: Buffer, fileCount = 20) => ({ fileCount, read: () => file });

test("an EU disc's monster names are the game's, with the overlay's for its look-alikes", () => {
  const { names, problem } = readDiscMonsterNames(dataBin(messageFile([NAMES])), eboot());
  assert.equal(problem, undefined);
  assert.equal(names?.[86], "Plum D.Hermitaur");
  assert.equal(names?.[2], "Fatalis");
  assert.equal(names?.[36], "Crimson Fatalis");
  assert.equal(names?.[29], "Rocks");
  assert.equal(names?.[0], null);
});

test("a US disc's monster names are read from its own table", () => {
  const us = eboot(INDEX, MONSTER_NAME_INDEXES_US);
  const { names, problem } = readDiscMonsterNames(
    dataBin(messageFile([NAMES])),
    us,
    MONSTER_NAME_INDEXES_US,
  );
  assert.equal(problem, undefined);
  assert.equal(names?.[86], "Plum D.Hermitaur");
  // At EU's address the US EBOOT has no names.
  assert.equal(readDiscMonsterNames(dataBin(messageFile([NAMES])), us).names, null);
});

test("monster names that can't be read fall back to the enum, saying why", () => {
  const unread = (result: { names: unknown; problem?: string }, why: RegExp) => {
    assert.equal(result.names, null);
    assert.match(result.problem ?? "", why);
    assert.match(result.problem ?? "", /monster\.enum/);
  };
  unread(readDiscMonsterNames(dataBin(messageFile([NAMES]), 10), eboot()), /no file 19/);
  unread(readDiscMonsterNames(dataBin(messageFile([])), eboot()), /no monster names/);
  // Furious Rajang now has a name of its own: the overlay entry no longer fits.
  unread(
    readDiscMonsterNames(
      dataBin(messageFile([[...NAMES, "Furious Rajang"]])),
      eboot({ ...INDEX, 89: 7 }),
    ),
    /emID 89/,
  );
});
