/**
 * Weapon progression: which weapon you get at each place in the smithy.
 *
 * A weapon's place is its create entry (`EquipmentCreate`, by `equipId`)
 * and its upgrade entry (`EquipmentUpgrade`, indexed by weapon: the
 * materials to make it by upgrading, and up to five weapons it upgrades
 * into). This shuffle gives each place a different weapon of the same
 * rarity (and, by default, the same weapon type):
 *
 * - create entries keep their materials and get the new weapon's ID;
 * - upgrade entry `σ(w)` gets `w`'s materials and `w`'s targets, mapped
 *   through `σ`, so every tree keeps its shape and its costs.
 *
 * A weapon keeps its own stats, notes, shells and ammo. Prices stay with
 * the weapon.
 *
 * Weapons made from Ancient/Rusted shards, weapons with no known type and
 * weapons in no create entry or upgrade tree stay where they are.
 *
 * The game already upgrades across types within a family (Great Sword to
 * Long Sword, Lance to Gunlance, ...), so `any-type` should work for
 * Blademaster weapons. Bow-to-bowgun has no precedent in the game.
 */
import { BinaryReader } from "../../../mhfu-extract/src/binary/reader.js";
import type { NameTable } from "../../../mhfu-extract/src/strings/names.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
} from "../../../mhfu-extract/src/tables/offsets.js";
import {
  equipmentCreateLayout,
  equipmentUpgradeLayout,
  type EquipmentCreateTables,
} from "../../../mhfu-extract/src/tables/recipes.js";
import type { TableAddressResolver } from "../../../mhfu-extract/src/tables/resolver.js";
import {
  readBlademasterWeapons,
  readGunnerWeapons,
  readModelToWeaponType,
  type WeaponTypeName,
} from "../../../mhfu-extract/src/tables/weapons.js";
import type { Edits } from "../edits.js";
import { tableName } from "../names.js";
import type { Rng } from "../rng.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

export const WEAPON_MIXES = ["same-type", "any-type"] as const;
export type WeaponMix = (typeof WEAPON_MIXES)[number];

const TARGETS_AT = 16;
const TARGET_COUNT = 5;

interface Family {
  name: "Blademaster" | "Gunner";
  names: NameTable;
  upgrade: "blademaster" | "gunner";
  create: (keyof EquipmentCreateTables)[];
  /** Create sections for weapons polished from Ancient/Rusted shards: left alone. */
  rust: keyof EquipmentCreateTables;
}

const FAMILIES: Family[] = [
  {
    name: "Blademaster",
    names: "WepBMID",
    upgrade: "blademaster",
    create: [
      "greatSwordLongSword",
      "lanceGunlance",
      "swordAndShieldDualBlades",
      "hammerHuntingHorn",
    ],
    rust: "ancientRustBlademaster",
  },
  {
    name: "Gunner",
    names: "WepGunID",
    upgrade: "gunner",
    create: ["lightBowgun", "heavyBowgun", "bow"],
    rust: "ancientRustGunner",
  },
];

const TYPE_NAMES: Record<WeaponTypeName, string> = {
  "great-sword": "Great Sword",
  "long-sword": "Long Sword",
  "sword-and-shield": "Sword and Shield",
  "dual-blades": "Dual Blades",
  hammer: "Hammer",
  "hunting-horn": "Hunting Horn",
  lance: "Lance",
  gunlance: "Gunlance",
  "light-bowgun": "Light Bowgun",
  "heavy-bowgun": "Heavy Bowgun",
  bow: "Bow",
};

export function shuffleWeapons(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  mix: WeaponMix,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const reader = new BinaryReader(eboot);
  const create = equipmentCreateLayout(reader, resolver);
  const upgrade = equipmentUpgradeLayout(reader, resolver);
  const modelType = readModelToWeaponType(reader, resolver);
  const stats = {
    Blademaster: readBlademasterWeapons(reader, resolver),
    Gunner: readGunnerWeapons(reader, resolver),
  };
  const out = edits.eboot();
  const lines: { where: string; text: string }[] = [];
  let moved = 0;

  for (const family of FAMILIES) {
    const weapons = stats[family.name];
    const name = (i: number) => tableName(family.names, i) ?? `${family.name} ${i}`;
    const typeOf = (i: number) => modelType[weapons[i]?.modelId ?? -1] ?? null;
    const createEntries = (sections: (keyof EquipmentCreateTables)[]) =>
      sections.flatMap((section) =>
        Array.from(
          { length: create[section].count },
          (_, i) => create[section].offset + i * EQUIP_CREATE_ENTRY_SIZE,
        ),
      );
    const createAt = createEntries(family.create);
    const rustAt = createEntries([family.rust]);
    const { offset: upgradeAt, count } = upgrade[family.upgrade];
    const entryAt = (i: number) => upgradeAt + i * EQUIP_UPGRADE_ENTRY_SIZE;
    const targetsOf = (i: number) =>
      Array.from({ length: TARGET_COUNT }, (_, k) => reader.u16(entryAt(i) + TARGETS_AT + k * 2));

    // Weapons in the smithy: created, upgraded from, or upgraded into.
    const inTree = new Set<number>();
    for (const at of createAt) inTree.add(reader.u16(at + 2));
    for (let i = 1; i < count; i++) {
      const targets = targetsOf(i).filter((t) => t !== 0 && t < count);
      if (targets.length > 0) inTree.add(i);
      for (const t of targets) inTree.add(t);
    }
    const fixed = new Set(rustAt.map((at) => reader.u16(at + 2)));
    const shuffled = [...inTree]
      .filter((i) => i > 0 && i < count && !fixed.has(i) && typeOf(i) !== null)
      .sort((a, b) => a - b);

    const group = (i: number) =>
      mix === "same-type" ? `${typeOf(i)}:${weapons[i]!.rarity}` : `${weapons[i]!.rarity}`;
    const next = permuteWithinGroups(shuffled, group, (i) => i, rng);
    const sigma = new Map(shuffled.map((w, k) => [w, next[k]!]));
    const map = (i: number) => sigma.get(i) ?? i;

    for (const at of [...createAt, ...rustAt]) {
      out.writeUInt16LE(map(reader.u16(at + 2)), at + 2);
    }
    for (let i = 1; i < count; i++) {
      // Entry σ(i) takes i's materials and i's targets, mapped.
      const entry = Buffer.from(reader.bytes(entryAt(i), EQUIP_UPGRADE_ENTRY_SIZE));
      targetsOf(i).forEach((t, k) => {
        if (t !== 0 && t < count) entry.writeUInt16LE(map(t), TARGETS_AT + k * 2);
      });
      entry.copy(out, entryAt(map(i)));
    }

    for (const w of shuffled) {
      const now = map(w);
      if (now === w) continue;
      moved++;
      const type = typeOf(w)!;
      const nowType = typeOf(now)!;
      lines.push({
        where: `${family.name}: ${TYPE_NAMES[type]}, rarity ${weapons[w]!.rarity + 1}`,
        text: `${name(w)} -> ${name(now)}${nowType === type ? "" : ` (${TYPE_NAMES[nowType]})`}`,
      });
    }
  }

  lines.sort((a, b) => a.where.localeCompare(b.where));
  return {
    title: "Weapon progression",
    notes: [
      "Each line is a place in the smithy: you now get the second weapon where you used to get the first.",
      `The new weapon has the same rarity${mix === "same-type" ? " and type" : " (any weapon type in the same family)"}.`,
      "Places keep their materials and upgrade links, so the trees keep their shape. Weapons keep their own stats and price (the zenny cost).",
      `${moved} weapons changed places. Weapons from Ancient/Rusted shards stay put.`,
    ],
    lines,
  };
}
