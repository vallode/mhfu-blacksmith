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
  boundTables,
  findAttackTables,
  type AttackTable,
  readAttackRecord,
  type AttackRecord,
} from "../monsters/attacks.js";
import {
  CodeGraph,
  type CodeFile,
  type MonsterLink,
  type TableUse,
} from "../monsters/code-graph.js";
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

/** A code location near a table, with the instruction words around it. */
export interface NearUse extends TableUse {
  /** 8 instructions before to 8 after, as hex words (the use is the ninth). */
  words: string[];
}

/** A function using a table: what it touches and which monsters lead to it. */
export interface TableFunction {
  file: string;
  offset: number;
  /** Records it builds the address of or reads, by index. */
  records: number[];
  monsters: MonsterLink[];
  /** `FUNCTION_BYTES` of its code from its start, as hex. */
  code: string;
}

export interface AttackTableDump {
  offset: number;
  /** vaddr of the first record, for overlays. */
  vaddr?: string;
  count: number;
  /** File offset of the struct after the table that points at it (`boundTables`). */
  struct?: number;
  /** The crib monster with the most different attacks matched here, and how many. */
  monster?: { name: string; attacks: number };
  /** The `BEFORE` bytes before the table and `AFTER` after it, as hex. */
  before: string;
  after: string;
  /**
   * Code using the table (`monsters/code-graph.ts`), for overlays: every
   * code-built address from `NEAR_BEFORE` bytes before the table to
   * `NEAR_AFTER` after it (the code may index from a struct before it),
   * nearest first, and the functions behind them with their monsters.
   */
  code?: {
    uses: NearUse[];
    functions: TableFunction[];
    /** The nearest code-built addresses outside the window, relative to the table's start. */
    nearest: ReturnType<CodeGraph["nearest"]>;
  };
  records: AttackRecordDump[];
}

export interface AttackRawDump {
  /** What the MIPS decoder found per overlay. */
  scan?: ReturnType<CodeGraph["stats"]>;
  /**
   * The functions the tables' users call (two calls deep, most widely
   * called first), with `FUNCTION_BYTES` of code each: a probe for the code
   * that reads the records.
   */
  callees?: { file: string; offset: number; calledBy: string[]; code: string }[];
  files: {
    name: string;
    emId?: number;
    loadBase?: string;
    length: number;
    tables: AttackTableDump[];
  }[];
}

const BEFORE = 0x800;
const AFTER = 0x200;
/** Code dumped per function using a table, and per function those call. */
const FUNCTION_BYTES = 0x400;
const CALLEE_DEPTH = 2;
const MAX_CALLEES = 80;
/** Caps that keep `raw/attacks.json` small. */
const MAX_USES = 60;
const NEAR_BEFORE = 0x800;
const NEAR_AFTER = 0x100;
const WORDS_AROUND = 8;
const MAX_LINKS = 12;
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
  run: AttackTable,
  byNumbers: ReadonlyMap<string, CribAttack[]>,
  pointers: PointerIndex,
  graph: CodeGraph | null,
  byName: ReadonlyMap<string, SearchFile>,
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
    ...(run.struct !== undefined ? { struct: run.struct } : {}),
    ...(monster ? { monster } : {}),
    before: file.buf.subarray(Math.max(0, run.offset - BEFORE), run.offset).toString("hex"),
    after: file.buf
      .subarray(
        run.offset + run.count * ATTACK_RECORD_SIZE,
        run.offset + run.count * ATTACK_RECORD_SIZE + AFTER,
      )
      .toString("hex"),
    ...(graph && ovl ? { code: tableCode(graph, byName, file.name, run) } : {}),
    records,
  };
}

/** The code using a table, grouped by function, with the monsters leading to each. */
function tableCode(
  graph: CodeGraph,
  files: ReadonlyMap<string, SearchFile>,
  fileName: string,
  run: { offset: number; count: number },
): NonNullable<AttackTableDump["code"]> {
  const end = run.offset + run.count * ATTACK_RECORD_SIZE;
  const uses = graph
    .usesOf(
      fileName,
      Math.max(0, run.offset - NEAR_BEFORE),
      end + NEAR_AFTER,
      run.offset,
      ATTACK_RECORD_SIZE,
    )
    .sort((a, b) => distance(a.rel, end - run.offset) - distance(b.rel, end - run.offset))
    .slice(0, MAX_USES);
  const byFunction = new Map<string, TableFunction>();
  for (const use of uses) {
    const key = `${use.file}:${use.func}`;
    let fn = byFunction.get(key);
    if (!fn) {
      fn = { file: use.file, offset: use.func, records: [], monsters: [], code: "" };
      byFunction.set(key, fn);
    }
    if (!fn.records.includes(use.record)) fn.records.push(use.record);
  }
  const functions = [...byFunction.values()].map((fn) => ({
    ...fn,
    code: codeAt(files.get(fn.file)!.buf, fn.offset),
    records: fn.records.sort((a, b) => a - b),
    monsters: graph
      .monstersOf(fn.file, fn.offset)
      .sort((a, b) => a.depth - b.depth || a.emId - b.emId)
      .slice(0, MAX_LINKS),
  }));
  const withWords = uses.map((use): NearUse => {
    const buf = files.get(use.file)!.buf;
    const words: string[] = [];
    for (let i = -WORDS_AROUND; i <= WORDS_AROUND; i++) {
      const at = use.offset + i * 4;
      if (at >= 0 && at + 4 <= buf.length)
        words.push(buf.readUInt32LE(at).toString(16).padStart(8, "0"));
    }
    return { ...use, words };
  });
  return {
    uses: withWords,
    functions,
    nearest: graph.nearest(
      fileName,
      Math.max(0, run.offset - NEAR_BEFORE),
      end + NEAR_AFTER,
      run.offset,
    ),
  };
}

const codeAt = (buf: Buffer, offset: number) =>
  buf.subarray(offset, Math.min(buf.length, offset + FUNCTION_BYTES)).toString("hex");

/**
 * The functions that the tables' users call, `CALLEE_DEPTH` calls deep, with
 * their code: one of them likely reads the records.
 */
function calleeCode(
  graph: CodeGraph,
  files: ReadonlyMap<string, SearchFile>,
  users: readonly TableFunction[],
): { file: string; offset: number; calledBy: string[]; code: string }[] {
  const out = new Map<string, { file: string; offset: number; calledBy: string[]; code: string }>();
  let frontier = users.map((u) => ({ file: u.file, offset: u.offset }));
  const userKeys = new Set(users.map((u) => `${u.file}:${u.offset}`));
  for (let depth = 0; depth < CALLEE_DEPTH && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const caller of frontier) {
      for (const callee of graph.callsFrom(caller.file, caller.offset, FUNCTION_BYTES)) {
        const key = `${callee.file}:${callee.offset}`;
        if (userKeys.has(key)) continue;
        const from = `${caller.file}:${hex(caller.offset)}`;
        const known = out.get(key);
        if (known) {
          if (!known.calledBy.includes(from)) known.calledBy.push(from);
          continue;
        }
        if (out.size >= MAX_CALLEES) continue;
        out.set(key, {
          ...callee,
          calledBy: [from],
          code: codeAt(files.get(callee.file)!.buf, callee.offset),
        });
        next.push(callee);
      }
    }
    frontier = next;
  }
  // Most widely called first: shared shell code.
  return [...out.values()].sort((a, b) => b.calledBy.length - a.calledBy.length);
}

/** How far `rel` is from the table [0, size): 0 inside it. */
const distance = (rel: number, size: number) => (rel < 0 ? -rel : rel >= size ? rel - size + 1 : 0);

/** Finds and dumps every attack table in `files`, labelled from `crib`. */
export function dumpAttacksRaw(
  files: readonly SearchFile[],
  crib: readonly CribAttack[],
  chunks: ChunkArray | null,
): AttackRawDump {
  const byNumbers = cribIndex(crib);
  const pointers = new PointerIndex(files, chunks);
  // The main overlays are always loaded; per-monster ones share addresses.
  const codeFiles: CodeFile[] = files
    .filter((f): f is SearchFile & { ovl: OvlFile } => f.ovl !== undefined)
    .map((f) => ({
      name: f.name,
      ovl: f.ovl,
      shared: f.name === "game_task.ovl" || f.name === "game_sub.ovl",
    }));
  const graph = codeFiles.length ? new CodeGraph(codeFiles, chunks) : null;
  const byName = new Map(files.map((f) => [f.name, f]));
  const dumped = files.map((file) => {
    const reader = file.ovl?.reader ?? new BinaryReader(file.buf);
    return {
      name: file.name,
      ...(file.emId !== undefined ? { emId: file.emId } : {}),
      ...(file.ovl ? { loadBase: hex(file.ovl.loadBase) } : {}),
      length: file.buf.length,
      tables: (file.ovl
        ? boundTables(file.buf, file.ovl.loadBase)
        : findAttackTables(file.buf)
      ).map((run) => dumpTable(file, reader, run, byNumbers, pointers, graph, byName)),
    };
  });
  const users = dumped.flatMap((f) => f.tables.flatMap((t) => t.code?.functions ?? []));
  return {
    ...(graph ? { scan: graph.stats(), callees: calleeCode(graph, byName, users) } : {}),
    files: dumped,
  };
}
