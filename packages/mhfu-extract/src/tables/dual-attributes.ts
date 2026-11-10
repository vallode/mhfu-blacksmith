/**
 * Dual-element weapon reader, transcribed from `WepValueDualAttr`/
 * `DualAttrEntry`/`EleBitFlag` in vendor/mhp2g-patterns/patterns/eboot.hexpat
 * — MIT, see ../../NOTICE.md.
 *
 * The 15 dual-element dual blades carry no element in their `WepBMValue`
 * struct; both elements live here instead, keyed by `WepBMID`.
 */
import { BinaryReader } from "../binary/reader.js";
import { DUAL_ATTRIBUTE_ENTRY_SIZE, TABLE_COUNTS, resolveTableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

/**
 * `EleBitFlag`: a bit flag, not the single-element enum `WepBMValue.EleType`
 * uses. Bit 8 is `Unused` in the pattern.
 */
export const DUAL_ATTRIBUTE_FLAG_NAMES: Readonly<Record<number, string>> = {
  0x001: "Sleep",
  0x002: "Poison",
  0x004: "Paralysis",
  0x010: "Fire",
  0x020: "Water",
  0x040: "Thunder",
  0x080: "Ice",
  0x100: "Dragon",
};

export interface DualAttribute {
  /** Raw `EleBitFlag`. */
  flag: number;
  /** Name from `DUAL_ATTRIBUTE_FLAG_NAMES`, or null for an unknown flag. */
  name: string | null;
  /** Raw value (true value / 10, like `WepBMValue.EleValue`). */
  value: number;
}

export interface DualAttributeWeapon {
  /** `WepBMID` of the weapon. */
  weaponId: number;
  /** Both attributes, in stored order. */
  attributes: [DualAttribute, DualAttribute];
}

function readAttribute(reader: BinaryReader, offset: number): DualAttribute {
  const flag = reader.u16(offset);
  return { flag, name: DUAL_ATTRIBUTE_FLAG_NAMES[flag] ?? null, value: reader.u16(offset + 2) };
}

/**
 * `WepValueDualAttr WepDualAttr[15]` @ 0x08976c54 — 10 bytes/entry
 * (`u16 WeaponID`, then two `{ u16 AttribType; u16 Value; }`).
 * `resolver` defaults to JP's static table — pass e.g. `MHP2G_EU_RESOLVER`
 * (games/mhp2g.ts) to read from a different region.
 */
export function readDualAttributeWeapons(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): DualAttributeWeapon[] {
  const base = resolveTableOffset("dualAttributeWeapons", reader, resolver);
  const out: DualAttributeWeapon[] = [];
  for (let i = 0; i < TABLE_COUNTS.dualAttributeWeapons; i++) {
    const off = base + i * DUAL_ATTRIBUTE_ENTRY_SIZE;
    out.push({
      weaponId: reader.u16(off),
      attributes: [readAttribute(reader, off + 2), readAttribute(reader, off + 6)],
    });
  }
  return out;
}
