/**
 * Slain and captured in the Monster List (`monsterList.slainCaptured`): the
 * card the Monster List shows for a monster (in the menu with the Combo
 * List and Comrade Info: name, type, count and record sizes) says how many the hunter
 * slew and how many they captured, where the game shows one "No. Hunted"
 * count for both.
 *
 * What the game does (found statically on the EU and JP EBOOTs; EU
 * addresses):
 *
 * - The save already keeps both, apart: a u16 per emID of monsters captured
 *   at `save + 0x44CC` and of monsters slain at `save + 0x46E8` (next to the
 *   largest and smallest sizes at `+0x4580` and `+0x4634`), each capped at
 *   9999. At a quest's end (EU 0x08879268) the quest object's own counts
 *   (`+0x350` captured, `+0x29C` slain, which the capture and kill code
 *   count up) are added to them: `add_slain(save, em, n)` (0x0884FEEC) and
 *   `add_captured(save, em, n)` (0x0884FF80).
 * - A Monster List entry is a group of emIDs (the crown groups, `u8*` lists
 *   ending in 0xFF by group at EU 0x0899BF40). `slain(save, group)`
 *   (0x088503F8) and `captured(save, group)` (0x0885048C) sum a group's
 *   counts, the same 37 words but for the getter they call, and only
 *   `hunted(save, group)` (0x08850520) calls them: their sum, capped at 9999.
 * - The Monster List's card (EU 0x08819E10) prints its third line with the
 *   game's printer, `print(printer, x, y, format, ...)` (0x088920A8, whose
 *   varargs are `$t0`-`$t3`): message 90, "~C05No. Hunted:~C00%d", with
 *   `hunted`. The card goes on to show the record sizes only when that
 *   count isn't 0. Its window is 35 half-width columns wide.
 * - The Guild Card's Monster Log (built at EU 0x08853E20) stores the same
 *   sum, in 14 bits of a card that is traded with other hunters; it's left
 *   as it is.
 *
 * The patch rewrites the two group sums (74 words) as one `counts(save,
 * group)` that returns both sums (`$v0` slain, `$v1` captured) and a
 * `line(group, x, y)` that prints "Slain:%d  Captured:%d" in the card's
 * colours and returns their sum; `hunted` is rewritten in place to add
 * `counts`. The card's third line calls `line`, keeping the sum where the
 * card reads it. The text is English on every disc (the game's own message
 * would need a %d more). Nothing in the save changes: the counts are the
 * ones an unmodified disc keeps.
 */
import type { Edits } from "../edits.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import {
  ADDIU,
  ADDU,
  Assembler,
  BEQ,
  JR,
  LBU,
  LHU,
  LUI,
  LW,
  R,
  RA,
  SLL,
  SLTIU,
  SP,
  SW,
  codeSegment,
  findUnique,
  hi16,
  hiLo,
  jalTo,
  jumpTarget,
  maskImmediates,
  type Segment,
} from "./mips.js";

/** The new line's format: labels in the card's yellow, counts in white, as message 90. */
export const LINE_FORMAT = "~C05Slain:~C00%d  ~C05Captured:~C00%d";
/** The game's cap on each count. */
export const MAX_COUNT = 9999;

/**
 * `hunted(save, group)` (EU 0x08850520): `slain` (word 5) and `captured`
 * (word 9) are its calls. Matched with immediates masked.
 */
export const HUNTED_CODE = [
  0x27bdfff0, 0xafbf000c, 0xafb10008, 0xafb00004, 0x00808821, 0x0e2140fe, 0x00a08021, 0x02002821,
  0x02202021, 0x0e214123, 0x3050ffff, 0x3042ffff, 0x02021021, 0x3042ffff, 0x28412710, 0x54200003,
  0x8fbf000c, 0x2402270f, 0x8fbf000c, 0x8fb10008, 0x8fb00004, 0x03e00008, 0x27bd0010,
];
const HUNTED_SIGNATURE = HUNTED_CODE.map(maskImmediates);
const HUNTED_SLAIN_CALL = 5;
const HUNTED_CAPTURED_CALL = 9;

/**
 * A group sum (EU 0x088503F8 and 0x0885048C): the group table is
 * `lui`/`addiu` at words 6 and 7, the getter its call at word 16. Matched
 * with immediates masked.
 */
export const GROUP_SUM_CODE = [
  0x27bdfff0, 0x30a200ff, 0xafbf000c, 0x00021880, 0xafb20008, 0xafb10004, 0x3c02089a, 0x2442bf40,
  0xafb00000, 0x00431021, 0x8c520000, 0x00808821, 0x92450000, 0x240200ff, 0x10a2000a, 0x00008021,
  0x0e213fc9, 0x02202021, 0x26520001, 0x02021021, 0x3050ffff, 0x92450000, 0x240200ff, 0x14a2fff8,
  0x00000000, 0x3202ffff, 0x28412710, 0x54200003, 0x02001021, 0x2410270f, 0x02001021, 0x8fbf000c,
  0x8fb20008, 0x8fb10004, 0x8fb00000, 0x03e00008, 0x27bd0010,
];
const GROUP_SUM_SIGNATURE = GROUP_SUM_CODE.map(maskImmediates);
export const GROUP_SUM_WORDS = GROUP_SUM_CODE.length;
const GROUP_TABLE_LUI = 6;
const GROUP_TABLE_ADDIU = 7;
const GROUP_SUM_GETTER_CALL = 16;

/** A count getter (EU 0x0884FF24): `andi; sll; addu; jr ra; lhu v0,offset(v0)`. */
export const GETTER_CODE = [0x30a200ff, 0x00021040, 0x00441021, 0x03e00008, 0x94420000];
const GETTER_SIGNATURE = GETTER_CODE.map(maskImmediates);
const GETTER_LOAD = 4;

/**
 * The card's third line (EU 0x08819FC0, JP 0x0881AAA0): `lui v0,hi(save);
 * lbu a1,3(entry); jal hunted; lw a0,lo(save)(v0); andi count,v0,0xffff;
 * lui v0; lw a0; lui v0; jal message; lhu a1,lo(90's ID)(v0); move a3,v0;
 * lui v0,hi(printer); lhu v1,0x82(sp); lw a0,lo(printer)(v0);
 * lh a1,0x80(sp); move t0,count; addiu v0,v1,0x20; jal print; seh a2,v0`.
 * `null` words are checked by `cardMatches`: the entry and count registers
 * differ between EU and JP.
 */
const CARD_WORDS: readonly (number | null)[] = [
  0x3c020000,
  null, // lbu a1, 3(entry)
  0x0c000000,
  0x8c440000,
  null, // andi count, v0, 0xffff
  0x3c020000,
  0x8c440000,
  0x3c020000,
  0x0c000000,
  0x94450000,
  0x00403821,
  0x3c020000,
  0x97a30082,
  0x8c440000,
  0x87a50080,
  null, // move t0, count
  0x24620020,
  0x0c000000,
  0x7c023620,
];
const CARD = {
  saveLui: 0,
  entry: 1,
  hunted: 2,
  saveLw: 3,
  count: 4,
  printerLui: 11,
  printerLw: 13,
  countArg: 15,
  print: 17,
} as const;
/** The words the line gets for its own; the rest of the card stays. */
export const CARD_LENGTH = CARD_WORDS.length;

const reg = (word: number, shift: number) => (word >>> shift) & 31;

/** The card's line at `at` (a file offset) if it matches, with its entry and count registers. */
function cardMatches(
  eboot: Buffer,
  at: number,
): { entry: number; count: number; words: number[] } | null {
  const words = CARD_WORDS.map((_, k) => eboot.readUInt32LE(at + k * 4));
  for (let k = 0; k < CARD_LENGTH; k++) {
    const want = CARD_WORDS[k];
    if (want != null && maskImmediates(words[k]!) !== maskImmediates(want)) return null;
  }
  const entryWord = words[CARD.entry]!;
  const countWord = words[CARD.count]!;
  const countArg = words[CARD.countArg]!;
  // lbu a1, 3(entry)
  if ((entryWord & 0xfc1fffff) >>> 0 !== 0x90050003) return null;
  // andi count, v0, 0xffff
  if ((countWord & 0xffe0ffff) >>> 0 !== 0x3040ffff) return null;
  const count = reg(countWord, 16);
  // move t0, count (addu t0, count, zero)
  if (countArg !== ((count << 21) | 0x4021) >>> 0) return null;
  const entry = reg(entryWord, 21);
  const saved = (r: number) => r >= 16 && r <= 23;
  if (!saved(entry) || !saved(count)) return null;
  return { entry, count, words };
}

export interface MonsterListSites {
  /** vaddrs of the two group sums (adjacent), `hunted` and the card's line. */
  slain: number;
  captured: number;
  hunted: number;
  card: number;
  entry: number;
  count: number;
  /** The group table, the save pointer and printer globals, and `print`. */
  groups: number;
  save: number;
  printer: number;
  print: number;
  /** The save's count arrays, as offsets. */
  slainCounts: number;
  capturedCounts: number;
}

const vaddrOf = (segment: Segment, offset: number) => segment.vaddr + (offset - segment.offset);
const offsetOf = (segment: Segment, vaddr: number) => segment.offset + (vaddr - segment.vaddr);

/** Finds what the patch needs in a vanilla `eboot`, or says why not. */
export function findMonsterList(eboot: Buffer): MonsterListSites | string {
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const word = (vaddr: number) => eboot.readUInt32LE(offsetOf(segment, vaddr));
  const [hunted] = findUnique(eboot, segment, [HUNTED_SIGNATURE], maskImmediates);
  if (hunted == null) return "the Monster List's count doesn't match";
  const slain = jumpTarget(word(hunted + HUNTED_SLAIN_CALL * 4), hunted);
  const captured = jumpTarget(word(hunted + HUNTED_CAPTURED_CALL * 4), hunted);
  // The rewrite takes both group sums and keeps `hunted` where it is after them.
  if (captured !== slain + GROUP_SUM_WORDS * 4 || hunted !== captured + GROUP_SUM_WORDS * 4) {
    return "the Monster List's group counts aren't laid out as expected";
  }
  const sumMatches = (at: number) =>
    GROUP_SUM_SIGNATURE.every((w, k) => maskImmediates(word(at + k * 4)) === w);
  if (!sumMatches(slain) || !sumMatches(captured)) {
    return "the Monster List's group counts don't match";
  }
  const groups = hiLo(word(slain + GROUP_TABLE_LUI * 4), word(slain + GROUP_TABLE_ADDIU * 4));
  if (
    groups !== hiLo(word(captured + GROUP_TABLE_LUI * 4), word(captured + GROUP_TABLE_ADDIU * 4))
  ) {
    return "the Monster List's group counts read different tables";
  }
  const getterOffset = (sum: number): number | null => {
    const getter = jumpTarget(word(sum + GROUP_SUM_GETTER_CALL * 4), sum);
    const ok = GETTER_SIGNATURE.every((w, k) => maskImmediates(word(getter + k * 4)) === w);
    return ok ? word(getter + GETTER_LOAD * 4) & 0xffff : null;
  };
  const slainCounts = getterOffset(slain);
  const capturedCounts = getterOffset(captured);
  if (slainCounts === null || capturedCounts === null || slainCounts === capturedCounts) {
    return "the save's slain and captured counts weren't found";
  }

  // Nothing else may call the group sums: their words become the new code.
  const end = segment.offset + segment.size;
  const sums = new Set([jalTo(slain), jalTo(captured)]);
  for (let at = segment.offset; at + 4 <= end; at += 4) {
    if (!sums.has(eboot.readUInt32LE(at))) continue;
    const from = vaddrOf(segment, at);
    if (from < hunted || from >= hunted + HUNTED_SIGNATURE.length * 4) {
      return "the Monster List's group counts have other callers";
    }
  }

  // The card's line: the one place that calls `hunted` with this shape.
  const cards: (NonNullable<ReturnType<typeof cardMatches>> & { at: number })[] = [];
  const huntedCall = jalTo(hunted);
  for (let at = segment.offset; at + CARD_LENGTH * 4 <= end; at += 4) {
    if (eboot.readUInt32LE(at + CARD.hunted * 4) !== huntedCall) continue;
    const found = cardMatches(eboot, at);
    if (found) cards.push({ ...found, at });
  }
  const card = cards[0];
  if (!card || cards.length !== 1) return "the Monster List's card doesn't match";
  const w = card.words;
  const save = hiLo(w[CARD.saveLui]!, w[CARD.saveLw]!);
  return {
    slain,
    captured,
    hunted,
    card: vaddrOf(segment, card.at),
    entry: card.entry,
    count: card.count,
    groups,
    save,
    printer: hiLo(w[CARD.printerLui]!, w[CARD.printerLw]!),
    print: jumpTarget(w[CARD.print]!, vaddrOf(segment, card.at + CARD.print * 4)),
    slainCounts,
    capturedCounts,
  };
}

const MOVZ = 0x0a;
const SEH = (rt: number, rd: number) =>
  ((0x1f << 26) | (rt << 16) | (rd << 11) | (0x18 << 6) | 0x20) >>> 0;

/** `rd = min(rd, MAX_COUNT)`, with `$t2`/`$t3` as scratch. */
function cap(a: Assembler, rd: number): void {
  a.i(ADDIU, R.zero, R.t2, MAX_COUNT);
  a.i(SLTIU, rd, R.t3, MAX_COUNT + 1);
  a.r(R.t2, R.t3, rd, 0, MOVZ); // movz rd, t2, t3: over the cap, the cap
}

/**
 * `counts(save, group)` then `line(group, x, y)` and the format, at
 * `sites.slain`; with `line`'s address.
 */
export function assembleCounts(sites: MonsterListSites): { words: number[]; line: number } {
  const a = new Assembler();
  // counts(a0 = save, a1 = group): v0 = slain, v1 = captured, each capped.
  a.label("counts");
  a.i(0x0c, R.a1, R.a1, 0xff); // andi a1, a1, 0xff
  a.r(0, R.a1, R.a1, 2, SLL); // sll a1, a1, 2
  a.i(LUI, 0, R.t0, hi16(sites.groups));
  a.r(R.t0, R.a1, R.t0, 0, ADDU);
  a.i(LW, R.t0, R.t0, sites.groups & 0xffff); // t0 = the group's emID list
  a.r(R.zero, R.zero, R.v0, 0, ADDU);
  a.r(R.zero, R.zero, R.v1, 0, ADDU);
  a.i(ADDIU, R.zero, R.t3, 0xff);
  a.label("next");
  a.i(LBU, R.t0, R.t1, 0);
  a.branch(BEQ, R.t1, R.t3, "summed");
  a.r(0, R.t1, R.t1, 1, SLL); // (delay) t1 = em × 2
  a.r(R.t1, R.a0, R.t1, 0, ADDU);
  a.i(LHU, R.t1, R.t2, sites.slainCounts);
  a.r(R.v0, R.t2, R.v0, 0, ADDU);
  a.i(LHU, R.t1, R.t2, sites.capturedCounts);
  a.r(R.v1, R.t2, R.v1, 0, ADDU);
  a.branch(BEQ, R.zero, R.zero, "next");
  a.i(ADDIU, R.t0, R.t0, 1); // (delay) the next emID
  a.label("summed");
  cap(a, R.v0);
  cap(a, R.v1);
  a.r(RA, 0, 0, 0, JR);
  a.emit(0);

  // line(a0 = group, a1 = x, a2 = y): prints both, returns their sum, capped.
  a.label("line");
  a.i(ADDIU, SP, SP, -0x10);
  a.i(SW, SP, RA, 0xc);
  a.i(SW, SP, 16, 0x8);
  a.i(SW, SP, 17, 0x4);
  a.i(SW, SP, 18, 0x0);
  a.r(R.a1, R.zero, 17, 0, ADDU); // s1 = x
  a.emit(SEH(R.a2, 18)); // s2 = y
  a.r(R.a0, R.zero, R.a1, 0, ADDU); // a1 = group
  a.i(LUI, 0, R.v0, hi16(sites.save));
  a.jalLabel("counts");
  a.i(LW, R.v0, R.a0, sites.save & 0xffff); // (delay) a0 = save
  a.r(R.v0, R.zero, R.t0, 0, ADDU); // t0 = slain
  a.r(R.v1, R.zero, R.t1, 0, ADDU); // t1 = captured
  a.r(R.v0, R.v1, 16, 0, ADDU); // s0 = both
  cap(a, 16);
  a.i(LUI, 0, R.v0, hi16(sites.printer));
  a.i(LW, R.v0, R.a0, sites.printer & 0xffff);
  a.r(17, R.zero, R.a1, 0, ADDU);
  a.addressOf(R.a3, "format");
  a.jal(sites.print);
  a.r(18, R.zero, R.a2, 0, ADDU); // (delay) a2 = y
  a.r(16, R.zero, R.v0, 0, ADDU);
  a.i(LW, SP, RA, 0xc);
  a.i(LW, SP, 16, 0x8);
  a.i(LW, SP, 17, 0x4);
  a.i(LW, SP, 18, 0x0);
  a.r(RA, 0, 0, 0, JR);
  a.i(ADDIU, SP, SP, 0x10);
  a.label("format");
  const words = a.link(sites.slain);
  const text = Buffer.alloc(Math.ceil((LINE_FORMAT.length + 1) / 4) * 4);
  text.write(LINE_FORMAT, "latin1");
  for (let k = 0; k < text.length; k += 4) words.push(text.readUInt32LE(k));
  return { words, line: sites.slain + a.offsetOf("line") * 4 };
}

/** `hunted(save, group)`, in place: `counts`' sum, capped. */
export function assembleHunted(sites: MonsterListSites): number[] {
  const a = new Assembler();
  a.i(ADDIU, SP, SP, -0x10);
  a.i(SW, SP, RA, 0xc);
  a.jal(sites.slain);
  a.emit(0);
  a.r(R.v0, R.v1, R.v0, 0, ADDU);
  cap(a, R.v0);
  a.i(LW, SP, RA, 0xc);
  a.r(RA, 0, 0, 0, JR);
  a.i(ADDIU, SP, SP, 0x10);
  const words = a.link(sites.hunted);
  while (words.length < HUNTED_SIGNATURE.length) words.push(0);
  return words;
}

/** The card's third line: `count = line(group, x, y + 0x20)`, then on past the old words. */
export function assembleCard(sites: MonsterListSites, line: number): number[] {
  const a = new Assembler();
  a.i(LBU, sites.entry, R.a0, 3);
  a.i(0x21, SP, R.a1, 0x80); // lh a1, 0x80(sp): x
  a.i(LHU, SP, R.v1, 0x82); // y
  a.jal(line);
  a.i(ADDIU, R.v1, R.a2, 0x20);
  a.branch(BEQ, R.zero, R.zero, "end");
  a.i(0x0c, R.v0, sites.count, 0xffff); // (delay) andi count, v0, 0xffff
  while (a.length < CARD_LENGTH) a.emit(0);
  a.label("end");
  return a.link(sites.card);
}

/** Patches the EBOOT (`edits`); null if it did, else why not. */
export function patchMonsterList(vanillaEboot: Buffer, edits: Edits): string | null {
  const sites = findMonsterList(vanillaEboot);
  if (typeof sites === "string") return sites;
  const { words: counts, line } = assembleCounts(sites);
  if (counts.length > GROUP_SUM_WORDS * 2) return "the new code doesn't fit";
  const segment = codeSegment(vanillaEboot)!;
  const eboot = edits.eboot();
  const put = (vaddr: number, words: number[]) =>
    words.forEach((w, k) => eboot.writeUInt32LE(w >>> 0, offsetOf(segment, vaddr) + k * 4));
  // The rest of the two group sums' words become nops.
  put(sites.slain, [...counts, ...Array<number>(GROUP_SUM_WORDS * 2 - counts.length).fill(0)]);
  put(sites.hunted, assembleHunted(sites));
  put(sites.card, assembleCard(sites, line));
  return null;
}

export function monsterListReport(problem: string | null): ShuffleReport {
  if (problem) {
    return {
      title: "Monster List",
      notes: [`The Monster List shows one hunted count on this image: ${problem}.`],
      lines: [],
      summary: `Monster List: not applied (${problem})`,
    };
  }
  return {
    title: "Monster List",
    notes: [
      "The Monster List's card shows how many of each monster you slew and how many you captured, from the counts the save already keeps.",
    ],
    lines: [],
    summary: "Monster List: slain and captured",
  };
}
