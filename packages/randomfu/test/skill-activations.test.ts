import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { SKILL_ACTIVATION_ENTRY_SIZE, tableOffset } from "mhfu-extract/src/tables/offsets.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import type { Settings } from "../src/settings.js";
import { skillTrees } from "../src/shuffles/armor-skills.js";
import { formatSpoiler } from "../src/spoiler.js";
import { buildFixtureDisc, FIXTURE_SKILL_ACTIVATIONS, TREE, tempDir } from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso);
  return { game, close: () => source.close() };
}

const BASE = tableOffset("skillActivations");
const ROWS = 98;
const TREES = Array.from({ length: ROWS }, (_, i) => i + 2);
/** Trees the fixture's armor or decorations have. */
const ON_GEAR = Object.keys(FIXTURE_SKILL_ACTIVATIONS).map(Number);

const rowOf = (buf: Buffer, tree: number) => {
  const at = BASE + (tree - 2) * SKILL_ACTIVATION_ENTRY_SIZE + 1;
  return [...buf.subarray(at, at + 6)];
};
const good = (row: number[]) => row.slice(3);
const bad = (row: number[]) => row.slice(0, 3).reverse();
const filled = (half: number[]) => half.some((s) => s !== 0);
const key = (list: number[][]) => list.map((r) => r.join(",")).sort();

/** Only skill columns of the table may change. */
function assertOnlyColumnsChange(before: Buffer, after: Buffer) {
  const columns = new Set<number>();
  for (const tree of TREES) {
    const at = BASE + (tree - 2) * SKILL_ACTIVATION_ENTRY_SIZE;
    for (let k = 1; k <= 6; k++) columns.add(at + k);
  }
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) assert.ok(columns.has(i), `byte ${i} changed`);
  }
}

const SEEDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const activationsWith = (seed: string, changes: Partial<Settings>) =>
  settingsWith(seed, [], changes);

test("skill activations: the fixture has the table, and nothing changes by default", async () => {
  const { game, close } = await load();
  assert.deepEqual(rowOf(game.eboot, TREE.attack), [81, 80, 79, 76, 77, 78]);
  const result = randomize(game, activationsWith("a", {}));
  assert.ok(!result.reports.some((r) => r.title === "Skill activations"));
  assert.deepEqual(
    result.edits.eboot().subarray(BASE, BASE + ROWS * 7 + 1),
    game.eboot.subarray(BASE, BASE + ROWS * 7 + 1),
  );
  close();
});

test("skill activations, shuffle: whole rows trade between trees for the same pieces", async () => {
  const { game, close } = await load();
  const before = game.eboot;
  const { uses } = skillTrees(before, game.resolver);
  const groupOf = (tree: number) => `${uses.get(tree)}:${filled(bad(rowOf(before, tree)))}`;
  let moved = 0;
  for (const seed of SEEDS) {
    const after = randomize(
      game,
      activationsWith(seed, { "skillActivations.mode": "shuffle" }),
    ).edits.eboot();
    assertOnlyColumnsChange(before, after);
    // Each group holds the same rows; trees on no gear keep theirs.
    const groups = (buf: Buffer) => {
      const out = new Map<string, number[][]>();
      for (const tree of ON_GEAR) {
        out.set(groupOf(tree), [...(out.get(groupOf(tree)) ?? []), rowOf(buf, tree)]);
      }
      return new Map([...out].map(([g, rows]) => [g, key(rows)]));
    };
    assert.deepEqual(groups(after), groups(before));
    for (const tree of TREES.filter((t) => !ON_GEAR.includes(t))) {
      assert.deepEqual(rowOf(after, tree), rowOf(before, tree), `tree ${tree} keeps its row`);
    }
    for (const tree of ON_GEAR)
      if (rowOf(after, tree).join() !== rowOf(before, tree).join()) moved++;
  }
  assert.ok(moved > 0, "some rows move");
  // Reload and Recoil are on Gunner armor only: their skills stay on Gunner trees.
  assert.equal(uses.get(TREE.reload), "gun");
  close();
});

test("skill activations, split: good and bad halves trade apart", async () => {
  const { game, close } = await load();
  const before = game.eboot;
  const { uses } = skillTrees(before, game.resolver);
  let apart = false;
  for (const seed of SEEDS) {
    const after = randomize(
      game,
      activationsWith(seed, { "skillActivations.mode": "split" }),
    ).edits.eboot();
    assertOnlyColumnsChange(before, after);
    for (const half of [good, bad]) {
      const groups = (buf: Buffer) => {
        const out = new Map<string, number[][]>();
        for (const tree of ON_GEAR) {
          const h = half(rowOf(buf, tree));
          const use = uses.get(tree)!;
          out.set(use, [...(out.get(use) ?? []), h]);
        }
        return new Map([...out].map(([g, rows]) => [g, key(rows)]));
      };
      assert.deepEqual(groups(after), groups(before));
    }
    for (const tree of ON_GEAR) {
      const was = rowOf(before, tree);
      const now = rowOf(after, tree);
      assert.equal(
        filled(bad(now)),
        filled(bad(was)),
        `tree ${tree} keeps having bad skills or not`,
      );
      // A good half from one tree, a bad half from another.
      const source = (h: (r: number[]) => number[]) =>
        ON_GEAR.find((t) => h(rowOf(before, t)).join() === h(now).join() && filled(h(now)));
      const g = source(good);
      const b = source(bad);
      if (g !== undefined && b !== undefined && g !== b) apart = true;
    }
  }
  assert.ok(apart, "some tree gets its good and bad skills from different trees");
  close();
});

/** A half's skills, each with its first column (0 for ±10, 2 for ±20). */
function tiers(half: number[]) {
  const out: { skill: number; from: number }[] = [];
  half.forEach((skill, k) => {
    if (skill !== 0 && skill !== out.at(-1)?.skill) out.push({ skill, from: k });
  });
  return out;
}

test("skill activations, thresholds: each skill moves one column at most, in order", async () => {
  const { game, close } = await load();
  const before = game.eboot;
  let shifted = 0;
  for (const seed of SEEDS) {
    const result = randomize(game, activationsWith(seed, { "skillActivations.thresholds": true }));
    const after = result.edits.eboot();
    assertOnlyColumnsChange(before, after);
    for (const tree of TREES) {
      const was = rowOf(before, tree);
      const now = rowOf(after, tree);
      if (!ON_GEAR.includes(tree) || tree === TREE.edgemaster) {
        assert.deepEqual(now, was, `tree ${tree} keeps its columns`);
        continue;
      }
      for (const half of [good, bad]) {
        const w = tiers(half(was));
        const n = tiers(half(now));
        assert.deepEqual(
          n.map((t) => t.skill),
          w.map((t) => t.skill),
          `tree ${tree} keeps its skills, weakest first`,
        );
        n.forEach((t, k) => {
          assert.ok(Math.abs(t.from - w[k]!.from) <= 1, `tree ${tree}: one column at most`);
          if (k > 0) assert.ok(t.from > n[k - 1]!.from);
        });
        if (w.length === 3) assert.deepEqual(half(now), half(was), "three skills stay put");
        if (n.some((t, k) => t.from !== w[k]!.from)) shifted++;
      }
    }
    const spoiler = formatSpoiler(
      game,
      activationsWith(seed, { "skillActivations.thresholds": true }),
      result,
    );
    assert.match(spoiler, /== Skill activations ==/);
  }
  assert.ok(shifted > 0, "some skills need other point totals");
  close();
});

test("skill activations: the spoiler names the new skills and what was there", async () => {
  const { game, close } = await load();
  const settings = activationsWith("a", { "skillActivations.mode": "shuffle" });
  const result = randomize(game, settings);
  const report = result.reports.find((r) => r.title === "Skill activations")!;
  const after = result.edits.eboot();
  const changed = ON_GEAR.filter((t) => rowOf(after, t).join() !== rowOf(game.eboot, t).join());
  assert.equal(report.lines.length, changed.length);
  assert.ok(report.lines.every((l) => l.where === "Skill trees" && / \(was .+\)$/.test(l.text)));
  const spoiler = formatSpoiler(game, settings, result);
  assert.match(
    spoiler,
    /Attack: .*\(was Attack Up \(Small\) \(\+10\), Attack Up \(Medium\) \(\+15\), Attack Up \(Large\) \(\+20\), Attack Down \(Small\) \(-10\)/,
  );
  close();
});
