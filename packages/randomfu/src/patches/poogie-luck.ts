/**
 * Poogie's luck: pet Poogie successfully before a hunt and that hunt's
 * carves, captures, breaks and quest rewards favour rarer rewards.
 *
 * What the game already does (found on the EU and JP discs):
 *
 * - Save event flags are a bit array at save `+0x508`, with set, clear and
 *   test helpers in the EBOOT. The save is reached through a global pointer.
 * - Petting Poogie at home (`lobby_task.ovl`) sets flag 0x1AC when Poogie
 *   lies down happily and 0x1AB when it knocks the hunter over. The quest's
 *   return-to-village step (`game_task.ovl`) clears both, so 0x1AC means
 *   "petted successfully since the last hunt" for the whole of the next one.
 * - Carves, captures and breaks draw from one weighted picker in the EBOOT,
 *   `pick(list, qtyOut)`: entries are (chance, item) or, with a quantity
 *   pointer, (chance, item, qty), ending at chance 0xFFFF. It rolls
 *   rng() % total chance and walks the list.
 * - The quest's own rewards are rolled in the reward state of `game_task`,
 *   one state before the flags are cleared, by an EBOOT function that does
 *   the same roll and walk inline over the quest's `RewardItem` lists
 *   (chance, item, amount) and writes each pick into the save's reward box
 *   (item at `+0x390`, amount at `+0x392`, 4 bytes a slot). A list whose
 *   header is 0x8000 always gives its first entry in its first slot.
 *
 * The patch rewrites the picker in its own space (it fits in the 68 words
 * the game's version used). It behaves as before, except that while flag
 * 0x1AC is set it rolls twice and keeps the entry with the lower chance.
 * Anything else that rolls through the picker gets the same luck. It also
 * replaces the quest rewards' inline walk with a call to the picker, keeping
 * the forced first entry. Everything is found by code signatures, which match
 * the EU and JP (FUC) EBOOTs, and nothing is patched if one doesn't match.
 */
import type { Edits } from "../edits.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";

/** Save event flag set by a successful pet, cleared when a hunt ends. */
const PETTED_FLAG = 0x1ac;

/**
 * Masked code signatures. `maskWord` drops the parts that move between
 * regions: jump targets, `lui` and `lw`/`sw` offsets, and constants loaded
 * from `$zero`.
 */
export const PICKER_SIGNATURE = [
  0x27bdffe0, 0xafbf0000, 0xafb30000, 0xafb20000, 0xafb10000, 0x00a09021, 0xafb00000, 0x16400003,
  0x00809821, 0x10000002, 0x24100000, 0x24100000, 0x96620000, 0x34040000, 0x00008821, 0x10440009,
  0x02602821, 0x00101840, 0x94a20000, 0x02221021, 0x3051ffff, 0x00a32821, 0x94a20000, 0x5444fffb,
  0x94a20000, 0x3c020000, 0x8c440000, 0x0c000000,
];
/** Words of the picker the patch may use: the game's version ends with `jr $ra` at 0x108. */
export const PICKER_WORDS = 68;
export const FLAG_TEST_SIGNATURE = [
  0x04a10003, 0x00051103, 0x24a2000f, 0x00021103, 0x00021040, 0x00441021, 0x94440508, 0x30a3000f,
  0x24020000, 0x00621004, 0x00821024, 0x03e00008, 0x0002102b,
];
/** `lui $v0, hi(save)`, `lw $v0, lo(save)($v0)`, then `lui $at, 6; ori $at, $at, 0xA5EA`. */
export const SAVE_POINTER_SIGNATURE = [0x3c020000, 0x8c420000, 0x3c010000, 0x3421a5ea];
/**
 * The quest rewards' inline roll and walk, then the code after it that stores
 * the pick into the reward box. In: `$s3` the list, `$s6` the list's header,
 * `$s1` the slot of the list, `$s2` the reward box offset. Out: `$a2` points at
 * the picked item and its amount.
 */
export const QUEST_REWARD_SIGNATURE = [
  0x96620000, 0x34030000, 0x00008021, 0x10430008, 0x02602021, 0x94820000, 0x02021021, 0x3050ffff,
  0x24840006, 0x94820000, 0x5443fffb, 0x94820000, 0x3c020000, 0x8c440000, 0x0c000000, 0x00002821,
  0x3043ffff, 0x3202ffff, 0x0062001a, 0x96c30000, 0x00002010, 0x34020000, 0x14620004, 0x3084ffff,
  0x56200003, 0x96620000, 0x00002021, 0x96620000, 0x34050000, 0x00003821, 0x1045000c, 0x02603021,
  0x3084ffff, 0x94c20000, 0x24c30002, 0x00e21021, 0x3047ffff, 0x0087102a, 0x14400004, 0x00603021,
  0x94620004, 0x1445fff7, 0x24660004, 0x94c40000, 0x5080000d, 0x2a810010, 0x3c020000, 0x8c430000,
  0x26940001, 0x00721821, 0xa4640390, 0x3c020000, 0x8c420000, 0x94c30002, 0x00521021, 0xa4430392,
  0x26520004,
];
/** Words of the inline walk the patch replaces: up to `lhu $a0, 0($a2)`, which reads the pick. */
export const QUEST_REWARD_WORDS = 43;
/** The reward box in the save: item and amount, 4 bytes a slot. */
const REWARD_BOX = 0x390;
/** A reward list header that makes the list's first slot always give its first entry. */
const FIRST_ENTRY_LIST = 0x8000;

const R = {
  zero: 0,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  t0: 8,
  t1: 9,
  t2: 10,
  t3: 11,
  t5: 13,
  t6: 14,
} as const;
const S = [16, 17, 18, 19, 20, 21] as const;
const SP = 29;
const RA = 31;

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

interface Segment {
  offset: number;
  vaddr: number;
  size: number;
}

/** The EBOOT ELF's first loadable segment, which holds all its code; null if it isn't an ELF. */
function codeSegment(elf: Buffer): Segment | null {
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
function findUnique(
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

const signed16 = (value: number): number => (value << 16) >> 16;

/** The address a `lui reg, hi` + `lw reg2, lo(reg)` pair loads from. */
function luiLwAddress(lui: number, lw: number): number {
  return ((lui & 0xffff) * 0x10000 + signed16(lw & 0xffff)) >>> 0;
}

/** A tiny MIPS assembler: instructions, labels and branches resolved on `link`. */
class Assembler {
  private readonly items: (number | ((pc: number) => number))[] = [];
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
  /** `lui reg, hi(address)` + `lw reg, lo(address)(reg)`. */
  loadWord(reg: number, address: number): void {
    this.i(0x0f, 0, reg, (address + 0x8000) >>> 16);
    this.i(0x23, reg, reg, address & 0xffff);
  }

  link(): number[] {
    return this.items.map((item, pc) => (typeof item === "number" ? item : item(pc)));
  }
}

const ADDU = 0x21;
const SUBU = 0x23;
const SLTU = 0x2b;
const ADDIU = 0x09;
const ORI = 0x0d;
const LW = 0x23;
const SW = 0x2b;
const LHU = 0x25;
const SH = 0x29;
const BEQ = 0x04;
const BNE = 0x05;
const BEQL = 0x14;
const BNEL = 0x15;
/** `bgez` is opcode REGIMM with rt = BGEZ. */
const REGIMM = 0x01;
const BGEZ = 0x01;

/** Rolls when lucky with `guaranteed` (for testing): 1 << 10, plus one. */
const GUARANTEED_ROLLS_SHIFT = 10;

export interface PoogieLuckOptions {
  /**
   * For testing in game: a lucky pick rolls 1025 times instead of twice, so it
   * all but always lands on the rarest entry (a 1% entry is missed about once
   * in 30,000 picks).
   */
  guaranteed?: boolean;
}

/**
 * The new picker. Same calling convention as the game's: `$a0` is the list,
 * `$a1` the quantity pointer (or 0); returns the item, or 0xFFFF for none.
 */
export function assemblePicker(
  addresses: { save: number; flagTest: number; rngContext: number; rng: number },
  options: PoogieLuckOptions = {},
): number[] {
  const a = new Assembler();
  const [s0, s1, s2, s3, s4, s5] = S;
  const move = (rd: number, rs: number) => a.r(rs, R.zero, rd, 0, ADDU);
  const nop = () => a.emit(0);

  a.i(ADDIU, SP, SP, -32);
  a.i(SW, SP, RA, 28);
  S.forEach((reg, k) => a.i(SW, SP, reg, 24 - k * 4));
  move(s0, R.a0); // list
  move(s1, R.a1); // quantity pointer
  a.r(R.zero, R.a1, s2, 0, SLTU); // stride: 4 bytes, or 6 with quantities
  a.r(0, s2, s2, 1, 0); // sll s2, s2, 1
  a.i(ADDIU, s2, s2, 4);
  move(s3, R.zero); // total chance
  move(R.t0, R.a0);
  a.i(ORI, R.zero, R.t1, 0xffff);
  a.label("sum");
  a.i(LHU, R.t0, R.t2, 0);
  a.branch(BEQ, R.t2, R.t1, "summed");
  a.r(R.t0, s2, R.t0, 0, ADDU);
  a.branch(BEQ, R.zero, R.zero, "sum");
  a.r(s3, R.t2, s3, 0, ADDU);
  a.label("summed");
  a.loadWord(R.a0, addresses.save);
  a.jal(addresses.flagTest);
  a.i(ADDIU, R.zero, R.a1, PETTED_FLAG);
  if (options.guaranteed) {
    a.r(0, R.v0, s5, GUARANTEED_ROLLS_SHIFT, 0); // sll s5, v0, 10
    a.i(ADDIU, s5, s5, 1); // rolls: 1, or 1025 when lucky
  } else {
    a.i(ADDIU, R.v0, s5, 1); // rolls: 1, or 2 when lucky
  }
  a.branch(BEQ, s3, R.zero, "done");
  move(s4, R.zero); // best entry so far
  a.label("roll");
  a.loadWord(R.a0, addresses.rngContext);
  a.jal(addresses.rng);
  move(R.a1, R.zero);
  a.r(R.v0, s3, 0, 0, 0x1b); // divu v0, s3
  a.r(0, 0, R.t3, 0, 0x10); // mfhi t3: the roll
  move(R.t0, s0);
  a.label("walk"); // subtract chances until the roll goes negative
  a.i(LHU, R.t0, R.t2, 0);
  a.r(R.t3, R.t2, R.t3, 0, SUBU);
  a.branch(REGIMM, R.t3, BGEZ, "walk");
  a.r(R.t0, s2, R.t0, 0, ADDU);
  a.r(R.t0, s2, R.t0, 0, SUBU); // the entry the roll landed on
  a.branch(BEQ, s4, R.zero, "take");
  a.i(LHU, R.t0, R.t6, 0);
  a.i(LHU, s4, R.t5, 0);
  a.r(R.t6, R.t5, R.t5, 0, SLTU); // keep it if its chance is lower
  a.branch(BEQ, R.t5, R.zero, "next");
  nop();
  a.label("take");
  move(s4, R.t0);
  a.label("next");
  a.i(ADDIU, s5, s5, -1);
  a.branch(BNE, s5, R.zero, "roll");
  nop();
  a.label("done");
  a.branch(BEQ, s1, R.zero, "noQuantity");
  a.i(ORI, R.zero, R.v0, 0xffff);
  a.branch(BEQL, s4, R.zero, "return"); // nothing picked: quantity 0, as the game does
  a.i(SH, s1, R.zero, 0);
  a.i(LHU, s4, R.t0, 4);
  a.i(SH, s1, R.t0, 0);
  a.label("noQuantity");
  a.branch(BNEL, s4, R.zero, "return");
  a.i(LHU, s4, R.v0, 2);
  a.label("return");
  a.i(LW, SP, RA, 28);
  S.forEach((reg, k) => a.i(LW, SP, reg, 24 - k * 4));
  a.emit((RA << 21) | 0x08); // jr ra
  a.i(ADDIU, SP, SP, 32);

  return a.link();
}

/**
 * The quest rewards' walk, as a call to the picker: it rolls with the luck,
 * writes the amount into the reward box slot, and the item next to it, then
 * leaves `$a2` at the slot for the game's code after it. The list's forced
 * first entry stays as it was. Every register it uses is free there: the
 * game's version calls the RNG, and `$s0` is set again before it's read.
 */
export function assembleQuestRewardWalk(addresses: { save: number; picker: number }): number[] {
  const a = new Assembler();
  const s1 = 17;
  const s2 = 18;
  const s3 = 19;
  const s6 = 22;
  const move = (rd: number, rs: number) => a.r(rs, R.zero, rd, 0, ADDU);
  const slot = (reg: number) => {
    a.loadWord(reg, addresses.save);
    a.r(reg, s2, reg, 0, ADDU);
  };

  move(R.a0, s3);
  slot(R.a1);
  a.jal(addresses.picker);
  a.i(ADDIU, R.a1, R.a1, REWARD_BOX + 2); // the amount goes straight into the slot
  slot(R.a2);
  a.i(ADDIU, R.a2, R.a2, REWARD_BOX);
  a.i(LHU, s6, R.v1, 0);
  a.i(ORI, R.zero, R.a0, FIRST_ENTRY_LIST);
  a.branch(BNE, R.v1, R.a0, "store");
  a.emit(0);
  a.branch(BNE, s1, R.zero, "store");
  move(R.a0, s3);
  a.label("first"); // the first entry with a chance, as a roll of 0 finds
  a.i(LHU, R.a0, R.v1, 0);
  a.branch(BEQL, R.v1, R.zero, "first");
  a.i(ADDIU, R.a0, R.a0, 6);
  a.i(LHU, R.a0, R.v0, 2);
  a.i(LHU, R.a0, R.v1, 4);
  a.i(SH, R.a2, R.v1, 2);
  a.label("store");
  a.branch(BEQL, R.v0, R.zero, "item"); // no item: no amount either
  a.i(SH, R.a2, R.zero, 2);
  a.label("item");
  a.i(SH, R.a2, R.v0, 0);
  return a.link();
}

const TITLE = "Poogie";

/**
 * Patches the reward picker and the quest rewards' walk. The report says
 * whether it was applied: it isn't when the EBOOT wasn't loaded or its code
 * doesn't match.
 */
export function addPoogieLuck(
  vanillaEboot: Buffer | null,
  edits: Edits,
  options: PoogieLuckOptions = {},
): ShuffleReport {
  const skipped = (why: string): ShuffleReport => ({
    title: TITLE,
    notes: [`Poogie's luck isn't in this image: ${why}.`],
    lines: [],
    summary: `${TITLE}: not applied (${why})`,
  });
  if (!vanillaEboot) return skipped("the EBOOT wasn't loaded");
  const segment = codeSegment(vanillaEboot);
  if (!segment) return skipped("the EBOOT isn't an ELF");
  const [picker, flagTest, savePointer, questRewards] = findUnique(vanillaEboot, segment, [
    PICKER_SIGNATURE,
    FLAG_TEST_SIGNATURE,
    SAVE_POINTER_SIGNATURE,
    QUEST_REWARD_SIGNATURE,
  ]);
  if (picker == null || flagTest == null || savePointer == null || questRewards == null) {
    return skipped("this EBOOT's code doesn't match");
  }

  const word = (vaddr: number) =>
    vanillaEboot.readUInt32LE(segment.offset + (vaddr - segment.vaddr));
  if (word(picker + (PICKER_WORDS - 2) * 4) !== 0x03e00008) {
    return skipped("this EBOOT's code doesn't match");
  }
  const save = luiLwAddress(word(savePointer), word(savePointer + 4));
  // The game's picker loads the RNG's context and calls it at +0x64.
  const rngContext = luiLwAddress(word(picker + 0x64), word(picker + 0x68));
  const rng = (((word(picker + 0x6c) & 0x03ffffff) << 2) | (picker & 0xf0000000)) >>> 0;

  const out = edits.eboot();
  const write = (vaddr: number, room: number, code: readonly number[], what: string) => {
    if (code.length > room)
      throw new Error(`Poogie's ${what} is ${code.length} words, room for ${room}`);
    const start = segment.offset + (vaddr - segment.vaddr);
    for (let k = 0; k < room; k++) out.writeUInt32LE(code[k] ?? 0, start + k * 4);
  };
  write(
    picker,
    PICKER_WORDS,
    assemblePicker({ save, flagTest, rngContext, rng }, options),
    "picker",
  );
  write(
    questRewards,
    QUEST_REWARD_WORDS,
    assembleQuestRewardWalk({ save, picker }),
    "quest reward walk",
  );

  const notes = [
    "Pet Poogie at home before a hunt. If it lies down happily, that hunt's carves, captures, breaks and quest rewards lean towards rarer rewards.",
  ];
  if (options.guaranteed) {
    notes.push("Test build: a happy Poogie always gives the rarest reward. Not for play.");
  }
  return {
    title: TITLE,
    notes,
    lines: [],
    summary: options.guaranteed ? `${TITLE}: test build, rarest reward guaranteed` : `${TITLE}: on`,
  };
}
