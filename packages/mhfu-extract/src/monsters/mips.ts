/**
 * A small interpreter for the PSP's CPU (Allegrex, MIPS32 with a few
 * extensions), for running game code with no game around it: integer, FPU
 * and branch instructions. VFPU instructions do nothing, so vector maths gives
 * nonsense, which is fine for following control flow. Memory outside the
 * segments reads as 0 and swallows writes, and a call to an address holding
 * no code returns 0, so code that walks a null pointer carries on as if
 * everything it reached were empty.
 *
 * `attacks.ts` uses it to run each monster's attack spawner; nothing else
 * depends on its details.
 */

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** The float whose bits are `bits`. */
export const bitsToFloat = (bits: number): number => {
  u32[0] = bits >>> 0;
  return f32[0]!;
};
/** The bits of `value` as a float. */
export const floatToBits = (value: number): number => {
  f32[0] = value;
  return u32[0]!;
};

const s16 = (v: number) => (v << 16) >> 16;

export class StepLimitError extends Error {}

interface Segment {
  base: number;
  end: number;
  view: DataView;
  bytes: Uint8Array;
}

/**
 * Address space made of segments; a later segment wins where two overlap
 * (overlays share load addresses). Writes are journaled, so `rollback`
 * puts every byte back as it was at the last `mark` without copying the
 * whole image for every run.
 */
export class Memory {
  private segments: Segment[] = [];
  private journal: { bytes: Uint8Array; at: number; old: Uint8Array }[] = [];

  /** Forgets the journal: `rollback` comes back to here. */
  mark(): void {
    this.journal = [];
  }

  /** Undoes every write since the last `mark`. */
  rollback(): void {
    for (let i = this.journal.length - 1; i >= 0; i--) {
      const { bytes, at, old } = this.journal[i]!;
      bytes.set(old, at);
    }
    this.journal = [];
  }

  private log(segment: Segment, at: number, size: number): void {
    this.journal.push({ bytes: segment.bytes, at, old: segment.bytes.slice(at, at + size) });
  }

  add(base: number, bytes: Uint8Array): void {
    this.segments.unshift({
      base,
      end: base + bytes.length,
      view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      bytes,
    });
  }

  private find(address: number, size: number): Segment | undefined {
    for (const segment of this.segments)
      if (address >= segment.base && address + size <= segment.end) return segment;
    return undefined;
  }

  u8(address: number): number {
    const s = this.find(address, 1);
    return s ? s.bytes[address - s.base]! : 0;
  }
  u16(address: number): number {
    const s = this.find(address, 2);
    return s ? s.view.getUint16(address - s.base, true) : 0;
  }
  u32(address: number): number {
    const s = this.find(address, 4);
    return s ? s.view.getUint32(address - s.base, true) : 0;
  }
  f32(address: number): number {
    return bitsToFloat(this.u32(address));
  }
  bytes(address: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = this.u8(address + i);
    return out;
  }
  w8(address: number, value: number): void {
    const s = this.find(address, 1);
    if (!s) return;
    this.log(s, address - s.base, 1);
    s.bytes[address - s.base] = value & 0xff;
  }
  w16(address: number, value: number): void {
    const s = this.find(address, 2);
    if (!s) return;
    this.log(s, address - s.base, 2);
    s.view.setUint16(address - s.base, value & 0xffff, true);
  }
  w32(address: number, value: number): void {
    const s = this.find(address, 4);
    if (!s) return;
    this.log(s, address - s.base, 4);
    s.view.setUint32(address - s.base, value >>> 0, true);
  }
  wf32(address: number, value: number): void {
    this.w32(address, floatToBits(value));
  }
  /** The instruction at `address`, or null where there is no code. */
  code(address: number): number | null {
    if (address & 3) return null;
    const s = this.find(address, 4);
    return s ? s.view.getUint32(address - s.base, true) : null;
  }
}

const enum Next {
  On,
  Branch,
  SkipDelay,
}

/** What a hook on an address does: true returns at once to $ra (with whatever it put in $v0). */
export type Hook = (cpu: Cpu) => boolean;

export class Cpu {
  /** General registers, as unsigned 32-bit numbers. */
  readonly r = new Array<number>(32).fill(0);
  /** FPU registers, as raw bits. */
  readonly f = new Array<number>(32).fill(0);
  hi = 0;
  lo = 0;
  fcc = false;
  readonly hooks = new Map<number, Hook>();
  steps = 0;
  private target = 0;

  constructor(readonly memory: Memory) {}

  /** Runs from `pc` until it reaches `stop` (a return address no code uses). */
  run(pc: number, stop: number, limit = 300_000): void {
    const r = this.r;
    this.steps = 0;
    for (;;) {
      if (pc === stop) return;
      if (++this.steps > limit) throw new StepLimitError(`over ${limit} steps`);
      const hook = this.hooks.get(pc);
      if (hook?.(this)) {
        pc = r[31]!;
        continue;
      }
      const word = this.memory.code(pc);
      if (word === null) {
        // A call through a null (or garbage) pointer: return 0.
        r[2] = 0;
        pc = r[31]!;
        continue;
      }
      const next = this.step(word, pc);
      r[0] = 0;
      if (next === Next.On) pc += 4;
      else if (next === Next.SkipDelay) pc += 8;
      else {
        // Run the delay slot, then go to the branch's target.
        const target = this.target;
        const slot = this.memory.code(pc + 4);
        if (slot !== null) this.step(slot, pc + 4);
        r[0] = 0;
        pc = target;
      }
    }
  }

  private branch(target: number): Next {
    this.target = target >>> 0;
    return Next.Branch;
  }

  private step(w: number, pc: number): Next {
    const r = this.r;
    const m = this.memory;
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const rd = (w >>> 11) & 31;
    const sa = (w >>> 6) & 31;
    const imm = w & 0xffff;
    const simm = s16(imm);
    const R = (i: number) => r[i]!;
    const S = (i: number) => r[i]! | 0;
    switch (op) {
      case 0x00: {
        const fn = w & 0x3f;
        switch (fn) {
          case 0x00:
            r[rd] = (R(rt) << sa) >>> 0;
            break;
          case 0x02: // srl, rotr
            r[rd] = rs === 1 ? ((R(rt) >>> sa) | (R(rt) << (32 - sa))) >>> 0 : R(rt) >>> sa;
            break;
          case 0x03:
            r[rd] = (S(rt) >> sa) >>> 0;
            break;
          case 0x04:
            r[rd] = (R(rt) << (R(rs) & 31)) >>> 0;
            break;
          case 0x06: {
            const k = R(rs) & 31;
            r[rd] = sa === 1 ? ((R(rt) >>> k) | (R(rt) << (32 - k))) >>> 0 : R(rt) >>> k;
            break;
          }
          case 0x07:
            r[rd] = (S(rt) >> (R(rs) & 31)) >>> 0;
            break;
          case 0x08:
            return this.branch(R(rs));
          case 0x09: {
            const target = R(rs);
            r[rd || 31] = (pc + 8) >>> 0;
            return this.branch(target);
          }
          case 0x0a:
            if (R(rt) === 0) r[rd] = R(rs);
            break;
          case 0x0b:
            if (R(rt) !== 0) r[rd] = R(rs);
            break;
          case 0x10:
            r[rd] = this.hi;
            break;
          case 0x11:
            this.hi = R(rs);
            break;
          case 0x12:
            r[rd] = this.lo;
            break;
          case 0x13:
            this.lo = R(rs);
            break;
          case 0x16: // clz
            r[rd] = Math.clz32(R(rs));
            break;
          case 0x17: // clo
            r[rd] = Math.clz32(~R(rs));
            break;
          case 0x18: {
            const p = BigInt(S(rs)) * BigInt(S(rt));
            this.lo = Number(BigInt.asUintN(32, p));
            this.hi = Number(BigInt.asUintN(32, p >> 32n));
            break;
          }
          case 0x19: {
            const p = BigInt(R(rs)) * BigInt(R(rt));
            this.lo = Number(BigInt.asUintN(32, p));
            this.hi = Number(BigInt.asUintN(32, p >> 32n));
            break;
          }
          case 0x1a:
            if (S(rt) !== 0) {
              const q = Math.trunc(S(rs) / S(rt));
              this.lo = q >>> 0;
              this.hi = (S(rs) - q * S(rt)) >>> 0;
            }
            break;
          case 0x1b:
            if (R(rt) !== 0) {
              this.lo = Math.floor(R(rs) / R(rt)) >>> 0;
              this.hi = (R(rs) % R(rt)) >>> 0;
            }
            break;
          case 0x1c: // madd, maddu, msub, msubu
          case 0x1d:
          case 0x2e:
          case 0x2f: {
            const signed = fn === 0x1c || fn === 0x2e;
            const acc = (BigInt(this.hi) << 32n) | BigInt(this.lo);
            const p = signed ? BigInt(S(rs)) * BigInt(S(rt)) : BigInt(R(rs)) * BigInt(R(rt));
            const sum = fn === 0x1c || fn === 0x1d ? acc + p : acc - p;
            this.lo = Number(BigInt.asUintN(32, sum));
            this.hi = Number(BigInt.asUintN(32, sum >> 32n));
            break;
          }
          case 0x20:
          case 0x21:
            r[rd] = (R(rs) + R(rt)) >>> 0;
            break;
          case 0x22:
          case 0x23:
            r[rd] = (R(rs) - R(rt)) >>> 0;
            break;
          case 0x24:
            r[rd] = (R(rs) & R(rt)) >>> 0;
            break;
          case 0x25:
            r[rd] = (R(rs) | R(rt)) >>> 0;
            break;
          case 0x26:
            r[rd] = (R(rs) ^ R(rt)) >>> 0;
            break;
          case 0x27:
            r[rd] = ~(R(rs) | R(rt)) >>> 0;
            break;
          case 0x2a:
            r[rd] = S(rs) < S(rt) ? 1 : 0;
            break;
          case 0x2b:
            r[rd] = R(rs) < R(rt) ? 1 : 0;
            break;
          case 0x2c: // max
            r[rd] = S(rs) > S(rt) ? R(rs) : R(rt);
            break;
          case 0x2d: // min
            r[rd] = S(rs) < S(rt) ? R(rs) : R(rt);
            break;
          // syscall, break, sync and the traps (teq after a divide): nothing
        }
        return Next.On;
      }
      case 0x01: {
        const target = pc + 4 + (simm << 2);
        if (rt >= 0x10) r[31] = (pc + 8) >>> 0; // bltzal, bgezal(l)
        const taken = rt === 0 || rt === 2 || rt === 0x10 || rt === 0x12 ? S(rs) < 0 : S(rs) >= 0;
        if (taken) return this.branch(target);
        return rt === 2 || rt === 3 || rt === 0x12 || rt === 0x13 ? Next.SkipDelay : Next.On;
      }
      case 0x02:
        return this.branch(((pc & 0xf0000000) | ((w & 0x3ffffff) << 2)) >>> 0);
      case 0x03:
        r[31] = (pc + 8) >>> 0;
        return this.branch(((pc & 0xf0000000) | ((w & 0x3ffffff) << 2)) >>> 0);
      case 0x04:
      case 0x05:
      case 0x06:
      case 0x07:
      case 0x14:
      case 0x15:
      case 0x16:
      case 0x17: {
        const kind = op & 3;
        const taken =
          kind === 0
            ? R(rs) === R(rt)
            : kind === 1
              ? R(rs) !== R(rt)
              : kind === 2
                ? S(rs) <= 0
                : S(rs) > 0;
        if (taken) return this.branch(pc + 4 + (simm << 2));
        return op >= 0x14 ? Next.SkipDelay : Next.On;
      }
      case 0x08:
      case 0x09:
        r[rt] = (R(rs) + simm) >>> 0;
        return Next.On;
      case 0x0a:
        r[rt] = S(rs) < simm ? 1 : 0;
        return Next.On;
      case 0x0b:
        r[rt] = R(rs) < simm >>> 0 ? 1 : 0;
        return Next.On;
      case 0x0c:
        r[rt] = R(rs) & imm;
        return Next.On;
      case 0x0d:
        r[rt] = (R(rs) | imm) >>> 0;
        return Next.On;
      case 0x0e:
        r[rt] = (R(rs) ^ imm) >>> 0;
        return Next.On;
      case 0x0f:
        r[rt] = (imm << 16) >>> 0;
        return Next.On;
      case 0x11:
        return this.cop1(w, pc);
      case 0x1f: {
        const fn = w & 0x3f;
        if (fn === 0x00) {
          // ext
          const size = rd + 1;
          r[rt] = size === 32 ? R(rs) >>> sa : (R(rs) >>> sa) & ((1 << size) - 1);
        } else if (fn === 0x04) {
          // ins
          const size = rd - sa + 1;
          const mask = (size === 32 ? 0xffffffff : ((1 << size) - 1) << sa) >>> 0;
          r[rt] = ((R(rt) & ~mask) | ((R(rs) << sa) & mask)) >>> 0;
        } else if (fn === 0x20) {
          if (sa === 0x10)
            r[rd] = ((R(rt) << 24) >> 24) >>> 0; // seb
          else if (sa === 0x18)
            r[rd] = ((R(rt) << 16) >> 16) >>> 0; // seh
          else if (sa === 0x02)
            r[rd] = (((R(rt) & 0x00ff00ff) << 8) | ((R(rt) >>> 8) & 0x00ff00ff)) >>> 0; // wsbh
          else if (sa === 0x03) {
            const v = R(rt); // wsw
            r[rd] =
              (((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24)) >>> 0;
          } else if (sa === 0x14) {
            let v = R(rt); // bitrev
            let out = 0;
            for (let i = 0; i < 32; i++, v >>>= 1) out = (out << 1) | (v & 1);
            r[rd] = out >>> 0;
          }
        }
        return Next.On;
      }
    }
    const address = (R(rs) + simm) >>> 0;
    switch (op) {
      case 0x20:
        r[rt] = ((m.u8(address) << 24) >> 24) >>> 0;
        break;
      case 0x21:
        r[rt] = ((m.u16(address & ~1) << 16) >> 16) >>> 0;
        break;
      case 0x23:
      case 0x30: // ll
        r[rt] = m.u32(address & ~3);
        break;
      case 0x24:
        r[rt] = m.u8(address);
        break;
      case 0x25:
        r[rt] = m.u16(address & ~1);
        break;
      case 0x22: {
        // lwl
        const shift = (3 - (address & 3)) * 8;
        const mask = (0xffffffff << shift) >>> 0;
        r[rt] = ((R(rt) & ~mask) | ((m.u32(address & ~3) << shift) & mask)) >>> 0;
        break;
      }
      case 0x26: {
        // lwr
        const shift = (address & 3) * 8;
        const mask = 0xffffffff >>> shift;
        r[rt] = ((R(rt) & ~mask) | (m.u32(address & ~3) >>> shift)) >>> 0;
        break;
      }
      case 0x28:
        m.w8(address, R(rt));
        break;
      case 0x29:
        m.w16(address & ~1, R(rt));
        break;
      case 0x2b:
        m.w32(address & ~3, R(rt));
        break;
      case 0x38: // sc
        m.w32(address & ~3, R(rt));
        r[rt] = 1;
        break;
      case 0x2a: {
        // swl
        const shift = (3 - (address & 3)) * 8;
        const mask = 0xffffffff >>> shift;
        const old = m.u32(address & ~3);
        m.w32(address & ~3, (old & ~mask) | (R(rt) >>> shift));
        break;
      }
      case 0x2e: {
        // swr
        const shift = (address & 3) * 8;
        const mask = (0xffffffff << shift) >>> 0;
        const old = m.u32(address & ~3);
        m.w32(address & ~3, (old & ~mask) | ((R(rt) << shift) & mask));
        break;
      }
      case 0x31: // lwc1
        this.f[rt] = m.u32(address & ~3);
        break;
      case 0x39: // swc1
        m.w32(address & ~3, this.f[rt]!);
        break;
      // cache, the VFPU's loads and stores, anything else: nothing
    }
    return Next.On;
  }

  private cop1(w: number, pc: number): Next {
    const f = this.f;
    const r = this.r;
    const fmt = (w >>> 21) & 31;
    const ft = (w >>> 16) & 31;
    const fs = (w >>> 11) & 31;
    const fd = (w >>> 6) & 31;
    switch (fmt) {
      case 0x00: // mfc1
        r[ft] = f[fs]!;
        return Next.On;
      case 0x02: // cfc1
        r[ft] = 0;
        return Next.On;
      case 0x04: // mtc1
        f[fs] = r[ft]!;
        return Next.On;
      case 0x08: {
        // bc1f, bc1t, bc1fl, bc1tl
        if (this.fcc === ((w >>> 16) & 1) > 0) return this.branch(pc + 4 + (s16(w & 0xffff) << 2));
        return (w >>> 17) & 1 ? Next.SkipDelay : Next.On;
      }
      case 0x14: // .w: cvt.s.w
        if ((w & 0x3f) === 0x20) f[fd] = floatToBits(f[fs]! | 0);
        return Next.On;
      case 0x10:
        break;
      default:
        return Next.On;
    }
    const fn = w & 0x3f;
    const a = bitsToFloat(f[fs]!);
    const b = bitsToFloat(f[ft]!);
    const toInt = (v: number) => (Number.isFinite(v) ? v | 0 : 0x7fffffff);
    switch (fn) {
      case 0x00:
        f[fd] = floatToBits(a + b);
        break;
      case 0x01:
        f[fd] = floatToBits(a - b);
        break;
      case 0x02:
        f[fd] = floatToBits(a * b);
        break;
      case 0x03:
        f[fd] = floatToBits(a / b);
        break;
      case 0x04:
        f[fd] = floatToBits(Math.sqrt(a));
        break;
      case 0x05:
        f[fd] = floatToBits(Math.abs(a));
        break;
      case 0x06:
        f[fd] = f[fs]!;
        break;
      case 0x07:
        f[fd] = floatToBits(-a);
        break;
      case 0x0c: // round.w (to nearest even, the FPU's default)
        f[fd] = toInt(a - Math.floor(a) === 0.5 ? 2 * Math.round(a / 2) : Math.round(a)) >>> 0;
        break;
      case 0x0d:
      case 0x24: // trunc.w, cvt.w.s (truncating, as the game sets the FPU)
        f[fd] = toInt(Math.trunc(a)) >>> 0;
        break;
      case 0x0e:
        f[fd] = toInt(Math.ceil(a)) >>> 0;
        break;
      case 0x0f:
        f[fd] = toInt(Math.floor(a)) >>> 0;
        break;
      default:
        if (fn >= 0x30) {
          const unordered = Number.isNaN(a) || Number.isNaN(b);
          const c = fn & 0xf;
          this.fcc =
            ((c & 1) !== 0 && unordered) ||
            ((c & 2) !== 0 && !unordered && a === b) ||
            ((c & 4) !== 0 && !unordered && a < b);
        }
    }
    return Next.On;
  }
}
