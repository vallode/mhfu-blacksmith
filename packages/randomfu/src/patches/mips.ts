/**
 * Shared helpers for patching the EBOOT and overlays' MIPS (Allegrex) code:
 * masked code signatures, the ELF code segment, and a tiny assembler.
 */

export const R = {
  zero: 0,
  at: 1,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  t0: 8,
  t1: 9,
  t2: 10,
  t3: 11,
  t4: 12,
  t5: 13,
  t6: 14,
  t7: 15,
  t8: 24,
  t9: 25,
} as const;
export const S = [16, 17, 18, 19, 20, 21] as const;
export const SP = 29;
export const RA = 31;

/** Opcodes whose immediate is a constant when `rs` is `$zero`: addiu, ori, and loads and stores. */
const CONSTANT_OPS = new Set([0x09, 0x0d, 0x20, 0x21, 0x24, 0x25, 0x28, 0x29]);

export function maskWord(word: number): number {
  const op = word >>> 26;
  const rs = (word >>> 21) & 31;
  if (op === 0x02 || op === 0x03) return (word & 0xfc000000) >>> 0;
  if (op === 0x0f || op === 0x23 || op === 0x2b) return (word & 0xffff0000) >>> 0;
  if (rs === 0 && CONSTANT_OPS.has(op)) return (word & 0xffff0000) >>> 0;
  return word >>> 0;
}

export interface Segment {
  offset: number;
  vaddr: number;
  size: number;
}

/** The EBOOT ELF's first loadable segment, which holds all its code; null if it isn't an ELF. */
export function codeSegment(elf: Buffer): Segment | null {
  if (elf.length < 0x34 || elf.readUInt32LE(0) !== 0x464c457f) return null;
  const phoff = elf.readUInt32LE(0x1c);
  const phnum = elf.readUInt16LE(0x2c);
  for (let i = 0; i < phnum && phoff + i * 32 + 32 <= elf.length; i++) {
    const at = phoff + i * 32;
    if (elf.readUInt32LE(at) !== 1) continue;
    const segment = {
      offset: elf.readUInt32LE(at + 4),
      vaddr: elf.readUInt32LE(at + 8),
      size: elf.readUInt32LE(at + 16),
    };
    return segment.offset + segment.size <= elf.length ? segment : null;
  }
  return null;
}

/** For each signature, the vaddr of the only place it matches, or null; in one pass over the code. */
export function findUnique(
  elf: Buffer,
  segment: Segment,
  signatures: readonly (readonly number[])[],
): (number | null)[] {
  const found: (number | null)[] = signatures.map(() => null);
  const ambiguous = signatures.map(() => false);
  const end = segment.offset + segment.size;
  for (let at = segment.offset; at + 4 <= end; at += 4) {
    const first = maskWord(elf.readUInt32LE(at));
    signatures.forEach((signature, s) => {
      if (first !== signature[0] || at + signature.length * 4 > end) return;
      for (let k = 1; k < signature.length; k++) {
        if (maskWord(elf.readUInt32LE(at + k * 4)) !== signature[k]) return;
      }
      if (found[s] !== null) ambiguous[s] = true;
      found[s] = segment.vaddr + (at - segment.offset);
    });
  }
  return found.map((vaddr, s) => (ambiguous[s] ? null : vaddr));
}

export const signed16 = (value: number): number => (value << 16) >> 16;

/** The address a `lui reg, hi` + `lw reg2, lo(reg)` pair loads from. */
export function luiLwAddress(lui: number, lw: number): number {
  return ((lui & 0xffff) * 0x10000 + signed16(lw & 0xffff)) >>> 0;
}

/** A tiny MIPS assembler: instructions, labels and branches resolved on `link`. */
export class Assembler {
  private readonly items: (number | ((pc: number, base: number) => number))[] = [];
  private readonly labels = new Map<string, number>();

  label(name: string): void {
    this.labels.set(name, this.items.length);
  }
  emit(word: number): void {
    this.items.push(word >>> 0);
  }
  r(rs: number, rt: number, rd: number, sa: number, funct: number): void {
    this.emit((rs << 21) | (rt << 16) | (rd << 11) | (sa << 6) | funct);
  }
  i(op: number, rs: number, rt: number, imm: number): void {
    this.emit((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff));
  }
  branch(op: number, rs: number, rt: number, label: string): void {
    this.items.push((pc) => {
      const target = this.labels.get(label);
      if (target === undefined) throw new Error(`No label ${label}`);
      const offset = target - (pc + 1);
      return ((op << 26) | (rs << 21) | (rt << 16) | (offset & 0xffff)) >>> 0;
    });
  }
  jal(target: number): void {
    this.emit((0x03 << 26) | ((target >>> 2) & 0x03ffffff));
  }
  j(target: number): void {
    this.emit((0x02 << 26) | ((target >>> 2) & 0x03ffffff));
  }
  /** `jal` to a label in this code; needs `link(base)`. */
  jalLabel(label: string): void {
    this.items.push((_pc, base) => {
      const target = this.labels.get(label);
      if (target === undefined) throw new Error(`No label ${label}`);
      return ((0x03 << 26) | (((base + target * 4) >>> 2) & 0x03ffffff)) >>> 0;
    });
  }
  /** Where a label lands, in words from the start. */
  offsetOf(label: string): number {
    const target = this.labels.get(label);
    if (target === undefined) throw new Error(`No label ${label}`);
    return target;
  }
  /** `lui reg, hi(address)` + `lw reg, lo(address)(reg)`. */
  loadWord(reg: number, address: number): void {
    this.i(0x0f, 0, reg, (address + 0x8000) >>> 16);
    this.i(0x23, reg, reg, address & 0xffff);
  }

  /** The words, with branches resolved; `base` is the vaddr of the first, for `jalLabel`. */
  link(base = 0): number[] {
    return this.items.map((item, pc) => (typeof item === "number" ? item : item(pc, base)));
  }
}

export const ADDU = 0x21;
export const SUBU = 0x23;
export const SLT = 0x2a;
export const SLTU = 0x2b;
export const JR = 0x08;
export const ADDIU = 0x09;
export const SLTIU = 0x0b;
export const ANDI = 0x0c;
export const ORI = 0x0d;
export const XORI = 0x0e;
export const LUI = 0x0f;
export const LW = 0x23;
export const SW = 0x2b;
export const LHU = 0x25;
export const SH = 0x29;
export const BEQ = 0x04;
export const BNE = 0x05;
export const BEQL = 0x14;
export const BNEL = 0x15;
/** `bgez` is opcode REGIMM with rt = BGEZ. */
export const REGIMM = 0x01;
export const BGEZ = 0x01;
export const JALR = 0x09;
export const SLL = 0x00;
export const LBU = 0x24;
export const SB = 0x28;
/** `bltz` is opcode REGIMM with rt = BLTZ. */
export const BLTZ = 0x00;

/** `jal target`, as a word. */
export const jalTo = (target: number): number =>
  ((0x03 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;

/** The target of a `jal` or `j` at `pc`. */
export const jumpTarget = (word: number, pc: number): number =>
  (((pc + 4) & 0xf0000000) | ((word & 0x03ffffff) << 2)) >>> 0;

/** The high half for a `lui` that a sign-extended low half completes. */
export const hi16 = (value: number): number => ((value + 0x8000) >>> 16) & 0xffff;

/** A `lui` + sign-extended 16-bit low half pair's value. */
export const hiLo = (lui: number, low: number): number =>
  ((lui & 0xffff) * 0x10000 + signed16(low & 0xffff)) >>> 0;
