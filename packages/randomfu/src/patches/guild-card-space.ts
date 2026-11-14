/**
 * Guild Card space: caps received Guild Cards so the save's largest block
 * becomes room for randomfu's own code and data, and rewrites the card
 * compaction so it frees a code cave in the EBOOT.
 *
 * What the game does (found on the EU and JP discs; the save layout is the
 * same in both):
 *
 * - The save struct (0x6AF40 bytes) is static: an arena in the EBOOT's BSS,
 *   at a constant address the arena's constructor computes (EU 0x09999C60,
 *   JP 0x099959A0), and the save pointer global is only ever set to it. Its
 *   persistent part, `+0x4A0..+0x6ADD8`, is what a save load copies in.
 * - Received Guild Cards are 96 slots of 4216 bytes at `+0x4A58`, plus a
 *   40-byte summary per card at `+0x687D0` and a 4-byte entry per card at
 *   `+0x6A384`. The count is a literal 96 in each loop over them (7 in the
 *   EBOOT, 1 in `game_sub.ovl`), and in one "96 − used" free count.
 * - Deleting a card compacts the rest: the game's routine (351 words) moves
 *   every card after an empty slot down by one and clears slot 95, until no
 *   gap is left.
 *
 * The patch keeps `kept` cards (3 by default). It bounds every loop and the
 * free count at `kept`, and rewrites the compaction as one pass over the kept
 * slots, which needs 75 of its 351 words. What's left of the routine is
 * a code cave, and slots `kept..95` are free save space (93 × 4216 = 392,088
 * bytes for 3 cards). Both are shared: features take cave words with
 * `allocateCave` and save space with `allocateSlots`, so several can be
 * combined in one image. Cards already in the freed slots are lost.
 *
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * EBOOTs, and nothing is patched if one doesn't match.
 */
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import {
  ADDIU,
  ADDU,
  Assembler,
  BEQ,
  BNE,
  JR,
  LHU,
  LUI,
  LW,
  ORI,
  R,
  RA,
  SLTIU,
  SLTU,
  SW,
  codeSegment,
  findUnique,
  hi16,
  hiLo,
  jalTo,
  type Segment,
} from "./mips.js";

/** Received Guild Cards in the save, and the game's count of them. */
export const CARDS = 0x4a58;
export const CARD_BYTES = 4216;
export const GAME_CARDS = 96;
/** Per card: a 40-byte summary and a 4-byte entry, compacted with the cards. */
export const CARD_SUMMARIES = 0x687d0;
export const CARD_SUMMARY_BYTES = 40;
export const CARD_TABLE = 0x6a384;
/** Guild Cards kept by default. */
export const DEFAULT_KEPT_CARDS = 3;

/** Masked signatures (see `maskWord`). The compaction: its first 40 of 351 words. */
export const COMPACT_SIGNATURE = [
  0x27bdffc0, 0xafbf0000, 0xafbe0000, 0xafb70000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000,
  0xafb20000, 0xafb10000, 0xafb00000, 0x3c030000, 0x8c630000, 0xafa00000, 0x00002021, 0x24654a58,
  0x94a30000, 0x50600005, 0x24840001, 0x8fa30000, 0x24630001, 0xafa30000, 0x24840001, 0x28830060,
  0x1460fff7, 0x24a51078, 0x8fa30000, 0x18600137, 0x00008021, 0x3c030000, 0x8c670000, 0x00103080,
  0x3c010000, 0x00101940, 0x00702023, 0x00041900, 0x00831821, 0x000318c0, 0x00e32021, 0x24834a58,
];
export const COMPACT_WORDS = 351;
/** Sets up the save struct (in the arena) and stores the save pointer. */
export const SAVE_INIT_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb00000, 0x00808021, 0x3c020000, 0xac500000, 0x3c020000, 0x00821021,
];

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/**
 * `slti`/`sltiu` against the game's card count, one or two words before a
 * pointer stepping one card (`addiu rX, rX, 4216`): the loops over the cards.
 * Offsets into `code`, skipping `[skipFrom, skipTo)`.
 */
export function findCardBounds(code: Buffer, skipFrom = 0, skipTo = 0): number[] {
  const found: number[] = [];
  for (let at = 8; at + 4 <= code.length; at += 4) {
    const w = word(code, at);
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    if (w >>> 26 !== ADDIU || rs !== rt || (w & 0xffff) !== CARD_BYTES) continue;
    for (const back of [4, 8]) {
      const x = word(code, at - back);
      const op = x >>> 26;
      if ((op === 0x0a || op === SLTIU) && (x & 0xffff) === GAME_CARDS) {
        if (at - back < skipFrom || at - back >= skipTo) found.push(at - back);
      }
    }
  }
  return found;
}

/** `addiu rX, $zero, 96` within six words after a card loop: the free-slot count. */
function findFreeCount(code: Buffer, bound: number): number | null {
  for (let at = bound + 4; at <= bound + 24 && at + 4 <= code.length; at += 4) {
    const x = word(code, at);
    if (x >>> 26 === ADDIU && ((x >>> 21) & 31) === 0 && (x & 0xffff) === GAME_CARDS) return at;
  }
  return null;
}

/**
 * The new compaction at `at`: one pass that packs the cards in use (and their
 * table entries and summaries) to the front of the kept slots in order, then
 * clears the rest of them. The game's version gets the same result by moving
 * cards down one at a time. Same contract (no arguments, nothing returned),
 * but leaf and only touching temporaries. `save` is the save pointer global.
 */
export function assembleCompaction(at: number, save: number, kept: number): number[] {
  const a = new Assembler();
  const { zero, at: AT, v0, v1, a0, a1, a2, a3, t0, t1, t2, t3, t4, t5, t6, t7, t8 } = R;
  const move = (rd: number, rs: number) => a.r(rs, zero, rd, 0, ADDU);
  const nop = () => a.emit(0);
  const b = (label: string) => a.branch(BEQ, zero, zero, label);
  /** `reg = base + offset`, for offsets past 16 bits. */
  const addressOf = (reg: number, base: number, offset: number) => {
    a.i(LUI, zero, AT, hi16(offset));
    a.r(base, AT, reg, 0, ADDU);
    a.i(ADDIU, reg, reg, offset);
  };

  move(t8, RA);
  a.loadWord(t0, save);
  a.i(ADDIU, t0, t1, CARDS); // read: card, table entry, summary
  addressOf(t2, t0, CARD_TABLE);
  addressOf(t3, t0, CARD_SUMMARIES);
  move(t5, t1); // write
  move(t6, t2);
  move(t7, t3);
  a.i(ADDIU, zero, a2, kept);
  a.label("slot");
  a.i(LHU, t1, v0, 0);
  a.branch(BEQ, v0, zero, "skip");
  nop();
  a.branch(BEQ, t1, t5, "kept");
  nop();
  for (const [to, from, bytes] of [
    [t5, t1, CARD_BYTES],
    [t6, t2, 4],
    [t7, t3, CARD_SUMMARY_BYTES],
  ] as const) {
    move(a0, to);
    move(a1, from);
    a.jalLabel("copy");
    a.i(ADDIU, zero, v1, bytes);
  }
  a.label("kept");
  a.i(ADDIU, t5, t5, CARD_BYTES);
  a.i(ADDIU, t6, t6, 4);
  a.i(ADDIU, t7, t7, CARD_SUMMARY_BYTES);
  a.label("skip");
  a.i(ADDIU, t1, t1, CARD_BYTES);
  a.i(ADDIU, t2, t2, 4);
  a.i(ADDIU, a2, a2, -1);
  a.branch(BNE, a2, zero, "slot");
  a.i(ADDIU, t3, t3, CARD_SUMMARY_BYTES);
  for (const [from, end] of [
    [t5, CARDS + kept * CARD_BYTES],
    [t6, CARD_TABLE + kept * 4],
    [t7, CARD_SUMMARIES + kept * CARD_SUMMARY_BYTES],
  ] as const) {
    move(a0, from);
    addressOf(a3, t0, end);
    a.jalLabel("clear");
    nop();
  }
  a.r(t8, zero, zero, 0, JR);
  nop();

  // copy: v1 bytes from a1 to a0, a word at a time.
  a.label("copy");
  a.r(a1, v1, t4, 0, ADDU);
  a.label("copyWord");
  a.i(LW, a1, v0, 0);
  a.i(ADDIU, a1, a1, 4);
  a.i(SW, a0, v0, 0);
  a.branch(BNE, a1, t4, "copyWord");
  a.i(ADDIU, a0, a0, 4);
  a.r(RA, zero, zero, 0, JR);
  nop();

  // clear: zero [a0, a3).
  a.label("clear");
  a.r(a0, a3, v0, 0, SLTU);
  a.branch(BEQ, v0, zero, "cleared");
  nop();
  a.i(SW, a0, zero, 0);
  b("clear");
  a.i(ADDIU, a0, a0, 4);
  a.label("cleared");
  a.r(RA, zero, zero, 0, JR);
  nop();

  return a.link(at);
}

/** What was found in the EBOOT, before anything is patched. */
interface Found {
  segment: Segment;
  compact: number;
  /** The save pointer global. */
  save: number;
  /** Where the save struct sits: its arena's constant address plus its offset. */
  saveStruct: number;
  ebootBounds: number[];
  freeCounts: number[];
  subBounds: number[];
}

/** The cave, the freed save slots, and what the patch found; shared per image. */
export class GuildCardSpace {
  private caveNext: number;
  private slotNext: number;

  constructor(
    readonly kept: number,
    /** The save pointer global (a vaddr). */
    readonly save: number,
    /** The save struct's fixed address. */
    readonly saveStruct: number,
    /** The free words after the new compaction: `[caveStart, caveEnd)`, vaddrs. */
    readonly caveStart: number,
    readonly caveEnd: number,
    private readonly segment: Segment,
    private readonly edits: Edits,
  ) {
    this.caveNext = caveStart;
    this.slotNext = kept;
  }

  /** Reserves `words` cave words and returns their vaddr; throws if they don't fit. */
  allocateCave(words: number): number {
    const at = this.caveNext;
    if (at + words * 4 > this.caveEnd) {
      throw new Error(
        `The Guild Card cave has ${(this.caveEnd - at) / 4} free words, ${words} asked for`,
      );
    }
    this.caveNext += words * 4;
    return at;
  }

  /** Writes code at a vaddr inside the cave. */
  writeCave(at: number, words: readonly number[]): void {
    if (at < this.caveStart || at + words.length * 4 > this.caveEnd) {
      throw new Error(`Cave write at 0x${at.toString(16)} is outside the cave`);
    }
    const out = this.edits.eboot();
    const offset = this.segment.offset + (at - this.segment.vaddr);
    words.forEach((w, k) => out.writeUInt32LE(w >>> 0, offset + k * 4));
  }

  /**
   * Reserves freed card slots (`count`, or all that are left when null) and
   * returns their range as save offsets.
   */
  allocateSlots(count: number | null): { start: number; end: number } {
    const n = count ?? GAME_CARDS - this.slotNext;
    if (n <= 0 || this.slotNext + n > GAME_CARDS) {
      throw new Error(`${GAME_CARDS - this.slotNext} freed Guild Card slots left, ${n} asked for`);
    }
    const start = CARDS + this.slotNext * CARD_BYTES;
    this.slotNext += n;
    return { start, end: CARDS + this.slotNext * CARD_BYTES };
  }
}

const spaces = new WeakMap<Edits, GuildCardSpace>();

function find(vanillaEboot: Buffer, gameSub: Buffer): Found | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [compact, saveInit] = findUnique(vanillaEboot, segment, [
    COMPACT_SIGNATURE,
    SAVE_INIT_SIGNATURE,
  ]);
  if (compact == null || saveInit == null) return "this EBOOT's code doesn't match";
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  const at = (vaddr: number) => word(vanillaEboot, offsetOf(vaddr));

  // The compaction ends with `jr ra; addiu sp, sp, 64` at its last two words.
  const compactEnd = compact + COMPACT_WORDS * 4;
  if (at(compactEnd - 8) !== 0x03e00008 || at(compactEnd - 4) !== 0x27bd0040) {
    return "this EBOOT's code doesn't match";
  }
  const save = hiLo(at(saveInit + 16), at(saveInit + 20));

  // The save struct's address: `lui at, hi; ori at, lo; jal saveInit; addu a0, s0, at`,
  // with `s0` the arena, set once by `lui s0, hi; addiu s0, s0, lo`.
  let saveStruct: number | null = null;
  const end = segment.offset + segment.size;
  for (let off = segment.offset + 8; off + 8 <= end; off += 4) {
    if (word(vanillaEboot, off) !== jalTo(saveInit)) continue;
    const lui = word(vanillaEboot, off - 8);
    const ori = word(vanillaEboot, off - 4);
    if (lui >>> 26 !== LUI || ori >>> 26 !== ORI) continue;
    const inArena = ((lui & 0xffff) * 0x10000 + (ori & 0xffff)) >>> 0;
    for (let back = off - 12; back >= Math.max(segment.offset, off - 0x400); back -= 4) {
      const w = word(vanillaEboot, back);
      const next = word(vanillaEboot, back + 4);
      if (w === 0x3c100000 + (w & 0xffff) && next >>> 16 === 0x2610) {
        saveStruct = (hiLo(w, next) + inArena) >>> 0;
        break;
      }
    }
  }
  if (saveStruct === null) return "this EBOOT's code doesn't match";

  const code = vanillaEboot.subarray(0, end);
  const ebootBounds = findCardBounds(code, offsetOf(compact), offsetOf(compactEnd));
  const subBounds = findCardBounds(gameSub);
  const freeCounts = ebootBounds.map((b) => findFreeCount(code, b)).filter((x) => x !== null);
  if (ebootBounds.length !== 7 || subBounds.length !== 1 || freeCounts.length !== 1) {
    return "this EBOOT's Guild Card code doesn't match";
  }
  return { segment, compact, save, saveStruct, ebootBounds, freeCounts, subBounds };
}

/**
 * Caps Guild Cards at `kept` and rewrites the compaction, once per image:
 * later calls return the same space (and must ask for the same cap). A string
 * says why it can't be applied; nothing is patched then.
 */
export function guildCardSpace(
  vanillaEboot: Buffer | null,
  gameSub: LoadedOverlay,
  edits: Edits,
  kept = DEFAULT_KEPT_CARDS,
): GuildCardSpace | string {
  const existing = spaces.get(edits);
  if (existing) {
    if (existing.kept !== kept) {
      throw new Error(`Guild Cards are already capped at ${existing.kept}, not ${kept}`);
    }
    return existing;
  }
  if (!Number.isInteger(kept) || kept < 0 || kept >= GAME_CARDS) {
    throw new Error(`Can't keep ${kept} Guild Cards`);
  }
  if (!vanillaEboot) return "the EBOOT wasn't loaded";
  const found = find(vanillaEboot, edits.dataFileNow(gameSub.index));
  if (typeof found === "string") return found;
  const { segment, compact } = found;

  const compaction = assembleCompaction(compact, found.save, kept);
  const out = edits.eboot();
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  for (let k = 0; k < COMPACT_WORDS; k++) {
    out.writeUInt32LE(compaction[k] ?? 0, offsetOf(compact) + k * 4);
  }
  const keep = (buf: Buffer, offset: number) =>
    buf.writeUInt32LE(((word(buf, offset) & 0xffff0000) | kept) >>> 0, offset);
  for (const b of [...found.ebootBounds, ...found.freeCounts]) keep(out, b);
  const sub = edits.overlay(gameSub);
  for (const b of found.subBounds) keep(sub, b);

  const space = new GuildCardSpace(
    kept,
    found.save,
    found.saveStruct,
    compact + compaction.length * 4,
    compact + COMPACT_WORDS * 4,
    segment,
    edits,
  );
  spaces.set(edits, space);
  return space;
}
