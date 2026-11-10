/**
 * Breakable monster parts, read from the EU disc (vallode/mhfu-blacksmith#121).
 *
 * The break reward tables (`capbreakindex`, `rewards.ts`) number each
 * monster's breaks; these say which body part each number belongs to. Body
 * parts are the numbers the hurtbox capsules carry (`collision.ts` `part`),
 * and each has a flinch counter (`monster + 0x582 + part * 8`).
 *
 * **The break table** (`game_task.ovl`, right after the per-monster part
 * durability records that `emChunk` `+0x1B4` points to): 0x20-byte records,
 * up to one with emID 0:
 *   0x00 u8  emID (matched by species, see below)
 *   0x01 u8  body part
 *   0x02 u8  flinch count at which the break happens
 *   0x03 u8  1: switch to the broken hitzone table (Gravios, Basarios)
 *   0x04 s16 joint the break effect plays at (-1: none)
 *   0x06 u16 break number (`capbreakindex` type), 0xFFFF for a visual break
 *            with no reward
 *   0x10 f32[4] effect offset from the joint
 * `game_task` `0x09AD4940` (EU) walks it each time a part flinches and calls
 * `0x09AD7F48`, which sets the break's bit in the monster (`+0x774`) and in
 * the quest's per-monster byte (`+0x5C2 + emID`); the EBOOT's reward code
 * gives the `capbreakindex` reward for each bit set there.
 *
 * **Species**: a record's emID is compared to the hunted monster's through
 * an EBOOT table of 90 pointers to 4-byte records whose first byte is the
 * species (Pink and Gold Rathian are species 1, Rathian), so subspecies use
 * their base species' records.
 *
 * The rest of the breaks are set in each species' own code; those are in
 * `overlay/breaks.json`.
 */
import type { BinaryReader } from "../binary/reader.js";
import type { OvlFile } from "../container/ovl.js";
import {
  FLINCH_THRESHOLD_POINTER_OFFSET,
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
} from "./hitzones.js";

/** `emChunk` `+0x1B4`: the per-monster flinch threshold record (`PartDurabilityPTR`, `hitzones.ts`). */
export const PART_DURABILITY_POINTER_OFFSET = FLINCH_THRESHOLD_POINTER_OFFSET;
export const PART_DURABILITY_RECORD_SIZE = 0x18;
export const BREAK_RECORD_SIZE = 0x20;
const NO_BREAK = 0xffff;
/** Sanity limit: the EU disc has 60. */
const MAX_BREAK_RECORDS = 256;
/** Sanity limits on a record's fields. */
const MAX_BODY_PART = 16;
const MAX_FLINCHES = 16;

export interface BreakRecord {
  emId: number;
  part: number;
  flinches: number;
  /** Switches the monster to its broken hitzone table. */
  brokenHitzones: boolean;
  /** Joint the break effect plays at, or null. */
  joint: number | null;
  /** `capbreakindex` break type, or null for a visual break with no reward. */
  breakType: number | null;
}

/**
 * File offset of the break table: right after the last part durability
 * record any chunk points to. Null if no chunk points into the overlay.
 */
export function locateBreakTable(gameTask: OvlFile, chunksOffset: number): number | null {
  let last = -1;
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const pointer = gameTask.reader.u32(
      chunksOffset + emId * MONSTER_CHUNK_SIZE + PART_DURABILITY_POINTER_OFFSET,
    );
    if (gameTask.isOwnVaddr(pointer)) last = Math.max(last, gameTask.vaddrToOffset(pointer));
  }
  return last < 0 ? null : last + PART_DURABILITY_RECORD_SIZE;
}

/** Reads break records up to the one with emID 0. Null if a record is out of range. */
export function readBreakTable(gameTask: OvlFile, offset: number): BreakRecord[] | null {
  const r = gameTask.reader;
  const records: BreakRecord[] = [];
  for (let at = offset; records.length < MAX_BREAK_RECORDS; at += BREAK_RECORD_SIZE) {
    if (at + BREAK_RECORD_SIZE > r.length) return null;
    const emId = r.u8(at);
    if (emId === 0) return records;
    const part = r.u8(at + 1);
    const flinches = r.u8(at + 2);
    const flag = r.u8(at + 3);
    if (emId >= MONSTER_CHUNK_COUNT || part >= MAX_BODY_PART || flinches > MAX_FLINCHES || flag > 1)
      return null;
    const joint = r.s16(at + 4);
    const breakType = r.u16(at + 6);
    records.push({
      emId,
      part,
      flinches,
      brokenHitzones: flag === 1,
      joint: joint < 0 ? null : joint,
      breakType: breakType === NO_BREAK ? null : breakType,
    });
  }
  return null;
}

/**
 * Finds the EBOOT's emID -> species table: 90 consecutive u32 pointers to
 * records whose first byte is the species. Most monsters are their own
 * species, so the table is the run of 90 pointers into the EBOOT where the
 * most records start with their own emID. Returns each emID's species, or
 * null if no run has a majority.
 */
export function readSpeciesTable(eboot: BinaryReader, baseAddress: number): number[] | null {
  const length = eboot.length;
  const byteAt = (vaddr: number): number | null => {
    const offset = vaddr - baseAddress;
    return offset >= 0 && offset < length ? eboot.u8(offset) : null;
  };
  let best: { at: number; score: number } | null = null;
  for (let at = 0; at + MONSTER_CHUNK_COUNT * 4 <= length; at += 4) {
    // Quick reject: emID 1's record (Rathian) must say species 1.
    if (byteAt(eboot.u32(at + 4)) !== 1) continue;
    let score = 0;
    for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
      const species = byteAt(eboot.u32(at + emId * 4));
      if (species === null || species >= MONSTER_CHUNK_COUNT) {
        score = -1;
        break;
      }
      if (species === emId) score++;
    }
    if (score > (best?.score ?? MONSTER_CHUNK_COUNT / 2)) best = { at, score };
  }
  if (!best) return null;
  const table = best.at;
  return Array.from({ length: MONSTER_CHUNK_COUNT }, (_, emId) =>
    byteAt(eboot.u32(table + emId * 4))!,
  );
}
