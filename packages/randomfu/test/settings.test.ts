import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { settingsFromFlags } from "../src/cli.js";
import {
  OPTIONS,
  actionsOf,
  PRESETS,
  SettingsError,
  applySettings,
  decodeSettings,
  defaultSettings,
  describeSettings,
  encodeSettings,
  isActive,
  needsEboot,
  parseAssignments,
  settingsFromJson,
  settingsToJson,
  type Action,
  type OptionDef,
  type OptionKey,
  type Settings,
} from "../src/settings.js";
import { LOGIC_VERSION } from "../src/version.js";

test("every option has a default its own checks accept", () => {
  const defaults = defaultSettings("S");
  for (const option of OPTIONS) {
    assert.deepEqual(
      applySettings(defaults, { [option.key]: option.default })[option.key],
      option.default,
    );
  }
  assert.equal(needsEboot(defaults), false, "the defaults run without the EBOOT");
  for (const preset of PRESETS) applySettings(defaults, preset.changes);
  for (const name of ["Full", "Chaos"]) {
    const preset = PRESETS.find((p) => p.name === name)!;
    assert.equal(preset.changes["armor.enabled"], true, `${name} shuffles armor`);
    assert.equal(preset.changes["gathering.enabled"], true, `${name} shuffles gathering`);
  }
  assert.equal(OPTIONS.find((o) => o.key === "armor.enabled")!.eboot, true);
  assert.ok(!OPTIONS.find((o) => o.key === "gathering.enabled")!.eboot);
});

/** Options no preset turns on until they're tried in game (see the README's status). */
const UNTRIED: readonly OptionKey[] = [
  "questMonsters.crowns",
  "questMonsters.difficulty",
  "questMonsters.smallCounts",
  "monsterStats.hp",
  "monsterStats.size",
  "monsterStats.status",
  "weaknesses.elements",
  "weaknesses.parts",
  "weapons.attack",
  "weapons.affinity",
  "weapons.element",
];

test("presets do what their help says", () => {
  const preset = (name: string) =>
    applySettings(defaultSettings("S"), PRESETS.find((p) => p.name === name)!.changes);
  const keys = (settings: Settings) => [...actionsOf(settings).keys()].sort();
  const of = (settings: Settings, action: Action) =>
    [...actionsOf(settings)].filter(([, a]) => a === action).map(([k]) => k);
  const tried = (action: Action) =>
    OPTIONS.filter(
      (o) =>
        !UNTRIED.includes(o.key) &&
        (o.action === action ||
          (o.type.kind === "choice" && o.type.choices.some((c) => c.action === action))),
    );

  // "The defaults: quest rewards and carves are shuffled."
  assert.deepEqual(preset("Rewards only"), defaultSettings("S"));
  assert.deepEqual(keys(preset("Rewards only")), [
    "monsterRewards.enabled",
    "questRewards.enabled",
  ]);

  // Shuffled: every shuffle that's been tried, and no randomizer.
  const shuffled = preset("Shuffled");
  assert.deepEqual(of(shuffled, "randomize"), []);
  assert.deepEqual(
    of(shuffled, "shuffle").sort(),
    tried("shuffle")
      .map((o) => o.key)
      .sort(),
  );
  for (const option of OPTIONS.filter((o) => o.type.kind === "choice")) {
    if (option.key === "armorSkills.mode") continue;
    assert.equal(shuffled[option.key], option.default, `Shuffled keeps ${option.key}'s pool`);
  }

  // Randomized: no shuffle, and every randomizer that's been tried and needs no shuffle on.
  const randomized = preset("Randomized");
  assert.deepEqual(of(randomized, "shuffle"), []);
  const needsShuffle = (o: OptionDef) => {
    const parent = OPTIONS.find((p) => p.key === o.enabledBy);
    return parent?.action === "shuffle";
  };
  assert.deepEqual(
    of(randomized, "randomize").sort(),
    tried("randomize")
      .filter((o) => !needsShuffle(o))
      .map((o) => o.key)
      .sort(),
  );

  // Full: both together, with logic; Chaos: all of Full, without.
  const full = preset("Full");
  const chaos = preset("Chaos");
  assert.equal(full["logic.tiers"], "star");
  assert.equal(chaos["logic.tiers"], "none");
  for (const key of [...keys(shuffled), ...keys(randomized)]) {
    assert.ok(actionsOf(full).has(key), `Full has ${key}`);
  }
  for (const key of keys(full)) assert.ok(actionsOf(chaos).has(key), `Chaos has ${key}`);

  // Nothing untried is in a preset.
  for (const { name } of PRESETS) {
    for (const key of UNTRIED) assert.ok(!actionsOf(preset(name)).has(key), `${name}: ${key}`);
  }
});

test("settings strings round-trip, seed included, and stay short for the defaults", () => {
  const custom = applySettings(defaultSettings("Ünïcode seed 🐉"), {
    "logic.tiers": "rank",
    "recipes.amounts": true,
    "recipes.amountSpread": 0.25,
    "weapons.enabled": true,
    "weapons.mix": "any-type",
  });
  const decoded = decodeSettings(encodeSettings(custom));
  assert.deepEqual(decoded.settings, custom);
  assert.equal(decoded.version, LOGIC_VERSION);
  assert.ok(encodeSettings(defaultSettings("ABC")).length < 40);
  assert.throws(() => decodeSettings("RF!!!"), SettingsError);
  assert.throws(() => decodeSettings("nope"), /starts with RF/);
});

test("values are checked and converted", () => {
  const d = defaultSettings("S");
  assert.equal(applySettings(d, { "costs.enabled": "true" })["costs.enabled"], true);
  assert.equal(applySettings(d, { "costs.spread": "0.3" })["costs.spread"], 0.3);
  assert.equal(applySettings(d, { "recipes.maxQuantity": 12.6 })["recipes.maxQuantity"], 13);
  assert.throws(() => applySettings(d, { "costs.spread": 1.5 }), /from 0 to 0.95/);
  assert.throws(() => applySettings(d, { "weapons.mix": "hammer" }), /same-type, any-type/);
  assert.throws(() => applySettings(d, { "costs.enabled": "maybe" }), /true or false/);
  assert.throws(() => applySettings(d, { "made.up": 1 }), /Unknown setting/);
  assert.throws(() => applySettings(d, { seed: " " }), /seed/);
  assert.deepEqual(parseAssignments("a=1, b = two"), { a: "1", b: "two" });
});

test("settings files hold any subset; written files list everything", () => {
  const partial = settingsFromJson('{"costs.enabled": true, "seed": "FILE"}', "unused");
  assert.equal(partial.seed, "FILE");
  assert.equal(partial["costs.enabled"], true);
  assert.equal(partial["questRewards.enabled"], true, "unlisted options keep their defaults");
  const full = JSON.parse(settingsToJson(partial));
  assert.equal(Object.keys(full).length, OPTIONS.length + 1);
  assert.throws(() => settingsFromJson("[]", "S"), /JSON object/);
  assert.throws(() => settingsFromJson("{", "S"), /valid JSON/);
});

test("describeSettings hides options whose switch is off", () => {
  const lines = describeSettings(defaultSettings("S"));
  assert.ok(lines.includes("Costs / Randomize crafting costs: no"));
  assert.ok(!lines.some((l) => l.includes("Cost variation")));
  const on = describeSettings(applySettings(defaultSettings("S"), { "costs.enabled": true }));
  assert.ok(on.includes("Costs / Crafting cost variation: ±50%"));
});

test("CLI flags layer: file < string < --shuffles < shorthand < --set < --seed", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "randomfu-settings-"));
  const file = path.join(dir, "s.json");
  writeFileSync(
    file,
    JSON.stringify({ seed: "FROMFILE", "costs.enabled": true, "costs.spread": 0.1 }),
  );
  assert.equal(settingsFromFlags({ settings: file }).seed, "FROMFILE");

  const string = encodeSettings(
    applySettings(defaultSettings("FROMSTRING"), { "weapons.enabled": true }),
  );
  const s = settingsFromFlags({
    settings: file,
    "settings-string": string,
    shuffles: "weapons,recipes",
    "cost-spread": "0.2",
    set: "recipes.maxQuantity=5",
    seed: "FINAL",
  });
  assert.equal(s.seed, "FINAL");
  assert.equal(s["weapons.enabled"], true);
  assert.equal(s["recipes.materials"], true);
  assert.equal(s["questRewards.enabled"], false, "--shuffles turns off what it doesn't list");
  assert.equal(s["costs.spread"], 0.2);
  assert.equal(s["recipes.maxQuantity"], 5);
  assert.throws(() => settingsFromFlags({ shuffles: "everything" }), /Unknown shuffle/);
  const named = settingsFromFlags({ shuffles: "armor,gathering" });
  assert.equal(named["armor.enabled"], true);
  assert.equal(named["gathering.enabled"], true);
  assert.equal(named["weapons.enabled"], false);
  assert.ok(readFileSync(file, "utf-8").includes("FROMFILE"));
});
