/**
 * EBOOT.BIN table addresses, transcribed field-for-field from
 * vendor/mhp2g-patterns/patterns/eboot.hexpat (MIT — see ../../NOTICE.md).
 *
 * Addresses below are virtual memory addresses (matching the pattern's
 * `#pragma base_address 0x08801A4C`), i.e. `fileOffset = vaddr - JP_BASE_ADDRESS`.
 *
 * JP-only, deliberately. We validated against real JP and EU EBOOTs and
 * found that a single per-region rebase constant does NOT hold — different
 * tables shift by different amounts in the EU binary (localized string data
 * inserted at different points pushes some tables further than others), so
 * a naive `REGION_REBASE` constant silently misreads some tables. Supporting
 * US/EU properly needs per-table signature-based address discovery (find
 * each table's real address by searching for its region-independent stat
 * bytes), which is real work we're deferring. Until then this whole pipeline
 * only supports the JP disc (ULJM-05500 / MHP2G) — see README for tracking.
 * English names still come from the mhp2g-patterns enums bootstrap, not disc
 * strings, so the JP-only restriction here doesn't block English output.
 */
import { BinaryReader } from "../binary/reader.js";

export const JP_BASE_ADDRESS = 0x08801a4c;

/** JP virtual addresses for every table this pipeline reads. */
export const JP_TABLE_ADDRESSES = {
  weaponClassModifiers: 0x08938104,
  equipmentCreate: 0x08938d14,
  equipmentUpgrade: 0x0894cea4,
  armorValuePointers: 0x08975970,
  weaponsBlademaster: 0x089574c8,
  weaponsGunner: 0x0895e098,
  decorationSkills: 0x08974ee0,
  modelToWeaponType: 0x08975984,
  bowgunShotTable: 0x08975bf4,
  bowChargeTable: 0x08976334,
  sharpnessTable: 0x08976508,
  bowgunModTable: 0x08976944,
  dualAttributeWeapons: 0x08976c54,
  decorationValues: 0x0899fb18,
  itemTable: 0x0899a238,
} as const;

export type TableName = keyof typeof JP_TABLE_ADDRESSES;

export const TABLE_COUNTS = {
  weaponsBlademaster: 1150,
  weaponsGunner: 354,
  headArmor: 436,
  chestArmor: 420,
  armArmor: 411,
  waistArmor: 409,
  legArmor: 420,
  sharpnessEntries: 40,
  decorations: 169,
  items: 1262,
  modelToWeaponType: 553,
} as const;

export const WEAPON_BM_ENTRY_SIZE = 24;
export const WEAPON_GUN_ENTRY_SIZE = 28;
export const ARMOR_ENTRY_SIZE = 40;
export const ITEM_ENTRY_SIZE = 24;
export const DECO_SKILL_ENTRY_SIZE = 16;
export const SHARPNESS_ENTRY_SIZE = 14;

/** Resolves a JP table address to a JP EBOOT file offset. */
export function tableOffset(table: TableName): number {
  return JP_TABLE_ADDRESSES[table] - JP_BASE_ADDRESS;
}

/** Resolves an arbitrary JP-space virtual address (not just a table base) to a file offset. */
export function jpVaddrToOffset(vaddr: number): number {
  return vaddr - JP_BASE_ADDRESS;
}

export interface OffsetVerificationResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

/**
 * Structural self-checks run before trusting any table read, to catch a
 * corrupt/mismatched EBOOT before we silently emit garbage data. JP-only,
 * validated against a real decrypted JP EBOOT (ULJM-05500) — see README.
 */
export function verifyOffsets(ebootReader: BinaryReader): OffsetVerificationResult {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  // 1. Decoration values must land exactly at item base + 948 * 24.
  const itemBase = tableOffset("itemTable");
  const decoBase = tableOffset("decorationValues");
  const expectedDecoBase = itemBase + 948 * ITEM_ENTRY_SIZE;
  check(
    "decorationValues == itemTable + 948 * 24",
    decoBase === expectedDecoBase,
    `decorationValues=0x${decoBase.toString(16)} expected=0x${expectedDecoBase.toString(16)}`
  );

  // 2. weaponsGunner and decorationSkills are independently-declared output
  // addresses in eboot.hexpat — they are NOT adjacent in the real binary
  // (confirmed against a real EBOOT: ~84KB of other unmodeled data sits
  // between them), so we only check that gunEnd doesn't run past
  // decorationSkills, which would indicate a corrupt count/entry size.
  const gunBase = tableOffset("weaponsGunner");
  const gunEnd = gunBase + TABLE_COUNTS.weaponsGunner * WEAPON_GUN_ENTRY_SIZE;
  const decoSkillsBase = tableOffset("decorationSkills");
  check(
    "weaponsGunner end <= decorationSkills start",
    gunEnd <= decoSkillsBase,
    `gunEnd=0x${gunEnd.toString(16)} decorationSkills=0x${decoSkillsBase.toString(16)}`
  );

  // 3. Sharpness IDs referenced by every blademaster weapon must fall
  // inside the 40-entry sharpness table.
  const wepBmBase = tableOffset("weaponsBlademaster");
  let sharpnessOk = true;
  let firstBadIndex = -1;
  for (let i = 0; i < TABLE_COUNTS.weaponsBlademaster; i++) {
    const entryOffset = wepBmBase + i * WEAPON_BM_ENTRY_SIZE;
    const sharpnessId = ebootReader.u8(entryOffset + 8); // ModelID(2)+Rarity(1)+Unkn1(1)+Price(4) precede SharpnessID
    if (sharpnessId >= TABLE_COUNTS.sharpnessEntries) {
      sharpnessOk = false;
      firstBadIndex = i;
      break;
    }
  }
  check(
    "all blademaster SharpnessID values < 40",
    sharpnessOk,
    sharpnessOk ? "ok" : `weapon index ${firstBadIndex} has out-of-range SharpnessID`
  );

  // 4. The weapon class modifier table (11 u32s) must contain plausible,
  // small positive multipliers (all known values are in [1.0, 6.0] scaled
  // by some fixed-point factor, but at minimum: nonzero and not huge).
  const classModBase = tableOffset("weaponClassModifiers");
  let classModsOk = true;
  for (let i = 0; i < 11; i++) {
    const v = ebootReader.u32(classModBase + i * 4);
    if (v === 0 || v > 100000) {
      classModsOk = false;
      break;
    }
  }
  check("weapon class modifiers are plausible", classModsOk, classModsOk ? "ok" : "found a zero or absurd value");

  return { ok: checks.every((c) => c.ok), checks };
}
