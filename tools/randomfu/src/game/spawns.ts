/**
 * A quest's monster spawns, with the file offset of every record, so they
 * can be edited in place. The layout is mhfu-extract's `quests/parser.ts`
 * (from `quest.hexpat`):
 *
 *   LargeMonTable[] @ header.largeMonPtr, 16 bytes, until a u16 0:
 *     +8  u32 emLgIDLPTR, the preload list: { u16 emID, u16 0 } until -1
 *     +12 u32 emLgDataPTR: LargeMonData[], 60 bytes, until emID -1
 *   SmallMonIndex[] @ header.smallMonPtr: u32 pointers, until a u16 0,
 *     each to SmallMonTable[] (16 bytes, until a u32 0) whose +12 points
 *     to SmallMonData[] (60 bytes, until emID 0xFFFF)
 *
 *   Large/SmallMonData: +0 u16 emID, +4 u8 quantity, +5 u8 power, ...
 *
 * Records reached twice (tables sharing a list) are listed once.
 */
import type { QuestHeader } from "../../../mhfu-extract/src/quests/parser.js";

export const MON_DATA_SIZE = 60;
export const QUANTITY_OFFSET = 4;
export const POWER_OFFSET = 5;
/** `questHeader.TargetID`: the quest's main target, by emID. */
export const TARGET_ID_OFFSET = 112;

const END = 0xffff;
/** No real list comes close; stops runaway reads of a damaged file. */
const MAX_ENTRIES = 256;

export interface Spawn {
  /** Offset of the record in the quest payload. */
  offset: number;
  monsterId: number;
  quantity: number;
  power: number;
}

export interface QuestSpawns {
  large: Spawn[];
  /** Large monster preload entries (`emLoadTable`): offset and emID. */
  loads: { offset: number; monsterId: number }[];
  small: Spawn[];
}

export function readSpawns(payload: Buffer, header: QuestHeader): QuestSpawns {
  const inside = (offset: number, size: number) => offset > 0 && offset + size <= payload.length;
  const u16 = (offset: number) => (inside(offset, 2) ? payload.readUInt16LE(offset) : END);
  const u32 = (offset: number) => (inside(offset, 4) ? payload.readUInt32LE(offset) : 0);

  const large: Spawn[] = [];
  const loads: QuestSpawns["loads"] = [];
  const small: Spawn[] = [];
  const seen = new Set<number>();

  const readData = (ptr: number, out: Spawn[]): void => {
    for (let i = 0, at = ptr; i < MAX_ENTRIES && u16(at) !== END; i++, at += MON_DATA_SIZE) {
      if (!inside(at, MON_DATA_SIZE)) break;
      if (seen.has(at)) continue;
      seen.add(at);
      out.push({
        offset: at,
        monsterId: payload.readUInt16LE(at),
        quantity: payload[at + QUANTITY_OFFSET]!,
        power: payload[at + POWER_OFFSET]!,
      });
    }
  };

  if (header.largeMonPtr !== 0) {
    for (let t = 0, at = header.largeMonPtr; t < MAX_ENTRIES; t++, at += 16) {
      if (!inside(at, 16) || payload.readUInt16LE(at) === 0) break;
      const list = u32(at + 8);
      for (let i = 0, e = list; list !== 0 && i < MAX_ENTRIES && u16(e) !== END; i++, e += 4) {
        if (seen.has(e)) continue;
        seen.add(e);
        loads.push({ offset: e, monsterId: payload.readUInt16LE(e) });
      }
      readData(u32(at + 12), large);
    }
  }

  if (header.smallMonPtr !== 0) {
    for (let i = 0, at = header.smallMonPtr; i < MAX_ENTRIES; i++, at += 4) {
      if (!inside(at, 4) || payload.readUInt16LE(at) === 0) break;
      for (let t = 0, table = u32(at); t < MAX_ENTRIES; t++, table += 16) {
        if (!inside(table, 16) || payload.readUInt32LE(table) === 0) break;
        readData(u32(table + 12), small);
      }
    }
  }

  return { large, loads, small };
}
