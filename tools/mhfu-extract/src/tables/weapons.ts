/**
 * Weapon-related struct readers, transcribed field-for-field from
 * vendor/mhp2g-patterns/patterns/eboot.hexpat (`WepClassMod`, `WepBMValue`,
 * `WepGunValue`, `ShotCoat`, `Mod2WepType`) — MIT, see ../../NOTICE.md.
 *
 * These return raw decoded fields (renamed to camelCase, values otherwise
 * untouched); mapping them onto the data/ schema shape is a later "emit"
 * step, not done here.
 */
import { BinaryReader } from "../binary/reader.js";
import { TABLE_COUNTS, WEAPON_BM_ENTRY_SIZE, WEAPON_GUN_ENTRY_SIZE, resolveTableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

export interface WeaponClassModifiers {
  greatSword: number;
  heavyBowgun: number;
  hammer: number;
  lance: number;
  swordAndShield: number;
  lightBowgun: number;
  dualBlades: number;
  longSword: number;
  huntingHorn: number;
  gunLance: number;
  bow: number;
}

/**
 * WepClassMod @ 0x08938104 — eleven u32s, one per weapon class.
 * `resolver` defaults to JP's static table (`tableOffset()`) — pass e.g.
 * `MHP2G_EU_RESOLVER` (games/mhp2g.ts) to read from a different region.
 */
export function readWeaponClassModifiers(reader: BinaryReader, resolver?: TableAddressResolver): WeaponClassModifiers {
  const base = resolveTableOffset("weaponClassModifiers", reader, resolver);
  return {
    greatSword: reader.u32(base + 0),
    heavyBowgun: reader.u32(base + 4),
    hammer: reader.u32(base + 8),
    lance: reader.u32(base + 12),
    swordAndShield: reader.u32(base + 16),
    lightBowgun: reader.u32(base + 20),
    dualBlades: reader.u32(base + 24),
    longSword: reader.u32(base + 28),
    huntingHorn: reader.u32(base + 32),
    gunLance: reader.u32(base + 36),
    bow: reader.u32(base + 40),
  };
}

export interface BlademasterWeapon {
  /** Index into WepBMValues, and into WepBMID for name lookup. */
  index: number;
  modelId: number;
  rarity: number;
  unkn1: number;
  price: number;
  sharpnessId: number;
  sharpnessAmount: number;
  attack: number;
  defense: number;
  affinity: number;
  eleType: number;
  eleValue: number;
  statusType: number;
  statusValue: number;
  slots: number;
  noteGlType: number;
  unkn2: number;
  sortOrder: number;
  unkn3: number;
}

/** WepBMValues[1150] @ 0x089574C8 — 24 bytes/entry. See readWeaponClassModifiers() for `resolver`. */
export function readBlademasterWeapons(reader: BinaryReader, resolver?: TableAddressResolver): BlademasterWeapon[] {
  const base = resolveTableOffset("weaponsBlademaster", reader, resolver);
  const out: BlademasterWeapon[] = [];
  for (let i = 0; i < TABLE_COUNTS.weaponsBlademaster; i++) {
    const off = base + i * WEAPON_BM_ENTRY_SIZE;
    out.push({
      index: i,
      modelId: reader.u16(off + 0),
      rarity: reader.u8(off + 2),
      unkn1: reader.u8(off + 3),
      price: reader.u32(off + 4),
      sharpnessId: reader.u8(off + 8),
      sharpnessAmount: reader.u8(off + 9),
      attack: reader.u16(off + 10),
      defense: reader.u8(off + 12),
      affinity: reader.s8(off + 13),
      eleType: reader.u8(off + 14),
      eleValue: reader.u8(off + 15),
      statusType: reader.u8(off + 16),
      statusValue: reader.u8(off + 17),
      slots: reader.u8(off + 18),
      noteGlType: reader.u8(off + 19),
      unkn2: reader.u8(off + 20),
      sortOrder: reader.u16(off + 21),
      unkn3: reader.u8(off + 23),
    });
  }
  return out;
}

/** Named bits of the ShotCoat u32 bitfield, in declaration order (bit 0 first). */
export const SHOT_COAT_FIELDS = [
  "norm1",
  "norm2",
  "norm3",
  "pierce1",
  "pierce2",
  "pierce3",
  "pellet1",
  "pellet2",
  "pellet3",
  "crag1",
  "crag2",
  "crag3",
  "clust1",
  "clust2",
  "clust3",
  "flameS",
  "waterS",
  "thunderS",
  "freezeS",
  "dragonS",
  "recov1",
  "recov2",
  "poison1",
  "poison2",
  "para1",
  "para2",
  "sleep1",
  "sleep2",
  "tranq",
  "paint",
  "demon",
  "armor",
] as const;

export type ShotCoatFlags = Record<(typeof SHOT_COAT_FIELDS)[number], boolean>;

/** Decodes the raw ShotCoat u32 into named boolean flags. */
export function decodeShotCoat(value: number): ShotCoatFlags {
  const flags = {} as ShotCoatFlags;
  for (let bit = 0; bit < SHOT_COAT_FIELDS.length; bit++) {
    flags[SHOT_COAT_FIELDS[bit]!] = ((value >>> bit) & 1) === 1;
  }
  return flags;
}

export interface GunnerWeapon {
  /** Index into WepGunValues, and into WepGunID for name lookup. */
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
  /** Raw ShotCoat bitfield — pass to decodeShotCoat() for named flags. */
  shotCoatings: number;
}

/** WepGunValues[354] @ 0x0895E098 — 28 bytes/entry. See readWeaponClassModifiers() for `resolver`. */
export function readGunnerWeapons(reader: BinaryReader, resolver?: TableAddressResolver): GunnerWeapon[] {
  const base = resolveTableOffset("weaponsGunner", reader, resolver);
  const out: GunnerWeapon[] = [];
  for (let i = 0; i < TABLE_COUNTS.weaponsGunner; i++) {
    const off = base + i * WEAPON_GUN_ENTRY_SIZE;
    out.push({
      index: i,
      modelId: reader.u16(off + 0),
      rarity: reader.u8(off + 2),
      rangedPhysxTbl: reader.u8(off + 3),
      price: reader.u32(off + 4),
      attack: reader.u16(off + 8),
      defense: reader.u8(off + 10),
      recoilCharge: reader.u8(off + 11),
      slots: reader.u8(off + 12),
      affinity: reader.s8(off + 13),
      sortOrder: reader.u16(off + 14),
      bulletCharge: reader.u8(off + 16),
      eleType: reader.u8(off + 17),
      eleValue: reader.u8(off + 18),
      reload: reader.u8(off + 19),
      unkn1: reader.u32(off + 20),
      shotCoatings: reader.u32(off + 24),
    });
  }
  return out;
}

/** WepTypeID enum values, in eboot.hexpat declaration order. */
export const WEAPON_TYPE_NAMES = [
  "great-sword",
  "heavy-bowgun",
  "hammer",
  "lance",
  "sword-and-shield",
  "light-bowgun",
  "dual-blades",
  "long-sword",
  "hunting-horn",
  "gunlance",
  "bow",
] as const;

export type WeaponTypeName = (typeof WEAPON_TYPE_NAMES)[number];

/** Mod2WepType[553] @ 0x08975984 — one u8 WepTypeID per weapon model ID. See readWeaponClassModifiers() for `resolver`. */
export function readModelToWeaponType(reader: BinaryReader, resolver?: TableAddressResolver): (WeaponTypeName | null)[] {
  const base = resolveTableOffset("modelToWeaponType", reader, resolver);
  const out: (WeaponTypeName | null)[] = [];
  for (let i = 0; i < TABLE_COUNTS.modelToWeaponType; i++) {
    const raw = reader.u8(base + i);
    out.push(WEAPON_TYPE_NAMES[raw] ?? null);
  }
  return out;
}
