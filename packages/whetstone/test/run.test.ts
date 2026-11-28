import assert from "node:assert/strict";
import { test } from "node:test";
import { runWhetstone } from "../src/run.js";
import {
  applyWhetstoneSettings,
  decodeWhetstoneSettings,
  defaultWhetstoneSettings,
  encodeWhetstoneSettings,
} from "../src/settings.js";
import { assemble, buildFixtureDisc, memorySource } from "./fixtures.js";

test("runWhetstone leaves the disc alone, returns the finished image and logs what went in", async () => {
  const disc = buildFixtureDisc();
  const original = Buffer.from(disc);
  const settings = applyWhetstoneSettings(defaultWhetstoneSettings(), {
    "mods.nodeMap": true,
    "camera.fov": "wide",
  });
  const lines: string[] = [];
  const result = await runWhetstone(memorySource(disc), settings, {}, (line) => lines.push(line));
  assert.ok(disc.equals(original), "the input is never written to");
  assert.ok(lines.some((line) => /Read-back check passed/.test(line)));
  assert.match(result.report, /^Whetstone log/);
  assert.match(result.report, /Settings: WS/);
  assert.match(result.report, /Camera \/ Field of view: Wide/);
  // The fixture's EBOOT has none of the game's code, so the patches say why they aren't in.
  assert.match(result.report, /== Online play ==/);
  assert.match(result.report, /Camera isn't in this image/);
  assert.equal(assemble(result.segments!, disc).length, disc.length);

  const dry = await runWhetstone(memorySource(disc), settings, { dryRun: true }, () => {});
  assert.equal(dry.segments, null);
  assert.equal(dry.report, result.report, "a dry run previews the same disc");
});

test("a Whetstone settings string keeps only what isn't a default, and reads back", () => {
  const defaults = defaultWhetstoneSettings();
  const changed = applyWhetstoneSettings(defaults, { "hud.damageNumbers": "split" });
  const { settings, version } = decodeWhetstoneSettings(encodeWhetstoneSettings(changed));
  assert.deepEqual(settings, changed);
  assert.equal(typeof version, "number");
  assert.ok(encodeWhetstoneSettings(defaults).length < encodeWhetstoneSettings(changed).length);
  assert.throws(() => decodeWhetstoneSettings("RFabc"), /starts with WS/);
});
