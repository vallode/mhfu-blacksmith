/**
 * MHF2 (MHP2nd) equipment tables, found with `table-probe` against an EU
 * MHFU EBOOT (README's "Other games"). EU (ULES00851) only: no JP or US
 * disc has been probed.
 *
 * MHF2 is MHFU's base game, and most tables keep MHFU's layout: blademaster
 * weapons, items, decoration values and skills, the model -> weapon type
 * map. Three changed, worked out byte by byte from MHFU's entries:
 *
 * - Gunner weapons, 24 bytes (MHFU 28): bytes 0-13 as MHFU; the sort order
 *   is a u8 at +14 (MHFU u16); bullet charge, element, element value and
 *   reload move up one byte to +15..+18; MHFU's always-zero u32 at +20 is
 *   one byte at +19; shot coatings are at +20.
 * - Armor, 32 bytes (MHFU 40): male and female model IDs are u8s at +0 and
 *   +1 (MHFU u16s), hunter type and rarity follow; MHFU's u16 at +6 is
 *   gone. Price, defense, the five resistances, slots, color series and the
 *   first three sphere caps keep MHFU's order from +4. MHFU's royal and true
 *   sphere fields are gone; +19 is a fourth byte that matches MHFU's heavy
 *   sphere cap only a third of the time. The sort order (MHFU's u16 at +28)
 *   is at +20, then five (skill, amount) pairs from +22. Skill amounts match
 *   MHFU, skill IDs only half the time: MHF2 numbers its skills differently.
 * - Sharpness, 12 bytes (MHFU 14): six u16s. The first five match MHFU's
 *   cumulative red..blue thresholds in all 40 entries; the sixth matches
 *   MHFU's white in 5%. Read as white here; `checkMhp2Tables` reports whether
 *   it is cumulative.
 *
 * Tables sit back to back, as in MHFU: 601 blademaster weapons end where 171
 * gunner weapons begin, which end where the armor begins; head 327, chest
 * 311, arm 305, waist 303, leg 311 entries, then 124 decoration skills (a
 * dummy first) and the five armor pointers, then the model -> weapon type
 * map. Items (713) end where decoration values (124) begin.
 */
import type { BinaryReader } from "../binary/reader.js";
import { type ArmorSlot, ARMOR_SLOTS } from "../tables/armor.js";
import { readDecorationSkillAt, type DecorationSkill } from "../tables/decorations.js";
import { readItemEntryAt, type ItemEntry } from "../tables/items.js";
import { DECO_SKILL_ENTRY_SIZE, ITEM_ENTRY_SIZE, WEAPON_BM_ENTRY_SIZE } from "../tables/offsets.js";
import {
  readBlademasterWeaponAt,
  WEAPON_TYPE_NAMES,
  type BlademasterWeapon,
  type WeaponTypeName,
} from "../tables/weapons.js";

/** Size of the decrypted EU MHF2 EBOOT these offsets were found in. */
export const MHP2_EU_EBOOT_BYTES = 1_424_032;

export const MHP2_GUNNER_ENTRY_SIZE = 24;
export const MHP2_ARMOR_ENTRY_SIZE = 32;
export const MHP2_SHARPNESS_ENTRY_SIZE = 12;

/** One table: its file offset in the decrypted EU EBOOT and its entry count. */
export interface Mhp2Table {
  offset: number;
  count: number;
}

export const MHP2_EU_TABLES = {
  weaponClassModifiers: { offset: 0x110958, count: 11 },
  weaponsBlademaster: { offset: 0x121ccc, count: 601 },
  weaponsGunner: { offset: 0x125524, count: 171 },
  armorHead: { offset: 0x12652c, count: 327 },
  armorChest: { offset: 0x128e0c, count: 311 },
  armorArm: { offset: 0x12b4ec, count: 305 },
  armorWaist: { offset: 0x12db0c, count: 303 },
  armorLeg: { offset: 0x1300ec, count: 311 },
  /** Including the dummy first entry, as MHFU's 169. */
  decorationSkills: { offset: 0x1327cc, count: 124 },
  /** Five u32 pointers, one per armor slot, straight after the decoration skills. */
  armorValuePointers: { offset: 0x132f8c, count: 5 },
  /** Up to the bowgun shot table; only entries for real model IDs mean anything. */
  modelToWeaponType: { offset: 0x132fa0, count: 464 },
  sharpnessTable: { offset: 0x1337d0, count: 40 },
  itemTable: { offset: 0x134c60, count: 713 },
  decorationValues: { offset: 0x138f38, count: 124 },
} as const satisfies Record<string, Mhp2Table>;

const ARMOR_TABLES: Record<ArmorSlot, Mhp2Table> = {
  head: MHP2_EU_TABLES.armorHead,
  chest: MHP2_EU_TABLES.armorChest,
  arm: MHP2_EU_TABLES.armorArm,
  waist: MHP2_EU_TABLES.armorWaist,
  leg: MHP2_EU_TABLES.armorLeg,
};

export interface Mhp2GunnerWeapon {
  index: number;
  modelId: number;
  rarity: number;
  rangedPhysxTbl: number;
  price: number;
  attack: number;
  defense: number;
  recoilCharge: number;
  slots: number;
  affinity: number;
  sortOrder: number;
  bulletCharge: number;
  eleType: number;
  eleValue: number;
  reload: number;
  unkn1: number;
  shotCoatings: number;
}

export function readMhp2GunnerAt(
  reader: BinaryReader,
  off: number,
  index: number,
): Mhp2GunnerWeapon {
  return {
    index,
    modelId: reader.u16(off + 0),
    rarity: reader.u8(off + 2),
    rangedPhysxTbl: reader.u8(off + 3),
    price: reader.u32(off + 4),
    attack: reader.u16(off + 8),
    defense: reader.u8(off + 10),
    recoilCharge: reader.u8(off + 11),
    slots: reader.u8(off + 12),
    affinity: reader.s8(off + 13),
    sortOrder: reader.u8(off + 14),
    bulletCharge: reader.u8(off + 15),
    eleType: reader.u8(off + 16),
    eleValue: reader.u8(off + 17),
    reload: reader.u8(off + 18),
    unkn1: reader.u8(off + 19),
    shotCoatings: reader.u32(off + 20),
  };
}

export interface Mhp2Armor {
  index: number;
  maleId: number;
  femaleId: number;
  hunterType: number;
  rarity: number;
  price: number;
  defense: number;
  resistances: { fire: number; water: number; thunder: number; dragon: number; ice: number };
  slots: number;
  colorSeries: number;
  sphereCaps: { armorSphere: number; armorSpherePlus: number; hrdArmorSphere: number };
  /** Matches MHFU's heavy sphere cap a third of the time; meaning unconfirmed. */
  unkn19: number;
  sortOrder: number;
  /** MHF2's own skill IDs, not MHFU's. */
  skills: { skill: number; amount: number }[];
}

export function readMhp2ArmorAt(reader: BinaryReader, off: number, index: number): Mhp2Armor {
  const skills = [];
  for (let i = 0; i < 5; i++) {
    skills.push({ skill: reader.u8(off + 22 + i * 2), amount: reader.s8(off + 23 + i * 2) });
  }
  return {
    index,
    maleId: reader.u8(off + 0),
    femaleId: reader.u8(off + 1),
    hunterType: reader.u8(off + 2),
    rarity: reader.u8(off + 3),
    price: reader.u32(off + 4),
    defense: reader.s8(off + 8),
    resistances: {
      fire: reader.s8(off + 9),
      water: reader.s8(off + 10),
      thunder: reader.s8(off + 11),
      dragon: reader.s8(off + 12),
      ice: reader.s8(off + 13),
    },
    slots: reader.u8(off + 14),
    colorSeries: reader.u8(off + 15),
    sphereCaps: {
      armorSphere: reader.u8(off + 16),
      armorSpherePlus: reader.u8(off + 17),
      hrdArmorSphere: reader.u8(off + 18),
    },
    unkn19: reader.u8(off + 19),
    sortOrder: reader.u16(off + 20),
    skills,
  };
}

export const MHP2_SHARPNESS_COLORS = ["red", "orange", "yellow", "green", "blue", "white"] as const;

export interface Mhp2Sharpness {
  index: number;
  cumulative: Record<(typeof MHP2_SHARPNESS_COLORS)[number], number>;
}

export function readMhp2SharpnessAt(
  reader: BinaryReader,
  off: number,
  index: number,
): Mhp2Sharpness {
  const cumulative = {} as Mhp2Sharpness["cumulative"];
  MHP2_SHARPNESS_COLORS.forEach((color, c) => (cumulative[color] = reader.u16(off + c * 2)));
  return { index, cumulative };
}

export interface Mhp2Tables {
  weaponClassModifiers: number[];
  blademaster: (BlademasterWeapon & { weaponType: WeaponTypeName | null })[];
  gunner: (Mhp2GunnerWeapon & { weaponType: WeaponTypeName | null })[];
  armor: Record<ArmorSlot, Mhp2Armor[]>;
  sharpness: Mhp2Sharpness[];
  items: ItemEntry[];
  decorationValues: ItemEntry[];
  /** The real entries, without the dummy first one (as readDecorationSkills does for MHFU). */
  decorationSkills: DecorationSkill[];
}

function readAll<T>(
  table: Mhp2Table,
  size: number,
  read: (off: number, index: number) => T,
  skip = 0,
): T[] {
  const out: T[] = [];
  for (let i = skip; i < table.count; i++) out.push(read(table.offset + i * size, i - skip));
  return out;
}

export function readMhp2Tables(reader: BinaryReader): Mhp2Tables {
  const t = MHP2_EU_TABLES;
  const modelTypes = readAll(t.modelToWeaponType, 1, (off) => reader.u8(off));
  const weaponType = (modelId: number) => WEAPON_TYPE_NAMES[modelTypes[modelId] ?? -1] ?? null;
  const armor = {} as Record<ArmorSlot, Mhp2Armor[]>;
  for (const slot of ARMOR_SLOTS) {
    armor[slot] = readAll(ARMOR_TABLES[slot], MHP2_ARMOR_ENTRY_SIZE, (off, i) =>
      readMhp2ArmorAt(reader, off, i),
    );
  }
  return {
    weaponClassModifiers: readAll(t.weaponClassModifiers, 4, (off) => reader.u32(off)),
    blademaster: readAll(t.weaponsBlademaster, WEAPON_BM_ENTRY_SIZE, (off, i) => {
      const w = readBlademasterWeaponAt(reader, off, i);
      return { ...w, weaponType: weaponType(w.modelId) };
    }),
    gunner: readAll(t.weaponsGunner, MHP2_GUNNER_ENTRY_SIZE, (off, i) => {
      const w = readMhp2GunnerAt(reader, off, i);
      return { ...w, weaponType: weaponType(w.modelId) };
    }),
    armor,
    sharpness: readAll(t.sharpnessTable, MHP2_SHARPNESS_ENTRY_SIZE, (off, i) =>
      readMhp2SharpnessAt(reader, off, i),
    ),
    items: readAll(t.itemTable, ITEM_ENTRY_SIZE, (off, i) => readItemEntryAt(reader, off, i)),
    decorationValues: readAll(t.decorationValues, ITEM_ENTRY_SIZE, (off, i) =>
      readItemEntryAt(reader, off, i),
    ),
    decorationSkills: readAll(
      t.decorationSkills,
      DECO_SKILL_ENTRY_SIZE,
      (off, i) => readDecorationSkillAt(reader, off, i),
      1,
    ),
  };
}

export interface Mhp2Check {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Checks that the EBOOT is the one these offsets came from and that the
 * tables read sensibly. The armor pointers are the independent one: their
 * spacing must match the five armor offsets, which were found by content.
 */
export function checkMhp2Tables(reader: BinaryReader, tables: Mhp2Tables): Mhp2Check[] {
  const checks: Mhp2Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  check(
    "EBOOT size is the EU MHF2 one",
    reader.buf.length === MHP2_EU_EBOOT_BYTES,
    `${reader.buf.length} bytes, expected ${MHP2_EU_EBOOT_BYTES}`,
  );

  const pointers = Array.from({ length: 5 }, (_, i) =>
    reader.u32(MHP2_EU_TABLES.armorValuePointers.offset + i * 4),
  );
  const offsets = ARMOR_SLOTS.map((slot) => ARMOR_TABLES[slot].offset);
  const sortedPointers = [...pointers].sort((a, b) => a - b);
  const sortedOffsets = [...offsets].sort((a, b) => a - b);
  const bases = new Set(sortedPointers.map((p, i) => p - sortedOffsets[i]!));
  const base = [...bases][0]!;
  const order = pointers.map((p) => ARMOR_SLOTS[offsets.indexOf(p - base)] ?? "?");
  check(
    "armor pointers point at the five armor tables",
    bases.size === 1,
    bases.size === 1
      ? `load base 0x${base.toString(16)}; pointer order ${order.join(", ")}`
      : `pointer spacing doesn't match the armor offsets: ${pointers.map((p) => `0x${p.toString(16)}`).join(", ")}`,
  );

  const badSharpness = tables.blademaster.filter((w) => w.sharpnessId >= tables.sharpness.length);
  check(
    "blademaster sharpness IDs are in the sharpness table",
    badSharpness.length === 0,
    `${badSharpness.length} out of range`,
  );

  const untyped = [...tables.blademaster, ...tables.gunner].filter(
    (w) => w.weaponType === null && w.modelId !== 0,
  );
  check(
    "every weapon's model has a weapon type",
    untyped.length === 0,
    `${untyped.length} without`,
  );

  const nonMonotonic = tables.sharpness.filter((s) => {
    const values = Object.values(s.cumulative);
    return values.some((v, i) => i > 0 && v < values[i - 1]!);
  });
  check(
    "sharpness thresholds are cumulative (never decrease)",
    nonMonotonic.length === 0,
    `${nonMonotonic.length} of ${tables.sharpness.length} entries decrease`,
  );

  const armorRarity = ARMOR_SLOTS.flatMap((slot) => tables.armor[slot]).filter(
    (a) => a.rarity > 10,
  );
  check("armor rarity is at most 10", armorRarity.length === 0, `${armorRarity.length} above`);
  return checks;
}
