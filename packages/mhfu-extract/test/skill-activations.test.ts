import assert from "node:assert/strict";
import { test } from "node:test";
import { MHP2G_EU_RESOLVER } from "../src/games/mhp2g.js";
import { SKILL_ACTIVATION_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "../src/tables/offsets.js";
import { readSkillActivations } from "../src/tables/skill-activations.js";
import { fixtureReader } from "./helpers.js";

/** The EU and FUC table's first three rows: Paralysis, Sleep, Faint. */
const FIRST_ROWS = "020303030102020306060604050504090909070808";

function writeTable(buf: Buffer, base: number) {
  for (let i = 0; i < TABLE_COUNTS.skillActivations; i++) {
    const at = base + i * SKILL_ACTIVATION_ENTRY_SIZE;
    buf[at] = i + 2;
    for (let k = 0; k < 6; k++) buf[at + 1 + k] = (i * 6 + k) % 218;
  }
  Buffer.from(FIRST_ROWS, "hex").copy(buf, base);
  buf[base + TABLE_COUNTS.skillActivations * SKILL_ACTIVATION_ENTRY_SIZE] = 0xff;
}

test("readSkillActivations reads a tree and six skills per row, trees 2 to 99", () => {
  const base = tableOffset("skillActivations");
  const { buf, reader } = fixtureReader(base + 1000);
  writeTable(buf, base);
  const rows = readSkillActivations(reader);
  assert.equal(rows.length, 98);
  assert.deepEqual(rows[0], { at: base, tree: 2, skills: [3, 3, 3, 1, 2, 2] });
  assert.deepEqual(rows[2]!.skills, [9, 9, 9, 7, 8, 8]);
  assert.equal(rows[97]!.tree, 99);
});

test("readSkillActivations throws on rows that aren't the table", () => {
  const base = tableOffset("skillActivations");
  const { buf, reader } = fixtureReader(base + 1000);
  writeTable(buf, base);
  buf[base + TABLE_COUNTS.skillActivations * SKILL_ACTIVATION_ENTRY_SIZE] = 0;
  assert.throws(() => readSkillActivations(reader), /0xFF/);
  writeTable(buf, base);
  buf[base + 7 * 5] = 40;
  assert.throws(() => readSkillActivations(reader), /row 5 is tree 40/);
});

test("MHP2G_EU_RESOLVER resolves skillActivations at its real EU file offset (0x1b6114)", () => {
  const realOffset = 0x1b6114;
  const buf = Buffer.alloc(realOffset + 1000);
  writeTable(buf, realOffset);
  assert.equal(MHP2G_EU_RESOLVER.resolve("skillActivations", buf), realOffset);
});
