/**
 * MHP2G/MHFU's `GameProfile` — the only real profile this pipeline has
 * today. Bundles the JP static address table (offsets.ts, unchanged from
 * before this abstraction existed) and the EU signature-based resolver
 * (tables/eu-signatures.ts, currently covering 2 tables as a proof of
 * concept — see README's "Region support" section for the rest).
 *
 * A hypothetical future MH1/MHF1 `GameProfile` would live at
 * `src/games/mh1.ts` alongside this file, with its own `TableDescriptor[]`
 * and its own resolvers built from that game's own EBOOT — none of
 * `tables/resolver.ts` or `tables/profile.ts` would need to change shape to
 * support it. See README for what such a profile would need to supply.
 */
import type { Region } from "../container/sfo.js";
import { EU_TABLE_SIGNATURES } from "../tables/eu-signatures.js";
import {
  DECO_SKILL_ENTRY_SIZE,
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
  ITEM_ENTRY_SIZE,
  JP_BASE_ADDRESS,
  JP_TABLE_ADDRESSES,
  SHARPNESS_ENTRY_SIZE,
  TABLE_COUNTS,
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
} from "../tables/offsets.js";
import type { GameProfile, TableDescriptor } from "../tables/profile.js";
import { SignatureResolver, StaticOffsetResolver, type TableAddressResolver } from "../tables/resolver.js";

/**
 * Per-table entry size/count, for tables that are a single flat fixed-stride
 * array. Tables not listed here are either a sequence of differently-sized
 * sections (`equipmentCreate`/`equipmentUpgrade` — see tables/recipes.ts,
 * `entrySize` only) or aren't read by this pipeline at all yet
 * (`bowgunShotTable`, `bowChargeTable`, `bowgunModTable`,
 * `dualAttributeWeapons` — declared in `eboot.hexpat` and carried in
 * `JP_TABLE_ADDRESSES` for completeness, but no reader/consumer exists in
 * tables/*.ts today).
 */
const FIXED_STRIDE_TABLES: Readonly<Partial<Record<keyof typeof JP_TABLE_ADDRESSES, { entrySize: number; count: number }>>> = {
  weaponClassModifiers: { entrySize: 4, count: 11 },
  armorValuePointers: { entrySize: 4, count: 5 },
  weaponsBlademaster: { entrySize: WEAPON_BM_ENTRY_SIZE, count: TABLE_COUNTS.weaponsBlademaster },
  weaponsGunner: { entrySize: WEAPON_GUN_ENTRY_SIZE, count: TABLE_COUNTS.weaponsGunner },
  decorationSkills: { entrySize: DECO_SKILL_ENTRY_SIZE, count: TABLE_COUNTS.decorations },
  modelToWeaponType: { entrySize: 1, count: TABLE_COUNTS.modelToWeaponType },
  sharpnessTable: { entrySize: SHARPNESS_ENTRY_SIZE, count: TABLE_COUNTS.sharpnessEntries },
  decorationValues: { entrySize: ITEM_ENTRY_SIZE, count: TABLE_COUNTS.decorations },
  itemTable: { entrySize: ITEM_ENTRY_SIZE, count: TABLE_COUNTS.regularItems },
};

/** Entry size only, for tables whose overall count isn't a single fixed number (see recipes.ts). */
const VARIABLE_SECTION_TABLES: Readonly<Partial<Record<keyof typeof JP_TABLE_ADDRESSES, number>>> = {
  equipmentCreate: EQUIP_CREATE_ENTRY_SIZE,
  equipmentUpgrade: EQUIP_UPGRADE_ENTRY_SIZE,
};

const MHP2G_TABLES: readonly TableDescriptor[] = Object.keys(JP_TABLE_ADDRESSES).map((name) => {
  const key = name as keyof typeof JP_TABLE_ADDRESSES;
  const fixed = FIXED_STRIDE_TABLES[key];
  if (fixed) return { name, entrySize: fixed.entrySize, count: fixed.count };
  const variableEntrySize = VARIABLE_SECTION_TABLES[key];
  if (variableEntrySize !== undefined) return { name, entrySize: variableEntrySize };
  return { name };
});

/** JP's exact pre-existing static-offset behavior, now expressed as a `TableAddressResolver`. */
export const MHP2G_JP_RESOLVER: TableAddressResolver = new StaticOffsetResolver(JP_BASE_ADDRESS, JP_TABLE_ADDRESSES);

/**
 * EU's signature-based resolver — a proof of concept, not full coverage.
 * Only the tables in `EU_TABLE_SIGNATURES` resolve; every other table throws
 * a clear "not validated yet" error. See README for the per-table TODO list.
 */
export const MHP2G_EU_RESOLVER: TableAddressResolver = new SignatureResolver(EU_TABLE_SIGNATURES);

export const MHP2G_PROFILE: GameProfile = {
  id: "mhp2g",
  tables: MHP2G_TABLES,
  resolverForRegion(region: Region): TableAddressResolver | null {
    switch (region) {
      case "jp":
        return MHP2G_JP_RESOLVER;
      case "eu":
        return MHP2G_EU_RESOLVER;
      case "us":
        // No US disc available to derive addresses or signatures from yet —
        // see README's "Region support" section. Returning null (rather
        // than an empty SignatureResolver) makes "not supported at all"
        // distinguishable from "supported, but only for some tables".
        return null;
    }
  },
};
