/**
 * Just enough MIPS (Allegrex) decoding to follow constant addresses through
 * overlay code: the `lui` + `addiu`/`ori` pairs that build an address, the
 * loads and stores that use one, `jal` calls, and function prologues.
 *
 * `scanCode` reads every word of an overlay as an instruction, data
 * included; the decoded "addresses" in data are noise, and only those that
 * land on something interesting (an attack table) are kept by callers.
 * Register values are tracked within straight-line code only: a call,
 * jump or return clears them after its delay slot.
 */
import type { OvlFile } from "../container/ovl.js";
import { OVL_HEADER_SIZE } from "../container/ovl.js";

export interface AddressUse {
  /** File offset of the instruction that completes the address. */
  offset: number;
  /** "addiu"/"ori" build it into a register; "mem" loads or stores at it. */
  kind: "addiu" | "ori" | "mem";
}

export interface CodeScan {
  /** Every constant address the code builds or touches, by address. */
  addresses: Map<number, AddressUse[]>;
  /** `jal` calls: file offset of the call and its target vaddr. */
  calls: { offset: number; target: number }[];
  /** File offsets of `addiu sp, sp, -n` (function prologues). */
  prologues: number[];
}

const OP_SPECIAL = 0x00;
const OP_J = 0x02;
const OP_JAL = 0x03;
const OP_ADDIU = 0x09;
const OP_ORI = 0x0d;
const OP_LUI = 0x0f;
/** lb lh lwl lw lbu lhu lwr; sb sh swl sw swr; lwc1 swc1 (FPU register in rt). */
const LOADS = new Set([0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26]);
const STORES = new Set([0x28, 0x29, 0x2a, 0x2b, 0x2e]);
const FPU_MEM = new Set([0x31, 0x39]);
/** I-type ops that write rt: addi addiu slti sltiu andi ori xori lui. */
const WRITES_RT = new Set([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
const FUNCT_JR = 0x08;
const FUNCT_JALR = 0x09;
const FUNCT_ADDU = 0x21;
const FUNCT_OR = 0x25;
const RA = 31;
const SP = 29;
/** Registers a call may change: at, v0-v1, a0-a3, t0-t9, ra. */
const CALLER_SAVED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 31];

export function scanCode(ovl: OvlFile): CodeScan {
  const r = ovl.reader;
  const addresses = new Map<number, AddressUse[]>();
  const calls: CodeScan["calls"] = [];
  const prologues: number[] = [];
  const regs: (number | undefined)[] = new Array(32).fill(undefined);
  const record = (address: number, offset: number, kind: AddressUse["kind"]) => {
    const list = addresses.get(address);
    if (list) list.push({ offset, kind });
    else addresses.set(address, [{ offset, kind }]);
  };
  // After the delay slot: "all" clears every register, "call" the caller-saved ones.
  let pending: { at: number; clear: "all" | "call" } | null = null;

  for (let at = OVL_HEADER_SIZE; at + 4 <= r.length; at += 4) {
    const w = r.u32(at);
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const imm = w & 0xffff;
    const simm = (imm << 16) >> 16;
    const base = regs[rs];

    if (op === OP_LUI) {
      regs[rt] = (imm << 16) >>> 0;
    } else if (op === OP_ADDIU) {
      if (rs === SP && rt === SP && simm < 0) prologues.push(at);
      if (base !== undefined && rs !== SP) {
        const v = (base + simm) >>> 0;
        regs[rt] = v;
        record(v, at, "addiu");
      } else {
        regs[rt] = undefined;
      }
    } else if (op === OP_ORI) {
      if (base !== undefined) {
        const v = (base | imm) >>> 0;
        regs[rt] = v;
        record(v, at, "ori");
      } else {
        regs[rt] = undefined;
      }
    } else if (LOADS.has(op) || STORES.has(op) || FPU_MEM.has(op)) {
      if (base !== undefined && rs !== SP) record((base + simm) >>> 0, at, "mem");
      if (LOADS.has(op)) regs[rt] = undefined;
    } else if (WRITES_RT.has(op)) {
      regs[rt] = undefined;
    } else if (op === OP_JAL) {
      calls.push({
        offset: at,
        target: (((ovl.loadBase + at + 4) & 0xf0000000) | ((w & 0x03ffffff) << 2)) >>> 0,
      });
      pending = { at: at + 4, clear: "call" };
    } else if (op === OP_J) {
      pending = { at: at + 4, clear: "all" };
    } else if (op === OP_SPECIAL) {
      const rd = (w >>> 11) & 31;
      const funct = w & 0x3f;
      if (funct === FUNCT_JR) {
        if (rs === RA) pending = { at: at + 4, clear: "all" };
      } else if (funct === FUNCT_JALR) {
        regs[rd] = undefined;
        pending = { at: at + 4, clear: "call" };
      } else if ((funct === FUNCT_ADDU || funct === FUNCT_OR) && rt === 0) {
        regs[rd] = regs[rs];
      } else {
        regs[rd] = undefined;
      }
    } else {
      // Anything else (FPU, Allegrex extensions, data) may write rt.
      regs[rt] = undefined;
    }
    regs[0] = 0;

    if (pending && pending.at === at) {
      if (pending.clear === "all") regs.fill(undefined);
      else for (const reg of CALLER_SAVED) regs[reg] = undefined;
      regs[0] = 0;
      pending = null;
    }
  }
  return { addresses, calls, prologues };
}
