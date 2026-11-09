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

export interface SpawnSite {
  file: string;
  offset: number;
  func: number;
  /** a0-a3, t0-t3 as hex where the code sets them to constants, else null. */
  args: (string | null)[];
  /** The nearest monster chunk leading to the calling function, if found. */
  monster?: { emId: number; at: string; depth: number };
  /** For spawners reaching a table: the caller's code key, and the calls into the caller. */
  codeKey?: string;
  callers?: {
    file: string;
    offset: number;
    func: number;
    kind: "jal" | "j";
    args: (string | null)[];
  }[];
}

/** A call or tail jump to a record copier. */
export interface SetterSite {
  file: string;
  offset: number;
  /** The calling function; its code is in `code` under `codeKey`. */
  func: number;
  codeKey: string;
  kind: "jal" | "j";
  /** The copier reached, as "file:0xoffset". */
  target: string;
  args: (string | null)[];
  /** Vtables (of `spawners`) with a slot reaching the caller within two calls. */
  classes: string[];
}

/** A vtable entry: the function it points at and the attack tables that function uses. */
export interface VtableSlot {
  slot: number;
  value: string;
  /** Where the function is (file and offset), when it is a known function. */
  file?: string;
  offset?: number;
  /** Attack tables this function uses, as "file@offset". */
  tables?: string[];
}

/**
 * A constructor: code that stores a vtable at offset 0 of a new object and
 * calls the class's init. For shells, the vtable leads to the class's
 * attack table and the call sites give the attack index (an argument).
 */
export interface Spawner {
  file: string;
  func: number;
  /** File offset of the vtable store. */
  store: number;
  vtable: string;
  /** "eboot" or the overlay holding the vtable. */
  vtableIn: string;
  slots: VtableSlot[];
  /** The init called after the store; its code (and its callees') is in `code`. */
  init: { file: string; offset: number; callees: string[] } | null;
  /** For spawners reaching a table: the constructor's code key and its callees' keys. */
  codeKey?: string;
  callees?: string[];
  sites: SpawnSite[];
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
  /**
   * Constructors whose stored address is a vtable (`findSpawners`), those
   * whose vtable reaches an attack table first. Probe output.
   */
  spawners?: Spawner[];
  /** Code by "file:0xoffset", for the spawners' inits and the setters' callers. */
  code?: Record<string, string>;
  /**
   * The record copiers (`CodeGraph.recordCopiers`) and every call or tail
   * jump to them, for decoding how each shell class picks its record. Probe
   * output.
   */
  setters?: {
    copiers: { file: string; offset: number; entry: boolean }[];
    sites: SetterSite[];
  };
  /** `DATA_BYTES` at each constant address the setters' callers use, by "file:0xoffset". */
  data?: Record<string, string>;
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
/** Code dumped per setter caller (up to its end), and data per constant address. */
const SETTER_CODE_BYTES = 0x800;
/** Calls into a spawner's caller, per site. */
const MAX_WRAPPER_CALLERS = 80;
const DATA_BYTES = 0x40;
const MAX_DATA_BLOCKS = 800;
/** Vtable entries read, and how many of the first 8 must be functions. */
const VTABLE_WORDS = 24;
const VTABLE_MIN_FUNCTIONS = 3;
const MAX_SPAWNERS = 150;
const MAX_SPAWN_SITES = 60;
/** Sites per spawner that also get a monster link (the search is slower). */
const LINKED_SITES = 25;
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

/** The EBOOT's bytes and the vaddr of its offset 0, for reading vtables there. */
export interface EbootImage {
  buf: Buffer;
  base: number;
}

/**
 * Constructors whose stored address holds a vtable (at least
 * `VTABLE_MIN_FUNCTIONS` of its first 8 words are known functions), with
 * the attack tables their vtable entries use, their init's code and their
 * call sites. Spawners reaching a table come first.
 */
function findSpawners(
  graph: CodeGraph,
  files: ReadonlyMap<string, SearchFile>,
  users: ReadonlyMap<string, string[]>,
  eboot: EbootImage | null,
  code: Record<string, string>,
): Spawner[] {
  const seen = new Set<string>();
  const spawners: Spawner[] = [];
  for (const setup of graph.objectSetups()) {
    const key = `${setup.file}:${setup.func}:${setup.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let words = graph.wordsAt(setup.value, setup.file, VTABLE_WORDS);
    let vtableIn = words ? graph.locate(setup.value, setup.file)[0]!.file : "";
    if (!words && eboot) {
      const at = setup.value - eboot.base;
      if (at >= 0 && at + VTABLE_WORDS * 4 <= eboot.buf.length) {
        words = Array.from({ length: VTABLE_WORDS }, (_, i) => eboot.buf.readUInt32LE(at + i * 4));
        vtableIn = "eboot";
      }
    }
    if (!words) continue;
    const functions = words.slice(0, 8).filter((w) => graph.isFunction(w, setup.file)).length;
    if (functions < VTABLE_MIN_FUNCTIONS) continue;
    const slots = words.map((w, slot): VtableSlot => {
      const where = graph.isFunction(w, setup.file) ? graph.locate(w, setup.file)[0] : undefined;
      const tables = where ? users.get(`${where.file}:${where.offset}`) : undefined;
      return {
        slot,
        value: hex(w),
        ...(where ? { file: where.file, offset: where.offset } : {}),
        ...(tables ? { tables } : {}),
      };
    });
    let init: Spawner["init"] = null;
    if (setup.init) {
      const addCode = (file: string, offset: number) => {
        const k = `${file}:${hex(offset)}`;
        if (!(k in code)) code[k] = codeAt(files.get(file)!.buf, offset);
        return k;
      };
      addCode(setup.init.file, setup.init.offset);
      const callees = graph
        .callsFrom(setup.init.file, setup.init.offset, FUNCTION_BYTES)
        .map((c) => addCode(c.file, c.offset));
      init = { ...setup.init, callees };
    }
    const sites = graph
      .callSites(setup.file, setup.func)
      .slice(0, MAX_SPAWN_SITES)
      .map((site): SpawnSite => ({
        ...site,
        args: site.args.map((a) => (a === null ? null : hex(a))),
      }));
    spawners.push({
      file: setup.file,
      func: setup.func,
      store: setup.store,
      vtable: hex(setup.value),
      vtableIn,
      slots,
      init,
      sites,
    });
  }
  const reaches = (s: Spawner) => s.slots.some((slot) => slot.tables);
  const kept = spawners
    .sort((a, b) => Number(reaches(b)) - Number(reaches(a)) || b.sites.length - a.sites.length)
    .slice(0, MAX_SPAWNERS);
  // For the spawn chains of spawners reaching a table: the constructor's code
  // and callees, each caller's code, and the calls into each caller.
  const addFunction = (file: string, offset: number) => {
    const key = `${file}:${hex(offset)}`;
    if (!(key in code)) {
      const end = Math.min(graph.funcEnd(file, offset), offset + SETTER_CODE_BYTES);
      code[key] = files.get(file)!.buf.subarray(offset, end).toString("hex");
    }
    return key;
  };
  for (const spawner of kept.filter(reaches)) {
    spawner.codeKey = addFunction(spawner.file, spawner.func);
    spawner.callees = graph
      .callsFrom(spawner.file, spawner.func, SETTER_CODE_BYTES)
      .map((c) => addFunction(c.file, c.offset));
    for (const site of spawner.sites) {
      site.codeKey = addFunction(site.file, site.func);
      site.callers = graph
        .sitesTo(site.file, site.func)
        .slice(0, MAX_WRAPPER_CALLERS)
        .map((c) => ({ ...c, args: c.args.map((a) => (a === null ? null : hex(a))) }));
    }
  }
  // Monster links only for the kept spawners' first sites: the search is slow.
  for (const spawner of kept) {
    spawner.sites.slice(0, LINKED_SITES).forEach((site) => {
      const link = graph
        .monstersOf(site.file, site.func)
        .sort((a, b) => a.depth - b.depth || a.emId - b.emId)[0];
      if (link) site.monster = { emId: link.emId, at: link.at, depth: link.depth };
    });
  }
  return kept;
}

/**
 * Every call or tail jump to a record copier, with the caller's code, its
 * argument registers, the classes reaching it, and the data it reads.
 */
function findSetters(
  graph: CodeGraph,
  files: ReadonlyMap<string, SearchFile>,
  spawners: readonly Spawner[],
  eboot: EbootImage | null,
  code: Record<string, string>,
  data: Record<string, string>,
): NonNullable<AttackRawDump["setters"]> {
  const copiers = graph.recordCopiers();
  // Vtables by the functions in their slots.
  const vtablesBySlot = new Map<string, Set<string>>();
  for (const spawner of spawners) {
    for (const slot of spawner.slots) {
      if (slot.file === undefined) continue;
      const key = `${slot.file}:${slot.offset}`;
      const set = vtablesBySlot.get(key) ?? new Set<string>();
      set.add(spawner.vtable);
      vtablesBySlot.set(key, set);
    }
  }
  const dumped = new Set<string>();
  const sites: SetterSite[] = [];
  for (const copier of copiers) {
    for (const site of graph.sitesTo(copier.file, copier.offset)) {
      const end = Math.min(graph.funcEnd(site.file, site.func), site.func + SETTER_CODE_BYTES);
      const codeKey = `${site.file}:${hex(site.func)}`;
      if (!(codeKey in code)) {
        code[codeKey] = files.get(site.file)!.buf.subarray(site.func, end).toString("hex");
      }
      if (!dumped.has(codeKey)) {
        dumped.add(codeKey);
        for (const { address } of graph.addressesIn(site.file, site.func, end)) {
          if (Object.keys(data).length >= MAX_DATA_BLOCKS) break;
          const where = graph.locate(address, site.file)[0];
          if (where) {
            const key = `${where.file}:${hex(where.offset)}`;
            if (!(key in data)) {
              data[key] = files
                .get(where.file)!
                .buf.subarray(where.offset, where.offset + DATA_BYTES)
                .toString("hex");
            }
          } else if (eboot) {
            const at = address - eboot.base;
            const key = `eboot:${hex(at)}`;
            if (at >= 0 && at < eboot.buf.length && !(key in data)) {
              data[key] = eboot.buf.subarray(at, at + DATA_BYTES).toString("hex");
            }
          }
        }
      }
      const classes = new Set<string>();
      for (const fn of graph.reachers(site.file, site.func, 2)) {
        for (const vt of vtablesBySlot.get(`${fn.file}:${fn.offset}`) ?? []) classes.add(vt);
      }
      sites.push({
        file: site.file,
        offset: site.offset,
        func: site.func,
        codeKey,
        kind: site.kind,
        target: `${copier.file}:${hex(copier.offset)}`,
        args: site.args.map((a) => (a === null ? null : hex(a))),
        classes: [...classes],
      });
    }
  }
  return { copiers, sites };
}

/** How far `rel` is from the table [0, size): 0 inside it. */
const distance = (rel: number, size: number) => (rel < 0 ? -rel : rel >= size ? rel - size + 1 : 0);

/** Finds and dumps every attack table in `files`, labelled from `crib`. */
export function dumpAttacksRaw(
  files: readonly SearchFile[],
  crib: readonly CribAttack[],
  chunks: ChunkArray | null,
  eboot: EbootImage | null = null,
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
  // Each table user's tables, by "file:offset".
  const tablesByUser = new Map<string, string[]>();
  for (const f of dumped) {
    for (const t of f.tables) {
      for (const fn of t.code?.functions ?? []) {
        const key = `${fn.file}:${fn.offset}`;
        const label = `${f.name}@${hex(t.offset)}`;
        const list = tablesByUser.get(key) ?? [];
        if (!list.includes(label)) list.push(label);
        tablesByUser.set(key, list);
      }
    }
  }
  const code: Record<string, string> = {};
  const data: Record<string, string> = {};
  if (!graph) return { files: dumped };
  const spawners = findSpawners(graph, byName, tablesByUser, eboot, code);
  return {
    scan: graph.stats(),
    callees: calleeCode(graph, byName, users),
    spawners,
    setters: findSetters(graph, byName, spawners, eboot, code, data),
    code,
    data,
    files: dumped,
  };
}
