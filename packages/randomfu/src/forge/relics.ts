/**
 * Relic weapons: the stitcher's weapons that keep a look.
 *
 * A relic is any weapon in the upgrade line of one starter per class (the
 * cheap weapons below, and everything they upgrade into). Its look is rolled
 * from a seed kept in its own equipment box slot, so it stays put; crafting
 * another one rolls another look.
 *
 * Where the seed lives (EU EBOOT and `lobby_task.ovl`, read offline): a box
 * slot is 12 bytes, and bytes 4-5 are 0 on every weapon (armor keeps its
 * upgrade level there). The game copies all 12 bytes when it equips a
 * weapon (EBOOT 0x08850910, box slot to the hunter's equipped set), and the
 * hunter's block keeps the equipped weapon's box index at +0x4020 (u16,
 * 0xFFFF for none). The smithy (`lobby_task` 0x09AA5D20) crafts through the
 * box's add (EBOOT 0x08850724) with bytes 4-5 at 0, and an upgrade rewrites
 * the weapon's own slot, zeroing bytes 4-5 (a special weapon's upgrade keeps
 * them). So the blob takes bytes 4-5 at 0 to mean "not rolled yet": it draws
 * a seed from the clock and writes it back to the slot and its equipped
 * copies, and every later build rolls the same look from it.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
} from "mhfu-extract/src/tables/offsets.js";
import {
  equipmentCreateLayout,
  equipmentUpgradeLayout,
  type EquipmentCreateTables,
} from "mhfu-extract/src/tables/recipes.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import { readBlademasterWeapons, readGunnerWeapons } from "mhfu-extract/src/tables/weapons.js";

/**
 * One starter per class (EU weapon IDs, as the vanilla smithy makes them):
 * Bone Blade, Bone, Hunter's Dagger, Bone Scythe, War Hammer, Ivory Horn,
 * Iron Lance, Bone Gunlance; Shooter's Barrel, Bone Shooter, Hunter's Bow I.
 */
export const RELIC_STARTERS = {
  blademaster: [28, 48, 158, 246, 57, 581, 103, 522],
  gunner: [1, 70, 116],
} as const;

const FAMILIES = [
  {
    name: "blademaster",
    create: [
      "greatSwordLongSword",
      "lanceGunlance",
      "swordAndShieldDualBlades",
      "hammerHuntingHorn",
    ],
  },
  { name: "gunner", create: ["lightBowgun", "heavyBowgun", "bow"] },
] as const satisfies readonly {
  name: keyof typeof RELIC_STARTERS;
  create: readonly (keyof EquipmentCreateTables)[];
}[];

const TARGETS_AT = 16;
const TARGET_COUNT = 5;

export interface Relic {
  /** A bow or bowgun (box type 6), else a melee weapon (box type 5). */
  ranged: boolean;
  /** Its weapon ID. */
  id: number;
  /** Its model (`weapon/weNNN.pac`). */
  model: number;
}

/**
 * The relics in `eboot` as edited: each starter's create place (wherever the
 * weapon shuffle put it, found by comparing `vanilla`'s create entries) and
 * everything its upgrade entries lead to.
 */
export function findRelics(
  vanilla: Buffer,
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): Relic[] {
  const before = new BinaryReader(vanilla);
  const after = new BinaryReader(eboot);
  const create = equipmentCreateLayout(after, resolver);
  const upgrade = equipmentUpgradeLayout(after, resolver);
  const models = {
    blademaster: readBlademasterWeapons(after, resolver).map((w) => w.modelId),
    gunner: readGunnerWeapons(after, resolver).map((w) => w.modelId),
  };
  const relics: Relic[] = [];
  for (const family of FAMILIES) {
    const starters = new Set<number>(RELIC_STARTERS[family.name]);
    const roots = new Set<number>();
    for (const section of family.create) {
      const { offset, count } = create[section];
      for (let k = 0; k < count; k++) {
        const at = offset + k * EQUIP_CREATE_ENTRY_SIZE + 2;
        if (starters.has(before.u16(at))) roots.add(after.u16(at));
      }
    }
    const { offset, count } = upgrade[family.name];
    const line = new Set<number>();
    const todo = [...roots];
    while (todo.length > 0) {
      const w = todo.pop()!;
      if (w <= 0 || w >= count || line.has(w)) continue;
      line.add(w);
      for (let k = 0; k < TARGET_COUNT; k++) {
        todo.push(after.u16(offset + w * EQUIP_UPGRADE_ENTRY_SIZE + TARGETS_AT + k * 2));
      }
    }
    for (const id of [...line].sort((a, b) => a - b)) {
      const model = models[family.name][id];
      if (model !== undefined) relics.push({ ranged: family.name === "gunner", id, model });
    }
  }
  return relics;
}

/**
 * The blob's relic table: a u32 count, then a u32 a relic, sorted: bit 31
 * ranged, bits 16-30 the weapon ID, bits 0-15 the model.
 */
export function relicTable(relics: readonly Relic[]): Buffer {
  const words = relics
    .map((r) => ((r.ranged ? 0x80000000 : 0) | (r.id << 16) | r.model) >>> 0)
    .sort((a, b) => a - b);
  const out = Buffer.alloc(4 + words.length * 4);
  out.writeUInt32LE(words.length, 0);
  words.forEach((w, k) => out.writeUInt32LE(w, 4 + k * 4));
  return out;
}

/** The stitcher's random state for a relic's look: from its slot's seed and its model. */
export function relicState(seed: number, model: number): number {
  return (Math.imul(seed, 0x9e3779b1) ^ Math.imul(model + 1, 0x85ebca77)) >>> 0 || 0x2545f491;
}
