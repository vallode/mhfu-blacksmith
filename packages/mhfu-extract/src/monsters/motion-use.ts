/**
 * Which of a monster's motions the game can play, so the site can mark the
 * rest unused: motions left in the bank that no code ever plays.
 *
 * A monster plays a motion by its index in a table of 8-byte records
 * (0x09BD3780[emID], kept at monster `+0x640`): byte 0 is the motion's
 * slot, byte 1 the body part it's for (-1 every part), byte 2 a blend, and
 * byte 3, where set, an index into a shared table the monster can switch to
 * (below). Two functions in game_task play one, PLAY_MOTION(monster, index,
 * blend, …) and PLAY_RECORD(monster, index), and no monster code writes its
 * motion (`+0x324`) any other way. The tables are near enough the identity
 * (record n plays slot n), so which motions are used is up to the code: the
 * record indices the monster's class hands those two.
 *
 * This reads them out of the class's code without running it. From every
 * method in the class's vtable it follows the code, both ways at every
 * branch and through jump tables, keeping for each register the set of
 * values it can hold: constants, the function's own arguments (a0-a3, then
 * t0-t3), what they point at, the stack, or a call's result. A function's
 * summary is the plays it makes, which object on and which index, in those
 * terms; a caller puts its own values in. A play on another object (one a
 * call returned, or one the monster points at: effects, attack objects)
 * counts its constant records as used too, in case that object is the
 * monster, but an index there that can't be followed is let go. Every call
 * to the two players on the disc, tail calls included, is reached this way
 * from some class, so no monster motion is played from anywhere else.
 *
 * Species sharing a class (Rathian and Rathalos and their variants) aren't
 * told apart: a motion one of them plays counts as used for all, which can
 * only under-report unused motions. Where an index can't be followed (worked
 * out from state, or handed in from outside) the result is `uncertain` and
 * the export writes nothing for that monster.
 *
 * Byte 3: with monster `+0x638` bit 0 set, playing a record whose byte 3 is
 * set switches the monster's table to the shared one (0x09BD38F0) for good,
 * so index i then plays shared record i. The shared records are Lao-Shan
 * Lung's alternates of its walking motions 1-10 (slots 20-31); what sets
 * the bit wasn't found, so for a table holding such records the shared
 * table's slots are `undecided`, neither used nor unused.
 *
 * The addresses are the EU disc's (ULES01213).
 */
import type { ImageSegment } from "./attacks.js";
import { overlayForVtable, vtableOfCase } from "./attacks.js";
import { Memory } from "./mips.js";

const SPAWN_SWITCH = 0x09c0ccf8;
const SPAWN_SWITCH_CASES = 90;
/** PLAY_MOTION(monster, record index, blend, …) and PLAY_RECORD(monster, record index). */
const PLAY_MOTION = 0x09ac5228;
const PLAY_RECORD = 0x09ac8ee0;
const PLAYERS = new Set([PLAY_MOTION, PLAY_RECORD]);
/** Each emID's motion record table. */
const RECORD_TABLES = 0x09bd3780;
/** Record indices above this aren't taken as real. */
const MAX_RECORDS = 0x200;
/** The shared record table byte 3 points into, and its length (row 11 on is other data). */
const SHARED_RECORDS = 0x09bd38f0;
const SHARED_RECORD_COUNT = 11;
/** Code the walk follows into: game_task and the per-monster overlays (the EBOOT's is library code). */
const CODE_RANGE = [0x09a00000, 0x09e00000] as const;
/** Where the per-monster overlays (emNN.ovl) load. */
const EM_OVERLAY_START = 0x09d1a180;
const isUserAddress = (v: number) => v >= 0x08800000 && v < 0x0a000000;

/** At most this many values for a register before it counts as anything. */
const MAX_VALUES = 48;
/** Instruction visits per function before giving up on it. */
const MAX_VISITS = 40_000;
/** Rounds a join point may change before what still changes is widened to anything. */
const WIDEN_AFTER = 3;
/** Call depth from a vtable method; a function past it may play anything. */
const MAX_DEPTH = 24;
const DEEP = -1;

/**
 * One value a register can hold:
 * - `c`: a constant
 * - `a`: the function's argument register `n` (ARG_REGS) plus `off`
 * - `l`: what that argument plus `off` points at, `size` bytes, `signed`
 * - `s`: the stack pointer at entry plus `off`
 * - `r`: what a call returned (a new object, or one looked up), or a pointer into it
 */
type Value =
  | { k: "r" }
  | { k: "c"; v: number }
  | { k: "a"; n: number; off: number }
  | { k: "l"; n: number; off: number; size: number; signed: boolean }
  | { k: "s"; off: number };

/** A register's possible values, or null for anything. */
type Values = ReadonlyMap<string, Value> | null;

const keyOf = (v: Value): string =>
  v.k === "r"
    ? "r"
    : v.k === "c"
      ? `c${v.v >>> 0}`
      : v.k === "a"
        ? `a${v.n}:${v.off}`
        : v.k === "l"
          ? `l${v.n}:${v.off}:${v.size}${v.signed ? "s" : "u"}`
          : `s${v.off}`;

function values(list: Value[]): Values {
  if (list.length > MAX_VALUES) return null;
  const out = new Map<string, Value>();
  for (const value of list) {
    const v: Value = value.k === "c" ? { k: "c", v: value.v >>> 0 } : value;
    out.set(keyOf(v), v);
  }
  return out.size > MAX_VALUES ? null : out;
}
const constant = (v: number): Values => values([{ k: "c", v }]);

function join(a: Values, b: Values): Values {
  if (a === null || b === null) return null;
  if (a === b) return a;
  let subset = true;
  for (const k of b.keys())
    if (!a.has(k)) {
      subset = false;
      break;
    }
  if (subset) return a;
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, v);
  return out.size > MAX_VALUES ? null : out;
}

function sameValues(a: Values, b: Values): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

/** Applies `f` to every value; null if `f` gives null for any. */
function mapValues(a: Values, f: (v: Value) => Value | Value[] | null): Values {
  if (a === null) return null;
  const out: Value[] = [];
  for (const v of a.values()) {
    const r = f(v);
    if (r === null) return null;
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return values(out);
}

/** Every pair of constants; null unless both are all constants. */
function constPairs(a: Values, b: Values, f: (x: number, y: number) => number): Values {
  if (a === null || b === null) return null;
  const out: Value[] = [];
  for (const x of a.values())
    for (const y of b.values()) {
      if (x.k !== "c" || y.k !== "c") return null;
      out.push({ k: "c", v: f(x.v, y.v) });
    }
  return values(out);
}

const onlyZero = (a: Values) => a !== null && a.size === 1 && a.has("c0");
const BOOL = values([
  { k: "c", v: 0 },
  { k: "c", v: 1 },
]);

interface State {
  regs: Values[];
  /** Stack slots by offset from the stack pointer at entry. */
  stack: Map<number, Values>;
}

const cloneState = (s: State): State => ({ regs: s.regs.slice(), stack: new Map(s.stack) });

function joinState(a: State, b: State): State {
  const regs = a.regs.map((v, i) => join(v, b.regs[i]!));
  const stack = new Map<number, Values>();
  for (const [k, v] of a.stack) if (b.stack.has(k)) stack.set(k, join(v, b.stack.get(k)!));
  return { regs, stack };
}

function sameState(a: State, b: State): boolean {
  for (let i = 0; i < 32; i++) if (!sameValues(a.regs[i]!, b.regs[i]!)) return false;
  if (a.stack.size !== b.stack.size) return false;
  for (const [k, v] of a.stack)
    if (!b.stack.has(k) || !sameValues(v, b.stack.get(k)!)) return false;
  return true;
}

/** Argument registers: a0-a3, then t0-t3 (the PSP's calling convention). */
const ARG_REGS = [4, 5, 6, 7, 8, 9, 10, 11];
/** Registers a call may change: at, v0-v1, a0-a3, t0-t9, ra. */
const CALLER_SAVED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 31];

interface CallSite {
  at: number;
  /** Where it goes; empty when that can't be told. */
  targets: number[];
  /** The argument registers at the call (ARG_REGS). */
  args: Values[];
}

/** One function's calls, found by following its code. */
interface Walked {
  calls: CallSite[];
  /** True if the walk hit its limit or code it couldn't follow. */
  partial: boolean;
}

/**
 * A motion a function plays: on which object (null: can't tell), and which
 * record (null: can't tell, at call site `at`), in terms of its arguments.
 */
interface Play {
  on: Value[] | null;
  index: Value[] | null;
  at: number;
}

const playKey = (p: Play) =>
  `${p.on ? p.on.map(keyOf).join(",") : "?"}|${p.index ? p.index.map(keyOf).join(",") : `?${p.at}`}`;

const s16 = (v: number) => (v << 16) >> 16;
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

class Walker {
  private readonly walked = new Map<number, Walked>();
  private readonly summaries = new Map<number, Play[]>();
  private readonly busy = new Set<number>();
  /**
   * Where the summary being worked out was cut short: functions it reached
   * again while still working them out (recursion), or DEEP past MAX_DEPTH.
   * A summary is cached only once nothing it depends on was cut, so one
   * found partway through a cycle isn't reused from elsewhere.
   */
  private cuts = new Set<number>();
  /** Calls to the motion players followed. */
  readonly playerSites = new Set<number>();

  constructor(private readonly memory: Memory) {}

  private isCode(address: number): boolean {
    return (
      address >= CODE_RANGE[0] && address < CODE_RANGE[1] && this.memory.code(address) !== null
    );
  }

  /**
   * True unless `address` is in the overlay slot and doesn't look like a
   * function's start. Only asked of calls from game_task: an overlay's own
   * calls land on its own functions, prologue or not.
   */
  private isFunctionStart(address: number): boolean {
    if (address < EM_OVERLAY_START) return true;
    const word = this.memory.code(address);
    if (word === null) return false;
    // addiu $sp, $sp, -n; or anything just after a `jr $ra; delay slot`
    return (
      (word >>> 16 === 0x27bd && (word & 0x8000) !== 0) ||
      this.memory.code(address - 8) === 0x03e00008
    );
  }

  /** Reads `size` bytes at a constant address; null outside the image. */
  private load(address: number, size: number, signed: boolean): number | null {
    if (!isUserAddress(address) || address % size !== 0) return null;
    if (this.memory.code(address & ~3) === null) return null;
    const v =
      size === 1
        ? this.memory.u8(address)
        : size === 2
          ? this.memory.u16(address)
          : this.memory.u32(address);
    return signed ? (size === 1 ? (v << 24) >> 24 : size === 2 ? s16(v) : v | 0) : v;
  }

  /**
   * True if `jr reg` / `jalr reg` at `at` calls a method through an object's
   * vtable: `lw reg, off(t)` after `lw t, 0(obj)`. A monster's own methods
   * are all walked from its vtable anyway.
   */
  private isVirtualCall(at: number, reg: number): boolean {
    for (let k = 1; k <= 4; k++) {
      const w = this.memory.code(at - 4 * k);
      if (w === null) return false;
      if (w >>> 26 === 0x23 && ((w >>> 16) & 31) === reg) {
        const base = (w >>> 21) & 31;
        for (let j = k + 1; j <= k + 4; j++) {
          const v = this.memory.code(at - 4 * j);
          if (v === null) return false;
          if (v >>> 26 === 0x23 && ((v >>> 16) & 31) === base) return (v & 0xffff) === 0;
        }
        return false;
      }
    }
    return false;
  }

  /**
   * Targets of `jr reg` at `at` through a jump table, or null: the table
   * from a `lui`/`addiu` pair before it (compilers hoist it, sometimes well
   * back) whose entries point at code near the jump, as many as the nearest
   * `sltiu` allows. Where that bound check is in another block, entries are
   * read while they point near: reading too many only follows more code, so
   * counts more motions used, never fewer.
   */
  private jumpTable(at: number): number[] | null {
    let bound: number | null = null;
    for (let k = 1; k <= 12 && bound === null; k++) {
      const w = this.memory.code(at - 4 * k);
      if (w !== null && w >>> 26 === 0x0b) bound = w & 0xffff; // sltiu
    }
    if (bound === 0 || (bound !== null && bound > 512)) return null;
    const near = (t: number) => Math.abs(t - at) < 0x8000 && this.isCode(t);
    for (let k = 1; k <= 96; k++) {
      const w = this.memory.code(at - 4 * k);
      if (w === null) break;
      if (w >>> 26 !== 0x09) continue; // addiu r, r, lo after lui r, hi
      const r = (w >>> 16) & 31;
      if (((w >>> 21) & 31) !== r) continue;
      for (let j = k + 1; j <= k + 8; j++) {
        const v = this.memory.code(at - 4 * j);
        if (v === null || v >>> 26 !== 0x0f || ((v >>> 16) & 31) !== r) continue;
        const table = (((v & 0xffff) << 16) + s16(w & 0xffff)) >>> 0;
        const targets: number[] = [];
        if (bound === null) {
          for (let i = 0; i < 128 && near(this.memory.u32(table + 4 * i)); i++)
            targets.push(this.memory.u32(table + 4 * i));
          if (targets.length >= 2) return targets;
        } else {
          for (let i = 0; i < bound; i++) targets.push(this.memory.u32(table + 4 * i));
          if (targets.every(near)) return targets;
        }
        break;
      }
    }
    return null;
  }

  /** Follows the function at `entry`, collecting its calls. */
  walk(entry: number): Walked {
    const cached = this.walked.get(entry);
    if (cached) return cached;
    const start: State = { regs: new Array<Values>(32).fill(null), stack: new Map() };
    start.regs[0] = constant(0);
    for (const n of ARG_REGS) start.regs[n] = values([{ k: "a", n, off: 0 }]);
    start.regs[29] = values([{ k: "s", off: 0 }]);

    const states = new Map<number, State>();
    const changes = new Map<number, number>();
    const calls = new Map<number, CallSite>();
    const todo: number[] = [];
    let partial = false;
    const enqueue = (pc: number, state: State) => {
      if (!this.isCode(pc)) {
        partial = true;
        return;
      }
      const old = states.get(pc);
      const next = old ? joinState(old, state) : state;
      if (old && sameState(old, next)) return;
      // Widening: a register still changing after a few rounds (a loop's
      // counter) can be anything from then on.
      const rounds = (changes.get(pc) ?? 0) + 1;
      changes.set(pc, rounds);
      if (old && rounds > WIDEN_AFTER) {
        for (let i = 0; i < 32; i++)
          if (!sameValues(old.regs[i]!, next.regs[i]!)) next.regs[i] = null;
        for (const [k, v] of next.stack)
          if (!sameValues(old.stack.get(k) ?? null, v)) next.stack.set(k, null);
      }
      states.set(pc, next);
      todo.push(pc);
    };
    const call = (at: number, targets: number[], state: State) => {
      const args = ARG_REGS.map((r) => state.regs[r]!);
      const old = calls.get(at);
      calls.set(at, {
        at,
        targets: [...new Set([...(old?.targets ?? []), ...targets])],
        args: old ? old.args.map((v, i) => join(v, args[i]!)) : args,
      });
    };
    const afterCall = (state: State) => {
      const s = cloneState(state);
      // A call handed a pointer into the stack may write anything from there up.
      let escaped = Infinity;
      for (const r of ARG_REGS)
        for (const v of state.regs[r]?.values() ?? [])
          if (v.k === "s") escaped = Math.min(escaped, v.off);
      for (const k of s.stack.keys()) if (k >= escaped) s.stack.delete(k);
      for (const r of CALLER_SAVED) s.regs[r] = null;
      s.regs[2] = values([{ k: "r" }]);
      return s;
    };
    const constTargets = (v: Values) =>
      v === null
        ? []
        : [...v.values()].flatMap((x) => (x.k === "c" && this.isCode(x.v) ? [x.v] : []));

    enqueue(entry, start);
    let visits = 0;
    while (todo.length) {
      if (++visits > MAX_VISITS) {
        partial = true;
        break;
      }
      let pc = todo.pop()!;
      const state = cloneState(states.get(pc)!);
      // Straight-line code runs on one state; it's stored again only where
      // something else has already joined.
      let w = this.memory.code(pc)!;
      let flow = this.flow(w, pc);
      while (flow === null && visits < MAX_VISITS) {
        this.exec(w, state);
        pc += 4;
        visits++;
        const next = this.memory.code(pc);
        if (next === null || states.has(pc)) break;
        w = next;
        flow = this.flow(w, pc);
      }
      if (flow === null) {
        enqueue(pc, state);
        continue;
      }
      // A branch or jump: its delay slot runs first (only when taken, for a likely branch).
      const before = cloneState(state);
      if (flow.link) state.regs[31] = constant(pc + 8);
      const slot = this.memory.code(pc + 4);
      if (slot !== null && this.flow(slot, pc + 4) === null) this.exec(slot, state);
      switch (flow.kind) {
        case "branch":
          enqueue(flow.target, state);
          enqueue(pc + 8, flow.likely ? before : state);
          break;
        case "jump":
          // A tail call to a player is a play like any other; one out of
          // game code is a tail call into the library. A `b` that leaves the
          // image is code not followed.
          if (PLAYERS.has(flow.target)) call(pc, [flow.target], state);
          else if (this.isCode(flow.target)) enqueue(flow.target, state);
          else if (w >>> 26 === 0x02) call(pc, [], state);
          else partial = true;
          break;
        case "call":
          call(
            pc,
            flow.target === null ? constTargets(before.regs[flow.reg]!) : [flow.target],
            state,
          );
          enqueue(pc + 8, afterCall(state));
          break;
        case "return":
          break;
        case "jr": {
          const table = this.jumpTable(pc);
          if (table) for (const t of table) enqueue(t, state);
          else {
            // A tail call through a register, or a switch not understood.
            const targets = constTargets(before.regs[flow.reg]!);
            if (targets.length) call(pc, targets, state);
            else if (this.isVirtualCall(pc, flow.reg)) call(pc, [], state);
            else partial = true;
          }
          break;
        }
      }
    }
    const result = { calls: [...calls.values()], partial };
    this.walked.set(entry, result);
    return result;
  }

  /** What `w` at `pc` does to control flow; null for a plain instruction. */
  private flow(
    w: number,
    pc: number,
  ):
    | { kind: "branch"; target: number; likely: boolean; link: boolean }
    | { kind: "jump"; target: number; link: false }
    | { kind: "call"; target: number | null; reg: number; link: true }
    | { kind: "return"; link: false }
    | { kind: "jr"; reg: number; link: false }
    | null {
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const target = (pc + 4 + (s16(w & 0xffff) << 2)) >>> 0;
    const jump = ((pc & 0xf0000000) | ((w & 0x3ffffff) << 2)) >>> 0;
    if (op === 0x00 && (w & 0x3f) === 0x08)
      return rs === 31 ? { kind: "return", link: false } : { kind: "jr", reg: rs, link: false };
    if (op === 0x00 && (w & 0x3f) === 0x09)
      return { kind: "call", target: null, reg: rs, link: true };
    if (op === 0x02) return { kind: "jump", target: jump, link: false };
    if (op === 0x03) return { kind: "call", target: jump, reg: 0, link: true };
    if (op === 0x01) {
      if (rt === 0x10 || rt === 0x11 || rt === 0x12 || rt === 0x13) {
        // bltzal, bgezal: `bal` (bgezal $zero) is a call.
        if (rs === 0 && (rt === 0x11 || rt === 0x13))
          return { kind: "call", target, reg: 0, link: true };
        return { kind: "branch", target, likely: rt >= 0x12, link: true };
      }
      if (rt <= 3) {
        // bgez $zero is `b`.
        if (rs === 0 && rt === 1) return { kind: "jump", target, link: false };
        return { kind: "branch", target, likely: rt >= 2, link: false };
      }
      return null;
    }
    if ((op >= 0x04 && op <= 0x07) || (op >= 0x14 && op <= 0x17)) {
      if (op === 0x04 && rs === 0 && rt === 0) return { kind: "jump", target, link: false }; // b
      return { kind: "branch", target, likely: op >= 0x14, link: false };
    }
    // bc1f/bc1t(l), and the VFPU's bvf/bvt(l)
    if ((op === 0x11 || op === 0x12) && rs === 0x08)
      return { kind: "branch", target, likely: ((w >>> 17) & 1) === 1, link: false };
    return null;
  }

  /** Runs a non-branch instruction on the abstract state. */
  private exec(w: number, s: State): void {
    const r = s.regs;
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const rd = (w >>> 11) & 31;
    const sa = (w >>> 6) & 31;
    const imm = w & 0xffff;
    const simm = s16(imm);
    const set = (reg: number, v: Values) => {
      if (reg !== 0) r[reg] = v;
    };
    const add = (v: Values, n: number) =>
      mapValues(v, (x) =>
        x.k === "c"
          ? { k: "c", v: (x.v + n) >>> 0 }
          : x.k === "a"
            ? { ...x, off: x.off + n }
            : x.k === "s"
              ? { k: "s", off: x.off + n }
              : x.k === "r"
                ? x
                : n === 0
                  ? x
                  : null,
      );
    const consts = (v: Values, f: (n: number) => number) =>
      mapValues(v, (x) => (x.k === "c" ? { k: "c", v: f(x.v) >>> 0 } : null));

    switch (op) {
      case 0x00: {
        const fn = w & 0x3f;
        const a = r[rs]!;
        const b = r[rt]!;
        switch (fn) {
          case 0x21: // addu
          case 0x20:
          case 0x25: // or
            set(
              rd,
              onlyZero(a)
                ? b
                : onlyZero(b)
                  ? a
                  : fn === 0x25
                    ? constPairs(a, b, (x, y) => x | y)
                    : constPairs(a, b, (x, y) => x + y),
            );
            return;
          case 0x23:
          case 0x22:
            set(
              rd,
              constPairs(a, b, (x, y) => x - y),
            );
            return;
          case 0x24:
            set(
              rd,
              constPairs(a, b, (x, y) => x & y),
            );
            return;
          case 0x00:
            set(
              rd,
              consts(b, (x) => x << sa),
            );
            return;
          case 0x02:
            set(
              rd,
              consts(b, (x) => x >>> sa),
            );
            return;
          case 0x03:
            set(
              rd,
              consts(b, (x) => (x | 0) >> sa),
            );
            return;
          case 0x0a: // movz, movn: maybe
          case 0x0b:
            set(rd, join(r[rd]!, a));
            return;
          case 0x2a:
          case 0x2b:
            set(rd, BOOL);
            return;
          case 0x08:
          case 0x09:
          case 0x0c:
          case 0x0d:
          case 0x0f:
          case 0x11:
          case 0x13:
          case 0x18:
          case 0x19:
          case 0x1a:
          case 0x1b:
          case 0x1c:
          case 0x1d:
          case 0x2e:
          case 0x2f:
            return; // no general register written (hi/lo, syscall, sync, …)
          default:
            set(rd, null);
            return;
        }
      }
      case 0x08:
      case 0x09:
        set(rt, add(r[rs]!, simm));
        return;
      case 0x0a:
      case 0x0b:
        set(rt, BOOL);
        return;
      case 0x0c: {
        // andi: masking an index to a byte or half keeps it
        const v = r[rs]!;
        set(
          rt,
          mapValues(v, (x) =>
            x.k === "c"
              ? { k: "c", v: x.v & imm }
              : (imm === 0xff || imm === 0xffff) && x.k !== "s"
                ? x
                : null,
          ),
        );
        return;
      }
      case 0x0d:
        set(rt, imm === 0 ? r[rs]! : consts(r[rs]!, (x) => x | imm));
        return;
      case 0x0e:
        set(
          rt,
          consts(r[rs]!, (x) => x ^ imm),
        );
        return;
      case 0x0f:
        set(rt, constant(imm << 16));
        return;
      case 0x1f: {
        const fn = w & 0x3f;
        if (fn === 0x20 && (sa === 0x10 || sa === 0x18)) {
          // seb, seh
          const bits = sa === 0x10 ? 24 : 16;
          set(
            rd,
            mapValues(r[rt]!, (x) => (x.k === "c" ? { k: "c", v: (x.v << bits) >> bits } : x)),
          );
        } else if (fn === 0x00)
          set(
            rt,
            consts(r[rs]!, (x) => (rd === 31 ? x >>> sa : (x >>> sa) & ((1 << (rd + 1)) - 1))),
          );
        else if (fn === 0x04) set(rt, null);
        else if (fn === 0x20) set(rd, null);
        return;
      }
      case 0x20:
      case 0x21:
      case 0x23:
      case 0x24:
      case 0x25: {
        const size = op === 0x23 ? 4 : op === 0x21 || op === 0x25 ? 2 : 1;
        const signed = op === 0x20 || op === 0x21;
        set(
          rt,
          mapValues(r[rs]!, (x) => {
            if (x.k === "c") {
              const v = this.load((x.v + simm) >>> 0, size, signed);
              return v === null ? null : { k: "c", v };
            }
            if (x.k === "a") return { k: "l", n: x.n, off: x.off + simm, size, signed };
            if (x.k === "s") {
              const slot = s.stack.get(x.off + simm);
              if (slot === undefined || slot === null) return null;
              return [...slot.values()];
            }
            return null;
          }),
        );
        return;
      }
      case 0x22:
      case 0x26:
      case 0x30:
        set(rt, null);
        return;
      case 0x28:
      case 0x29:
      case 0x2b:
      case 0x2a:
      case 0x2e:
      case 0x38: {
        const base = r[rs]!;
        if (base === null) return;
        const slots = [...base.values()].flatMap((x) => (x.k === "s" ? [x.off + simm] : []));
        if (slots.length === 1 && base.size === 1 && op === 0x2b) s.stack.set(slots[0]!, r[rt]!);
        else for (const slot of slots) s.stack.delete(slot);
        if (op === 0x38) set(rt, BOOL);
        return;
      }
      case 0x11: {
        // mfc1, cfc1 write a general register.
        if (rs === 0x00 || rs === 0x02) set(rt, null);
        return;
      }
      case 0x12: // mfv, mfvc
        if (rs === 0x03) set(rt, null);
        return;
      default:
        return;
    }
  }

  /** What the function at `entry` plays, in terms of its arguments. */
  summary(entry: number, depth = 0): Play[] {
    const cached = this.summaries.get(entry);
    if (cached) return cached;
    if (this.busy.has(entry)) {
      // Its plays are counted where it's being worked out.
      this.cuts.add(entry);
      return [];
    }
    if (depth > MAX_DEPTH) {
      this.cuts.add(DEEP);
      return [{ on: null, index: null, at: entry }];
    }
    this.busy.add(entry);
    const outer = this.cuts;
    this.cuts = new Set();
    const { calls, partial } = this.walk(entry);
    const plays = new Map<string, Play>();
    const add = (p: Play) => plays.set(playKey(p), p);
    // Code the walk couldn't follow may play anything.
    if (partial) add({ on: null, index: null, at: entry });
    const list = (v: Values) => (v === null ? null : [...v.values()]);

    for (const site of calls) {
      for (const target of site.targets) {
        if (PLAYERS.has(target)) {
          this.playerSites.add(site.at);
          const index = list(site.args[1]!);
          const known = index && index.every((v) => v.k !== "s" && v.k !== "r");
          add({ on: list(site.args[0]!), index: known ? index : null, at: site.at });
          continue;
        }
        // game_task calls into the overlay slot are meant for whichever
        // family's overlay is loaded: one landing mid-function isn't this one's.
        if (!this.isCode(target)) continue;
        if (site.at < EM_OVERLAY_START && !this.isFunctionStart(target)) continue;
        for (const play of this.summary(target, depth + 1)) {
          const index = play.index && this.substitute(play.index, site.args);
          add({
            on: play.on && this.substitute(play.on, site.args),
            index,
            at: play.index && !index ? site.at : play.at,
          });
        }
      }
    }
    this.busy.delete(entry);
    const result = [...plays.values()];
    const cuts = this.cuts;
    cuts.delete(entry);
    if (cuts.size === 0) this.summaries.set(entry, result);
    for (const cut of cuts) outer.add(cut);
    this.cuts = outer;
    return result;
  }

  /** Callee values in the caller's terms, given its arguments; null if lost. */
  private substitute(list: Value[], args: Values[]): Value[] | null {
    const out: Value[] = [];
    for (const v of list) {
      const put = this.substituteOne(v, args);
      if (put === null) return null;
      out.push(...put);
    }
    return out.length > MAX_VALUES ? null : out;
  }

  private substituteOne(v: Value, args: Values[]): Value[] | null {
    if (v.k === "c" || v.k === "r") return [v];
    if (v.k === "s") return null;
    const arg = args[v.n - 4]!;
    if (arg === null) return null;
    const out: Value[] = [];
    for (const x of arg.values()) {
      if (v.k === "a") {
        if (x.k === "c") out.push({ k: "c", v: (x.v + v.off) >>> 0 });
        else if (x.k === "a") out.push({ ...x, off: x.off + v.off });
        else if (x.k === "r") out.push(x);
        else if (x.k === "l" && v.off === 0) out.push(x);
        else return null;
      } else {
        if (x.k === "c") {
          const loaded = this.load((x.v + v.off) >>> 0, v.size, v.signed);
          if (loaded === null) return null;
          out.push({ k: "c", v: loaded >>> 0 });
        } else if (x.k === "a") out.push({ ...v, n: x.n, off: x.off + v.off });
        else return null;
      }
    }
    return out;
  }
}

/**
 * Whether a play in a method's terms may be on the monster itself (`this`,
 * a0): not when it's on an object a call returned, a constant, the stack,
 * or something the monster points at.
 */
function mayBeThis(on: Value[] | null): boolean {
  if (on === null) return true;
  return on.some((v) => (v.k === "a" && (v.n !== 4 || v.off === 0)) || (v.k === "l" && v.n !== 4));
}

/** What a class's methods play: record indices, and calls whose index couldn't be followed. */
export interface PlayedRecords {
  records: number[];
  /** Calls (vaddr) whose record index couldn't be followed to a constant. */
  unresolved: number[];
  /** Calls to the motion players the walk reached. */
  playerSites: number[];
}

/** The motion records the methods at `methods` (a class's vtable) may play on the monster. */
export function playedRecords(memory: Memory, methods: readonly number[]): PlayedRecords {
  const walker = new Walker(memory);
  const records = new Set<number>();
  const unresolved = new Set<number>();
  for (const method of methods) {
    if (method < CODE_RANGE[0] || method >= CODE_RANGE[1]) continue;
    for (const play of walker.summary(method)) {
      // A play on another object (an effect, an attack object, or one a
      // call looked up) may still be on the monster: its constant records
      // count as used, which can only hide an unused motion, but an index it
      // can't follow doesn't make the monster's result uncertain.
      const own = mayBeThis(play.on);
      if (play.index === null) {
        if (own) unresolved.add(play.at);
      } else
        for (const v of play.index)
          if (v.k === "c") records.add(v.v | 0);
          // An index from the monster's state, or handed in by whoever
          // calls the method: not followed.
          else if (own) unresolved.add(play.at);
    }
  }
  return {
    records: sorted(records),
    unresolved: sorted(unresolved),
    playerSites: sorted(walker.playerSites),
  };
}

export interface MotionUse extends PlayedRecords {
  /** Motion slots the monster's code can play. */
  used: number[];
  /** Motion slots neither used nor known unused (the shared table's, when a record can switch to it). */
  undecided: number[];
  /** Why `used` can't be trusted, if it can't: a record index the walk couldn't follow. */
  uncertain?: string;
  /** The emNN.ovl the class's code came from, if any. */
  overlay?: number;
}

/**
 * The motion slots that playing `records` from the record table at `table`
 * can reach.
 */
export function recordSlots(
  memory: Memory,
  table: number,
  records: readonly number[],
): { used: number[]; undecided: number[] } {
  const indices = records.filter((i) => i >= 0 && i < MAX_RECORDS);
  const used = new Set(indices.map((i) => memory.u8(table + 8 * i)));
  // A record with byte 3 set can switch the monster to the shared table
  // (Lao-Shan Lung's alternates of its walking motions 1-10), after which
  // index i plays the shared table's record i. What sets the flag allowing
  // it, and so when, wasn't found: where the table (its length isn't
  // stored: up to the last record played) has such a record, the shared
  // table's motions are left undecided rather than called unused.
  const last = Math.max(-1, ...indices);
  let switching = false;
  for (let i = 0; i <= last && !switching; i++) switching = memory.u8(table + 8 * i + 3) !== 0;
  const undecided = new Set<number>();
  if (switching)
    for (let i = 0; i < SHARED_RECORD_COUNT; i++) undecided.add(memory.u8(SHARED_RECORDS + 8 * i));
  for (const slot of used) undecided.delete(slot);
  return { used: sorted(used), undecided: sorted(undecided) };
}

/**
 * The motion slots monster `emId`'s class can play. `image` is the game
 * with no monster overlay (the EBOOT's segments, game_task and game_sub);
 * `overlays` the emNN.ovl files by emID, `preferred` the one to pick on a
 * tie (overlayForVtable).
 */
export function findMotionUse(
  image: ImageSegment[],
  overlays: ReadonlyMap<number, ImageSegment>,
  emId: number,
  preferred = emId,
): MotionUse | { error: string } {
  if (emId < 0 || emId >= SPAWN_SWITCH_CASES) return { error: `emID ${emId} has no spawn case` };
  const probe = new Memory();
  for (const { base, bytes } of image) probe.add(base, bytes);
  const vtable = vtableOfCase(probe, probe.u32(SPAWN_SWITCH + emId * 4));
  if (vtable === null || !isUserAddress(vtable))
    return { error: "no class vtable in its spawn case" };
  const overlay = overlayForVtable(probe, vtable, overlays, preferred);
  const memory = new Memory();
  for (const { base, bytes } of overlay === undefined ? image : [...image, overlays.get(overlay)!])
    memory.add(base, bytes);
  const table = memory.u32(RECORD_TABLES + emId * 4);
  if (!isUserAddress(table)) return { error: "no motion record table" };

  const methods: number[] = [];
  for (let at = vtable + 8; memory.u32(at) && methods.length < 256; at += 4)
    methods.push(memory.u32(at));
  const played = playedRecords(memory, methods);
  const result: MotionUse = { ...played, ...recordSlots(memory, table, played.records) };
  if (played.unresolved.length)
    result.uncertain = `record index not followed at ${played.unresolved.map((a) => `0x${a.toString(16)}`).join(", ")}`;
  if (overlay !== undefined) result.overlay = overlay;
  return result;
}
