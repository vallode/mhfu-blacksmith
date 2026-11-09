/**
 * Monster attack records (vallode/mhfu-blacksmith#122). Found on the EU
 * disc by searching for the Monster Hunter Wiki's damage, stun and guard
 * knockback per attack (`overlay/attack-crib.json`): 27 of the 32 monsters
 * whose attacks turned up agree on one layout, the same 24 bytes as the
 * player's `PlayerMotVal` (`vendor/mhp2g-patterns/patterns/game_task.hexpat`):
 *
 *   +0x02 u8 damage            (PlayerMotVal: MotionValue)
 *   +0x03 u8 reaction?         (KnockbackStrength: 2 and 1 in most records)
 *   +0x07 u8 0xE0 in nearly every record (0xF4, 0xC0 in a few)
 *   +0x08 u8 guard knockback
 *   +0x09 u8 element bits      (DamageType, `ELEMENT_BITS`; bit 0 is set in
 *                               all but 3 of the 1,112 records)
 *   +0x0A u8 index?            (varies within a table)
 *   +0x0C u8, +0x0D u8 status bits (EffectonHit1/2, `STATUS_BITS`), and
 *   +0x0E u8 the status's value (Rathian's Backflip: poison 25)
 *   +0x10 u8 0, 1 or 5
 *   +0x14 u8 stun              (KO)
 *
 * The element and status bits are named by the wiki's elements and statuses
 * for the records whose numbers match one of its attacks.
 *
 * The tables have no pointer to them in the monster chunks; they sit in the
 * monster's own `overlay/emNN.ovl`, or in `game_task.ovl` for monsters
 * without one. A table is not one monster's: monsters sharing a skeleton
 * share one (Diablos and Monoblos in `em14.ovl`, Gravios and Basarios in
 * `em17.ovl`), and `game_task.ovl`'s mix small monsters with large. So they
 * are found by shape: runs of records whose always-zero bytes are zero and
 * whose +0x07 has its top two bits set (`isAttackRecord`).
 *
 * How the game reaches them (fifth EU run): each table is followed by a
 * struct whose first word points at the table. A shell (attack hit) is
 * given that struct by its setup code, which calls one `game_task.ovl`
 * function (`0x09b674c0` on the EU disc) with the struct's address; it
 * keeps it at `+0xC8` and copies the record at `table + index * 24`, the
 * index being the shell's byte `+0x0D`, into the shell at `+0x1C`
 * (`0x09b674d0` sets another index later). The pointer gives each table's
 * true start: record 0, which the shape test misses, is part of it, and a
 * table the shape test splits is one table (`boundTables`).
 */
import type { BinaryReader } from "../binary/reader.js";

export const ATTACK_RECORD_SIZE = 24;
/** Shortest run of records taken as a table. */
export const MIN_TABLE_RECORDS = 4;
/** Tables seen so far start on 8-byte boundaries; 4 leaves room. */
const SCAN_ALIGN = 4;

/** Bytes that were zero in all 691 records the first search saw. */
const ZERO_BYTES = [0x04, 0x11, 0x13, 0x15, 0x17];

/** True if the 24 bytes at `at` look like an attack record. */
export function isAttackRecord(buf: Buffer, at: number): boolean {
  if (at < 0 || at + ATTACK_RECORD_SIZE > buf.length) return false;
  for (const z of ZERO_BYTES) if (buf[at + z] !== 0) return false;
  return (buf[at + 0x07]! & 0xc0) === 0xc0 && buf[at + 0x10]! <= 5;
}

export interface AttackTableRun {
  /** File offset of the first record. */
  offset: number;
  count: number;
}

/** Every run of at least `MIN_TABLE_RECORDS` consecutive attack records in `buf`. */
export function findAttackTables(buf: Buffer): AttackTableRun[] {
  const runs: AttackTableRun[] = [];
  for (let at = 0; at + ATTACK_RECORD_SIZE <= buf.length;) {
    let count = 0;
    while (isAttackRecord(buf, at + count * ATTACK_RECORD_SIZE)) count++;
    if (count >= MIN_TABLE_RECORDS) {
      runs.push({ offset: at, count });
      at += count * ATTACK_RECORD_SIZE;
    } else {
      at += SCAN_ALIGN;
    }
  }
  return runs;
}

export interface AttackTable extends AttackTableRun {
  /**
   * File offset of the struct after the table whose first word points at
   * its start, when there is one; the table then runs from that pointer to
   * the struct.
   */
  struct?: number;
}

/**
 * The tables in `buf` (an overlay loaded at `loadBase`): each run of records
 * followed by a pointer to a start at or before it, on a record boundary,
 * becomes the table from that start to the pointer; runs inside it are
 * merged into it. Runs without such a pointer stay as found.
 */
export function boundTables(buf: Buffer, loadBase: number): AttackTable[] {
  const runs = findAttackTables(buf);
  const bound: AttackTable[] = [];
  for (const run of runs) {
    const end = run.offset + run.count * ATTACK_RECORD_SIZE;
    if (end + 4 > buf.length) continue;
    const start = buf.readUInt32LE(end) - loadBase;
    if (start < 0 || start > run.offset || (end - start) % ATTACK_RECORD_SIZE !== 0) continue;
    bound.push({ offset: start, count: (end - start) / ATTACK_RECORD_SIZE, struct: end });
  }
  const inside = (run: AttackTableRun) =>
    bound.some(
      (t) =>
        run.offset >= t.offset &&
        run.offset + run.count * ATTACK_RECORD_SIZE <= t.offset + t.count * ATTACK_RECORD_SIZE,
    );
  return [...bound, ...runs.filter((run) => !inside(run))].sort((a, b) => a.offset - b.offset);
}

/** +0x09 bits, matched against the wiki's elements on the EU disc. */
export const ELEMENT_BITS: Record<number, string> = {
  0x04: "fire",
  0x10: "water",
  0x20: "dragon",
  0x40: "thunder",
  0x80: "ice",
};

/** +0x0C and +0x0D bits (as `0x0C | 0x0D << 8`), matched against the wiki's statuses. */
export const STATUS_BITS: Record<number, string> = {
  0x0001: "sleep",
  0x0002: "poison",
  0x0004: "paralysis",
  0x0200: "snowman",
  0x0400: "soiled",
  0x1000: "defense down",
};

/** Names of the bits set in `value`; bits without a name as hex. */
function bitNames(value: number, names: Record<number, string>, ignore = 0): string[] {
  const out: string[] = [];
  for (let bit = 1; bit <= value; bit <<= 1) {
    if (!(value & bit) || bit & ignore) continue;
    out.push(names[bit] ?? `0x${bit.toString(16)}`);
  }
  return out;
}

export interface AttackRecord {
  damage: number;
  reaction: number;
  guard: number;
  /** The +0x09 byte, and its element bits by name (bit 0 left out). */
  elementBits: number;
  elements: string[];
  index: number;
  /** +0x0C and +0x0D, as `0x0C | 0x0D << 8`, and their names. */
  statusBits: number;
  statuses: string[];
  statusValue: number;
  stun: number;
}

export function readAttackRecord(reader: BinaryReader, at: number): AttackRecord {
  const elementBits = reader.u8(at + 0x09);
  const statusBits = reader.u8(at + 0x0c) | (reader.u8(at + 0x0d) << 8);
  return {
    damage: reader.u8(at + 0x02),
    reaction: reader.u8(at + 0x03),
    guard: reader.u8(at + 0x08),
    elementBits,
    elements: bitNames(elementBits, ELEMENT_BITS, 0x01),
    index: reader.u8(at + 0x0a),
    statusBits,
    statuses: bitNames(statusBits, STATUS_BITS),
    statusValue: reader.u8(at + 0x0e),
    stun: reader.u8(at + 0x14),
  };
}
