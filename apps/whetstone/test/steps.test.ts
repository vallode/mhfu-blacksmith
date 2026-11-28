import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WHETSTONE_OPTIONS,
  defaultWhetstoneSettings,
  encodeWhetstoneSettings,
} from "whetstone/src/settings.js";
import { OPTION_STEPS, PRESETS, SECTION_ICONS, presetSettings } from "../steps.js";

test("every option section is in exactly one step, and named steps have their sprite", () => {
  const sections = new Set(WHETSTONE_OPTIONS.map((o) => o.section));
  const listed = OPTION_STEPS.flatMap((s) => s.sections ?? []);
  assert.deepEqual(new Set(listed), sections, "no step lists a section that isn't there");
  assert.equal(listed.length, new Set(listed).size, "no section is in two steps");
  assert.ok(
    OPTION_STEPS.every((s) => s.id !== "more"),
    "every section has a step of its own choosing",
  );
  assert.deepEqual(
    OPTION_STEPS.map((s) => s.title),
    ["Camera", "HUD", "Quality of life", "Monsters & Poogie", "Boot & buttons"],
  );
  for (const step of OPTION_STEPS.filter((s) => (s.sections?.length ?? 0) > 1)) {
    for (const section of step.sections!) assert.ok(SECTION_ICONS[section], section);
  }
});

test("Recommended turns on the quality-of-life mods, and Defaults is the library's defaults", () => {
  const recommended = presetSettings(PRESETS.find((p) => p.name === "Recommended")!);
  for (const key of [
    "camera.photoMode",
    "quests.keyLabel",
    "mods.nodeMap",
    "rewards.sendAll",
    "smithy.improvePips",
    "farm.harvestAll",
    "pouch.bulkCombine",
  ] as const) {
    assert.equal(recommended[key], true, key);
  }
  const defaults = presetSettings(PRESETS.find((p) => p.name === "Defaults")!);
  assert.deepEqual(defaults, defaultWhetstoneSettings());
  // The Defaults preset's points name the mods that are on by default.
  assert.deepEqual(
    WHETSTONE_OPTIONS.filter((o) => o.default === true).map((o) => o.key),
    [
      "poogie.enabled",
      "rewards.sendAll",
      "farm.harvestAll",
      "pouch.bulkCombine",
      "smithy.improvePips",
    ],
  );
});

test("the presets are all different, so the page can tell which one the settings match", () => {
  const strings = PRESETS.map((p) => encodeWhetstoneSettings(presetSettings(p)));
  assert.equal(new Set(strings).size, PRESETS.length);
  for (const s of strings) assert.match(s, /^WS/);
});
