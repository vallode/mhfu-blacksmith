import assert from "node:assert/strict";
import { test } from "node:test";
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
  settingsFromJson,
  settingsToJson,
  withOlderDefaults,
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
  for (const preset of PRESETS) applySettings(defaults, preset.changes);
  for (const name of ["Full", "Chaos"]) {
    const preset = PRESETS.find((p) => p.name === name)!;
    assert.equal(preset.changes["armor.enabled"], true, `${name} shuffles armor`);
    assert.ok(preset.changes["gathering.mode"] !== undefined, `${name} changes gathering`);
  }
});

/**
 * Options no preset turns on until they're tried in game (see the README's
 * status). Armor stats are the exception the README's Presets names.
 */
const UNTRIED: readonly OptionKey[] = [
  "carveCounts.mode",
  "questMaps.enabled",
  "questMaps.starts",
  "questMonsters.smallSpecies",
  "trades.mode",
  "mods.nodeMap",
  "elites.enabled",
  "monsterAi.branches",
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
        // Reward modes can do either: Randomized leaves them off (every reward stays put).
        !(action === "randomize" && o.key.endsWith(".mode") && o.key !== "armorSkills.mode") &&
        (o.action === action ||
          (o.type.kind === "choice" && o.type.choices.some((c) => c.action === action))),
    );

  // "The defaults: quest rewards and carves are shuffled."
  assert.deepEqual(preset("Rewards only"), defaultSettings("S"));
  assert.deepEqual(keys(preset("Rewards only")), ["monsterRewards.mode", "questRewards.mode"]);

  // Shuffled: every shuffle that's been tried, and no randomizer.
  const shuffled = preset("Shuffled");
  assert.deepEqual(of(shuffled, "randomize"), []);
  assert.deepEqual(
    of(shuffled, "shuffle").sort(),
    tried("shuffle")
      .map((o) => o.key)
      .sort(),
  );
  for (const option of OPTIONS) {
    if (option.type.kind !== "choice") continue;
    // The modes are what the presets set, so they differ from the defaults: a
    // mode's every value but "off" shuffles or randomizes. A scope or pool
    // with an action on one value is still checked.
    if (option.type.choices.every((c) => c.action || c.value === "off")) continue;
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

  // Full: both together, at the same star level; Chaos: all of Full, with the limits off.
  const full = preset("Full");
  const chaos = preset("Chaos");
  assert.equal(full["recipes.scope"], "star");
  assert.equal(chaos["recipes.scope"], "any");
  for (const key of [...keys(shuffled), ...keys(randomized)]) {
    assert.ok(actionsOf(full).has(key), `Full has ${key}`);
  }
  for (const key of keys(full)) assert.ok(actionsOf(chaos).has(key), `Chaos has ${key}`);

  // Every preset writes the bookshelf guides, as the defaults do.
  for (const { name } of PRESETS) {
    for (const key of ["hints.bookshelf", "hints.almanac"] as const) {
      assert.equal(preset(name)[key], true, `${name}: ${key}`);
    }
  }

  // Nothing untried is in a preset.
  for (const { name } of PRESETS) {
    for (const key of UNTRIED) assert.ok(!actionsOf(preset(name)).has(key), `${name}: ${key}`);
  }
});

test("settings strings round-trip, seed included, and stay short for the defaults", () => {
  const custom = applySettings(defaultSettings("Ünïcode seed 🐉"), {
    "recipes.scope": "rank",
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

test("settings from before Poogie's luck existed keep it off, so they don't cap Guild Cards", () => {
  const encode = (payload: Record<string, unknown>) =>
    `RF${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  assert.equal(decodeSettings(encode({ v: 14, seed: "a" })).settings["poogie.enabled"], false);
  assert.equal(
    decodeSettings(encode({ v: 14, seed: "a", "poogie.enabled": true })).settings["poogie.enabled"],
    true,
  );
  assert.equal(decodeSettings(encode({ v: 15, seed: "a" })).settings["poogie.enabled"], true);
  // A full set stored by an older build lacks the key; a newer one keeps its own.
  const { "poogie.enabled": _, ...older } = defaultSettings("b");
  assert.equal(withOlderDefaults(older)["poogie.enabled"], false);
  assert.equal(withOlderDefaults({ ...defaultSettings("b") })["poogie.enabled"], true);
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
});

test("settings files hold any subset; written files list everything", () => {
  const partial = settingsFromJson('{"costs.enabled": true, "seed": "FILE"}', "unused");
  assert.equal(partial.seed, "FILE");
  assert.equal(partial["costs.enabled"], true);
  assert.equal(partial["questRewards.mode"], "shuffle", "unlisted options keep their defaults");
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

test("an option enabled by a choice names one of its values; one enabled by a switch doesn't", () => {
  for (const option of OPTIONS.filter((o) => o.enabledBy)) {
    const parent = OPTIONS.find((o) => o.key === option.enabledBy);
    assert.ok(parent, `${option.key}: ${option.enabledBy} is an option`);
    if (parent.type.kind === "choice") {
      const values = parent.type.choices.map((c) => c.value);
      assert.ok(option.enabledWhen?.length, `${option.key}: a choice needs enabledWhen`);
      for (const when of option.enabledWhen) {
        assert.ok(values.includes(when), `${option.key}: ${when} is a value of ${parent.key}`);
        const on = applySettings(defaultSettings("S"), { [parent.key]: when });
        assert.ok(isActive(on, option), `${option.key} is active at ${when}`);
      }
    } else {
      assert.equal(parent.type.kind, "boolean", `${option.key}: ${parent.key} is a switch`);
      assert.equal(option.enabledWhen, undefined, `${option.key}: a switch needs no enabledWhen`);
    }
  }
});
