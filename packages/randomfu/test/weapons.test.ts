import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
} from "mhfu-extract/src/tables/offsets.js";
import { equipmentCreateLayout, equipmentUpgradeLayout } from "mhfu-extract/src/tables/recipes.js";
import { MHP2G_PROFILE } from "mhfu-extract/src/games/mhp2g.js";
import {
  ARMOR_SLOT_TABLE_NAMES,
  ARMOR_SLOTS,
  armorValuesOffsets,
} from "mhfu-extract/src/tables/armor.js";
import {
  PinnedResolver,
  TableResolutionError,
  type TableAddressResolver,
} from "mhfu-extract/src/tables/resolver.js";
import { loadGame, type GameData } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import type { Settings } from "../src/settings.js";
import { settingsWith } from "./settings-helper.js";
import {
  buildFixtureDisc,
  FIXTURE_RUST_CREATE,
  FIXTURE_UPGRADES,
  FIXTURE_WEAPON_CREATE,
  FIXTURE_WEAPONS,
  tempDir,
} from "./fixtures.js";

function settings(seed: string, mix: "same-type" | "any-type" = "same-type"): Settings {
  return settingsWith(seed, ["weapons"], { "weapons.mix": mix });
}

async function load(): Promise<{ game: GameData; close: () => void }> {
  const file = path.join(tempDir(), "disc.iso");
  writeFileSync(file, buildFixtureDisc());
  const { source, iso } = openDiscImage(file);
  const game = await loadGame(source, iso, { eboot: {} });
  return { game, close: () => source.close() };
}

interface Tables {
  /** Weapon made by each Great Sword/Long Sword create entry, and by the rust entry. */
  create: number[];
  rust: number;
  /** Upgrade entry per weapon: [materials as "item x qty", targets]. */
  upgrade: (i: number) => { craft: string; targets: number[] };
}

function tables(eboot: Buffer): Tables {
  const reader = new BinaryReader(eboot);
  const create = equipmentCreateLayout(reader);
  const upgrade = equipmentUpgradeLayout(reader).blademaster.offset;
  return {
    create: FIXTURE_WEAPON_CREATE.map((_, i) =>
      reader.u16(create.greatSwordLongSword.offset + i * EQUIP_CREATE_ENTRY_SIZE + 2),
    ),
    rust: reader.u16(create.ancientRustBlademaster.offset + 2),
    upgrade: (i) => {
      const at = upgrade + i * EQUIP_UPGRADE_ENTRY_SIZE;
      const craft = [0, 1, 2, 3]
        .map((k) => [reader.u16(at + k * 4), reader.u16(at + k * 4 + 2)])
        .filter(([item]) => item !== 0)
        .map(([item, q]) => `${item} x${q}`)
        .join(", ");
      const targets = [0, 1, 2, 3, 4]
        .map((k) => reader.u16(at + 16 + k * 2))
        .filter((t) => t !== 0);
      return { craft, targets };
    },
  };
}

const weapon = (i: number) => FIXTURE_WEAPONS.find((w) => w.index === i)!;

/** Reads σ off the new tables and checks every place kept its materials and links. */
function checkIsomorphic(before: Tables, after: Tables): Map<number, number> {
  const sigma = new Map<number, number>();
  FIXTURE_WEAPON_CREATE.forEach(([w], i) => sigma.set(w, after.create[i]!));
  // Weapons only reached by upgrading: read their new IDs off their parent's new targets.
  for (const u of FIXTURE_UPGRADES) {
    const newTargets = after.upgrade(sigma.get(u.index) ?? u.index).targets;
    u.targets.forEach((t, k) => sigma.set(t, newTargets[k]!));
  }
  assert.deepEqual(
    [...sigma.values()].sort((a, b) => a - b),
    [...sigma.keys()].sort((a, b) => a - b),
    "a permutation",
  );
  for (const u of FIXTURE_UPGRADES) {
    const moved = after.upgrade(sigma.get(u.index)!);
    assert.equal(
      moved.craft,
      before.upgrade(u.index).craft,
      `weapon ${u.index}'s place keeps its materials`,
    );
    assert.deepEqual(
      moved.targets,
      u.targets.map((t) => sigma.get(t)!),
      `weapon ${u.index}'s links`,
    );
  }
  assert.equal(after.rust, FIXTURE_RUST_CREATE[0]![0], "rust weapons stay");
  return sigma;
}

test("same-type: places get weapons of the same type and rarity, trees keep their shape", async () => {
  const { game, close } = await load();
  const before = tables(game.eboot!);
  let movedAny = false;
  for (const seed of ["a", "b", "c", "d"]) {
    const result = randomize(game, settings(seed));
    const sigma = checkIsomorphic(before, tables(result.edits.eboot()));
    for (const [from, to] of sigma) {
      assert.equal(weapon(to).type, weapon(from).type, `${from} -> ${to}`);
      assert.equal(weapon(to).rarity, weapon(from).rarity, `${from} -> ${to}`);
      if (from !== to) movedAny = true;
    }
    assert.ok(!sigma.has(2) && !sigma.has(7), "weapons outside the trees stay out");
    assert.equal(tables(result.edits.eboot()).upgrade(2).targets.length, 0);
  }
  assert.ok(movedAny);
  close();
});

test("any-type: places keep their rarity but can change type", async () => {
  const { game, close } = await load();
  const before = tables(game.eboot!);
  let crossed = false;
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const result = randomize(game, settings(seed, "any-type"));
    const sigma = checkIsomorphic(before, tables(result.edits.eboot()));
    for (const [from, to] of sigma) {
      assert.equal(weapon(to).rarity, weapon(from).rarity, `${from} -> ${to}`);
      if (weapon(to).type !== weapon(from).type) crossed = true;
    }
  }
  assert.ok(crossed, "some seed moves a Long Sword into a Great Sword place or back");
  close();
});

test("weapons and recipes together: recipes shuffle the tables weapons left", async () => {
  const { game, close } = await load();
  const both = randomize(game, settingsWith("z", ["weapons", "recipes"]));
  const weaponsOnly = randomize(game, settings("z"));
  // Same weapon permutation (each shuffle has its own random stream).
  assert.deepEqual(tables(both.edits.eboot()).create, tables(weaponsOnly.edits.eboot()).create);
  const report = both.reports.find((r) => r.title === "Weapon progression")!;
  assert.ok(report.lines.every((l) => l.text.includes(" -> ")));
  assert.deepEqual(both.problems, []);
  close();
});

/**
 * Finds tables as the EU disc's signature resolver does: by the table's own
 * bytes, so it fails once those bytes are edited. Built on the fixture's
 * static (JP) offsets, checking the 2 KB there against the
 * unedited EBOOT's.
 */
function signatureLike(original: Buffer): TableAddressResolver {
  const jp = MHP2G_PROFILE.resolverForRegion("jp")!;
  // JP finds armor values through a pointer table rather than an address.
  const armor = armorValuesOffsets(new BinaryReader(original));
  const armorTables = new Map(
    ARMOR_SLOTS.map((slot) => [ARMOR_SLOT_TABLE_NAMES[slot], armor[slot]]),
  );
  return {
    resolve(table: string, buf?: Buffer): number {
      const at = armorTables.get(table) ?? jp.resolve(table);
      if (!buf || !buf.subarray(at, at + 0x800).equals(original.subarray(at, at + 0x800))) {
        throw new TableResolutionError(`signature for table "${table}" not found in buffer`);
      }
      return at;
    },
  };
}

test("tables found by signature stay found once weapons and armor edit them", async () => {
  const { game, close } = await load();
  const original = Buffer.from(game.eboot!);
  const all = settingsWith("z", ["weapons", "armor", "recipes", "costs"]);

  // The bug this guards against: searching the edited EBOOT loses the tables.
  game.resolver = signatureLike(original);
  assert.throws(() => randomize(game, all), /not found in buffer/);

  // As loadGame sets it up for a signature region: found once, in the unedited EBOOT.
  game.resolver = new PinnedResolver(signatureLike(original), original);
  const pinned = randomize(game, all);
  game.resolver = undefined;
  const staticOffsets = randomize(game, all);
  assert.ok(pinned.edits.eboot().equals(staticOffsets.edits.eboot()));
  close();
});
