import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import { needsEboot, OPTIONS, PRESETS, type Settings } from "../src/settings.js";
import { formatSpoiler } from "../src/spoiler.js";
import {
  armorValueAt,
  buildFixtureDisc,
  FIXTURE_ARMOR,
  FIXTURE_ARMOR_SKILLS,
  TREE,
  tempDir,
} from "./fixtures.js";
import { settingsWith } from "./settings-helper.js";

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  return { game, close: () => source.close() };
}

type Skill = [tree: number, points: number];

/** A piece's five skill entries, as written in `eboot`. */
function skillsOf(eboot: Buffer, key: string): Skill[] {
  const [slot, index] = key.split(":") as [Parameters<typeof armorValueAt>[0], string];
  const at = armorValueAt(slot, Number(index)) + 30;
  return Array.from({ length: 5 }, (_, k): Skill => [
    eboot[at + k * 2]!,
    eboot.readInt8(at + k * 2 + 1),
  ]);
}

/** Pieces that take part: made by a create entry and wearable. Head 9 and 10 aren't. */
const PIECES = Object.keys(FIXTURE_ARMOR_SKILLS).filter((k) => k !== "head:9" && k !== "head:10");

function armor(key: string) {
  const [slot, index] = key.split(":");
  return FIXTURE_ARMOR.find((a) => a.slot === slot && a.index === Number(index))!;
}

function hunter(key: string): "blade" | "gun" | "both" {
  const bits = armor(key).hunterType;
  if (bits & 4 && bits & 8) return "both";
  return bits & 4 ? "blade" : "gun";
}

/** Only skill bytes of pieces in `keys` may change. */
function assertOnlySkillsChange(before: Buffer, after: Buffer, keys: string[]) {
  const editable = new Set<number>();
  for (const key of keys) {
    const [slot, index] = key.split(":") as [Parameters<typeof armorValueAt>[0], string];
    const at = armorValueAt(slot, Number(index)) + 30;
    for (let i = 0; i < 10; i++) editable.add(at + i);
  }
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) assert.ok(editable.has(i), `byte ${i} changed`);
  }
}

/** What every mode keeps: empty entries, signs, no repeated trees, kept trees in place. */
function assertShape(before: Buffer, after: Buffer, kept: number[]) {
  for (const key of PIECES) {
    const was = skillsOf(before, key);
    const now = skillsOf(after, key);
    was.forEach(([tree, points], k) => {
      const [newTree, newPoints] = now[k]!;
      if (tree === 0) assert.deepEqual(now[k], [0, 0], `${key} entry ${k} stays empty`);
      else
        assert.equal(Math.sign(newPoints), Math.sign(points), `${key} entry ${k} keeps its sign`);
      if (kept.includes(tree)) assert.deepEqual(now[k], was[k], `${key} keeps tree ${tree}`);
      else assert.ok(!kept.includes(newTree), `${key} gets no kept tree (${newTree})`);
    });
    const trees = now.map(([t]) => t).filter((t) => t !== 0);
    assert.equal(new Set(trees).size, trees.length, `${key}: no tree twice (${trees})`);
  }
  for (const key of ["head:9", "head:10"]) {
    assert.deepEqual(skillsOf(after, key), skillsOf(before, key), `${key} is left alone`);
  }
}

const SEEDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const skillsWith = (seed: string, changes: Partial<Settings>) =>
  settingsWith(seed, ["armor-skills"], changes);

test("armor skills, shuffle: entries trade within rarity, hunter type and sign", async () => {
  const { game, close } = await load();
  const before = game.eboot!;
  const moved = new Set<string>();
  for (const seed of SEEDS) {
    const after = randomize(
      game,
      skillsWith(seed, { "armorSkills.mode": "shuffle" }),
    ).edits.eboot();
    assertOnlySkillsChange(before, after, PIECES);
    assertShape(before, after, [TREE.torsoUp, TREE.edgemaster]);

    // Each (rarity, hunter type, sign) group holds the same skills as before.
    const groups = (buf: Buffer) => {
      const out = new Map<string, string[]>();
      for (const key of PIECES) {
        for (const [tree, points] of skillsOf(buf, key)) {
          if (tree === 0 || tree === TREE.torsoUp || tree === TREE.edgemaster) continue;
          const group = `${armor(key).rarity}:${hunter(key)}:${Math.sign(points)}`;
          out.set(group, [...(out.get(group) ?? []), `${tree}/${points}`].sort());
        }
      }
      return out;
    };
    assert.deepEqual(groups(after), groups(before));

    for (const key of PIECES) {
      skillsOf(after, key).forEach(([tree, points], k) => {
        if (tree !== skillsOf(before, key)[k]![0]) moved.add(`${key}:${tree}/${points}`);
      });
    }
  }
  // Skills do move, Blademaster-only ones between Blademaster pieces.
  assert.ok(
    moved.has(`chest:3:${TREE.sharpness}/2`),
    "Sharpness reaches the other Blademaster chest",
  );
  assert.ok(moved.has(`chest:4:${TREE.recoil}/1`), "Recoil reaches the other Gunner chest");
  assert.ok(moved.has(`head:5:${TREE.health}/3`));
  close();
});

test("armor skills, shuffle: without keepArmorOnly, trees no decoration has move too", async () => {
  const { game, close } = await load();
  const before = game.eboot!;
  let edgemasterMoved = false;
  for (const seed of SEEDS) {
    const settings = skillsWith(seed, {
      "armorSkills.mode": "shuffle",
      "armorSkills.keepArmorOnly": false,
    });
    const after = randomize(game, settings).edits.eboot();
    assertShape(before, after, [TREE.torsoUp]);
    if (!skillsOf(after, "head:4").some(([t]) => t === TREE.edgemaster)) edgemasterMoved = true;
  }
  assert.ok(edgemasterMoved);
  close();
});

test("armor skills, randomize: new trees for the piece's hunter type, points sized for its rarity", async () => {
  const { game, close } = await load();
  const before = game.eboot!;
  const seen = new Set<number>();
  for (const seed of SEEDS) {
    const after = randomize(
      game,
      skillsWith(seed, { "armorSkills.mode": "randomize" }),
    ).edits.eboot();
    assertOnlySkillsChange(before, after, PIECES);
    assertShape(before, after, [TREE.torsoUp, TREE.edgemaster]);

    // Sizes each rarity and sign has on the disc (kept trees aside).
    const sizes = new Map<string, Set<number>>();
    for (const key of PIECES) {
      for (const [tree, points] of skillsOf(before, key)) {
        if (tree === 0 || tree === TREE.torsoUp || tree === TREE.edgemaster) continue;
        const group = `${armor(key).rarity}:${Math.sign(points)}`;
        sizes.set(group, new Set([...(sizes.get(group) ?? []), Math.abs(points)]));
      }
    }
    for (const key of PIECES) {
      for (const [tree, points] of skillsOf(after, key)) {
        if (tree === 0 || tree === TREE.torsoUp || tree === TREE.edgemaster) continue;
        seen.add(tree);
        const blade = [TREE.sharpness, TREE.guard] as number[];
        const gun = [TREE.reload, TREE.recoil] as number[];
        if (hunter(key) !== "blade")
          assert.ok(!blade.includes(tree), `${key}: no Blademaster tree`);
        if (hunter(key) !== "gun") assert.ok(!gun.includes(tree), `${key}: no Gunner tree`);
        const group = `${armor(key).rarity}:${Math.sign(points)}`;
        assert.ok(sizes.get(group)!.has(Math.abs(points)), `${key}: ${points} sized for ${group}`);
      }
    }
  }
  // Trees come from armor and decorations: Gathering is only on a decoration.
  assert.ok(seen.has(TREE.gathering));
  assert.ok(seen.has(TREE.sharpness) && seen.has(TREE.reload));
  close();
});

test("armor skills, randomize: without keepArmorOnly, Edgemaster can be drawn", async () => {
  const { game, close } = await load();
  let drawn = false;
  for (const seed of SEEDS) {
    const settings = skillsWith(seed, {
      "armorSkills.mode": "randomize",
      "armorSkills.keepArmorOnly": false,
    });
    const after = randomize(game, settings).edits.eboot();
    assertShape(game.eboot!, after, [TREE.torsoUp]);
    for (const key of PIECES) {
      skillsOf(after, key).forEach(([tree], k) => {
        if (tree === TREE.edgemaster && skillsOf(game.eboot!, key)[k]![0] !== tree) drawn = true;
      });
    }
  }
  assert.ok(drawn);
  close();
});

test("armor skills: deterministic, with a spoiler line per changed piece", async () => {
  const { game, close } = await load();
  for (const mode of ["shuffle", "randomize"] as const) {
    const s = skillsWith("spoiler", { "armorSkills.mode": mode });
    const a = randomize(game, s);
    const b = randomize(game, s);
    assert.ok(a.edits.eboot().equals(b.edits.eboot()));
    assert.equal(formatSpoiler(game, s, a), formatSpoiler(game, s, b));
    const report = a.reports.find((r) => r.title === "Armor skills")!;
    const changed = PIECES.filter(
      (k) =>
        JSON.stringify(skillsOf(a.edits.eboot(), k)) !== JSON.stringify(skillsOf(game.eboot!, k)),
    );
    assert.equal(report.lines.length, changed.length);
    assert.ok(report.lines.every((l) => / \(was .+\)$/.test(l.text)));
    assert.ok(
      report.notes.some((n) => n.includes("Edgemaster +7")),
      "armor-only reach: 2 + 3 + 2",
    );
  }
  close();
});

test("armor skills with the armor shuffle: skills stay with their piece", async () => {
  const { game, close } = await load();
  const alone = randomize(game, skillsWith("together", {})).edits.eboot();
  const both = randomize(game, settingsWith("together", ["armor", "armor-skills"])).edits.eboot();
  for (const key of PIECES) assert.deepEqual(skillsOf(both, key), skillsOf(alone, key));
  close();
});

test("armor skills settings: need the EBOOT, off by default, in the presets", () => {
  const enabled = OPTIONS.find((o) => o.key === "armorSkills.enabled")!;
  assert.equal(enabled.eboot, true);
  assert.equal(enabled.default, false);
  assert.ok(needsEboot(skillsWith("x", {})));
  const presets = Object.fromEntries(PRESETS.map((p) => [p.name, p.changes]));
  assert.equal(presets.Full!["armorSkills.enabled"], true);
  assert.equal(presets.Full!["armorSkills.mode"], undefined, "Full shuffles");
  assert.equal(presets.Chaos!["armorSkills.mode"], "randomize");
});
