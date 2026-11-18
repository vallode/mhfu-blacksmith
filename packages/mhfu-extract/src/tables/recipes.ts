/**
 * Crafting/upgrade struct readers, transcribed from `EquipCreate`/
 * `EquipmentCreateTable`/`EquipUpgrade`/`EquipUpgradeTable` in
 * vendor/mhp2g-patterns/patterns/eboot.hexpat — MIT, see ../../NOTICE.md.
 *
 * Both tables are read as one long sequential run of fixed-size entries with
 * a handful of hidden filler fields interspersed (a couple of raw u16 `TERM`
 * markers, a few "Null" dummy entries, and a big `Unkn[49]` gap) — we track
 * a running offset and advance it exactly as the struct declares, rather
 * than deriving each section's address independently, since only the very
 * first section (equipmentCreate / equipmentUpgrade) has a known address.
 * The final computed end-of-table offset for each was cross-checked against
 * the real gap to the next declared table address (see git history) and
 * matches exactly, which is strong evidence every segment count here is
 * right.
 */
import { BinaryReader } from "../binary/reader.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
  TABLE_COUNTS,
  resolveTableOffset,
} from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

export interface CraftMaterial {
  itemId: number;
  quantity: number;
}

function readCraftItems(reader: BinaryReader, off: number): CraftMaterial[] {
  const items: CraftMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    items.push({ itemId: reader.u16(off + i * 4), quantity: reader.u16(off + i * 4 + 2) });
  }
  return items;
}

export interface EquipCreateEntry {
  /** Index within this section's array, and into the corresponding *ID name enum. */
  index: number;
  equipId: number;
  hide: boolean;
  craft: CraftMaterial[];
  unkn: number;
  unkn2: number;
}

function readEquipCreateEntry(reader: BinaryReader, off: number, index: number): EquipCreateEntry {
  return {
    index,
    hide: reader.u8(off + 1) !== 0,
    equipId: reader.u16(off + 2),
    craft: readCraftItems(reader, off + 4),
    unkn: reader.u32(off + 20),
    unkn2: reader.u16(off + 24),
  };
}

function readEquipCreateSection(
  reader: BinaryReader,
  offset: number,
  count: number,
): { entries: EquipCreateEntry[]; nextOffset: number } {
  const entries: EquipCreateEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push(readEquipCreateEntry(reader, offset + i * EQUIP_CREATE_ENTRY_SIZE, i));
  }
  return { entries, nextOffset: offset + count * EQUIP_CREATE_ENTRY_SIZE };
}

export interface EquipmentCreateTables {
  head: EquipCreateEntry[];
  chest: EquipCreateEntry[];
  arm: EquipCreateEntry[];
  waist: EquipCreateEntry[];
  leg: EquipCreateEntry[];
  greatSwordLongSword: EquipCreateEntry[];
  lanceGunlance: EquipCreateEntry[];
  swordAndShieldDualBlades: EquipCreateEntry[];
  hammerHuntingHorn: EquipCreateEntry[];
  ancientRustBlademaster: EquipCreateEntry[];
  lightBowgun: EquipCreateEntry[];
  heavyBowgun: EquipCreateEntry[];
  bow: EquipCreateEntry[];
  ancientRustGunner: EquipCreateEntry[];
  decoration: EquipCreateEntry[];
}

/** `EquipmentCreateTables`' sections in table order, with their entry counts. */
const EQUIP_CREATE_SECTIONS: readonly (readonly [keyof EquipmentCreateTables, number])[] = [
  ["head", 437],
  ["chest", 435],
  ["arm", 426],
  ["waist", 424],
  ["leg", 434],
  ["greatSwordLongSword", 131],
  ["lanceGunlance", 117],
  ["swordAndShieldDualBlades", 131],
  ["hammerHuntingHorn", 124],
  ["ancientRustBlademaster", 8],
  ["lightBowgun", 135],
  ["heavyBowgun", 107],
  ["bow", 61],
  ["ancientRustGunner", 2],
  ["decoration", 192],
];

/** The hidden u16 TERM plus `NullCreate` entry that come after these sections. */
const EQUIP_CREATE_FILLER_AFTER = new Set<keyof EquipmentCreateTables>([
  "leg",
  "ancientRustGunner",
]);

export interface TableSection {
  /** File offset of the section's first entry. */
  offset: number;
  count: number;
}

/**
 * Where each EquipmentCreate section starts in the EBOOT, for tools that
 * patch entries in place: entry `i` of a section is at
 * `offset + i * EQUIP_CREATE_ENTRY_SIZE`. See readEquipmentCreate() for `resolver`.
 */
export function equipmentCreateLayout(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Record<keyof EquipmentCreateTables, TableSection> {
  let offset = resolveTableOffset("equipmentCreate", reader, resolver);
  const layout = {} as Record<keyof EquipmentCreateTables, TableSection>;
  for (const [name, count] of EQUIP_CREATE_SECTIONS) {
    layout[name] = { offset, count };
    offset += count * EQUIP_CREATE_ENTRY_SIZE;
    if (EQUIP_CREATE_FILLER_AFTER.has(name)) {
      offset += 2; // hidden u16 TERM / TERM2
      offset += EQUIP_CREATE_ENTRY_SIZE; // hidden EquipCreate<0> NullCreate1 / NullCreate2
    }
  }
  return layout;
}

/**
 * EquipmentCreate (EquipmentCreateTable) @ 0x08938D14. `resolver` defaults
 * to JP's static table — pass e.g. `MHP2G_EU_RESOLVER` (games/mhp2g.ts) to
 * read from a different region (only the starting address changes; every
 * section's count is the same game data regardless of region).
 */
export function readEquipmentCreate(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): EquipmentCreateTables {
  const layout = equipmentCreateLayout(reader, resolver);
  const tables = {} as EquipmentCreateTables;
  for (const [name] of EQUIP_CREATE_SECTIONS) {
    const { offset, count } = layout[name];
    tables[name] = readEquipCreateSection(reader, offset, count).entries;
  }
  return tables;
}

export interface EquipUpgradeEntry {
  /** Index within this section — for blademaster/gunner, also the weapon's own index. */
  index: number;
  craft: CraftMaterial[];
  /** Up to 5 target indices this entry can upgrade into (0 = unused slot). */
  upgradeTargets: number[];
}

function readEquipUpgradeEntry(
  reader: BinaryReader,
  off: number,
  index: number,
): EquipUpgradeEntry {
  const craft = readCraftItems(reader, off);
  const upgradeTargets = [0, 1, 2, 3, 4].map((i) => reader.u16(off + 16 + i * 2));
  return { index, craft, upgradeTargets };
}

export interface EquipmentUpgradeTables {
  blademaster: EquipUpgradeEntry[];
  gunner: EquipUpgradeEntry[];
  armorSphere: EquipUpgradeEntry[];
}

/**
 * Where each EquipmentUpgrade section starts in the EBOOT: entry `i` of a
 * section is at `offset + i * EQUIP_UPGRADE_ENTRY_SIZE`. See readEquipmentCreate() for `resolver`.
 */
export function equipmentUpgradeLayout(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Record<keyof EquipmentUpgradeTables, TableSection> {
  let offset = resolveTableOffset("equipmentUpgrade", reader, resolver);
  offset += EQUIP_UPGRADE_ENTRY_SIZE; // hidden EquipUpgrade<1> NullUpgrade[1]
  const blademaster = { offset, count: TABLE_COUNTS.weaponsBlademaster };
  offset += TABLE_COUNTS.weaponsBlademaster * EQUIP_UPGRADE_ENTRY_SIZE;
  const gunner = { offset, count: TABLE_COUNTS.weaponsGunner };
  offset += TABLE_COUNTS.weaponsGunner * EQUIP_UPGRADE_ENTRY_SIZE;
  offset += 49 * 4; // hidden u32 Unkn[49]
  const armorSphere = { offset, count: 7 };
  return { blademaster, gunner, armorSphere };
}

/** EquipmentUpgrade (EquipUpgradeTable) @ 0x0894CEA4. See readEquipmentCreate() for `resolver`. */
export function readEquipmentUpgrade(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): EquipmentUpgradeTables {
  const layout = equipmentUpgradeLayout(reader, resolver);
  const read = ({ offset, count }: TableSection): EquipUpgradeEntry[] =>
    Array.from({ length: count }, (_, i) =>
      readEquipUpgradeEntry(reader, offset + i * EQUIP_UPGRADE_ENTRY_SIZE, i),
    );
  return {
    blademaster: read(layout.blademaster),
    gunner: read(layout.gunner),
    armorSphere: read(layout.armorSphere),
  };
}

/**
 * Inverts a weapon upgrade tree: `EquipUpgrade` lists, per source weapon,
 * which weapons it can upgrade *into*; most consumers (and the data/ schema's
 * `improve_from`) want the reverse — given a weapon, which weapon(s) upgrade
 * into it. Index 0 (the WepBMID/WepGunID dummy "None" slot) is never a real
 * upgrade target and is skipped.
 */
export function invertUpgradeTree(entries: EquipUpgradeEntry[]): Map<number, number[]> {
  const inverted = new Map<number, number[]>();
  for (const entry of entries) {
    for (const target of entry.upgradeTargets) {
      if (target === 0) continue;
      const sources = inverted.get(target);
      if (sources) sources.push(entry.index);
      else inverted.set(target, [entry.index]);
    }
  }
  return inverted;
}
