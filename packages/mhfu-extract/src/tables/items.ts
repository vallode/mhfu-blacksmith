/**
 * Item struct reader for `itemTable` @ 0x0899A238: one 24-byte entry per
 * ItemID, 0 ("None") through 1260.
 *
 * Unlike the other tables in this directory, this struct is not documented
 * in `eboot.hexpat` (it has no named `ItemValue`/`ItemValues` declaration) —
 * its address and entry size come from `verifyOffsets()`'s
 * `decorationValues == itemTable + 948 * ITEM_ENTRY_SIZE` invariant (which
 * *is* in the pattern), combined with reading raw bytes off a real EBOOT and
 * noticing the field layout that falls out is byte-for-byte identical to
 * `DecoValues`/`DecorationValue` (tables/decorations.ts) — unsurprising once
 * you realize `decorationValues` is just this same array's entries 948–1116.
 * The array goes on past the decorations, through the last ItemID (1260):
 * on the EU disc entries 1117–1260 hold the treasure, Felyne and arena
 * items' rarity, carry limit and price, and entry 1261 is unrelated data.
 *
 * Checked against the EU disc: `rarity` + 1 equals the community item
 * lists' rarity on 1016 of 1017 items they have it for (the other,
 * DragonslyrJewel, matches `data/decorations.json`); `stackLimit` is Potion
 * 10, Whetstone 20, Pierce S Lv1 60, materials 99; `price` is the general
 * store's buy price (Herb 20z, Potion 66z, Whetstone 80z). The u32 at +16
 * is a tenth of `price` on items that can be sold (Herb 2, Rathalos Ruby
 * 9700) and 0 on the rest, likely the sell price; not confirmed on screen.
 *
 * `iconId` is the item's icon shape and `color` its tint, on every item
 * (`tables/item-icons.ts` has what they index): each potion is 24, each ore
 * 27, each fang 31; Dragonite Ore is green and Eltalite Ore red. `iconDeco`
 * is named for its role in DecorationValue; on other items its bits are
 * set on groups such as cooked meat and fish (1) and the charms (32), with
 * no known meaning.
 */
import { BinaryReader } from "../binary/reader.js";
import { ITEM_ENTRY_SIZE, TABLE_COUNTS, resolveTableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

export interface ItemEntry {
  /** Index into itemTable, and into ItemID for name lookup. */
  index: number;
  unkn1: number;
  /** 0-based, like every equipment table's (`emit/common.ts` `displayRarity`). */
  rarity: number;
  /** Carry limit: Potion 10, Whetstone 20, most materials 99; 255 on Normal S Lv1, which is unlimited. */
  stackLimit: number;
  iconDeco: number;
  iconId: number;
  color: number;
  unkn2: number;
  unkn3: number;
  /** Price in zenny; for items the shops sell, their buy price. */
  price: number;
  unkn4: number;
  unkn5: number;
  unkn6: number;
  skillTblId: number;
}

/**
 * itemTable[1261] @ 0x0899A238 — 24 bytes/entry, same layout as
 * DecorationValue, indexed by ItemID. `resolver` defaults to JP's static
 * table — pass e.g. `MHP2G_EU_RESOLVER` (games/mhp2g.ts) to read from a
 * different region.
 */
export function readItemTable(reader: BinaryReader, resolver?: TableAddressResolver): ItemEntry[] {
  const base = resolveTableOffset("itemTable", reader, resolver);
  const out: ItemEntry[] = [];
  for (let i = 0; i < TABLE_COUNTS.items; i++) {
    const off = base + i * ITEM_ENTRY_SIZE;
    out.push({
      index: i,
      unkn1: reader.u16(off + 0),
      rarity: reader.u8(off + 2),
      stackLimit: reader.u8(off + 3),
      iconDeco: reader.u8(off + 4),
      iconId: reader.u8(off + 5),
      color: reader.u8(off + 6),
      unkn2: reader.u8(off + 7),
      unkn3: reader.u32(off + 8),
      price: reader.u32(off + 12),
      unkn4: reader.u16(off + 16),
      unkn5: reader.u16(off + 18),
      unkn6: reader.u16(off + 20),
      skillTblId: reader.u16(off + 22),
    });
  }
  return out;
}
