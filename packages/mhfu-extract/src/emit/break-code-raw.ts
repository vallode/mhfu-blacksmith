/**
 * Raw dump for working out which body part each break reward belongs to
 * (`extract --raw`, `raw/break-code.json`).
 *
 * The break reward tables (`capbreakindex` and its pointer table in
 * `game_sub.ovl`, see `monsters/rewards.ts`) number each monster's breaks
 * (Rathalos: 1 head, 2 wing), but nothing in the monster chunk links those
 * numbers to the body parts the hitbox capsules and the part durability
 * records use (`raw/parts.json`). That link is probably code: the monster
 * overlays record a break when a part's durability runs out, and the reward
 * code reads the table by break number.
 *
 * This finds every MIPS `lui` + `addiu`/`ori`/load/store pair, in the EBOOT
 * and every overlay, that builds an address inside the reward tables, and
 * keeps 0x200 bytes of code either side of each as hex, to start the
 * disassembly from. The overlays themselves are copied to `raw/overlays/`.
 */

export interface CodeFile {
  name: string;
  buf: Buffer;
}

export interface AddressRange {
  name: string;
  /** vaddrs, end exclusive. */
  start: number;
  end: number;
}

export interface CodeRef {
  file: string;
  range: string;
  /** The address built, and its offset into the range. */
  target: string;
  rangeOffset: string;
  /** File offsets of the `lui` and the instruction that adds the low half. */
  hiAt: string;
  loAt: string;
  /** Mnemonic of the low-half instruction. */
  op: string;
  /** File offset of `window`, which runs 0x200 bytes either side of the `lui`. */
  windowAt: string;
  window: string;
}

const hex = (n: number) => `0x${n.toString(16).padStart(8, "0")}`;

/** The opcodes that add a 16-bit immediate to a base register, by MIPS primary opcode. */
const LO_OPS: Record<number, string> = {
  0x09: "addiu",
  0x0d: "ori",
  0x20: "lb",
  0x21: "lh",
  0x23: "lw",
  0x24: "lbu",
  0x25: "lhu",
  0x28: "sb",
  0x29: "sh",
  0x2b: "sw",
  0x31: "lwc1",
  0x39: "swc1",
};
const LUI = 0x0f;
/** How far after a `lui` to look for its low half. */
const PAIR_WINDOW = 32;
const CODE_WINDOW = 0x200;
/** Sanity limit per file. */
const MAX_REFS = 2000;

/** Finds `lui`/low-half pairs in `files` that build an address in one of `ranges`. */
export function findAddressRefs(files: CodeFile[], ranges: AddressRange[]): CodeRef[] {
  const refs: CodeRef[] = [];
  for (const { name, buf } of files) {
    let count = 0;
    for (let at = 0; at + 4 <= buf.length && count < MAX_REFS; at += 4) {
      const word = buf.readUInt32LE(at);
      if (word >>> 26 !== LUI) continue;
      const rt = (word >>> 16) & 0x1f;
      const hi = (word & 0xffff) << 16;
      for (let k = 1; k <= PAIR_WINDOW && at + k * 4 + 4 <= buf.length; k++) {
        const loAt = at + k * 4;
        const lo = buf.readUInt32LE(loAt);
        const op = lo >>> 26;
        const rs = (lo >>> 21) & 0x1f;
        const loRt = (lo >>> 16) & 0x1f;
        // Another lui into the same register ends this one's reach.
        if (op === LUI && loRt === rt) break;
        const mnemonic = LO_OPS[op];
        // An integer immediate op (addi..xori) or integer load into the register ends the pair's reach.
        const writesRt = (op >= 0x08 && op <= 0x0e) || (op >= 0x20 && op <= 0x27);
        const overwrites = writesRt && loRt === rt;
        if (!mnemonic || rs !== rt) {
          if (overwrites) break;
          continue;
        }
        const imm = lo & 0xffff;
        const target = (op === 0x0d ? hi | imm : hi + ((imm << 16) >> 16)) >>> 0;
        const range = ranges.find((r) => target >= r.start && target < r.end);
        if (range) {
          const windowAt = Math.max(0, at - CODE_WINDOW);
          refs.push({
            file: name,
            range: range.name,
            target: hex(target),
            rangeOffset: `0x${(target - range.start).toString(16)}`,
            hiAt: hex(at),
            loAt: hex(loAt),
            op: mnemonic,
            windowAt: hex(windowAt),
            window: buf.subarray(windowAt, Math.min(buf.length, at + CODE_WINDOW)).toString("hex"),
          });
          count++;
        }
        // An addiu/ori/load back into the register ends the pair too.
        if (overwrites) break;
      }
    }
  }
  return refs;
}
