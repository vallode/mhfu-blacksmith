/**
 * The Veggie Elder's trades in `game_task.ovl` (`VeggieTradeTable` in the
 * vendored `game_task.hexpat`, which puts it at JP `0x09BD2E58`): seven
 * tables of 6-byte rows, u16 item to give, u16 common trade and u16 rare
 * trade, each ending in a 0xFFFF u16. Every table has 109 rows on the EU
 * and JP discs; on the EU disc the tables sit 0x110 bytes past the JP file offset, as the
 * monster chunks do (`monsters/hitzones.ts`).
 *
 * How the game uses them (EU `game_task`):
 *
 * - `0x09AFBF28` picks the table by the hunting ground's map ID (the
 *   quest's `map`, `quest-maps.ts`): `TRADE_TABLE_MAPS`. Every other map
 *   has none, so the Elder only trades on these.
 * - The trade (`0x09AFA308` on) walks the table and takes the first row
 *   whose item the hunter carries. It gives the rare trade if the Felyne
 *   Negotiations kitchen skill is on (skill 3 in the active skill list,
 *   EBOOT `0x088D6A54`; the skill's own text says the Veggie Elders will
 *   give nice items), else on `rand() % 100 < 20`, else the common trade.
 *   If the trade can't be given (an EBOOT check on the reward, likely room
 *   to carry it) it moves on to the next row the hunter has an item for.
 */
import type { OvlFile } from "../container/ovl.js";
import { GAME_TASK_JP } from "../monsters/hitzones.js";
import { ITEM_COUNT } from "../shops/shops.js";

export const VEGGIE_TRADES_JP = 0x09bd2e58;
export const TRADE_ROW_SIZE = 6;
export const TRADE_TABLE_COUNT = 7;
export const TRADE_END = 0xffff;
/** In percent: the roll that gives the rare trade without Felyne Negotiations. */
export const RARE_TRADE_CHANCE = 20;

/** Each table's map IDs (Day, then Night where the map has both). */
export const TRADE_TABLE_MAPS: readonly (readonly number[])[] = [
  [2, 16], // Forest and Hills
  [3, 17], // Desert
  [4, 18], // Swamp
  [6, 20], // Jungle
  [11, 21], // Snowy Mountains
  [26], // Old Jungle
  [28], // Old Swamp
];

export interface VeggieTrade {
  /** File offset of the row. */
  offset: number;
  give: number;
  common: number;
  rare: number;
}

export interface VeggieTrades {
  /** File offset of the first table. */
  offset: number;
  /** Shift from JP's file offset. */
  shift: number;
  tables: VeggieTrade[][];
}

/** No table should come near this; it bounds the walk on a bad offset. */
const MAX_ROWS = 512;
const isItem = (id: number) => id > 0 && id < ITEM_COUNT;

/**
 * The tables at `offset`, or null unless all seven are well-formed, follow
 * each other and are the same length (the hexpat's fixed `[109]` arrays).
 * The length check keeps item-like bytes before the first table from
 * passing as extra rows of it.
 */
function readTablesAt(ovl: OvlFile, offset: number): VeggieTrade[][] | null {
  const { reader } = ovl;
  const tables: VeggieTrade[][] = [];
  let at = offset;
  for (let t = 0; t < TRADE_TABLE_COUNT; t++) {
    const rows: VeggieTrade[] = [];
    for (;;) {
      if (at < 0 || at + 2 > reader.length || rows.length > MAX_ROWS) return null;
      const give = reader.u16(at);
      if (give === TRADE_END) break;
      if (at + TRADE_ROW_SIZE > reader.length) return null;
      const common = reader.u16(at + 2);
      const rare = reader.u16(at + 4);
      if (!isItem(give) || !isItem(common) || !isItem(rare)) return null;
      rows.push({ offset: at, give, common, rare });
      at += TRADE_ROW_SIZE;
    }
    if (rows.length === 0 || rows.length !== (tables[0] ?? rows).length) return null;
    tables.push(rows);
    at += 2;
  }
  return tables;
}

/**
 * Finds the tables in a `game_task.ovl` of any region: the nearest shift
 * of JP's file offset (in steps of a u16) where all seven read cleanly.
 */
export function readVeggieTrades(ovl: OvlFile, range = 0x1000): VeggieTrades | null {
  const jp = VEGGIE_TRADES_JP - GAME_TASK_JP.loadBase;
  for (let d = 0; d <= range; d += 2) {
    for (const shift of d === 0 ? [0] : [d, -d]) {
      const tables = readTablesAt(ovl, jp + shift);
      if (tables) return { offset: jp + shift, shift, tables };
    }
  }
  return null;
}
