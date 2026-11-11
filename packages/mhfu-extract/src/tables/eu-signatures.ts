/**
 * Real, validated EU (`Monster Hunter Freedom Unite (Europe)`, `ULES01213`)
 * table signatures for `SignatureResolver` (resolver.ts).
 *
 * Every entry below was derived and independently confirmed against a real
 * decrypted EU EBOOT (via `pspdecrypt`, from the actual EU disc image — not
 * fabricated or guessed), using the same process every time:
 *
 *   1. Take a whole number of entries' worth of bytes (never an arbitrary
 *      byte count) from the known-good JP static offset
 *      (`JP_TABLE_ADDRESSES`/`tableOffset()` in offsets.ts), via
 *      `extractSignature()`.
 *   2. Confirm the resulting signature occurs *exactly once* in the real EU
 *      EBOOT (`findAllOccurrences`) — and exactly once in the real JP EBOOT
 *      too, as a sanity check that the slice itself isn't some degenerate
 *      repeating pattern.
 *   3. For every table below (not just a spot check), additionally diffed
 *      the table's *entire* real content — not just the signature bytes —
 *      between JP and the resolved EU offset, and found it byte-for-byte
 *      identical across the whole table in every case. This is strong
 *      independent confirmation that (a) the resolved EU offset is exactly
 *      right, not just "some plausible-looking match", and (b) JP and EU
 *      share identical equipment stat data, as expected for two
 *      localizations of the same game.
 *
 * This is a hand-curated allowlist, not a generated table for every entry
 * in `JP_TABLE_ADDRESSES` (see README's "Region support" section for the
 * current per-table status). Only add an entry here once you've actually
 * run the same derive-then-confirm-unique-match-then-diff-full-table
 * process against a real EU dump; a wrong or ambiguous signature would
 * otherwise make `SignatureResolver` silently resolve to the wrong address.
 *
 * Every signature below is made of raw gameplay values (u32 multipliers,
 * item/weapon/armor stat fields, crafting recipes) with no pointers or
 * localized text — exactly the kind of content `SignatureResolver` requires
 * (identical bytes regardless of region). The one table whose *own* bytes
 * are NOT usable this way is `armorValuePointers` (a table of pointers, not
 * raw values) — see `ARMOR_SLOT_TABLE_NAMES_EU` below and
 * `tables/armor.ts`'s module doc comment for how that's handled instead.
 *
 * All real, confirmed table shifts found in the EU EBOOT relative to their
 * JP static offset, for reference (every table below uses one of these
 * three): `+0x2ab8` (`weaponClassModifiers` only), `+0x2f60`
 * (`itemTable`/`decorationValues`), `+0x2b04` (everything else validated so
 * far). Three different real shifts for tables that a naive single
 * "region rebase" constant would have to pick just one of — the core reason
 * `SignatureResolver` exists instead.
 */
import type { TableSignature } from "./resolver.js";

const WEAPON_CLASS_MODIFIERS_EU: TableSignature = {
  // weaponClassModifiers (11 u32s, tables/weapons.ts's WeaponClassModifiers)
  // — whole-table signature. Real values (identical in JP and EU): [480,
  // 120, 520, 230, 140, 120, 140, 480, 520, 230, 120]. Real EU offset
  // 0x139170, JP static offset 0x1366b8 (+0x2ab8).
  signature: Buffer.from(
    "e00100007800000008020000e60000008c000000780000008c000000e001000008020000e600000078000000",
    "hex",
  ),
  signatureOffset: 0,
};

const ITEM_TABLE_EU: TableSignature = {
  // itemTable (tables/items.ts) — entry index 0 (the dummy "None" item),
  // already unique across the whole ~1.9MB EBOOT. Real EU offset 0x19b74c,
  // JP static offset 0x1987ec (+0x2f60). Read by emit/items.ts and
  // emit/shops.ts.
  signature: Buffer.from("0000000104ff000000000000000000000000000000000100", "hex"),
  signatureOffset: 0,
};

const EQUIPMENT_DESCRIPTIONS_EU: TableSignature = {
  // The equipment description indexes (tables/descriptions.ts): the
  // blademaster array's first 24 entries (0, 1, 1, 2, ...), the only match in
  // the EU EBOOT. Real EU offset 0x1987b0. Found on the EU disc alone, with no
  // JP dump to diff against: every one of the seven arrays reads back with
  // its largest index exactly its str_tbl description table's last entry.
  signature: Buffer.from(
    "00000100010002000300040005000600070008000900090009000a000a000a000b000b000c000d000c000e000f000e00",
    "hex",
  ),
  signatureOffset: 0,
};

const UI_SPRITE_TABLE_EU: TableSignature = {
  // The UI sprite table (tables/item-icons.ts), anchored on sprites 186-188,
  // the 16x16 item icons' first three. Real EU offset 0x13775c, the sprites
  // at 0x138014. Unique in the EBOOT. JP not checked (no JP disc to hand).
  signature: Buffer.from(
    "c00000001000100000800b00d00000001000100000800b00e00000001000100000800b00",
    "hex",
  ),
  signatureOffset: 186 * 12,
};

const ITEM_ICON_SPRITE_INDEX_EU: TableSignature = {
  // The icon shape -> sprite lists (tables/item-icons.ts), anchored on the
  // 24x24 list's shapes 39-55, the out-of-sequence part (its start is the
  // same run of IDs as several other tables). Real EU offset 0x139080,
  // unique in the EBOOT. JP not checked.
  signature: Buffer.from(
    "6b006b008f01900191016b0092016b006b006b0093019401950196016b00f001ef01",
    "hex",
  ),
  signatureOffset: 39 * 2,
};

const ITEM_COLOR_PALETTE_EU: TableSignature = {
  // The item colour palette (tables/item-icons.ts), all 11 u32s. Real EU
  // offset 0x139010, unique in the EBOOT. JP not checked.
  signature: Buffer.from(
    "ffffff01ff5d5d0173cb8d0196b5fd01ffd35d01b895c6019bdff001ff985d01ed93a40100000001a0a0a001",
    "hex",
  ),
  signatureOffset: 0,
};

const WEAPONS_BLADEMASTER_EU: TableSignature = {
  // weaponsBlademaster (tables/weapons.ts) — first 2 entries (48 bytes,
  // WEAPON_BM_ENTRY_SIZE=24). Real EU offset 0x158580, JP static offset
  // 0x155a7c (+0x2b04). Full 1150-entry table (27600 bytes) diffed
  // byte-for-byte identical between JP and this EU offset.
  signature: Buffer.from(
    "0000000000000000000000000000000000000000000000000a00050050c300000002be00000000000000000000410000",
    "hex",
  ),
  signatureOffset: 0,
};

const WEAPONS_GUNNER_EU: TableSignature = {
  // weaponsGunner (tables/weapons.ts) — first entry (28 bytes,
  // WEAPON_GUN_ENTRY_SIZE). Real EU offset 0x15f150, JP static offset
  // 0x15c64c (+0x2b04). Full 354-entry table (9912 bytes) diffed
  // byte-for-byte identical.
  signature: Buffer.from("0b0000000000000000000000000000000000000200000000ffffffff", "hex"),
  signatureOffset: 0,
};

const DECORATION_SKILLS_EU: TableSignature = {
  // decorationSkills (tables/decorations.ts) — first entry (16 bytes,
  // DECO_SKILL_ENTRY_SIZE), i.e. the hidden dummy slot readDecorationSkills()
  // skips. Real EU offset 0x175f98, JP static offset 0x173494 (+0x2b04).
  // Full 169-entry table (2704 bytes) diffed byte-for-byte identical.
  signature: Buffer.from("010f0000000000000000000000000000", "hex"),
  signatureOffset: 0,
};

const SHARPNESS_TABLE_EU: TableSignature = {
  // sharpnessTable (tables/sharpness.ts) — first entry (14 bytes,
  // SHARPNESS_ENTRY_SIZE). Real EU offset 0x1775c0, JP static offset
  // 0x174abc (+0x2b04). Full 40-entry table (560 bytes) diffed
  // byte-for-byte identical.
  signature: Buffer.from("50006e00dc0040017c01ae01c201", "hex"),
  signatureOffset: 0,
};

const MODEL_TO_WEAPON_TYPE_EU: TableSignature = {
  // modelToWeaponType (tables/weapons.ts) — first 16 bytes (16 u8 entries).
  // Real EU offset 0x176a3c, JP static offset 0x173f38 (+0x2b04). Full
  // 553-byte table diffed byte-for-byte identical.
  signature: Buffer.from("07000302020003040000000500010007", "hex"),
  signatureOffset: 0,
};

const EQUIPMENT_CREATE_EU: TableSignature = {
  // equipmentCreate (tables/recipes.ts) — first entry (26 bytes,
  // EQUIP_CREATE_ENTRY_SIZE), the hidden dummy slot at the very start of the
  // `head` armor section. Real EU offset 0x139dcc, JP static offset
  // 0x1372c8 (+0x2b04). The armor-related sections (head/chest/arm/waist/
  // leg, 2156 entries / 56056 bytes) diffed byte-for-byte identical — the
  // full multi-section table's exact total length isn't independently known
  // ahead of time (see tables/recipes.ts), so only that prefix was diffed,
  // not literally every later weapon-recipe section.
  signature: Buffer.from("0101fc004a010100000000000000000000000000000000000000", "hex"),
  signatureOffset: 0,
};

const EQUIPMENT_UPGRADE_EU: TableSignature = {
  // equipmentUpgrade (tables/recipes.ts) — first 2 entries (56 bytes,
  // EQUIP_UPGRADE_ENTRY_SIZE=28), i.e. the hidden dummy NullUpgrade[1] slot
  // plus blademaster weapon index 0. Real EU offset 0x14df5c, JP static
  // offset 0x14b458 (+0x2b04).
  signature: Buffer.from(
    "ff0000000000000000000000000000000000000000000000ff00000000000000000000000000000000000000000000000000000000000000",
    "hex",
  ),
  signatureOffset: 0,
};

const BOWGUN_SHOT_TABLE_EU: TableSignature = {
  // bowgunShotTable (eboot.hexpat's BowgunShots, 32 bytes/entry — no
  // reader/consumer in tables/*.ts today) — first entry, the full 32-byte
  // struct. Real EU offset 0x176cac, JP static offset 0x1741a8 (+0x2b04).
  signature: Buffer.from("0606090303030404040101010101010303030301030303010301030102020101", "hex"),
  signatureOffset: 0,
};

const BOW_CHARGE_TABLE_EU: TableSignature = {
  // bowChargeTable (eboot.hexpat's BowCharges, 4 bytes/entry — no
  // reader/consumer in tables/*.ts today) — first 2 entries (8 bytes). Real
  // EU offset 0x1773ec, JP static offset 0x1748e8 (+0x2b04).
  signature: Buffer.from("0000010600010206", "hex"),
  signatureOffset: 0,
};

const DUAL_ATTRIBUTE_WEAPONS_EU: TableSignature = {
  // dualAttributeWeapons (tables/dual-attributes.ts, eboot.hexpat's
  // WepValueDualAttr, 10 bytes/entry) — first 2 entries (20 bytes).
  // Real EU offset 0x177d0c, JP static offset 0x175208 (+0x2b04).
  signature: Buffer.from("630380000c000200080064038000100002001400", "hex"),
  signatureOffset: 0,
};

const DECORATION_VALUES_EU: TableSignature = {
  // decorationValues (tables/decorations.ts) — first entry (24 bytes,
  // ITEM_ENTRY_SIZE), same shift bucket as itemTable (unsurprising — this
  // table is literally itemTable's own tail past index 947, see
  // tables/items.ts). Real EU offset 0x1a102c, JP static offset 0x19e0cc
  // (+0x2f60). Full 169-entry table (4056 bytes) diffed byte-for-byte
  // identical.
  signature: Buffer.from("00000363002b040000000000900100002800000000000200", "hex"),
  signatureOffset: 0,
};

/**
 * bowgunModTable (eboot.hexpat's `BGModTable`) is, like `armorValuePointers`,
 * a table of *pointers* (`BGModLevel *ModType1[5] : u32`, four such 5-entry
 * pointer arrays) — confirmed against real JP bytes at its declared address
 * (first 4 u32s are plausible nearby vaddrs, e.g. `0x8976764`, close to but
 * before the table's own `0x8976944`; a naive whole-table content search
 * against EU found 0 matches, because pointer *values* differ by region
 * exactly like `armorValuePointers`' do). The actual pointed-to
 * `BGModLevel` data (a flat pool of 24-byte structs: 1 u32 + 5 floats) IS
 * region-independent raw content, so the same indirect technique used for
 * armor works here too: signature the target data pool directly, at the
 * vaddr the first pointer in the table resolves to, rather than the pointer
 * table's own declared address. Real EU offset 0x17781c, JP file offset for
 * the pool (`jpVaddrToOffset(0x8976764)`) 0x174d18 (+0x2b04). No
 * reader/consumer exists for this table in tables/*.ts, so this is a
 * validated reference example, not something wired into emit output.
 */
const BOWGUN_MOD_TABLE_POOL_EU: TableSignature = {
  signature: Buffer.from("000000003333333f3333b33f000000409a9989403d0ab73f", "hex"),
  signatureOffset: 0,
};

/**
 * Every table this pipeline can currently resolve for the EU disc by
 * content signature. Anything not listed here isn't supported yet —
 * `SignatureResolver.resolve()` throws a clear error naming the table
 * rather than guessing. `bowgunModTable`'s entry here resolves to the
 * pointed-to data pool's address, not `BGModTable`'s own declared address
 * (see doc comment above) — there is no reader that would consume this
 * distinction today, but it's the address a future reader would need.
 */
export const EU_TABLE_SIGNATURES: Readonly<Record<string, TableSignature>> = {
  weaponClassModifiers: WEAPON_CLASS_MODIFIERS_EU,
  itemTable: ITEM_TABLE_EU,
  equipmentDescriptions: EQUIPMENT_DESCRIPTIONS_EU,
  uiSpriteTable: UI_SPRITE_TABLE_EU,
  itemIconSpriteIndex: ITEM_ICON_SPRITE_INDEX_EU,
  itemColorPalette: ITEM_COLOR_PALETTE_EU,
  weaponsBlademaster: WEAPONS_BLADEMASTER_EU,
  weaponsGunner: WEAPONS_GUNNER_EU,
  decorationSkills: DECORATION_SKILLS_EU,
  sharpnessTable: SHARPNESS_TABLE_EU,
  modelToWeaponType: MODEL_TO_WEAPON_TYPE_EU,
  equipmentCreate: EQUIPMENT_CREATE_EU,
  equipmentUpgrade: EQUIPMENT_UPGRADE_EU,
  bowgunShotTable: BOWGUN_SHOT_TABLE_EU,
  bowChargeTable: BOW_CHARGE_TABLE_EU,
  dualAttributeWeapons: DUAL_ATTRIBUTE_WEAPONS_EU,
  decorationValues: DECORATION_VALUES_EU,
  bowgunModTable: BOWGUN_MOD_TABLE_POOL_EU,
};

/**
 * Per-armor-slot direct-array signatures for EU, keyed by
 * `tables/armor.ts`'s `ARMOR_SLOT_TABLE_NAMES` (NOT by `armorValuePointers`
 * — see that module's doc comment for why the pointer table itself isn't
 * signature-resolvable). Each is the slot's first 2 `ArmorValue` entries (80
 * bytes, ARMOR_ENTRY_SIZE=40), found by dereferencing JP's real
 * `armorValuePointers` table once (via `readPointer()` +
 * `JP_BASE_ADDRESS`) to get each array's known-good JP address, then
 * applying the same signature process as every other table above. All 5
 * real EU offsets found a +0x2b04 shift, the same bucket as most other
 * tables; every array's entire content was diffed byte-for-byte identical
 * between JP and the resolved EU offset.
 *
 * Keyed by the slot each array really holds, which is not the slot
 * eboot.hexpat's pointer order labels it with (see `ARMOR_POINTER_INDEX` in
 * `tables/armor.ts`). These were first recorded under the hexpat labels,
 * one slot off: the bytes below are unchanged, only the keys moved.
 */
export const ARMOR_SLOT_TABLE_NAMES_EU: Readonly<Record<string, TableSignature>> = {
  armorValuesHead: {
    // helmets, 436 entries; entry 1 is Leather Helm.
    // Real EU offset 0x161808, JP array base 0x15ed04 (+0x2b04).
    signature: Buffer.from(
      "000000000f00000000000000000000000000000000000000000000000000000000000000000000000f0011000f0000002c0100000202000000000100060b0e0e13131c0002003402130229013c0244fe",
      "hex",
    ),
    signatureOffset: 0,
  },
  armorValuesChest: {
    // chest plates, 420 entries; entry 1 is Leather Armor.
    // Real EU offset 0x165c28, JP array base 0x163124 (+0x2b04).
    signature: Buffer.from(
      "000000000f0000000000000000000000000000000000000000000000000000000000000000000000060024000f0000002c0100000202000000000000060b0e0e13131c0002003402130229023b0244ff",
      "hex",
    ),
    signatureOffset: 0,
  },
  armorValuesArm: {
    // gauntlets, 411 entries; entry 1 is Leather Vambraces.
    // Real EU offset 0x169dc8, JP array base 0x1672c4 (+0x2b04).
    signature: Buffer.from(
      "000000000f0000000000000000000000000000000000000000000000000000000000000000000000060023000f0000002c0100000202000000000100060b0e0e13131c0002003403130229023d020000",
      "hex",
    ),
    signatureOffset: 0,
  },
  armorValuesWaist: {
    // waist, 409 entries; entry 1 is Leather Belt.
    // Real EU offset 0x16de00, JP array base 0x16b2fc (+0x2b04).
    signature: Buffer.from(
      "000000000f0000000000000000000000000000000000000000000000000000000000000000000000060019000f0000002c0100000202000000000000060b0e0e13131c0003003403130229013b0344fe",
      "hex",
    ),
    signatureOffset: 0,
  },
  armorValuesLeg: {
    // leggings, 420 entries; entry 1 is Green Pants.
    // Real EU offset 0x171de8, JP array base 0x16f2e4 (+0x2b04).
    signature: Buffer.from(
      "000000000f000000000000000000000000000000000000000000000000000000000000000000000006001a000f0000002c0100000202000000000100060b0e0e13131c0002003403130229023d020000",
      "hex",
    ),
    signatureOffset: 0,
  },
};

/**
 * Everything `MHP2G_EU_RESOLVER` (games/mhp2g.ts) resolves — the flat table
 * signatures plus the per-slot armor signatures merged in under their own
 * synthetic table names, so a single `SignatureResolver` instance can
 * answer both `resolver.resolve("weaponsBlademaster", buf)` and
 * `resolver.resolve("armorValuesHead", buf)`.
 */
export const EU_ALL_SIGNATURES: Readonly<Record<string, TableSignature>> = {
  ...EU_TABLE_SIGNATURES,
  ...ARMOR_SLOT_TABLE_NAMES_EU,
};
