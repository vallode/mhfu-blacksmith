/**
 * Item struct reader for `itemTable` @ 0x0899A238.
 *
 * Unlike the other tables in this directory, this struct is not documented
 * in `eboot.hexpat` (it has no named `ItemValue`/`ItemValues` declaration) —
 * its address, entry size, and count come from `verifyOffsets()`'s
 * `decorationValues == itemTable + 948 * ITEM_ENTRY_SIZE` invariant (which
 * *is* in the pattern), combined with reading raw bytes off a real EBOOT and
 * noticing the field layout that falls out is byte-for-byte identical to
 * `DecoValues`/`DecorationValue` (tables/decorations.ts) — unsurprising once
 * you realize `decorationValues` is just this same array's tail past index
 * 947. Confirmed plausible against real, known MHFU items (e.g. index 7 has
 * stackLimit=10, matching Potion's real in-game carry limit; a run of six
 * entries starting at index 1 has round, strictly-increasing prices 1000 →
 * 20000, matching "Book of Combos 1..5" + "Alchemy Guide").
 *
 * Field names/meanings are consequently lower-confidence than the
 * hexpat-transcribed tables — `iconDeco`/`iconId`/`color` in particular are
 * named for their role in DecorationValue and may mean something different
 * (or nothing) for a non-decoration item; kept as raw fields for the emit
 * layer to interpret rather than guessing further here.
 */
import { BinaryReader } from "../binary/reader.js";
import { ITEM_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "./offsets.js";

export interface ItemEntry {
  /** Index into itemTable, and into ItemID for name lookup. */
  index: number;
  unkn1: number;
  rarity: number;
  /** Max carry/stack limit — matches known real values for the few items checked (e.g. Potion = 10). */
  stackLimit: number;
  iconDeco: number;
  iconId: number;
  color: number;
  unkn2: number;
  unkn3: number;
  price: number;
  unkn4: number;
  unkn5: number;
  unkn6: number;
  skillTblId: number;
}

/** itemTable[948] @ 0x0899A238 — 24 bytes/entry, same layout as DecorationValue. */
export function readItemTable(reader: BinaryReader): ItemEntry[] {
  const base = tableOffset("itemTable");
  const out: ItemEntry[] = [];
  for (let i = 0; i < TABLE_COUNTS.regularItems; i++) {
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
