/**
 * `extract --raw`: a numbers-only dump of the monster overlay tables
 * (vallode/mhfu-blacksmith#35), for checking the layouts in
 * `src/monsters/` against a real disc without shipping disc files.
 *
 * Holds each overlay's header, where the tables were found (and the shift
 * from JP), the decoded chunks, carve and cap/break tables, and raw words
 * and short byte windows around every pointer followed, so a wrong layout
 * guess can be corrected from the dump. `anchors` locates the three
 * byte-verified fixtures from `test/ovl.test.ts` and every u32 pointing at
 * them.
 */
import type { OvlFile } from "../container/ovl.js";
import { probeMonsters, type MonstersProbe } from "./monsters-probe.js";
import {
  GAME_TASK_JP,
  HITZONE_POINTER_COUNT,
  HITZONE_POINTERS_OFFSET,
  locateMonsterChunks,
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
  readMonsterChunks,
  type MonsterChunk,
} from "../monsters/hitzones.js";
import {
  emFileName,
  emFilesContaining,
  monsterAddressSpace,
  type MonsterOverlays,
} from "../monsters/overlays.js";
import {
  CAP_BREAK_POINTER_COUNT,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  CARVE_POINTER_COUNT,
  GAME_SUB_JP,
  locateCapBreakTables,
  locateCarveTables,
  readCapBreakTables,
  readCarveTables,
  type CapBreakTable,
  type CarveTables,
  type TablePairLocation,
} from "../monsters/rewards.js";

/** Byte strings confirmed on the JP disc (test/ovl.test.ts); gameplay values, so region-independent. */
export const MONSTER_ANCHORS = {
  /** Felyne's hitzone row from `cut` on (the row's part byte precedes it). */
  felyneHitzone: "787878646464640a64",
  mosswineHitzone: "969678646464640a00",
  /** Giaprey low-rank body carves: 52% 340, 30% 342, 18% 281, 0xffff. */
  giapreyCarve: "340054011e00560112001901ffff",
} as const;

interface OverlayHeader {
  file: string;
  loadBase: number;
  loadEnd: number;
  length: number;
}

interface AnchorHit {
  file: string;
  offset: number;
  vaddr: number;
  /** u32 words equal to `vaddr` or `vaddr - 1`, in any overlay. */
  references: { file: string; offset: number; value: number }[];
}

interface ChunkDump {
  emId: number;
  /** The chunk's 116 u32 words. */
  words: number[];
  decoded: MonsterChunk;
  pointers: {
    pointer: number;
    /** `emXX` numbers whose image maps the pointer. */
    emFiles: number[];
    inGameTask: boolean;
    /** 64 bytes at the pointer, in game_task or each em file mapping it. */
    windows: { file: string; hex: string }[];
    /** 200 bytes at the u32 read there, per file. */
    rowWindows: { file: string; rowsPointer: number; hex: string }[];
  }[];
}

export interface MonstersRawDump {
  overlays: OverlayHeader[];
  anchors: Record<string, AnchorHit[]>;
  chunks: {
    location: { offset: number; shift: number } | null;
    /** The location used: found, or the JP offset as a fallback. */
    offset: number;
    entries: ChunkDump[];
  };
  carves: {
    location: TablePairLocation | null;
    pointers: number;
    index: number;
    indexWords: number[];
    pointerWords: number[];
    tables: CarveTables[];
  };
  capBreak: {
    location: TablePairLocation | null;
    pointers: number;
    index: number;
    pointerWords: number[];
    tables: CapBreakTable[];
  };
}

const header = (file: string, ovl: OvlFile): OverlayHeader => ({
  file,
  loadBase: ovl.loadBase,
  loadEnd: ovl.loadEnd,
  length: ovl.reader.length,
});

const vaddrOf = (ovl: OvlFile, offset: number) => ovl.loadBase - 0x80 + offset;

function hexAt(ovl: OvlFile, vaddr: number, length: number): string | null {
  if (!ovl.isOwnVaddr(vaddr)) return null;
  const offset = ovl.vaddrToOffset(vaddr);
  return ovl.reader.buf
    .subarray(offset, Math.min(offset + length, ovl.reader.length))
    .toString("hex");
}

function words(ovl: OvlFile, offset: number, count: number, size: 2 | 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + i * size;
    if (at < 0 || at + size > ovl.reader.length) break;
    out.push(size === 4 ? ovl.reader.u32(at) : ovl.reader.u16(at));
  }
  return out;
}

function allFiles(overlays: MonsterOverlays): [string, OvlFile][] {
  return [
    ["game_task.ovl", overlays.gameTask],
    ["game_sub.ovl", overlays.gameSub],
    ...[...overlays.em].map(([n, ovl]): [string, OvlFile] => [emFileName(n), ovl]),
  ];
}

function findAll(buf: Buffer, needle: Buffer): number[] {
  const hits: number[] = [];
  for (
    let at = buf.indexOf(needle);
    at !== -1 && hits.length < 16;
    at = buf.indexOf(needle, at + 1)
  ) {
    hits.push(at);
  }
  return hits;
}

function findU32(buf: Buffer, values: number[]): { offset: number; value: number }[] {
  const hits: { offset: number; value: number }[] = [];
  for (let at = 0; at + 4 <= buf.length; at += 4) {
    const v = buf.readUInt32LE(at);
    if (values.includes(v)) hits.push({ offset: at, value: v });
  }
  return hits;
}

function dumpAnchors(overlays: MonsterOverlays): Record<string, AnchorHit[]> {
  const files = allFiles(overlays);
  const result: Record<string, AnchorHit[]> = {};
  for (const [name, hex] of Object.entries(MONSTER_ANCHORS)) {
    const needle = Buffer.from(hex, "hex");
    const hits: AnchorHit[] = [];
    for (const [file, ovl] of files) {
      for (const offset of findAll(ovl.reader.buf, needle)) {
        const vaddr = vaddrOf(ovl, offset);
        const references = files.flatMap(([refFile, refOvl]) =>
          findU32(refOvl.reader.buf, [vaddr, vaddr - 1]).map((r) => ({ file: refFile, ...r })),
        );
        hits.push({ file, offset, vaddr, references });
      }
    }
    result[name] = hits;
  }
  return result;
}

function dumpChunks(overlays: MonsterOverlays): MonstersRawDump["chunks"] {
  const task = overlays.gameTask;
  const location = locateMonsterChunks(task);
  const offset = location?.offset ?? GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase + 0x80;
  const decoded = readMonsterChunks(task, offset, monsterAddressSpace(overlays));
  const entries: ChunkDump[] = [];
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const base = offset + emId * MONSTER_CHUNK_SIZE;
    const pointers: ChunkDump["pointers"] = [];
    for (let p = 0; p < HITZONE_POINTER_COUNT; p++) {
      if (base + HITZONE_POINTERS_OFFSET + p * 4 + 4 > task.reader.length) break;
      const pointer = task.reader.u32(base + HITZONE_POINTERS_OFFSET + p * 4);
      const emFiles = emFilesContaining(overlays, pointer);
      const holders: [string, OvlFile][] = [
        ...(task.isOwnVaddr(pointer) ? [["game_task.ovl", task] as [string, OvlFile]] : []),
        ...emFiles.map((n): [string, OvlFile] => [emFileName(n), overlays.em.get(n)!]),
      ];
      const windows: { file: string; hex: string }[] = [];
      const rowWindows: { file: string; rowsPointer: number; hex: string }[] = [];
      for (const [file, ovl] of holders) {
        windows.push({ file, hex: hexAt(ovl, pointer, 64) ?? "" });
        const rowsPointer = ovl.reader.u32(ovl.vaddrToOffset(pointer));
        for (const [rowFile, rowOvl] of [
          ...holders,
          ["game_task.ovl", task] as [string, OvlFile],
        ]) {
          const hex = hexAt(rowOvl, rowsPointer, 200);
          if (hex && !rowWindows.some((w) => w.file === rowFile && w.rowsPointer === rowsPointer)) {
            rowWindows.push({ file: rowFile, rowsPointer, hex });
          }
        }
      }
      pointers.push({
        pointer,
        emFiles,
        inGameTask: task.isOwnVaddr(pointer),
        windows,
        rowWindows,
      });
    }
    entries.push({
      emId,
      words: words(task, base, MONSTER_CHUNK_SIZE / 4, 4),
      decoded: decoded[emId]!,
      pointers,
    });
  }
  return { location, offset, entries };
}

const jpSubOffset = (vaddr: number) => vaddr - GAME_SUB_JP.loadBase + 0x80;

function dumpCarves(ovl: OvlFile): MonstersRawDump["carves"] {
  const location = locateCarveTables(ovl);
  const pointers = location?.pointers ?? jpSubOffset(GAME_SUB_JP.carvePointers);
  const index = location?.index ?? jpSubOffset(GAME_SUB_JP.carveIndex);
  return {
    location,
    pointers,
    index,
    indexWords: words(ovl, index, (CARVE_INDEX_COUNT * CARVE_INDEX_SIZE) / 2, 2),
    pointerWords: words(ovl, pointers, CARVE_POINTER_COUNT, 4),
    tables: readCarveTables(ovl, pointers, index),
  };
}

function dumpCapBreak(ovl: OvlFile, hint?: number): MonstersRawDump["capBreak"] {
  const location = locateCapBreakTables(ovl, { hint });
  const pointers = location?.pointers ?? jpSubOffset(GAME_SUB_JP.capBreakPointers);
  const index = location?.index ?? jpSubOffset(GAME_SUB_JP.capBreakIndex);
  return {
    location,
    pointers,
    index,
    pointerWords: words(ovl, pointers, CAP_BREAK_POINTER_COUNT, 4),
    tables: readCapBreakTables(ovl, pointers, index),
  };
}

type Section<T> = T | { error: string };

/** Runs one section, recording an exception instead of losing the rest of the dump. */
function section<T>(run: () => T): Section<T> {
  try {
    return run();
  } catch (error) {
    return { error: error instanceof Error ? (error.stack ?? error.message) : String(error) };
  }
}

export interface MonstersRawDumpSections {
  overlays: OverlayHeader[];
  anchors: Section<MonstersRawDump["anchors"]>;
  chunks: Section<MonstersRawDump["chunks"]>;
  carves: Section<MonstersRawDump["carves"]>;
  capBreak: Section<MonstersRawDump["capBreak"]>;
  probe: Section<MonstersProbe>;
}

export function dumpMonstersRaw(
  overlays: MonsterOverlays,
  dataDir: string,
): MonstersRawDumpSections {
  const carves = section(() => dumpCarves(overlays.gameSub));
  const hint = "location" in carves ? carves.location?.shift : undefined;
  const chunks = section(() => dumpChunks(overlays));
  return {
    overlays: allFiles(overlays).map(([file, ovl]) => header(file, ovl)),
    anchors: section(() => dumpAnchors(overlays)),
    chunks,
    carves,
    capBreak: section(() => dumpCapBreak(overlays.gameSub, hint)),
    probe: section(() =>
      probeMonsters(
        overlays,
        dataDir,
        "offset" in chunks
          ? chunks.offset
          : GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase + 0x80,
      ),
    ),
  };
}
