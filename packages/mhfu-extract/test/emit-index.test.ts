import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { emitAll, writeEmitOutput } from "../src/emit/index.js";
import { JP_BASE_ADDRESS, tableOffset } from "../src/tables/offsets.js";
import { fixtureReader } from "./helpers.js";

const EXPECTED_FILES = [
  "items.json",
  "decorations.json",
  "armor/helmet.json",
  "armor/plate.json",
  "armor/gauntlets.json",
  "armor/waist.json",
  "armor/leggings.json",
  "weapons/great-sword.json",
  "weapons/long-sword.json",
  "weapons/sword-and-shield.json",
  "weapons/dual-blades.json",
  "weapons/hammer.json",
  "weapons/hunting-horn.json",
  "weapons/lance.json",
  "weapons/gunlance.json",
  "weapons/light-bowgun.json",
  "weapons/heavy-bowgun.json",
  "weapons/bow.json",
];

/**
 * A buffer with valid (in-bounds) ArmorValuePTR pointers but otherwise
 * zero-filled contents. Every other table emitAll() touches has a fixed
 * address (no pointer indirection), so this is enough to exercise
 * orchestration end-to-end without the per-module correctness fixtures
 * emit-armor/decorations/weapons.test.ts already own.
 */
function buildOrchestratorFixture() {
  const { buf, reader } = fixtureReader(0x200000);
  const ptrBase = tableOffset("armorValuePointers");
  // All five slots point at the same safe, zero-filled region — the actual
  // per-entry data doesn't matter here, only that reads stay in bounds.
  for (let slot = 0; slot < 5; slot++) {
    buf.writeUInt32LE(JP_BASE_ADDRESS + 0x180000, ptrBase + slot * 4);
  }
  return reader;
}

test("emitAll produces every data/*.json-shaped file with the right top-level key", () => {
  const reader = buildOrchestratorFixture();
  const output = emitAll(reader);

  assert.deepEqual(Object.keys(output).sort(), [...EXPECTED_FILES].sort());
  assert.ok(Array.isArray((output["items.json"] as { items: unknown }).items));
  assert.ok(Array.isArray((output["decorations.json"] as { decorations: unknown }).decorations));
  for (const armorFile of [
    "armor/helmet.json",
    "armor/plate.json",
    "armor/gauntlets.json",
    "armor/waist.json",
    "armor/leggings.json",
  ]) {
    assert.ok(
      Array.isArray((output[armorFile] as { armor: unknown }).armor),
      `${armorFile} should have an armor array`,
    );
  }
  for (const weaponFile of EXPECTED_FILES.filter((f) => f.startsWith("weapons/"))) {
    assert.ok(
      Array.isArray((output[weaponFile] as { weapons: unknown }).weapons),
      `${weaponFile} should have a weapons array`,
    );
  }
});

test("emitAll routes every emitted weapon into its own type's file only", () => {
  const reader = buildOrchestratorFixture();
  const output = emitAll(reader);
  const gsNames = new Set(
    (output["weapons/great-sword.json"] as { weapons: { name: string }[] }).weapons.map(
      (w) => w.name,
    ),
  );
  const lsNames = new Set(
    (output["weapons/long-sword.json"] as { weapons: { name: string }[] }).weapons.map(
      (w) => w.name,
    ),
  );
  for (const name of gsNames)
    assert.ok(
      !lsNames.has(name),
      `${name} should not appear in both great-sword and long-sword output`,
    );
});

test("writeEmitOutput persists every file to disk under the given directory", async () => {
  const reader = buildOrchestratorFixture();
  const output = emitAll(reader);
  const outDir = await mkdtemp(path.join(tmpdir(), "mhfu-emit-"));
  try {
    await writeEmitOutput(outDir, output);
    const written = JSON.parse(await readFile(path.join(outDir, "armor/helmet.json"), "utf-8"));
    assert.ok(Array.isArray(written.armor));
    const decorations = JSON.parse(await readFile(path.join(outDir, "decorations.json"), "utf-8"));
    assert.deepEqual(decorations, output["decorations.json"]);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
