/**
 * Monster attack records (vallode/mhfu-blacksmith#122). Found on the EU
 * disc by searching for the Monster Hunter Wiki's damage, stun and guard
 * knockback per attack (`overlay/attack-crib.json`): 27 of the 32 monsters
 * whose attacks turned up agree on one layout, the same 24 bytes as the
 * player's `PlayerMotVal` (`vendor/mhp2g-patterns/patterns/game_task.hexpat`):
 *
 *   +0x02 u8 damage            (PlayerMotVal: MotionValue)
 *   +0x03 u8 reaction?         (KnockbackStrength: 1, 2, 3, 5, ...)
 *   +0x07 u8 0xE0 in nearly every record (0xF4, 0xC0 in a few)
 *   +0x08 u8 guard knockback
 *   +0x09 u8 element bits      (DamageType: 1 plain, 5 Lavasioth's fire,
 *                               0x81 Blangonga's ice, 0x21 Yama Tsukami's)
 *   +0x0A u8 index?            (varies within a table)
 *   +0x0D u8 status?, +0x0E its value (Blangonga's Snow Breath: 2, 10)
 *   +0x10 u8 0, 1 or 5
 *   +0x14 u8 stun              (KO)
 *
 * The tables have no pointer to them in the monster chunks; they sit in the
 * monster's own `overlay/emNN.ovl`, or in `game_task.ovl` for monsters
 * without one, several back to back. So they are found by shape: runs of
 * records whose always-zero bytes are zero and whose +0x07 has its top two
 * bits set (`isAttackRecord`).
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

export interface AttackRecord {
  damage: number;
  reaction: number;
  guard: number;
  element: number;
  index: number;
  status: number;
  statusValue: number;
  stun: number;
}

export function readAttackRecord(reader: BinaryReader, at: number): AttackRecord {
  return {
    damage: reader.u8(at + 0x02),
    reaction: reader.u8(at + 0x03),
    guard: reader.u8(at + 0x08),
    element: reader.u8(at + 0x09),
    index: reader.u8(at + 0x0a),
    status: reader.u8(at + 0x0d),
    statusValue: reader.u8(at + 0x0e),
    stun: reader.u8(at + 0x14),
  };
}
