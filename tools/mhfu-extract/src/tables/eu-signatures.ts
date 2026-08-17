/**
 * Real, validated EU (`Monster Hunter Freedom Unite (Europe)`, `ULES01213`)
 * table signatures for `SignatureResolver` (resolver.ts).
 *
 * Each entry below was derived and independently confirmed against a real
 * decrypted EU EBOOT (via `pspdecrypt`, from the actual EU disc image — not
 * fabricated or guessed): the byte sequence is copied verbatim from the
 * known-good JP static offset (`JP_TABLE_ADDRESSES`/`tableOffset()` in
 * offsets.ts) using `extractSignature()`, then confirmed to occur *exactly
 * once* in the real EU EBOOT, at a file offset that is a plausible table
 * location (i.e. not inside an unrelated table).
 *
 * This is intentionally a small, hand-curated allowlist, not a generated
 * table for every entry in `JP_TABLE_ADDRESSES` — see README's "Region
 * support" section for the full per-table TODO list of what's left. Only
 * add an entry here once you've actually run the same
 * derive-then-confirm-unique-match process against a real EU dump; a wrong
 * or ambiguous signature would otherwise make `SignatureResolver` silently
 * resolve to the wrong address.
 *
 * Both signatures below are entirely made of raw gameplay values (u32
 * multipliers / item stat fields) with no pointers or localized text, which
 * is exactly the kind of content `SignatureResolver` requires: identical
 * bytes regardless of region.
 */
import type { TableSignature } from "./resolver.js";

/**
 * `weaponClassModifiers` (11 u32s, tables/weapons.ts's `WeaponClassModifiers`).
 * Whole-table signature (44 bytes = all 11 entries) since the table is
 * short enough to use in full.
 *
 * Real values (identical in JP and EU, confirming this data is
 * region-independent): [480, 120, 520, 230, 140, 120, 140, 480, 520, 230, 120].
 *
 * Found at real EU file offset 0x139170 — JP's static offset is 0x1366b8,
 * i.e. a +0x2ab8 shift, exactly matching the manually-found shift documented
 * in README's "Region support" section (this is the same finding, now
 * reproduced mechanically instead of by hand).
 */
const WEAPON_CLASS_MODIFIERS_EU: TableSignature = {
  signature: Buffer.from(
    "e00100007800000008020000e60000008c000000780000008c000000e001000008020000e600000078000000",
    "hex"
  ),
  signatureOffset: 0,
};

/**
 * `itemTable` (tables/items.ts), signature = just entry index 0 (the dummy
 * "None" item, 24 bytes) — already unique across the whole ~1.9MB EBOOT in
 * both JP and EU, so no need for a longer run.
 *
 * Found at real EU file offset 0x19b74c — JP's static offset is 0x1987ec,
 * i.e. a +0x2f60 shift, matching the second distinct shift amount documented
 * in README's "Region support" section (different from
 * weaponClassModifiers' +0x2ab8, which is the whole point: a single
 * per-region constant does not work).
 */
const ITEM_TABLE_EU: TableSignature = {
  signature: Buffer.from("0000000104ff000000000000000000000000000000000100", "hex"),
  signatureOffset: 0,
};

/**
 * Every table this pipeline can currently resolve for the EU disc. Anything
 * not listed here isn't supported yet — `SignatureResolver.resolve()` throws
 * a clear error naming the table rather than guessing.
 */
export const EU_TABLE_SIGNATURES: Readonly<Record<string, TableSignature>> = {
  weaponClassModifiers: WEAPON_CLASS_MODIFIERS_EU,
  itemTable: ITEM_TABLE_EU,
};
