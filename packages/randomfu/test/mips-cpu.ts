/**
 * Just enough of a MIPS CPU to run patch and blob code in tests: the integer
 * ops they use, with delay slots, over sparse 64 KB pages. Game functions
 * the code calls are JavaScript (`native`): they get the CPU and return
 * `$v0`.
 */
export class Cpu {
  readonly reg = new Int32Array(32);
  /** Addresses that run JavaScript instead of code, then return to `$ra`. */
  readonly native = new Map<number, (cpu: Cpu) => number>();
  /** Every native call, in order: its address and `$a0`–`$a2`. */
  readonly calls: { address: number; args: number[] }[] = [];
  private readonly pages = new Map<number, Buffer>();

  private page(address: number): Buffer {
    const key = address >>> 16;
    let page = this.pages.get(key);
    if (!page) this.pages.set(key, (page = Buffer.alloc(0x10000)));
    return page;
  }
  u8(address: number): number {
    return this.page(address)[address & 0xffff]!;
  }
  u16(address: number): number {
    return this.page(address).readUInt16LE(address & 0xffff);
  }
  u32(address: number): number {
    return this.page(address).readUInt32LE(address & 0xffff);
  }
  setU8(address: number, value: number): void {
    this.page(address)[address & 0xffff] = value & 0xff;
  }
  setU16(address: number, value: number): void {
    this.page(address).writeUInt16LE(value & 0xffff, address & 0xffff);
  }
  setU32(address: number, value: number): void {
    this.page(address).writeUInt32LE(value >>> 0, address & 0xffff);
  }
  load(address: number, words: readonly number[]): void {
    words.forEach((w, k) => this.setU32(address + k * 4, w));
  }
  write(address: number, data: Buffer): void {
    data.forEach((b, k) => this.setU8(address + k, b));
  }
  fill(address: number, bytes: number, byte: number): void {
    for (let k = 0; k < bytes; k++) this.setU8(address + k, byte);
  }
  bytes(address: number, n: number): Buffer {
    return Buffer.from(Array.from({ length: n }, (_, k) => this.u8(address + k)));
  }
  string(address: number): string {
    let out = "";
    for (let c = this.u8(address); c !== 0; c = this.u8(++address)) out += String.fromCharCode(c);
    return out;
  }

  /** Calls `entry` with `args` in `$a0`… and runs until it returns; returns `$v0`. */
  call(entry: number, args: readonly number[] = [], limit = 50_000_000): number {
    const RETURN = 0x0bad0000;
    args.forEach((value, k) => (this.reg[4 + k] = value));
    this.reg[29] ||= 0x09fff000;
    this.reg[31] = RETURN;
    let pc = entry >>> 0;
    let next = pc + 4;
    let steps = 0;
    while (pc !== RETURN) {
      if (++steps > limit) throw new Error("runaway");
      const r = this.reg;
      const u = (n: number) => r[n]! >>> 0;
      const set = (n: number, v: number) => {
        if (n !== 0) r[n] = v | 0;
      };
      const handler = this.native.get(pc);
      if (handler) {
        this.calls.push({ address: pc, args: [u(4), u(5), u(6)] });
        set(2, handler(this));
        pc = u(31);
        next = pc + 4;
        continue;
      }
      const w = this.u32(pc);
      const op = w >>> 26;
      const rs = (w >>> 21) & 31;
      const rt = (w >>> 16) & 31;
      const rd = (w >>> 11) & 31;
      const sa = (w >>> 6) & 31;
      const imm = w & 0xffff;
      const simm = (imm << 16) >> 16;
      let target: number | null = null;
      const at = () => (u(rs) + simm) >>> 0;
      if (op === 0) {
        const funct = w & 63;
        if (funct === 0x00) set(rd, u(rt) << sa);
        else if (funct === 0x02) set(rd, u(rt) >>> sa);
        else if (funct === 0x03) set(rd, r[rt]! >> sa);
        else if (funct === 0x08) target = u(rs);
        else if (funct === 0x09) {
          target = u(rs);
          set(rd, pc + 8);
        } else if (funct === 0x21) set(rd, u(rs) + u(rt));
        else if (funct === 0x23) set(rd, u(rs) - u(rt));
        else if (funct === 0x24) set(rd, u(rs) & u(rt));
        else if (funct === 0x25) set(rd, u(rs) | u(rt));
        else if (funct === 0x26) set(rd, u(rs) ^ u(rt));
        else if (funct === 0x2a) set(rd, r[rs]! < r[rt]! ? 1 : 0);
        else if (funct === 0x2b) set(rd, u(rs) < u(rt) ? 1 : 0);
        else throw new Error(`funct ${funct.toString(16)} at ${pc.toString(16)}`);
      } else if (op === 0x01) {
        if (rt === 0x00 && r[rs]! < 0) target = pc + 4 + simm * 4;
        else if (rt === 0x01 && r[rs]! >= 0) target = pc + 4 + simm * 4;
        else if (rt !== 0x00 && rt !== 0x01) throw new Error(`regimm ${rt} at ${pc.toString(16)}`);
      } else if (op === 0x02 || op === 0x03) {
        if (op === 0x03) r[31] = pc + 8;
        target = ((pc + 4) & 0xf0000000) | ((w & 0x03ffffff) << 2);
      } else if (op === 0x04 || op === 0x05) {
        if ((r[rs] === r[rt]) === (op === 0x04)) target = pc + 4 + simm * 4;
      } else if (op === 0x09) set(rt, u(rs) + simm);
      else if (op === 0x0a) set(rt, r[rs]! < simm ? 1 : 0);
      else if (op === 0x0b) set(rt, u(rs) < simm >>> 0 ? 1 : 0);
      else if (op === 0x0c) set(rt, u(rs) & imm);
      else if (op === 0x0d) set(rt, u(rs) | imm);
      else if (op === 0x0e) set(rt, u(rs) ^ imm);
      else if (op === 0x0f) set(rt, imm << 16);
      else if (op === 0x20) set(rt, (this.u8(at()) << 24) >> 24);
      else if (op === 0x21) set(rt, (this.u16(at()) << 16) >> 16);
      else if (op === 0x23) set(rt, this.u32(at()));
      else if (op === 0x24) set(rt, this.u8(at()));
      else if (op === 0x25) set(rt, this.u16(at()));
      else if (op === 0x28) this.setU8(at(), u(rt));
      else if (op === 0x29) this.setU16(at(), u(rt));
      else if (op === 0x2b) this.setU32(at(), u(rt));
      else throw new Error(`op ${op.toString(16)} at ${pc.toString(16)}`);
      pc = next;
      next = target !== null ? target >>> 0 : pc + 4;
    }
    return this.reg[2]! >>> 0;
  }
}
