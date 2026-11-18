/**
 * Monster behaviour (`monsterAi.branches`): every weighted random choice in
 * the monsters' AI scripts gets new weights, so a monster may favour a move
 * it rarely used, or turn and walk more than before. Moves themselves, and
 * what makes a monster choose, don't change.
 *
 * The AI is bytecode that `game_task.ovl` interprets (`docs/monster-ai.md`):
 *
 * - A monster's `emChunk` (`+0x158`) holds 28 pointers; 3 to 19 are its AI
 *   script roots, one picked per map. The scripts are in `game_task.ovl` or
 *   in the monster family's `emNN.ovl`. Those overlays all load at one
 *   address, so a root is matched to the monster's own overlay (Basarios and
 *   Black Gravios: em17, mhfu-extract `familyOverlayId`), or the one
 *   overlay where every root it has reads as one; monsters that match more
 *   than one, or none, are left alone.
 * - A root is 20 table pointers to script entry points: `+0` by the
 *   monster's state, `+4` for op `81 n`, `+0x3C + 4a` for op `82 a n`.
 * - Op `80 00 N` is a weighted choice: N entries `80 k w <body>`, then
 *   `80 FF`. The game rolls `0`…`31` and walks the weights, which add up
 *   to 32.
 *
 * Each weight is multiplied by a random factor within the spread, then the
 * choice is scaled back to 32. An entry the game could pick stays possible
 * (at least 1), and an entry it never picks (weight 0) stays that way.
 *
 * The scripts are read by pattern, not with the game's instruction lengths:
 * a choice is only changed if its entries come in order, its weights add up
 * to 32, it ends with `80 FF` and no entry holds another choice. Species that
 * share scripts (the dromes, Rathian and Rathalos...) change together.
 */
import { OVL_HEADER_SIZE, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { familyOverlayId } from "mhfu-extract/src/monsters/families.js";
import {
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
  locateMonsterChunks,
} from "mhfu-extract/src/monsters/hitzones.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { MonsterNames } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

/** `emChunk` offset of the 28 behaviour pointers. */
export const AI_POINTER_OFFSET = 0x158;
/** Pointers 3 to 19 are the AI script roots. */
export const AI_ROOT_FIRST = 3;
export const AI_ROOT_LAST = 19;
/** A root's table pointers. */
export const ROOT_TABLES = 20;
/** The roll is `0`…`31`. */
export const CHOICE_TOTAL = 32;

/** How far a choice's entry is searched for after the one before it. */
const MAX_ENTRY = 0x140;

export interface Choice {
  /** File offset of the `80 00 N`. */
  offset: number;
  /** File offsets of the weight bytes, in order. */
  weightAt: number[];
  weights: number[];
}

const owns = (ovl: OvlFile, v: number) => ovl.isOwnVaddr(v);

/** The entry points a root's tables list, or null if it doesn't read as a root. */
function readRoot(ovl: OvlFile, rootVaddr: number): { root: number; starts: number[] } | null {
  if (!owns(ovl, rootVaddr)) return null;
  const buf = ovl.reader.buf;
  const root = ovl.vaddrToOffset(rootVaddr);
  // Up to 20 tables: a root that calls no high `82 a` stops early, and other data follows.
  const tables: number[] = [];
  for (let i = 0; i < ROOT_TABLES && root + i * 4 + 4 <= buf.length; i++) {
    const t = buf.readUInt32LE(root + i * 4);
    if (t !== 0 && !owns(ovl, t)) break;
    tables.push(t);
  }
  if (!tables[0]) return null;
  const tableAt = [...new Set(tables.filter((t) => t).map((t) => ovl.vaddrToOffset(t)))].sort(
    (a, b) => a - b,
  );
  const starts = new Set<number>();
  for (const at of tableAt) {
    if (at >= root) continue;
    const end = Math.min(...tableAt.filter((x) => x > at), root);
    for (let k = 0; at + k * 4 + 4 <= end; k++) {
      const v = buf.readUInt32LE(at + k * 4);
      if (!owns(ovl, v)) continue;
      const off = ovl.vaddrToOffset(v);
      if (off < root) starts.add(off);
    }
  }
  if (!starts.size) return null;
  return { root, starts: [...starts] };
}

/** The checked choice at `at`, or null. */
function readChoice(buf: Buffer, at: number, limit: number): (Choice & { end: number }) | null {
  const n = buf[at + 2]!;
  if (buf[at] !== 0x80 || buf[at + 1] !== 0 || n < 2 || n > 16) return null;
  const weightAt: number[] = [];
  let from = at + 3;
  for (let k = 1; k <= n; k++) {
    const e = buf.indexOf(Buffer.from([0x80, k]), from);
    if (e < 0 || e - from > MAX_ENTRY || e + 3 > limit) return null;
    weightAt.push(e + 2);
    from = e + 3;
  }
  const end = buf.indexOf(Buffer.from([0x80, 0xff]), from);
  if (end < 0 || end - from > MAX_ENTRY || end > limit) return null;
  const weights = weightAt.map((w) => buf[w]!);
  if (weights.reduce((s, w) => s + w, 0) !== CHOICE_TOTAL) return null;
  // A nested choice would hide its own entries among ours.
  for (let i = at + 3; i + 1 < end; i++) {
    if (buf[i] === 0x80 && buf[i + 1] === 0) return null;
  }
  return { offset: at, weightAt, weights, end };
}

/** Every checked weighted choice in the scripts of `roots` (vaddrs in `ovl`). */
export function findChoices(ovl: OvlFile, roots: readonly number[]): Choice[] {
  const buf = ovl.reader.buf;
  const found = new Map<number, Choice>();
  for (const vaddr of roots) {
    const r = readRoot(ovl, vaddr);
    if (!r) continue;
    for (let at = Math.min(...r.starts); at + 3 <= r.root; at++) {
      if (found.has(at)) continue;
      const c = readChoice(buf, at, r.root);
      if (!c) continue;
      const { end, ...choice } = c;
      found.set(at, choice);
      at = end + 1;
    }
  }
  return [...found.values()].sort((a, b) => a.offset - b.offset);
}

/** Splits `total` over `weights` in proportion, by largest remainder. */
export function splitWeights(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map((w) => (w * total) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, w) => s + w, 0);
  const order = raw
    .map((r, i) => [r - out[i]!, i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}

/** New weights for a choice: each times `factor()`, back to 32; possible entries keep at least 1. */
export function rerollWeights(weights: readonly number[], factor: () => number): number[] {
  const out = splitWeights(
    weights.map((w) => (w > 0 ? w * factor() : 0)),
    CHOICE_TOTAL,
  );
  weights.forEach((w, i) => {
    if (w > 0 && out[i] === 0) {
      const most = out.indexOf(Math.max(...out));
      out[most]!--;
      out[i] = 1;
    }
  });
  return out;
}

export interface ScriptFile {
  file: LoadedOverlay;
  name: string;
  /** Root vaddrs in it. */
  roots: number[];
  /** Species whose scripts are in it. */
  emIds: number[];
}

/**
 * The `emNN.ovl` (emID and file) that holds a monster's roots outside
 * `game_task.ovl`: its own or its family's if `reads`, else the only one that
 * does. Null when none or several do.
 */
export function scriptOverlay(
  emId: number,
  emOverlays: ReadonlyMap<number, LoadedOverlay>,
  reads: (file: LoadedOverlay) => boolean,
): readonly [number, LoadedOverlay] | null {
  const ownId = familyOverlayId(emId);
  const own = emOverlays.get(ownId);
  if (own && reads(own)) return [ownId, own];
  const holders = [...emOverlays].filter(([, f]) => reads(f));
  return holders.length === 1 ? holders[0]! : null;
}

/**
 * Each monster's AI roots, by the overlay that holds them, and the monsters
 * whose overlay couldn't be told.
 */
export function locateScripts(
  gameTask: LoadedOverlay,
  emOverlays: ReadonlyMap<number, LoadedOverlay>,
): { files: ScriptFile[]; unknown: number[] } {
  const ovl = gameTask.ovl;
  const table = locateMonsterChunks(ovl);
  if (!table) throw new Error("game_task.ovl: the monster table wasn't found");
  const files = new Map<LoadedOverlay, ScriptFile>();
  const add = (file: LoadedOverlay, name: string, emId: number, root: number) => {
    let f = files.get(file);
    if (!f) files.set(file, (f = { file, name, roots: [], emIds: [] }));
    if (!f.roots.includes(root)) f.roots.push(root);
    if (!f.emIds.includes(emId)) f.emIds.push(emId);
  };
  const unknown: number[] = [];
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const chunk = table.offset + emId * MONSTER_CHUNK_SIZE;
    const roots = new Set<number>();
    for (let i = AI_ROOT_FIRST; i <= AI_ROOT_LAST; i++) {
      const v = ovl.reader.u32(chunk + AI_POINTER_OFFSET + i * 4);
      if (v) roots.add(v);
    }
    const elsewhere: number[] = [];
    for (const root of roots) {
      if (ovl.vaddrToOffset(root) >= OVL_HEADER_SIZE && readRoot(ovl, root)) {
        add(gameTask, "game_task.ovl", emId, root);
      } else elsewhere.push(root);
    }
    if (!elsewhere.length) continue;
    const reads = (file: LoadedOverlay) => elsewhere.every((r) => readRoot(file.ovl, r));
    const holder = scriptOverlay(emId, emOverlays, reads);
    if (!holder) {
      unknown.push(emId);
      continue;
    }
    const [id, file] = holder;
    for (const root of elsewhere) add(file, `em${String(id).padStart(2, "0")}.ovl`, emId, root);
  }
  const ordered = [...files.values()].sort((a, b) => a.file.index - b.file.index);
  return { files: ordered, unknown };
}

export function randomizeMonsterAi(
  spread: number,
  rng: Rng,
  edits: Edits,
  gameTask: LoadedOverlay,
  emOverlays: ReadonlyMap<number, LoadedOverlay>,
  monsterName: MonsterNames,
): ShuffleReport {
  const factor = () => 1 - spread + 2 * spread * rng.float();
  const { files, unknown } = locateScripts(gameTask, emOverlays);
  const lines: ShuffleReport["lines"] = [];
  let total = 0;
  for (const { file, name, roots, emIds } of files) {
    const choices = findChoices(file.ovl, roots);
    if (!choices.length) continue;
    const buf = edits.overlay(file);
    for (const c of choices) {
      const next = rerollWeights(c.weights, factor);
      c.weightAt.forEach((at, k) => buf.writeUInt8(next[k]!, at));
    }
    total += choices.length;
    lines.push({
      where: name,
      text: `${choices.length} choices, for ${emIds.map(monsterName).join(", ")}`,
    });
  }
  const notes = [
    "Each weighted choice in the AI scripts has new weights; species that share scripts change together.",
  ];
  if (unknown.length) {
    notes.push(
      `Left alone, their scripts' overlay unknown: ${unknown.map(monsterName).join(", ")}.`,
    );
  }
  return {
    title: "Monster behaviour",
    notes,
    lines,
    summary: `Monster behaviour: ${total} choices`,
  };
}
