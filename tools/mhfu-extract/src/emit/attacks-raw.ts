/**
 * `extract --raw`: every monster attack table on the disc, as numbers
 * (`raw/attacks.json`).
 *
 * The record layout came from a first search for the Monster Hunter Wiki's
 * numbers (`overlay/attack-crib.json`); see `monsters/attacks.ts`. This dump
 * finds the tables by that layout instead, so it also covers the monsters
 * the crib lacks (subspecies, variants) and those whose wiki numbers don't
 * match. For working out where each monster's table starts and ends, each
 * table carries:
 *
 * - every record whole (hex) and its decoded fields;
 * - per record, the crib attacks with the same damage and guard knockback
 *   (and stun, where the crib gives it), and per table the monster with the
 *   most of them;
 * - the 0x80 bytes before it (a list of pointers precedes several tables);
 * - the pointers to each record, from the same file or `game_task.ovl`
 *   (per-monster overlays share load addresses, so pointers from one into
 *   another mean nothing), naming the `MonChunk` slot when one holds it.
 */
import { BinaryReader } from "../binary/reader.js";
import type { OvlFile } from "../container/ovl.js";
import {
  ATTACK_RECORD_SIZE,
  findAttackTables,
  readAttackRecord,
  type AttackRecord,
} from "../monsters/attacks.js";
import { isUserAddress } from "../monsters/collision.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../monsters/hitzones.js";

/** A file to search. `ovl` is set for overlays, so pointers into them can be found. */
export interface SearchFile {
  name: string;
  buf: Buffer;
  ovl?: OvlFile;
  /** emID of a per-monster `overlay/emNN.ovl` or `emmodel/emNN.pac` entry. */
  emId?: number;
}

/** `game_task.ovl` and the file offset of its `MonChunk[90]`. */
export interface ChunkArray {
  ovl: OvlFile;
  offset: number;
}

/** One crib attack (`overlay/attack-crib.json`). */
export interface CribAttack {
  monster: string;
  name: string;
  damage?: number;
  stun?: number;
  guard?: number;
}

/** `overlay/attack-crib.json`. */
export interface AttackCrib {
  monsters: Record<string, Omit<CribAttack, "monster">[]>;
}

export function cribAttacks(crib: AttackCrib): CribAttack[] {
  return Object.entries(crib.monsters).flatMap(([monster, list]) =>
    list.map((a) => ({ monster, ...a })),
  );
}

export interface PointerRef {
  file: string;
  /** File offset of the u32 holding the pointer. */
  offset: number;
  /** The `MonChunk` slot holding it, when it is in `game_task.ovl`'s chunk array. */
  chunk?: { emId: number; at: string };
}

export interface AttackRecordDump extends AttackRecord {
  offset: number;
  hex: string;
  /** Crib attacks with these numbers, as "Monster: Attack". */
  crib?: string[];
  refs?: PointerRef[];
}

export interface AttackTableDump {
  offset: number;
  /** vaddr of the first record, for overlays. */
  vaddr?: string;
  count: number;
  /** The crib monster with the most different attacks matched here, and how many. */
  monster?: { name: string; attacks: number };
  /** The 0x80 bytes before the table, as hex. */
  before: string;
  records: AttackRecordDump[];
}

export interface AttackRawDump {
  files: {
    name: string;
    emId?: number;
    loadBase?: string;
    length: number;
    tables: AttackTableDump[];
  }[];
}

const BEFORE = 0x80;
const hex = (n: number) => `0x${n.toString(16)}`;

/**
 * Every u32 in the overlays among `files` that holds a user-memory address,
 * sorted by value, for finding the pointers to a record.
 */
export class PointerIndex {
  private readonly values: Uint32Array;
  private readonly entries: { file: SearchFile; offset: number }[];

  constructor(
    files: readonly SearchFile[],
    private readonly chunks: ChunkArray | null,
  ) {
    const found: { value: number; file: SearchFile; offset: number }[] = [];
    for (const file of files) {
      if (!file.ovl) continue;
      const r = file.ovl.reader;
      for (let at = 0; at + 4 <= r.length; at += 4) {
        const value = r.u32(at);
        if (isUserAddress(value)) found.push({ value, file, offset: at });
      }
    }
    found.sort((a, b) => a.value - b.value || a.offset - b.offset);
    this.values = Uint32Array.from(found, (f) => f.value);
    this.entries = found.map(({ file, offset }) => ({ file, offset }));
  }

  /** Pointers holding exactly `value`, read from a file `from` accepts. */
  to(value: number, from: (file: SearchFile) => boolean): PointerRef[] {
    const refs: PointerRef[] = [];
    for (let i = this.lowerBound(value); i < this.values.length && this.values[i] === value; i++) {
      const { file, offset } = this.entries[i]!;
      if (!from(file)) continue;
      const ref: PointerRef = { file: file.name, offset };
      const chunks = this.chunks;
      if (chunks && file.ovl === chunks.ovl) {
        const rel = offset - chunks.offset;
        if (rel >= 0 && rel < MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE) {
          ref.chunk = {
            emId: Math.floor(rel / MONSTER_CHUNK_SIZE),
            at: hex(rel % MONSTER_CHUNK_SIZE),
          };
        }
      }
      refs.push(ref);
    }
    return refs;
  }

  private lowerBound(value: number): number {
    let lo = 0;
    let hi = this.values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.values[mid]! < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/** Crib attacks by damage and guard knockback. */
function cribIndex(crib: readonly CribAttack[]): Map<string, CribAttack[]> {
  const index = new Map<string, CribAttack[]>();
  for (const a of crib) {
    if (a.damage === undefined || a.guard === undefined) continue;
    const key = `${a.damage},${a.guard}`;
    index.set(key, [...(index.get(key) ?? []), a]);
  }
  return index;
}

function dumpTable(
  file: SearchFile,
  reader: BinaryReader,
  run: { offset: number; count: number },
  byNumbers: ReadonlyMap<string, CribAttack[]>,
  pointers: PointerIndex,
): AttackTableDump {
  const ovl = file.ovl;
  // Pointers from the same file or game_task.ovl (always loaded); into
  // game_task.ovl, from any overlay.
  const from = (f: SearchFile) =>
    f === file || f.name === "game_task.ovl" || file.name === "game_task.ovl";
  const perMonster = new Map<string, Set<string>>();
  const records = Array.from({ length: run.count }, (_, i): AttackRecordDump => {
    const at = run.offset + i * ATTACK_RECORD_SIZE;
    const record = readAttackRecord(reader, at);
    const matches = (byNumbers.get(`${record.damage},${record.guard}`) ?? []).filter(
      (a) => a.stun === undefined || a.stun === record.stun,
    );
    for (const a of matches) {
      const set = perMonster.get(a.monster) ?? new Set<string>();
      set.add(a.name);
      perMonster.set(a.monster, set);
    }
    const refs = ovl ? pointers.to(ovl.loadBase + at, from) : [];
    return {
      offset: at,
      hex: file.buf.subarray(at, at + ATTACK_RECORD_SIZE).toString("hex"),
      ...record,
      ...(matches.length ? { crib: matches.map((a) => `${a.monster}: ${a.name}`) } : {}),
      ...(refs.length ? { refs } : {}),
    };
  });
  let monster: AttackTableDump["monster"];
  for (const [name, attacks] of perMonster) {
    if (!monster || attacks.size > monster.attacks) monster = { name, attacks: attacks.size };
  }
  return {
    offset: run.offset,
    ...(ovl ? { vaddr: hex(ovl.loadBase + run.offset) } : {}),
    count: run.count,
    ...(monster ? { monster } : {}),
    before: file.buf.subarray(Math.max(0, run.offset - BEFORE), run.offset).toString("hex"),
    records,
  };
}

/** Finds and dumps every attack table in `files`, labelled from `crib`. */
export function dumpAttacksRaw(
  files: readonly SearchFile[],
  crib: readonly CribAttack[],
  chunks: ChunkArray | null,
): AttackRawDump {
  const byNumbers = cribIndex(crib);
  const pointers = new PointerIndex(files, chunks);
  return {
    files: files.map((file) => {
      const reader = file.ovl?.reader ?? new BinaryReader(file.buf);
      return {
        name: file.name,
        ...(file.emId !== undefined ? { emId: file.emId } : {}),
        ...(file.ovl ? { loadBase: hex(file.ovl.loadBase) } : {}),
        length: file.buf.length,
        tables: findAttackTables(file.buf).map((run) =>
          dumpTable(file, reader, run, byNumbers, pointers),
        ),
      };
    }),
  };
}
