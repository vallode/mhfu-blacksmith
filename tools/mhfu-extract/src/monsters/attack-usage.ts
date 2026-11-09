/**
 * Which attack records each monster's code uses (vallode/mhfu-blacksmith#122).
 *
 * A monster attack hits through a shell (`monsters/attacks.ts`). Its class
 * (a vtable in the EBOOT) has a setup that copies one record of the class's
 * table into the shell, by calling a record copier entry with the record
 * index in a2 and the struct after the table in a3. The index comes from
 * the shell's bytes: its kind (`+0x0D`) and variant (`+0x8B`), which the
 * code spawning the shell sets from its arguments. So:
 *
 * 1. **Rules** (`indexRule`): at each call to a copier entry, the value in
 *    a2, read back through the instructions before it as an expression of
 *    the kind, the variant, constants and loads from the overlay (on the EU
 *    disc: the kind, kind + 1, `s8[array + kind]`, `s16[array + kind * 2]`,
 *    `s16[start + kind * 2] + variant`, or a constant).
 * 2. **Spawn entries** (`fieldArg`): for each class's constructor, which
 *    argument reaches the kind (and variant), either in the constructor
 *    itself (when it also allocates and initialises) or in each function
 *    calling it (the `ShellManager` wrappers in `game_task.ovl`), following
 *    moves and calls into the init chain.
 * 3. **Usage**: every call to a spawn entry with a constant kind, evaluated
 *    through the class's rule to a record of its table, grouped by the file
 *    of the calling code (a per-monster overlay is a monster family).
 */
import type { BinaryReader } from "../binary/reader.js";
import type { OvlFile } from "../container/ovl.js";
import { ATTACK_RECORD_SIZE } from "./attacks.js";
import type { CodeGraph } from "./code-graph.js";

/** A symbolic value: what a register holds at some instruction. */
export type Expr =
  | { k: "const"; v: number }
  | { k: "field"; off: number }
  | { k: "add"; a: Expr; b: Expr }
  | { k: "shl"; a: Expr; n: number }
  | { k: "load"; addr: Expr; width: 1 | 2 | 4; signed: boolean }
  | { k: "unknown" };

const UNKNOWN: Expr = { k: "unknown" };
const KIND = 0x0d;
const VARIANT = 0x8b;
const MAX_DEPTH = 12;
const WALK_BYTES = 0x800;
const WALK_CALL_DEPTH = 3;

const LOADS: Record<number, { width: 1 | 2 | 4; signed: boolean }> = {
  0x20: { width: 1, signed: true },
  0x21: { width: 2, signed: true },
  0x23: { width: 4, signed: false },
  0x24: { width: 1, signed: false },
  0x25: { width: 2, signed: false },
};
/** Ops that write rt (I-type arithmetic and loads; SPECIAL3 `ext`/`ins`). */
const WRITES_RT = new Set([
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
]);
/** The register an instruction writes, if any. */
function destOf(w: number): number | null {
  const op = w >>> 26;
  if (op === 0) {
    const funct = w & 0x3f;
    return funct === 0x08 || funct === 0x18 || funct === 0x19 ? null : (w >>> 11) & 31;
  }
  // SPECIAL3 `bshfl` (seb, seh, wsbh) writes rd.
  if (op === 0x1f && (w & 0x3f) === 0x20) return (w >>> 11) & 31;
  return WRITES_RT.has(op) ? (w >>> 16) & 31 : null;
}

/** The last instruction at or before `at` (the delay slot of `site` first) writing `reg`. */
function writerOf(
  r: BinaryReader,
  from: number,
  at: number,
  reg: number,
  slot?: number,
): number | null {
  const order = slot !== undefined ? [slot] : [];
  for (let i = at; i >= from; i -= 4) order.push(i);
  for (const i of order) if (destOf(r.u32(i)) === reg) return i;
  return null;
}

/**
 * What `reg` holds just before the instruction at `at` (with `slot`, the
 * delay slot of a call at `at`, executed first), within the function
 * starting at `from`, followed back through straight-line code.
 */
export function valueOf(
  r: BinaryReader,
  from: number,
  at: number,
  reg: number,
  slot?: number,
  depth = 0,
): Expr {
  if (reg === 0) return { k: "const", v: 0 };
  if (depth > MAX_DEPTH) return UNKNOWN;
  const i = writerOf(r, from, at - 4, reg, slot);
  if (i === null) return UNKNOWN;
  const w = r.u32(i);
  const op = w >>> 26;
  const rs = (w >>> 21) & 31;
  const rt = (w >>> 16) & 31;
  const imm = w & 0xffff;
  const simm = (imm << 16) >> 16;
  const prev = (src: number) => valueOf(r, from, i, src, undefined, depth + 1);
  if (op === 0x0f) return { k: "const", v: (imm << 16) >>> 0 };
  if (op === 0x09)
    return rs === 0 ? { k: "const", v: simm } : add(prev(rs), { k: "const", v: simm });
  if (op === 0x0d) return rs === 0 ? { k: "const", v: imm } : add(prev(rs), { k: "const", v: imm });
  if (op === 0x0c && imm === 0xff) return prev(rs);
  if (op === 0x1f && (w & 0x3f) === 0x20) return prev(rt);
  const load = LOADS[op];
  if (load) {
    const base = prev(rs);
    // A field of the shell (a register holding an unknown pointer), or a
    // table read at a computed address.
    if (base.k === "unknown") return load.width === 1 ? { k: "field", off: simm } : UNKNOWN;
    return { k: "load", addr: add(base, { k: "const", v: simm }), ...load };
  }
  if (op === 0) {
    const funct = w & 0x3f;
    if (funct === 0x21 || funct === 0x25) {
      if (rt === 0) return prev(rs);
      if (rs === 0) return prev(rt);
      return add(prev(rs), prev(rt));
    }
    if (funct === 0x00) return { k: "shl", a: prev(rt), n: (w >>> 6) & 31 };
  }
  return UNKNOWN;
}

function add(a: Expr, b: Expr): Expr {
  if (a.k === "const" && b.k === "const") return { k: "const", v: (a.v + b.v) >>> 0 };
  if (b.k === "const" && b.v === 0) return a;
  return { k: "add", a, b };
}

/** Evaluates `e` for a shell of `kind` and `variant`, reading loads through `mem`. */
export function evaluate(
  e: Expr,
  kind: number,
  variant: number,
  mem: (address: number, width: 1 | 2 | 4, signed: boolean) => number | null,
): number | null {
  switch (e.k) {
    case "const":
      return e.v;
    case "field":
      return e.off === KIND ? kind : e.off === VARIANT ? variant : null;
    case "add": {
      const a = evaluate(e.a, kind, variant, mem);
      const b = evaluate(e.b, kind, variant, mem);
      return a === null || b === null ? null : (a + b) >>> 0;
    }
    case "shl": {
      const a = evaluate(e.a, kind, variant, mem);
      return a === null ? null : (a << e.n) >>> 0;
    }
    case "load": {
      const address = evaluate(e.addr, kind, variant, mem);
      return address === null ? null : mem(address, e.width, e.signed);
    }
    default:
      return null;
  }
}

/** `e` as text: "kind", "variant", "s16[0x9c00f68 + kind << 1] + variant", ... */
export function render(e: Expr): string {
  switch (e.k) {
    case "const":
      return e.v > 0xffff ? `0x${e.v.toString(16)}` : String(e.v | 0);
    case "field":
      return e.off === KIND
        ? "kind"
        : e.off === VARIANT
          ? "variant"
          : `byte 0x${e.off.toString(16)}`;
    case "add":
      return `${render(e.a)} + ${render(e.b)}`;
    case "shl":
      return `${render(e.a)} << ${e.n}`;
    case "load":
      return `${e.signed ? "s" : "u"}${e.width * 8}[${render(e.addr)}]`;
    default:
      return "?";
  }
}

/** Where a register's value came from, for `fieldArg`. */
type Origin = { k: "arg"; i: number } | { k: "obj" } | null;
const ARG_REGS = [4, 5, 6, 7, 8, 9, 10, 11];
const CALLER_SAVED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 31];

/**
 * Which argument of the function at `offset` ends up stored at `field` of
 * the shell: walking it forward, following moves; a store of a register to
 * `field` off the shell, or a call passing the shell in a0 to a function
 * that stores one of its arguments there. The shell is the function's a0
 * (`objIsArg0`), or (for a wrapper) the value a call to one of `ctors`
 * returns or a register a constant vtable is stored through.
 */
export function fieldArg(
  graph: CodeGraph,
  fileName: string,
  offset: number,
  field: number,
  objIsArg0: boolean,
  ctors: ReadonlySet<number>,
  /** The overlay to read a call into the shared per-monster range from. */
  preferFile: string = fileName,
  depth = 0,
  memo = new Map<string, number | null>(),
): number | null {
  const key = `${fileName}:${offset}:${field}:${objIsArg0}:${preferFile}`;
  if (memo.has(key)) return memo.get(key)!;
  memo.set(key, null);
  const ovl = graph.overlay(fileName);
  if (!ovl || depth > WALK_CALL_DEPTH) return null;
  const r = ovl.reader;
  const regs: Origin[] = new Array(32).fill(null);
  ARG_REGS.forEach((reg, i) => (regs[reg] = { k: "arg", i }));
  const isObj = (o: Origin) => (objIsArg0 ? o?.k === "arg" && o.i === 0 : o?.k === "obj");
  const end = Math.min(graph.funcEnd(fileName, offset), offset + WALK_BYTES, r.length);
  let pendingCall: { target: number; tail: boolean } | null = null;
  // An unconditional forward branch (`b`, i.e. `beq zero, zero`) skips the
  // code it jumps over (an else path) after its delay slot.
  let pendingBranch: number | null = null;
  let result: number | null = null;
  for (let at = offset; at + 4 <= end && result === null; at += 4) {
    const w = r.u32(at);
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const imm = (((w & 0xffff) << 16) >> 16) as number;
    const call = pendingCall;
    pendingCall = null;
    const branch = pendingBranch;
    pendingBranch = null;
    if (op === 0x04 && rs === 0 && rt === 0 && imm > 0) pendingBranch = at + 4 + imm * 4;
    if (op === 0x28 && imm === field && isObj(regs[rs] ?? null)) {
      const src = regs[rt];
      if (src?.k === "arg") result = src.i;
    } else if (op === 0x2b && imm === 0 && !objIsArg0 && regs[rs] === null) {
      regs[rs] = { k: "obj" };
    } else if (op === 0 && ((w & 0x3f) === 0x21 || (w & 0x3f) === 0x25) && rt === 0) {
      regs[(w >>> 11) & 31] = regs[rs] ?? null;
    } else if (op === 0x0c && ((w & 0xffff) === 0xff || (w & 0xffff) === 0xffff)) {
      // Masking to a byte or halfword keeps the value.
      regs[rt] = regs[rs] ?? null;
    } else if (op === 0x1f && (w & 0x3f) === 0x20) {
      // seb / seh likewise.
      regs[(w >>> 11) & 31] = regs[rt] ?? null;
    } else if (op === 0x03 || op === 0x02) {
      const target = (((ovl.loadBase + at + 4) & 0xf0000000) | ((w & 0x03ffffff) << 2)) >>> 0;
      pendingCall = { target, tail: op === 0x02 };
    } else if (op === 0 && (w & 0x3f) === 0x08 && rs === 31) {
      break;
    } else {
      const dest = destOf(w);
      if (dest !== null) regs[dest] = null;
    }
    regs[0] = null;
    if (branch !== null) at = branch - 4;
    if (!call) continue;
    // After the delay slot: the call happens with the registers as they are now.
    const args = ARG_REGS.map((reg) => regs[reg]);
    const candidates = graph.locate(call.target, fileName);
    const where = candidates.find((c) => c.file === preferFile) ?? candidates[0];
    if (where && isObj(args[0]!)) {
      const k = fieldArg(
        graph,
        where.file,
        where.offset,
        field,
        true,
        ctors,
        preferFile,
        depth + 1,
        memo,
      );
      const src = k === null ? null : args[k];
      if (src?.k === "arg") result = src.i;
    }
    if (call.tail) break;
    for (const reg of CALLER_SAVED) regs[reg] = null;
    if (where && ctors.has(call.target)) regs[2] = { k: "obj" };
  }
  memo.set(key, result);
  return result;
}

export interface IndexRule {
  /** The table, as "file@0xoffset" of its first record, and its record count. */
  table: string;
  count: number;
  rule: string;
  expr: Expr;
  /** The copier call it was read at. */
  site: { file: string; offset: number };
}

/**
 * The rule at each call to a record copier entry whose a3 is the struct
 * after a known table (`structs`: "file:offset" of the struct -> table).
 */
export function indexRules(
  graph: CodeGraph,
  structs: ReadonlyMap<string, { table: string; count: number }>,
): { func: { file: string; offset: number }; rule: IndexRule }[] {
  const out: { func: { file: string; offset: number }; rule: IndexRule }[] = [];
  for (const copier of graph.recordCopiers().filter((c) => c.entry)) {
    for (const site of graph.sitesTo(copier.file, copier.offset)) {
      const ovl = graph.overlay(site.file)!;
      const r = ovl.reader;
      const end = valueOf(r, site.func, site.offset, 7, site.offset + 4);
      if (end.k !== "const") continue;
      const [where] = graph.locate(end.v, site.file);
      const table = where && structs.get(`${where.file}:${where.offset}`);
      if (!table) continue;
      const expr = valueOf(r, site.func, site.offset, 6, site.offset + 4);
      out.push({
        func: { file: site.file, offset: site.func },
        rule: {
          ...table,
          rule: render(expr),
          expr,
          site: { file: site.file, offset: site.offset },
        },
      });
    }
  }
  return out;
}

/** Reads `width` bytes at `address` from the overlay it means when read from `fromFile`. */
export function memoryReader(
  graph: CodeGraph,
  fromFile: string,
): (address: number, width: 1 | 2 | 4, signed: boolean) => number | null {
  return (address, width, signed) => {
    const [where] = graph.locate(address, fromFile);
    if (!where) return null;
    const ovl = graph.overlay(where.file) as OvlFile;
    const r = ovl.reader;
    if (where.offset + width > r.length) return null;
    if (width === 1) return signed ? r.s8(where.offset) : r.u8(where.offset);
    if (width === 2) return signed ? r.s16(where.offset) : r.u16(where.offset);
    return r.u32(where.offset);
  };
}

/** The record index `rule` gives for a kind and variant, if it lands in its table. */
export function recordFor(
  rule: IndexRule,
  kind: number,
  variant: number,
  mem: (address: number, width: 1 | 2 | 4, signed: boolean) => number | null,
): number | null {
  const index = evaluate(rule.expr, kind, variant, mem);
  return index !== null && index >= 0 && index < rule.count ? index : null;
}

export { ATTACK_RECORD_SIZE };
