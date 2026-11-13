import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import {
  applySettings,
  defaultSettings,
  encodeSettings,
  decodeSettings,
  needsEboot,
  OPTIONS,
  type OptionKey,
  type Settings,
} from "../src/settings.js";
import { collectWeaponStats, type WeaponStats } from "../src/shuffles/weapon-stats.js";
import { settingsWith } from "./settings-helper.js";
import { buildFixtureDisc, FIXTURE_GUNNER_WEAPONS, FIXTURE_WEAPONS, tempDir } from "./fixtures.js";

const STAT_KEYS = ["weapons.attack", "weapons.affinity", "weapons.element"] as const;

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  return { game, close: () => source.close() };
}

function statsWith(seed: string, changes: Partial<Record<OptionKey, unknown>> = {}): Settings {
  return applySettings(settingsWith(seed, []), {
    "weapons.attack": true,
    "weapons.affinity": true,
    "weapons.element": true,
    ...changes,
  });
}

const key = (w: WeaponStats) => `${w.family}:${w.index}`;
const byKey = (weapons: WeaponStats[]) => new Map(weapons.map((w) => [key(w), w]));

/** Bounds a value must stay in: the same type, one rarity either side; none for a lone weapon. */
function bounds(
  all: WeaponStats[],
  w: WeaponStats,
  value: (o: WeaponStats) => number | null,
): [number, number] {
  const values = all
    .filter((o) => o.type === w.type && Math.abs(o.rarity - w.rarity) <= 1)
    .map(value)
    .filter((v): v is number => v !== null);
  return values.length > 1 ? [Math.min(...values), Math.max(...values)] : [-Infinity, Infinity];
}

test("reads the fixture's weapons: attack, affinity, element and status, both families", async () => {
  const { game, close } = await load();
  const stats = byKey(collectWeaponStats(game.eboot!, game.resolver));
  for (const f of FIXTURE_WEAPONS) {
    const w = stats.get(`Blademaster:${f.index}`)!;
    assert.equal(w.attack, f.attack);
    assert.equal(w.affinity, f.affinity);
    assert.equal(w.type, f.type);
    const kind = f.element ? "element" : f.status ? "status" : null;
    assert.equal(w.element?.kind ?? null, kind, `${f.index}`);
    assert.equal(w.element?.value ?? null, (f.element ?? f.status)?.[1] ?? null);
  }
  for (const f of FIXTURE_GUNNER_WEAPONS) {
    const gun = stats.get(`Gunner:${f.index}`)!;
    assert.equal(gun.type, "bow");
    assert.deepEqual(
      [gun.attack, gun.affinity, gun.element?.value],
      [f.attack, f.affinity, f.element[1]],
    );
  }
  assert.equal(stats.get("Gunner:1")!.element?.name, "Ice");
  close();
});

test("weapon stats: off by default, need the EBOOT", () => {
  const defaults = defaultSettings("S");
  for (const k of STAT_KEYS) {
    const option = OPTIONS.find((o) => o.key === k)!;
    assert.equal(option.default, false, k);
    assert.equal(option.action, "randomize", k);
    assert.equal(option.section, "Weapons", k);
    assert.ok(needsEboot(applySettings(defaults, { [k]: true })), k);
  }
  // A new option at its default leaves existing settings strings as they were.
  assert.equal(
    encodeSettings(applySettings(defaults, { "weapons.attackSpread": 0.2 })),
    encodeSettings(defaults),
  );
  const custom = statsWith("S", { "weapons.attackSpread": 0.4, "weapons.affinitySpread": 30 });
  assert.deepEqual(decodeSettings(encodeSettings(custom)).settings, custom);
});

test("weapon stats are deterministic, stay in bounds and change something", async () => {
  const { game, close } = await load();
  const before = collectWeaponStats(game.eboot!, game.resolver);
  let changed = 0;
  let gunnerElement = false;
  let loneStatus = false;
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const settings = statsWith(seed, {
      "weapons.attackSpread": 0.5,
      "weapons.affinitySpread": 20,
      "weapons.elementSpread": 0.5,
    });
    const result = randomize(game, settings);
    assert.ok(
      result.edits.eboot().equals(randomize(game, settings).edits.eboot()),
      "same seed, same EBOOT",
    );
    const after = byKey(collectWeaponStats(result.edits.eboot(), game.resolver));
    for (const w of before) {
      const now = after.get(key(w))!;
      const [lo, hi] = bounds(before, w, (o) => o.attack);
      assert.ok(now.attack >= lo && now.attack <= hi, `${w.name} attack ${now.attack}`);
      assert.ok(Math.abs(now.attack - w.attack) <= Math.ceil(w.attack * 0.5), "within the spread");
      const [alo, ahi] = bounds(before, w, (o) => o.affinity);
      assert.ok(now.affinity >= alo && now.affinity <= ahi, `${w.name} affinity`);
      assert.ok(Math.abs(now.affinity - w.affinity) <= 20);
      assert.equal(Math.abs(now.affinity - w.affinity) % 5, 0, "steps of 5");
      assert.equal(now.element?.kind, w.element?.kind, "keeps its kind");
      assert.equal(now.element?.name, w.element?.name, "keeps its element");
      if (w.element) {
        const kind = w.element.kind;
        const [elo, ehi] = bounds(before, w, (o) =>
          o.element?.kind === kind ? o.element.value : null,
        );
        assert.ok(now.element!.value >= elo && now.element!.value <= ehi, `${w.name} element`);
      }
      // Nothing else in the record moves.
      assert.equal(now.rarity, w.rarity);
      assert.equal(now.type, w.type);
      if (now.attack !== w.attack || now.affinity !== w.affinity) changed++;
      if (w.family === "Gunner" && now.element!.value !== w.element!.value) gunnerElement = true;
      // Weapon 5 is the only status Great Sword: the spread alone limits it.
      if (w.family === "Blademaster" && w.index === 5 && now.element!.value !== w.element!.value) {
        loneStatus = true;
        assert.ok(
          Math.abs(now.element!.value - w.element!.value) <= Math.ceil(w.element!.value * 0.5),
        );
      }
    }
    const report = result.reports.find((r) => r.title === "Weapon stats")!;
    assert.ok(report.lines.length > 0);
    assert.ok(
      report.lines.every((l) => /^.+: .+ -> /.test(l.text)),
      "spoiler lines",
    );
  }
  assert.ok(changed > 0);
  assert.ok(gunnerElement, "a bow's element moves");
  assert.ok(loneStatus, "a weapon alone with its status still moves");
  close();
});

test("weapon stats only touch attack, affinity and element bytes", async () => {
  const { game, close } = await load();
  const original = game.eboot!;
  const edited = randomize(game, statsWith("bytes", { "weapons.attackSpread": 0.9 })).edits.eboot();
  const stats = collectWeaponStats(original, game.resolver);
  const allowed = new Set<number>();
  for (const w of stats) {
    const fields = w.family === "Blademaster" ? [10, 11, 13, 15, 17] : [8, 9, 13, 18];
    for (const at of fields) allowed.add(w.offset + at);
  }
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== edited[i]) assert.ok(allowed.has(i), `byte 0x${i.toString(16)} changed`);
  }
  close();
});

test("each stat draws from its own stream, and none moves another shuffle's output", async () => {
  const { game, close } = await load();
  const stats = (s: Settings) =>
    byKey(collectWeaponStats(randomize(game, s).edits.eboot(), game.resolver));
  const all = stats(statsWith("own"));
  const attackOnly = stats(
    statsWith("own", { "weapons.affinity": false, "weapons.element": false }),
  );
  const affinityOnly = stats(
    statsWith("own", { "weapons.attack": false, "weapons.element": false }),
  );
  const elementOnly = stats(
    statsWith("own", { "weapons.attack": false, "weapons.affinity": false }),
  );
  for (const [k, w] of all) {
    assert.equal(attackOnly.get(k)!.attack, w.attack, k);
    assert.equal(affinityOnly.get(k)!.affinity, w.affinity, k);
    assert.equal(elementOnly.get(k)!.element?.value, w.element?.value, k);
  }

  // The weapons shuffle and costs give the same tables with or without stats on.
  const base = settingsWith("own", ["weapons", "recipes", "costs"]);
  const plain = randomize(game, base).edits.eboot();
  const withStats = randomize(game, statsWith("own", { ...shufflesOn(base) })).edits.eboot();
  const statBytes = new Set(
    collectWeaponStats(game.eboot!, game.resolver).flatMap((w) =>
      (w.family === "Blademaster" ? [10, 11, 13, 15, 17] : [8, 9, 13, 18]).map(
        (at) => w.offset + at,
      ),
    ),
  );
  for (let i = 0; i < plain.length; i++) {
    if (!statBytes.has(i)) assert.equal(withStats[i], plain[i], `byte 0x${i.toString(16)}`);
  }
  close();
});

function shufflesOn(settings: Settings): Partial<Record<OptionKey, unknown>> {
  const out: Partial<Record<OptionKey, unknown>> = {};
  for (const o of OPTIONS) if (settings[o.key] !== o.default) out[o.key] = settings[o.key];
  return out;
}

test("stats go with the weapon: the weapons shuffle doesn't change them, in either order", async () => {
  const { game, close } = await load();
  const statsOnly = byKey(
    collectWeaponStats(randomize(game, statsWith("mix")).edits.eboot(), game.resolver),
  );
  const both = randomize(
    game,
    statsWith("mix", { "weapons.enabled": true, "weapons.mix": "any-type" }),
  );
  const after = byKey(collectWeaponStats(both.edits.eboot(), game.resolver));
  for (const [k, w] of statsOnly) {
    const now = after.get(k)!;
    assert.deepEqual(
      [now.attack, now.affinity, now.element?.value],
      [w.attack, w.affinity, w.element?.value],
      k,
    );
  }
  const titles = both.reports.map((r) => r.title);
  assert.ok(titles.includes("Weapon progression") && titles.includes("Weapon stats"));
  close();
});

test("weapon stats off: the EBOOT's weapon records are untouched", async () => {
  const { game, close } = await load();
  const result = randomize(game, settingsWith("off", ["weapons", "costs"]));
  const before = collectWeaponStats(game.eboot!, game.resolver);
  const after = byKey(collectWeaponStats(result.edits.eboot(), game.resolver));
  for (const w of before) {
    const now = after.get(key(w))!;
    assert.deepEqual(
      [now.attack, now.affinity, now.element?.value],
      [w.attack, w.affinity, w.element?.value],
    );
  }
  assert.ok(!result.reports.some((r) => r.title === "Weapon stats"));
  close();
});

test("spoiler groups sort by rarity as a number", async () => {
  const { game, close } = await load();
  const report = randomize(game, statsWith("order", { "weapons.attackSpread": 0.9 })).reports.find(
    (r) => r.title === "Weapon stats",
  )!;
  const rarities = report.lines
    .filter((l) => l.where.startsWith("Blademaster: Great Sword"))
    .map((l) => Number(/rarity (\d+)/.exec(l.where)![1]));
  assert.deepEqual(
    rarities,
    [...rarities].sort((a, b) => a - b),
  );
  close();
});
