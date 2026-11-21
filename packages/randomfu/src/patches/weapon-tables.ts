/**
 * Room for new weapon IDs (docs/ruststone-weapons.md, "Instance IDs").
 *
 * Six tables are indexed by weapon ID and packed against each other: the
 * melee and ranged stats, the melee and ranged upgrade entries, and the
 * melee and ranged description indexes. The weapon section of the Create
 * table is a list the smithy walks until a type byte of 0xFF. None of them
 * can grow where they are, so this copies all seven into a new loadable
 * segment at the end of the EBOOT, with room for the new IDs and Create
 * entries, and repoints the code that addresses them: every `lui` whose
 * register forms an address inside one of the old tables, in the EBOOT's
 * code and in the overlays that read them (`lobby_task`, `game_task`,
 * `edit_task`). The old tables stay where they are, unread.
 *
 * Found on EU and JP by the same scan (the weapon-table probe: 31 sites
 * for the melee tables on EU, all of them repointed without a conflict).
 * There are no bounds checks on 1150 or 354 and no data pointers into the
 * tables. A save holding new IDs read on a disc without this expansion
 * reads the wrong records, so keep new IDs stable across seeds.
 *
 * Run it last among the EBOOT edits to these tables: it copies them as they
 * are, and later edits to the old addresses would be lost.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { equipmentCreateLayout, equipmentUpgradeLayout } from "mhfu-extract/src/tables/recipes.js";
import { TABLE_COUNTS, resolveTableOffset } from "mhfu-extract/src/tables/offsets.js";
import type { Edits } from "../edits.js";
import type { GameData, LoadedOverlay } from "../game/load.js";
import { codeSegment, signed16, type Segment } from "./mips.js";

export const MELEE_IDS = TABLE_COUNTS.weaponsBlademaster; // 1150
export const RANGED_IDS = TABLE_COUNTS.weaponsGunner; // 354
/** IDs from here up are rust stones to the smithy (its own test, `lobby_task`). */
export const RUST_IDS = 1501;
export const CREATE_ENTRY = 26;
export const MELEE_STATS = 24;
export const RANGED_STATS = 28;
export const UPGRADE_ENTRY = 28;

/** The description index tables (u16 per ID), which no table reader covers yet. */
const DESCRIPTION_INDEX: Partial<Record<string, { melee: number; ranged: number }>> = {
  eu: { melee: 0x0899a1fc, ranged: 0x0899aaf8 },
  jp: { melee: 0x089972ac, ranged: 0x08997ba8 },
};

/** Where the new segment loads: past the EBOOT's own image and the heap's start on both. */
const NEW_SEGMENT: Partial<Record<string, number>> = { eu: 0x09d65500, jp: 0x09d60400 };

export type TableName =
  | "meleeStats"
  | "rangedStats"
  | "meleeUpgrade"
  | "rangedUpgrade"
  | "meleeDescription"
  | "rangedDescription"
  | "create";

export interface ExpandRequest {
  melee: number;
  ranged: number;
  /** Create entries (26 bytes each) to add after the vanilla weapon entries. */
  create: Buffer[];
}

export interface ExpandedTables {
  /** The first new melee and ranged IDs. */
  firstMelee: number;
  firstRanged: number;
  /** Each table's new address (vaddr) and its offset in the EBOOT file. */
  address: Record<TableName, number>;
  offset: Record<TableName, number>;
  /** Index (from the weapon Create table's start) of the first added Create entry. */
  firstCreate: number;
  /** `lui` sites repointed, per file. */
  sites: Record<string, number>;
}

/** A table's old place (exported for tests). */
export interface OldTable {
  name: TableName;
  vaddr: number;
  /** Bytes the code may address: the entries (and, for Create, its terminator). */
  bytes: number;
  /** Bytes to copy; new room is added after them. */
  copy: number;
  /** Bytes the new copy has. */
  newBytes: number;
}

const align = (n: number, a: number) => Math.ceil(n / a) * a;

/**
 * Copies the tables into a new segment with room for `request`, and
 * repoints the code. Returns where everything went, or why it can't.
 */
export function expandWeaponTables(
  game: GameData,
  edits: Edits,
  request: ExpandRequest,
): ExpandedTables | string {
  const base = NEW_SEGMENT[game.region];
  const descriptions = DESCRIPTION_INDEX[game.region];
  if (base === undefined || !descriptions) return `no table addresses for region ${game.region}`;
  const eboot = edits.eboot();
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const reader = new BinaryReader(eboot);
  const toVaddr = (offset: number) => segment.vaddr + (offset - segment.offset);
  const meleeStats = resolveTableOffset("weaponsBlademaster", reader, game.resolver);
  const rangedStats = resolveTableOffset("weaponsGunner", reader, game.resolver);
  const upgrades = equipmentUpgradeLayout(reader, game.resolver);
  const create = equipmentCreateLayout(reader, game.resolver);
  const createStart = create.greatSwordLongSword.offset;
  const rustEnd = create.ancientRustGunner.offset + create.ancientRustGunner.count * CREATE_ENTRY;
  // The walk ends at a type byte of 0xFF: the u16 terminator right after the last weapon entry.
  if (eboot[rustEnd] !== 0xff) return "the weapon Create table doesn't end where expected";
  const vanillaCreate = (rustEnd - createStart) / CREATE_ENTRY;
  const meleeN = MELEE_IDS + request.melee;
  const rangedN = RANGED_IDS + request.ranged;
  if (meleeN > RUST_IDS || rangedN > RUST_IDS) return "too many new IDs";
  const old: OldTable[] = [
    {
      name: "meleeStats",
      vaddr: toVaddr(meleeStats),
      bytes: MELEE_IDS * MELEE_STATS,
      copy: MELEE_IDS * MELEE_STATS,
      newBytes: meleeN * MELEE_STATS,
    },
    {
      name: "rangedStats",
      vaddr: toVaddr(rangedStats),
      bytes: RANGED_IDS * RANGED_STATS,
      copy: RANGED_IDS * RANGED_STATS,
      newBytes: rangedN * RANGED_STATS,
    },
    {
      name: "meleeUpgrade",
      vaddr: toVaddr(upgrades.blademaster.offset),
      bytes: MELEE_IDS * UPGRADE_ENTRY,
      copy: MELEE_IDS * UPGRADE_ENTRY,
      newBytes: meleeN * UPGRADE_ENTRY,
    },
    {
      name: "rangedUpgrade",
      vaddr: toVaddr(upgrades.gunner.offset),
      bytes: RANGED_IDS * UPGRADE_ENTRY,
      copy: RANGED_IDS * UPGRADE_ENTRY,
      newBytes: rangedN * UPGRADE_ENTRY,
    },
    {
      name: "meleeDescription",
      vaddr: descriptions.melee,
      bytes: MELEE_IDS * 2,
      copy: MELEE_IDS * 2,
      newBytes: meleeN * 2,
    },
    {
      name: "rangedDescription",
      vaddr: descriptions.ranged,
      bytes: RANGED_IDS * 2,
      copy: RANGED_IDS * 2,
      newBytes: rangedN * 2,
    },
    {
      name: "create",
      vaddr: toVaddr(createStart),
      bytes: rustEnd + 2 - createStart,
      copy: rustEnd - createStart,
      newBytes: (vanillaCreate + request.create.length) * CREATE_ENTRY + 2 + CREATE_ENTRY,
    },
  ];
  // The new segment: each table 0x40-aligned.
  const address = {} as Record<TableName, number>;
  let at = 0;
  for (const t of old) {
    address[t.name] = base + at;
    at = align(at + t.newBytes, 0x40);
  }
  const size = align(at, 0x100);
  const seg = Buffer.alloc(size);
  const offsetIn = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  for (const t of old) {
    eboot.copy(seg, address[t.name] - base, offsetIn(t.vaddr), offsetIn(t.vaddr) + t.copy);
  }
  // New Create entries, then the terminator (0xFFFF) and an empty entry, as vanilla ends.
  const createAt = address.create - base + vanillaCreate * CREATE_ENTRY;
  request.create.forEach((entry, k) => entry.copy(seg, createAt + k * CREATE_ENTRY));
  seg.writeUInt16LE(0xffff, createAt + request.create.length * CREATE_ENTRY);

  // Repoint the code.
  const sites: Record<string, number> = {};
  const problems: string[] = [];
  // On copies, so a table reference it can't move leaves every file as it was.
  const text = textRange(eboot, segment);
  const ebootCopy = Buffer.from(eboot);
  sites.EBOOT = repoint(ebootCopy, text.offset, text.vaddr, text.size, old, address, problems);
  const overlays: [string, LoadedOverlay][] = (
    [
      ["lobby_task", game.lobbyTask],
      ["game_task", game.gameTask],
      ["edit_task", game.editTask],
    ] as const
  ).flatMap(([name, o]) => (o ? [[name, o] as [string, LoadedOverlay]] : []));
  const copies = overlays.map(([name, overlay]) => {
    const buf = Buffer.from(edits.dataFileNow(overlay.index));
    sites[name] = repoint(buf, 0, overlay.ovl.loadBase, buf.length, old, address, problems);
    return buf;
  });
  if (problems.length) return `couldn't repoint: ${problems.slice(0, 3).join("; ")}`;

  overlays.forEach(([, overlay], k) => copies[k]!.copy(edits.overlay(overlay)));
  edits.replaceEboot(appendSegment(ebootCopy, seg, base));
  const offset = {} as Record<TableName, number>;
  const segOffset = alignedLength(ebootCopy.length);
  for (const t of old) offset[t.name] = segOffset + (address[t.name] - base);
  return {
    firstMelee: MELEE_IDS,
    firstRanged: RANGED_IDS,
    address,
    offset,
    firstCreate: vanillaCreate,
    sites,
  };
}

/** The EBOOT's `.text`: section headers when it has them, else the whole first segment. */
function textRange(elf: Buffer, segment: Segment): { offset: number; vaddr: number; size: number } {
  const shoff = elf.readUInt32LE(0x20);
  const shnum = elf.readUInt16LE(0x30);
  for (let i = 0; i < shnum && shoff && shoff + i * 40 + 40 <= elf.length; i++) {
    const at = shoff + i * 40;
    const type = elf.readUInt32LE(at + 4);
    const flags = elf.readUInt32LE(at + 8);
    if (type !== 1 || !(flags & 4)) continue; // PROGBITS, executable
    const vaddr = elf.readUInt32LE(at + 12);
    const offset = elf.readUInt32LE(at + 16);
    const size = elf.readUInt32LE(at + 20);
    if (vaddr === segment.vaddr) return { offset, vaddr, size };
  }
  return segment;
}

const alignedLength = (n: number) => align(n, 0x40);

/** The ELF with `seg` as one more PT_LOAD at `vaddr`, its program headers moved to the end. */
export function appendSegment(elf: Buffer, seg: Buffer, vaddr: number): Buffer {
  const phoff = elf.readUInt32LE(0x1c);
  const phnum = elf.readUInt16LE(0x2c);
  const segOffset = alignedLength(elf.length);
  const phAt = align(segOffset + seg.length, 4);
  const out = Buffer.alloc(phAt + (phnum + 1) * 32);
  elf.copy(out);
  seg.copy(out, segOffset);
  elf.copy(out, phAt, phoff, phoff + phnum * 32);
  const ph = phAt + phnum * 32;
  // PT_LOAD, offset, vaddr, paddr, filesz, memsz, flags RW, align
  [1, segOffset, vaddr, vaddr, seg.length, seg.length, 6, 0x10].forEach((v, k) =>
    out.writeUInt32LE(v, ph + k * 4),
  );
  out.writeUInt32LE(phAt, 0x1c);
  out.writeUInt16LE(phnum + 1, 0x2c);
  return out;
}

// Loads into a GPR (lb lh lw lbu lhu lwl lwr ll); FPU and VFPU loads (lwc1 lv.s lv.q) write no GPR.
const LOADS = new Set([0x20, 0x21, 0x23, 0x24, 0x25, 0x22, 0x26, 0x30]);
const OTHER_LOADS = new Set([0x31, 0x32, 0x35, 0x36]);
const STORES = new Set([0x28, 0x29, 0x2b, 0x39, 0x3a, 0x3e]); // sb sh sw swc1 sv.s sv.q
const ADDIU = 0x09;
const ORI = 0x0d;
const BRANCHES = new Set([0x01, 0x02, 0x04, 0x05, 0x06, 0x07, 0x14, 0x15, 0x16, 0x17]);
/** Opcodes besides loads that write GPR rt: ALU immediates, SPECIAL3 (ext, ins, seb, seh, wsbh). */
const WRITES_RT = new Set([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x1f, 0x38]);
const CALL_CLOBBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 31];
const WINDOW = 400;

interface Use {
  at: number;
  kind: "mem" | "addiu" | "other";
  address: number | null;
  /** Whether the instruction adds its own immediate to the lui's value (so it's repointed). */
  raw: boolean;
}

/**
 * Follows `lui`'s register forward until it's overwritten: the memory
 * accesses and `addiu`s that add an immediate to it, and anything else that
 * reads it. (A port of the weapon-table probe's tracer.)
 */
function usesOf(words: Uint32Array, i: number, vaddr: number): Use[] {
  const x = words[i]!;
  const rt0 = (x >>> 16) & 31;
  const hi = ((x & 0xffff) << 16) >>> 0;
  const val = new Map<number, { v: number; raw: boolean }>([[rt0, { v: hi, raw: true }]]);
  const out: Use[] = [];
  // Only a use of the bare lui value needs repointing; one of an address made from it doesn't.
  const rawOf = (...regs: number[]) => regs.some((r) => val.get(r)?.raw === true);
  // The furthest word a branch from the traced code reaches: code past a
  // return or jump is only followed while a branch can still get there.
  let reach = i;
  let endAt = -1;
  for (let j = i + 1; j < Math.min(words.length, i + WINDOW); j++) {
    const y = words[j]!;
    const op = y >>> 26;
    const rs = (y >>> 21) & 31;
    const rt = (y >>> 16) & 31;
    const imm = signed16(y & 0xffff);
    if (op === 0x01 || (op >= 0x04 && op <= 0x07) || (op >= 0x14 && op <= 0x17)) {
      reach = Math.max(reach, j + 1 + imm);
    } else if (op === 0x02 || (op === 0 && (y & 0x3f) === 0x08)) {
      // j or jr: the delay slot runs, then the walk ends unless a branch reaches past it.
      if (op === 0x02) {
        const target = (((vaddr + j * 4) & 0xf0000000) | ((y & 0x3ffffff) << 2)) >>> 0;
        reach = Math.max(reach, (target - vaddr) / 4);
      }
      if (j + 1 >= reach) endAt = j + 1;
    }
    const set = new Map<number, { v: number; raw: boolean }>();
    const kill = new Set<number>();
    const load = LOADS.has(op) || OTHER_LOADS.has(op);
    if ((load || STORES.has(op) || op === ADDIU || op === ORI) && val.has(rs)) {
      const { v, raw } = val.get(rs)!;
      if (op === ORI) {
        out.push({ at: j, kind: "other", address: null, raw });
        kill.add(rt);
      } else {
        const a = (v + imm) >>> 0;
        out.push({ at: j, kind: op === ADDIU ? "addiu" : "mem", address: a, raw });
        if (op === ADDIU) set.set(rt, { v: a, raw: false });
        else if (LOADS.has(op)) kill.add(rt);
      }
    } else if (
      op === 0 &&
      ((y & 0x3f) === 0x20 || (y & 0x3f) === 0x21) &&
      val.has(rs) !== val.has(rt)
    ) {
      // addu with one traced operand: the result carries its value (an index added in).
      set.set((y >>> 11) & 31, val.get(rs) ?? val.get(rt)!);
    } else {
      if (op === 0) {
        const f = y & 0x3f;
        if ((val.has(rs) || val.has(rt)) && f !== 0x08 && f !== 0x09) {
          out.push({ at: j, kind: "other", address: null, raw: rawOf(rs, rt) });
        }
        kill.add((y >>> 11) & 31);
      } else if (op === 0x1c) {
        kill.add((y >>> 11) & 31); // SPECIAL2 (clz, clo, mul): rd
      } else if (WRITES_RT.has(op) || LOADS.has(op)) {
        kill.add(rt);
      } else if ((op === 0x11 || op === 0x12) && (rs === 0 || rs === 2 || rs === 3)) {
        kill.add(rt); // mfc1, cfc1, mfv, mfvc: a coprocessor register into GPR rt
      }
      if (op === 3 || (op === 0 && (y & 0x3f) === 9)) CALL_CLOBBERS.forEach((r) => kill.add(r));
      if (
        (op === 0x04 || op === 0x05 || op === 0x14 || op === 0x15) &&
        (val.has(rs) || val.has(rt))
      ) {
        out.push({ at: j, kind: "other", address: null, raw: rawOf(rs, rt) });
      }
    }
    for (const r of kill) val.delete(r);
    for (const [r, v] of set) val.set(r, v);
    if (!val.size || j === endAt) break;
  }
  return out;
}

/** Repoints every lui whose immediate uses address an old table; returns how many. */
export function repoint(
  buf: Buffer,
  offset: number,
  vaddr: number,
  size: number,
  old: OldTable[],
  address: Record<TableName, number>,
  problems: string[],
): number {
  const n = Math.floor(size / 4);
  const words = new Uint32Array(n);
  for (let k = 0; k < n; k++) words[k] = buf.readUInt32LE(offset + k * 4);
  const inTable = (a: number) => old.find((t) => a >= t.vaddr && a < t.vaddr + t.bytes);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = words[i]!;
    if (x >>> 26 !== 0x0f) continue;
    const uses = usesOf(words, i, vaddr);
    const hits = uses.filter((u) => u.raw && u.address !== null && inTable(u.address));
    if (!hits.length) continue;
    const where = `${(vaddr + i * 4).toString(16)}`;
    const others = uses.filter((u) => u.raw && (u.address === null || !inTable(u.address)));
    const moved = hits.map((u) => {
      const t = inTable(u.address!)!;
      return { at: u.at, to: address[t.name] + (u.address! - t.vaddr), table: t.name };
    });
    const his = new Set(moved.map((m) => ((m.to + 0x8000) >>> 16) & 0xffff));
    const tables = new Set(moved.map((m) => m.table));
    if (others.length || his.size > 1 || tables.size > 1) {
      problems.push(`lui at ${where} (${[...tables].join(", ")})`);
      continue;
    }
    const hi = [...his][0]!;
    words[i] = ((x & 0xffff0000) | hi) >>> 0;
    for (const m of moved) words[m.at] = ((words[m.at]! & 0xffff0000) | (m.to & 0xffff)) >>> 0;
    count++;
  }
  for (let k = 0; k < n; k++) buf.writeUInt32LE(words[k]!, offset + k * 4);
  return count;
}
