/**
 * Quest stat multiplier tables in `game_task.ovl` (vallode/mhfu-blacksmith#35).
 *
 * A quest's large-monster entry carries a `power` byte (0-31). It selects a
 * row of 4 floats: HP, attack, defense (lower means less damage taken) and a
 * fourth that is 1.0 in low rank and rises to 2.3-2.5 in G rank. HP
 * multiplies the chunk's base HP (`hitzones.ts`); the fourth multiplies the
 * parts' flinch thresholds when the game refills them (EU `0x09AD3B88`,
 * `readFlinchThresholds`), and maybe more.
 *
 * The rows come in tables of 32 (512 bytes), three tables to a set, and the
 * sets are reached from one master list:
 *
 *   master list: u32 pointers to sets (4 on the EU disc)
 *   set:         u32 pointers to 3 tables (some sets repeat one table)
 *   table:       32 rows x { f32 hp, attack, defense, status }
 *
 * The tables follow the hitzone pool, each set's pointer list right after
 * its tables. On the EU disc the master list is at 0x168c80 and the first
 * set's first table at 0x167c40. Set 1's first row is HP 0.35 / attack
 * 1.02, which matches a published figure for the first Village Elder quest.
 * Which set a quest uses follows its header `rank` byte: 0 -> set 0
 * (Training School Basic/Mastery quests, the two Village Tigrex quests and
 * the Guild's ★1/★2 quests `1`-`10` and `101`-`109`), 1/2/5 (the low/high/G rank tier, on both the Village and Guild boards)
 * -> set 1, 3 (Treasure Hunting) -> set 2, 4 (Subjugation Training) ->
 * set 3. The board itself comes from the quest ID (`questHub` in
 * src/emit/quests.ts). Sets 2 and 3 hold real values exactly on the rows
 * those quests use (0-11 and 0-18; filler 1.0 after), and set 1
 * is the harder one (G rows: HP 1.75-2.1, attack 3.5-3.8, status 2.3-2.4,
 * against set 0's 1.5-1.6, 2.0-2.7, 1.0). Which of a set's three tables
 * applies isn't stored in the quest: `attr1`/`attr2` are almost always 0
 * and no header field varies with them. Set 0's first two tables are
 * identical; set 1's differ mostly in HP, which looks like a mode chosen at
 * run time. So the tables are dumped (`extract --raw`) but not attached to
 * quests or written to `data/`.
 */
import type { OvlFile } from "../container/ovl.js";

export const MULTIPLIER_ROWS = 32;
export const MULTIPLIER_ROW_SIZE = 16;
export const TABLES_PER_SET = 3;

export interface MultiplierRow {
  hp: number;
  attack: number;
  defense: number;
  /** 1.0 in low rank, 2.3-2.5 in G rank; scales flinch thresholds (and maybe more). */
  status: number;
}

export interface MultiplierTable {
  /** vaddr of the table (sets can share one). */
  pointer: number;
  rows: MultiplierRow[];
}

export interface MultiplierSet {
  pointer: number;
  tables: MultiplierTable[];
}

export interface MultiplierTables {
  /** File offset of the master list. */
  offset: number;
  sets: MultiplierSet[];
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const plausible = (x: number) => Number.isFinite(x) && x >= 0.05 && x <= 20;

/** Reads a 32-row table at `vaddr`, or null if any value isn't a plausible multiplier. */
export function readMultiplierTable(ovl: OvlFile, vaddr: number): MultiplierTable | null {
  if (!ovl.isOwnVaddr(vaddr)) return null;
  const at = ovl.vaddrToOffset(vaddr);
  if (at + MULTIPLIER_ROWS * MULTIPLIER_ROW_SIZE > ovl.reader.length) return null;
  const rows: MultiplierRow[] = [];
  for (let i = 0; i < MULTIPLIER_ROWS; i++) {
    const [hp, attack, defense, status] = [0, 4, 8, 12].map((f) =>
      ovl.reader.f32(at + i * MULTIPLIER_ROW_SIZE + f),
    ) as [number, number, number, number];
    if (![hp, attack, defense, status].every(plausible)) return null;
    rows.push({
      hp: round(hp),
      attack: round(attack),
      defense: round(defense),
      status: round(status),
    });
  }
  return { pointer: vaddr, rows };
}

/** u32 pointers into the overlay starting at `offset`, up to the first that isn't one. */
function pointerList(ovl: OvlFile, offset: number, max: number): number[] {
  const out: number[] = [];
  for (let at = offset; at + 4 <= ovl.reader.length && out.length < max; at += 4) {
    const v = ovl.reader.u32(at);
    if (!ovl.isOwnVaddr(v)) break;
    out.push(v);
  }
  return out;
}

function readSet(ovl: OvlFile, pointer: number): MultiplierSet | null {
  const tables = pointerList(ovl, ovl.vaddrToOffset(pointer), TABLES_PER_SET + 1);
  if (tables.length !== TABLES_PER_SET) return null;
  const read = tables.map((t) => readMultiplierTable(ovl, t));
  if (read.some((t) => t === null)) return null;
  return { pointer, tables: read as MultiplierTable[] };
}

/** Finds the master list: the pointer list whose every entry is a set; the one with the most sets wins. */
export function locateMultiplierTables(ovl: OvlFile): MultiplierTables | null {
  let best: MultiplierTables | null = null;
  const r = ovl.reader;
  for (let at = 0x80; at + 4 <= r.length; at += 4) {
    if (!ovl.isOwnVaddr(r.u32(at))) continue;
    // Only the start of a list.
    if (ovl.isOwnVaddr(r.u32(at - 4))) continue;
    const entries = pointerList(ovl, at, 16);
    if (entries.length < 2 || entries.length <= (best?.sets.length ?? 1)) continue;
    const sets = entries.map((p) => readSet(ovl, p));
    if (sets.some((s) => s === null)) continue;
    best = { offset: at, sets: sets as MultiplierSet[] };
  }
  return best;
}
