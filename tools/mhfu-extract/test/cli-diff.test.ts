import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { diffFile, itemKeyOf, runDiff } from "../src/cli/diff.js";

test("itemKeyOf prefers name, falls back to a numeric id, then a JSON snippet", () => {
  assert.equal(itemKeyOf({ name: "Carbalite Sword" }), "Carbalite Sword");
  assert.equal(itemKeyOf({ id: 1 }), "#1");
  assert.equal(itemKeyOf({ foo: "bar" }), '{"foo":"bar"}');
});

test("diffFile reports field mismatches only for keys present on both sides", () => {
  const extracted = { weapons: [{ name: "Carbalite Sword", attack: 100, rarity: 3, notes: "extra field" }] };
  const committed = { weapons: [{ name: "Carbalite Sword", attack: 90, rarity: 3 }] };

  const result = diffFile("weapons/great-sword.json", extracted, committed);
  assert.deepEqual(result.itemsOnlyInExtracted, []);
  assert.deepEqual(result.itemsOnlyInCommitted, []);
  assert.deepEqual(result.fieldMismatches, [
    { itemKey: "Carbalite Sword", field: "attack", extracted: 100, committed: 90 },
  ]);
});

test("diffFile reports items present on only one side", () => {
  const extracted = { weapons: [{ name: "Only Extracted" }] };
  const committed = { weapons: [{ name: "Only Committed" }] };

  const result = diffFile("weapons/great-sword.json", extracted, committed);
  assert.deepEqual(result.itemsOnlyInExtracted, ["Only Extracted"]);
  assert.deepEqual(result.itemsOnlyInCommitted, ["Only Committed"]);
  assert.deepEqual(result.fieldMismatches, []);
});

test("diffFile returns an empty diff when either side isn't array-shaped", () => {
  const result = diffFile("weird.json", { notAnArray: 1 }, { alsoNot: 2 });
  assert.deepEqual(result, { file: "weird.json", itemsOnlyInExtracted: [], itemsOnlyInCommitted: [], fieldMismatches: [] });
});

test("runDiff walks both directory trees and diffs shared files, reporting files unique to each side", async () => {
  const extractedDir = await mkdtemp(path.join(tmpdir(), "mhfu-extract-diff-extracted-"));
  const dataDir = await mkdtemp(path.join(tmpdir(), "mhfu-extract-diff-data-"));
  try {
    await mkdir(path.join(extractedDir, "weapons"), { recursive: true });
    await mkdir(path.join(dataDir, "weapons"), { recursive: true });
    await mkdir(path.join(dataDir, "schemas"), { recursive: true });

    await writeFile(
      path.join(extractedDir, "weapons", "great-sword.json"),
      JSON.stringify({ weapons: [{ name: "Carbalite Sword", attack: 100 }] })
    );
    await writeFile(
      path.join(dataDir, "weapons", "great-sword.json"),
      JSON.stringify({ weapons: [{ name: "Carbalite Sword", attack: 90 }] })
    );
    // Only in extracted (e.g. the new quests category, not yet reviewed into data/).
    await writeFile(path.join(extractedDir, "quests.json"), JSON.stringify({ quests: [] }));
    // Only in committed data/, and a schema file that should be excluded entirely.
    await writeFile(path.join(dataDir, "decorations.json"), JSON.stringify({ decorations: [] }));
    await writeFile(path.join(dataDir, "schemas", "weapon.schema.json"), JSON.stringify({}));

    const report = await runDiff({ extracted: extractedDir, data: dataDir });

    assert.deepEqual(report.filesOnlyInExtracted, ["quests.json"]);
    assert.deepEqual(report.filesOnlyInCommitted, ["decorations.json"]);
    assert.equal(report.files.length, 1);
    assert.equal(report.files[0]!.file, path.join("weapons", "great-sword.json"));
    assert.deepEqual(report.files[0]!.fieldMismatches, [
      { itemKey: "Carbalite Sword", field: "attack", extracted: 100, committed: 90 },
    ]);
  } finally {
    await rm(extractedDir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});
