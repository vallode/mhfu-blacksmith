import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { ARMOR_STATS } from "../src/shuffles/armor-stats.js";
import {
  OPTIONS,
  PRESETS,
  applySettings,
  defaultSettings,
  type OptionKey,
} from "../src/settings.js";
import { armorValueAt, buildFixtureDisc, FIXTURE_ARMOR, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  return { game, close: () => source.close() };
}

/** Pieces that take part: made by a create entry and wearable. Head 9-11 aren't. */
const PIECES = FIXTURE_ARMOR.filter((a) => !(a.slot === "head" && a.index >= 9));
const LEFT_ALONE = FIXTURE_ARMOR.filter((a) => a.slot === "head" && a.index >= 9);
type Piece = (typeof FIXTURE_ARMOR)[number];

interface Stats {
  defense: number;
  caps: number[];
  resistances: number[];
  slots: number;
  rarity: number;
}

function statsOf(buf: Buffer, a: Piece): Stats {
  const at = armorValueAt(a.slot, a.index);
  return {
    defense: buf[at + 12]!,
    caps: [...buf.subarray(at + 20, at + 27)],
    resistances: Array.from({ length: 5 }, (_, k) => buf.readInt8(at + 13 + k)),
    slots: buf[at + 18]!,
    rarity: buf[at + 5]!,
  };
}

const hunter = (a: Piece) =>
  a.hunterType & 4 && a.hunterType & 8 ? "both" : a.hunterType & 4 ? "blade" : "gun";

/** Stat bytes of the pieces that take part (rarity, defense to slots, sphere caps). */
const STAT_BYTES = new Set(
  PIECES.flatMap((a) => {
    const at = armorValueAt(a.slot, a.index);
    return [at + 5, ...Array.from({ length: 7 }, (_, k) => at + 12 + k)].concat(
      Array.from({ length: 7 }, (_, k) => at + 20 + k),
    );
  }),
);

function assertOnlyStatsChange(before: Buffer, after: Buffer) {
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) assert.ok(STAT_BYTES.has(i), `byte ${i} changed`);
  }
  for (const a of LEFT_ALONE) {
    assert.deepEqual(statsOf(after, a), statsOf(before, a), `${a.slot} ${a.index} is left alone`);
  }
}

/** Each group's values, sorted, so a shuffle leaves them the same. */
function groups(buf: Buffer, key: (a: Piece) => string, value: (s: Stats) => unknown) {
  const out = new Map<string, string[]>();
  for (const a of PIECES) {
    const k = key(a);
    out.set(k, [...(out.get(k) ?? []), JSON.stringify(value(statsOf(buf, a)))].sort());
  }
  return out;
}

const SEEDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const statsWith = (seed: string, changes: Partial<Record<OptionKey, string | number>>) =>
  settingsWith(seed, [], changes);
const ALL = (mode: string) => ({
  "armorStats.defense": mode,
  "armorStats.resistances": mode,
  "armorStats.slots": mode,
  "armorStats.rarity": mode,
});

test("armor stats, off: nothing changes and there's no report", async () => {
  const { game, close } = await load();
  const result = randomize(game, statsWith("a", {}));
  assert.ok(!result.reports.some((r) => r.title === "Armor stats"));
  for (const a of PIECES) {
    assert.deepEqual(statsOf(result.edits.eboot(), a), statsOf(game.eboot, a));
  }
  close();
});

test("armor stats, shuffle: values trade within rarity (rank for rarity) and hunter type", async () => {
  const { game, close } = await load();
  const before = game.eboot;
  const sameRarity = (a: Piece) => `${a.rarity}:${hunter(a)}`;
  const moved = new Set<string>();
  for (const seed of SEEDS) {
    const result = randomize(game, statsWith(seed, ALL("shuffle")));
    const after = result.edits.eboot();
    assertOnlyStatsChange(before, after);
    // Defense with its caps, and the five resistances, trade as one.
    const defense = (s: Stats) => [s.defense, s.caps];
    assert.deepEqual(groups(after, sameRarity, defense), groups(before, sameRarity, defense));
    const res = (s: Stats) => s.resistances;
    assert.deepEqual(groups(after, sameRarity, res), groups(before, sameRarity, res));
    const slots = (s: Stats) => s.slots;
    assert.deepEqual(groups(after, sameRarity, slots), groups(before, sameRarity, slots));
    // Rarities 1-3 are all Low Rank: they trade within hunter type.
    const rarity = (s: Stats) => s.rarity;
    assert.deepEqual(groups(after, hunter, rarity), groups(before, hunter, rarity));
    for (const a of PIECES) {
      const [s, b] = [statsOf(after, a), statsOf(before, a)];
      if (s.defense !== b.defense) moved.add(`${a.slot}:${a.index}:defense`);
      if (s.rarity !== b.rarity) moved.add(`${a.slot}:${a.index}:rarity`);
    }
    assert.ok(result.reports.some((r) => r.title === "Armor stats"));
  }
  assert.ok(moved.has("head:1:defense"), "head 1 trades defense");
  assert.ok(moved.has("chest:1:defense"), "Blademaster chests trade defense with each other");
  assert.ok(moved.has("leg:1:rarity"), "leg 1 trades rarity with other Low Rank pieces");
  close();
});

test("armor stats, randomize: within spread and bounds, caps stay", async () => {
  const { game, close } = await load();
  const before = game.eboot;
  // What pieces of the same hunter type have from one rarity below to one above.
  const windowOf = (a: Piece): [number, number] | null => {
    const near = PIECES.filter(
      (o) => hunter(o) === hunter(a) && Math.abs(o.rarity - a.rarity) <= 1,
    );
    const values = near.map((o) => statsOf(before, o).defense);
    return near.length > 1 ? [Math.min(...values), Math.max(...values)] : null;
  };
  const slotsAt = (rarity: number) =>
    new Set(PIECES.filter((a) => a.rarity === rarity).map((a) => statsOf(before, a).slots));
  const changed = new Set<string>();
  for (const seed of SEEDS) {
    const settings = statsWith(seed, {
      ...ALL("randomize"),
      "armorStats.defenseSpread": 0.5,
      "armorStats.resistanceSpread": 3,
      "armorStats.raritySpread": 2,
    });
    const after = randomize(game, settings).edits.eboot();
    assertOnlyStatsChange(before, after);
    for (const a of PIECES) {
      const [s, b] = [statsOf(after, a), statsOf(before, a)];
      assert.deepEqual(s.caps, b.caps, "sphere caps stay");
      const window = windowOf(a);
      assert.ok(
        s.defense >= Math.max(1, window?.[0] ?? 1) && s.defense <= (window?.[1] ?? 255),
        `${a.slot} ${a.index} defense within its rarity window`,
      );
      assert.ok(
        s.defense >= Math.round(b.defense * 0.5) && s.defense <= Math.round(b.defense * 1.5),
      );
      s.resistances.forEach((r, k) => {
        assert.ok(Math.abs(r - b.resistances[k]!) <= 3, `${a.slot} ${a.index} resistance ${k}`);
      });
      assert.ok(slotsAt(a.rarity).has(s.slots), `${a.slot} ${a.index} slots from its rarity`);
      assert.ok(s.rarity >= 0 && s.rarity <= 2, "rarity stays Low Rank");
      for (const key of ["defense", "slots", "rarity"] as const) {
        if (s[key] !== b[key]) changed.add(key);
      }
      if (s.resistances.some((r, k) => r !== b.resistances[k])) changed.add("resistances");
    }
  }
  assert.deepEqual([...changed].sort(), ["defense", "rarity", "resistances", "slots"]);

  // Same seed, same bytes; spreads only matter when randomizing.
  const settings = statsWith("a", ALL("randomize"));
  assert.ok(
    randomize(game, settings).edits.eboot().equals(randomize(game, settings).edits.eboot()),
  );
  close();
});

test("armor stats: each stat is kept, shuffled or randomized on its own", async () => {
  const { game, close } = await load();
  const before = game.eboot;
  for (const seed of SEEDS) {
    const after = randomize(
      game,
      statsWith(seed, { "armorStats.slots": "randomize" }),
    ).edits.eboot();
    for (const a of PIECES) {
      const [s, b] = [statsOf(after, a), statsOf(before, a)];
      assert.deepEqual({ ...s, slots: 0 }, { ...b, slots: 0 }, "only slots change");
    }
  }
  close();
});

test("armor stats: defense is a whole byte, up to 255", async () => {
  const { game, close } = await load();
  const at = (slot: Piece["slot"], index: number) => armorValueAt(slot, index);
  const byNumber = (a: number, b: number) => a - b;
  const chest4Defense = game.eboot[at("chest", 4) + 12]!;
  // Gunner chests 2 and 4 trade defense; 200 only survives read as unsigned.
  game.eboot[at("chest", 2) + 12] = 200;
  for (const seed of SEEDS) {
    const after = randomize(
      game,
      statsWith(seed, { "armorStats.defense": "shuffle" }),
    ).edits.eboot();
    const traded = [after[at("chest", 2) + 12]!, after[at("chest", 4) + 12]!];
    assert.deepEqual(traded.sort(byNumber), [chest4Defense, 200].sort(byNumber));
  }

  // Alone in its window (no other Gunner piece near rarity 6), 250 is held
  // only by its spread, and by the byte.
  game.eboot[at("chest", 4) + 5] = 5;
  game.eboot[at("chest", 4) + 12] = 250;
  const seen = new Set<number>();
  for (const seed of SEEDS) {
    const settings = statsWith(seed, {
      "armorStats.defense": "randomize",
      "armorStats.defenseSpread": 0.95,
    });
    const defense = randomize(game, settings).edits.eboot()[at("chest", 4) + 12]!;
    assert.ok(defense >= Math.round(250 * 0.05) && defense <= 255);
    seen.add(defense);
  }
  assert.ok(seen.has(255), "a factor over 1.02 stops at 255");
  close();
});

test("armor stats settings: off by default, shuffled or rolled anew in the presets", () => {
  const preset = (name: string) =>
    applySettings(defaultSettings("S"), PRESETS.find((p) => p.name === name)!.changes);
  const modes = ARMOR_STATS.map((stat) => `armorStats.${stat}` as const);
  for (const key of modes) {
    assert.equal(OPTIONS.find((o) => o.key === key)!.default, "off", key);
    assert.equal(preset("Rewards only")[key], "off", `Rewards only: ${key}`);
    assert.equal(preset("Shuffled")[key], "shuffle", `Shuffled: ${key}`);
    for (const name of ["Randomized", "Full", "Chaos"]) {
      assert.equal(preset(name)[key], "randomize", `${name}: ${key}`);
    }
  }
  // Chaos varies them more widely than the defaults, which the others keep.
  const spreads = [
    "armorStats.defenseSpread",
    "armorStats.resistanceSpread",
    "armorStats.raritySpread",
  ] as const;
  for (const key of spreads) {
    const fallback = OPTIONS.find((o) => o.key === key)!.default;
    for (const name of ["Randomized", "Full"]) assert.equal(preset(name)[key], fallback);
    assert.ok((preset("Chaos")[key] as number) > (fallback as number), `Chaos: ${key}`);
  }
});
