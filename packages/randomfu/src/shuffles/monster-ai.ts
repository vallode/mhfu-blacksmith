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
 * - A root is table pointers to script entry points: `+0` by the
 *   monster's state, `+4` for op `81 n`, `+0x3C + 4a` for op `82 a n`. Most
 *   have 20; ones that use `82 a n` above `a` 4 have more (up to 25), but
 *   the scripts behind those sit among the others' (all 498 on the EU disc),
 *   so the first 20 find every choice.
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
 *
 * Monster aggression (`monsterAi.aggression`, `makeMonstersAggressive`) leans
 * the choices that mix attacks with other moves towards the attacks, and
 * Monster reach (`monsterAi.reach`, `keepMonstersInReach`) leans the ones
 * that mix taking off or digging in with other moves away from them.
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
import { fnv1a } from "../hash.js";
import type { Rng } from "../rng.js";
import type { Settings } from "../settings.js";
import { MONSTER_ATTACKS, type AttackData } from "./monster-attacks.js";
import { MONSTER_REACH } from "./monster-reach.js";
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

/**
 * `scaled` (each of `weights` times something) back to 32: an entry the game
 * could pick stays possible (at least 1), one it never picks stays at 0.
 */
function backTo32(weights: readonly number[], scaled: readonly number[]): number[] {
  const out = splitWeights(scaled, CHOICE_TOTAL);
  weights.forEach((w, i) => {
    if (w > 0 && out[i] === 0) {
      const most = out.indexOf(Math.max(...out));
      out[most]!--;
      out[i] = 1;
    }
  });
  return out;
}

/** New weights for a choice: each times `factor()`, back to 32; possible entries keep at least 1. */
export function rerollWeights(weights: readonly number[], factor: () => number): number[] {
  return backTo32(
    weights,
    weights.map((w) => (w > 0 ? w * factor() : 0)),
  );
}

/** Attack entries (`A` in `kinds`) times `factor`, back to 32; possible entries keep at least 1. */
export function favourAttacks(weights: readonly number[], kinds: string, factor: number): number[] {
  return backTo32(
    weights,
    weights.map((w, i) => (kinds[i] === "A" ? w * factor : w)),
  );
}

/**
 * Entries that take a monster out of reach (`L` in `kinds`) divided by
 * `factor`, ones that bring it back (`B`) times it, back to 32; possible
 * entries keep at least 1.
 */
export function keepInReach(weights: readonly number[], kinds: string, factor: number): number[] {
  return backTo32(
    weights,
    weights.map((w, i) => (kinds[i] === "L" ? w / factor : kinds[i] === "B" ? w * factor : w)),
  );
}

export interface ScriptFile {
  file: LoadedOverlay;
  name: string;
  /** Root vaddrs in it. */
  roots: number[];
  /** Species whose scripts are in it. */
  emIds: number[];
  /** Each of those species' roots in it. */
  rootsBy: Map<number, number[]>;
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
    if (!f) files.set(file, (f = { file, name, roots: [], emIds: [], rootsBy: new Map() }));
    if (!f.roots.includes(root)) f.roots.push(root);
    if (!f.emIds.includes(emId)) f.emIds.push(emId);
    const own = f.rootsBy.get(emId) ?? [];
    if (!own.includes(root)) f.rootsBy.set(emId, [...own, root]);
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

export interface ScriptChoices extends ScriptFile {
  /** Its checked choices, with their vanilla weights. */
  choices: Choice[];
}

/** `locateScripts`, with each file's choices read: what both AI options work on. */
export function readScripts(
  gameTask: LoadedOverlay,
  emOverlays: ReadonlyMap<number, LoadedOverlay>,
): { files: ScriptChoices[]; unknown: number[] } {
  const { files, unknown } = locateScripts(gameTask, emOverlays);
  return {
    files: files.map((f) => ({ ...f, choices: findChoices(f.file.ovl, f.roots) })),
    unknown,
  };
}

export function randomizeMonsterAi(
  spread: number,
  rng: Rng,
  edits: Edits,
  scripts: ReturnType<typeof readScripts>,
  monsterName: MonsterNames,
): ShuffleReport {
  const factor = () => 1 - spread + 2 * spread * rng.float();
  const { files, unknown } = scripts;
  const lines: ShuffleReport["lines"] = [];
  let total = 0;
  for (const { file, name, choices, emIds } of files) {
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

/** How much likelier an attack entry gets than before, against the others. */
export const AGGRESSION_FACTOR: Readonly<
  Record<Exclude<Settings["monsterAi.aggression"], "off">, number>
> = { more: 2, relentless: 4 };

/**
 * FNV-1a over each choice, in order: its distance from the one before, its
 * entry count, and each entry's weight and place in it (`monster-attacks.ts`).
 * Places as well as weights, so choices with the same weights in another
 * order don't match.
 */
export function weightHash(choices: readonly Choice[]): string {
  const bytes: number[] = [];
  let last = choices[0]?.offset ?? 0;
  for (const c of choices) {
    const gap = c.offset - last;
    last = c.offset;
    bytes.push(gap, gap >> 8, gap >> 16, c.weights.length);
    c.weights.forEach((w, k) => {
      const place = c.weightAt[k]! - c.offset;
      bytes.push(w, place, place >> 8);
    });
  }
  return fnv1a(bytes).toString(16).padStart(8, "0");
}

/** A file's mixed choices from `AttackData.mixed`: choice index to entry kinds. */
export function parseMixed(mixed: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const part of mixed.split(" ")) {
    const [index, kinds] = part.split(":");
    if (index && kinds) out.set(Number(index), kinds);
  }
  return out;
}

/** Whether a file's choices, by their vanilla weights, are the ones `known` was made from. */
export function matchesAttackData(choices: readonly Choice[], known: AttackData): boolean {
  return choices.length === known.choices && weightHash(choices) === known.hash;
}

/**
 * Reweights `known`'s mixed choices in `buf` (the file's edited copy, whose
 * current weights are kept as the base) with `reweight(weights, kinds)`.
 * `choices` must match `known` (`matchesAttackData`). Returns the changed
 * choices' offsets.
 */
function reweightKnown(
  choices: readonly Choice[],
  buf: Buffer,
  known: AttackData,
  reweight: (weights: readonly number[], kinds: string) => number[],
  what: string,
): Set<number> {
  const changed = new Set<number>();
  for (const [index, kinds] of parseMixed(known.mixed)) {
    const c = choices[index];
    if (c?.weights.length !== kinds.length) {
      throw new Error(`${what}: choice ${index} doesn't match its data`);
    }
    const next = reweight(
      c.weightAt.map((at) => buf[at]!),
      kinds,
    );
    c.weightAt.forEach((at, k) => buf.writeUInt8(next[k]!, at));
    changed.add(c.offset);
  }
  return changed;
}

/** Leans `known`'s mixed choices towards their attacks in `buf` (`reweightKnown`). */
export function leanTowardsAttacks(
  choices: readonly Choice[],
  buf: Buffer,
  known: AttackData,
  factor: number,
): Set<number> {
  return reweightKnown(
    choices,
    buf,
    known,
    (w, kinds) => favourAttacks(w, kinds, factor),
    "Monster aggression",
  );
}

/** Leans `known`'s mixed choices away from leaving reach in `buf` (`reweightKnown`). */
export function leanTowardsReach(
  choices: readonly Choice[],
  buf: Buffer,
  known: AttackData,
  factor: number,
): Set<number> {
  return reweightKnown(
    choices,
    buf,
    known,
    (w, kinds) => keepInReach(w, kinds, factor),
    "Monster reach",
  );
}

/**
 * Applies `lean` to every file `data` has whose choices match it. The report
 * lines name the species whose own scripts hold a changed choice; `unmatched`
 * lists files that don't match, or that this disc's scan didn't place.
 */
function leanFiles(
  files: readonly ScriptChoices[],
  edits: Edits,
  data: Readonly<Record<string, AttackData>>,
  lean: (choices: readonly Choice[], buf: Buffer, known: AttackData) => Set<number>,
  monsterName: MonsterNames,
) {
  const lines: ShuffleReport["lines"] = [];
  const unmatched: string[] = [];
  let total = 0;
  for (const { file, name, choices, emIds, rootsBy } of files) {
    const known = data[name];
    if (!known) continue;
    if (!matchesAttackData(choices, known)) {
      unmatched.push(name);
      continue;
    }
    const changed = lean(choices, edits.overlay(file), known);
    total += changed.size;
    const species = emIds.filter((emId) =>
      findChoices(file.ovl, rootsBy.get(emId) ?? []).some((c) => changed.has(c.offset)),
    );
    lines.push({
      where: name,
      text: `${changed.size} choices, for ${species.map(monsterName).join(", ")}`,
    });
  }
  const seen = new Set(files.map((f) => f.name));
  unmatched.push(...Object.keys(data).filter((name) => !seen.has(name)));
  return { lines, unmatched, total };
}

/**
 * Monster aggression (`monsterAi.aggression`): in every choice that mixes
 * attacks with other moves (`monster-attacks.ts`), the attack entries' weights
 * are multiplied by the level's factor and the choice scaled back to 32. It
 * works on the weights as they are, so after `randomizeMonsterAi` it leans the
 * new odds. A file is changed only if its choices and their vanilla weights
 * are the ones the data was made from.
 */
export function makeMonstersAggressive(
  level: keyof typeof AGGRESSION_FACTOR,
  edits: Edits,
  scripts: ReturnType<typeof readScripts>,
  monsterName: MonsterNames,
  data: Readonly<Record<string, AttackData>> = MONSTER_ATTACKS,
): ShuffleReport {
  const factor = AGGRESSION_FACTOR[level];
  const { lines, unmatched, total } = leanFiles(
    scripts.files,
    edits,
    data,
    (choices, buf, known) => leanTowardsAttacks(choices, buf, known, factor),
    monsterName,
  );
  const notes = [
    `In each choice between attacks and other moves, attacks are ${factor} times as likely as before against the rest; every move stays possible.`,
  ];
  const list = unmatched.join(", ");
  if (unmatched.length) {
    notes.push(
      `Left alone, their scripts aren't the ones the attack data was made from (EU and FUC discs): ${list}.`,
    );
  }
  return {
    title: "Monster aggression",
    notes,
    lines,
    // The summary is the run log's line, so a disc it can't change says so there too.
    summary: `Monster aggression: ${total} choices${unmatched.length ? `; warning: left alone, not the scripts the attack data was made from: ${list}` : ""}`,
  };
}

type ReachLevel = Exclude<Settings["monsterAi.reach"], "off">;

/** How many times less likely taking off or digging in gets against the other moves. */
export const REACH_FACTOR: Readonly<Record<ReachLevel, number>> = { less: 3, rarely: 8 };
/** How many times longer a large monster keeps after a hunter it can't see. */
export const REACH_ENGAGED_FACTOR: Readonly<Record<ReachLevel, number>> = { less: 2, rarely: 4 };
/**
 * `emChunk` offset of the frames (s16) a monster stays after a hunter once
 * it can't see them (`docs/monster-ai.md`, "Out of reach").
 */
export const ENGAGED_FRAMES_OFFSET = 0x146;
/**
 * `emChunk` offset of the pointer to a monster's area times: how long it
 * fights in an area before it leaves (`docs/monster-ai.md`, "Leaving
 * mid-fight").
 */
export const AREA_TIMES_OFFSET = 0x1c0;
/** The most entries an area-time list is read for. */
const AREA_TIMES_MAX = 64;

/**
 * Each of `emIds`' engagement time (`ENGAGED_FRAMES_OFFSET`) times `factor`,
 * in `buf` (`game_task.ovl`'s edited copy, its monster table at `tableAt`),
 * at most 32767. Returns the species changed with their frames before and
 * after; ones without a time (0) are left alone.
 */
export function lengthenEngagement(
  buf: Buffer,
  tableAt: number,
  emIds: Iterable<number>,
  factor: number,
): { emId: number; before: number; after: number }[] {
  const out: { emId: number; before: number; after: number }[] = [];
  for (const emId of [...new Set(emIds)].sort((a, b) => a - b)) {
    if (emId <= 0 || emId >= MONSTER_CHUNK_COUNT) continue;
    const at = tableAt + emId * MONSTER_CHUNK_SIZE + ENGAGED_FRAMES_OFFSET;
    const before = buf.readInt16LE(at);
    if (before <= 0) continue;
    const after = Math.min(0x7fff, Math.round(before * factor));
    buf.writeInt16LE(after, at);
    out.push({ emId, before, after });
  }
  return out;
}

/**
 * The file offsets of an area-time list's frames (s16) at `at` in `buf`, the
 * default last, or null if it doesn't read as one: `{ s16 stage, s16 frames }`
 * pairs (a stage above 1000 is the stage plus 1000), then `{ -1, default }`.
 */
export function readAreaTimes(buf: Buffer, at: number): number[] | null {
  const frames: number[] = [];
  for (let i = 0; i < AREA_TIMES_MAX; i++) {
    const o = at + i * 4;
    if (o < 0 || o + 4 > buf.length) return null;
    const stage = buf.readInt16LE(o);
    if (buf.readInt16LE(o + 2) <= 0) return null;
    frames.push(o + 2);
    if (stage === -1) return frames;
    if (stage < 0 || stage >= 2000) return null;
  }
  return null;
}

/**
 * The most an area time is scaled to: the game adds 0 to 3 minutes (1800
 * frames each, by `+0x322`, EU 0x09AD0B48) to it in the s16 countdown, which
 * must stay positive.
 */
export const AREA_TIMES_CAP = 0x7fff - 3 * 1800;

/** Each of `frames` (offsets of s16s in `buf`) times `factor`, at most `cap`, never lower than it was. */
export function scaleFrames(
  buf: Buffer,
  frames: readonly number[],
  factor: number,
  cap = 0x7fff,
): void {
  for (const o of frames) {
    const before = buf.readInt16LE(o);
    buf.writeInt16LE(Math.max(before, Math.min(cap, Math.round(before * factor))), o);
  }
}

/**
 * Each of `largeIds`' area times (`AREA_TIMES_OFFSET`) times `factor`, in
 * the file that holds them: `game_task.ovl`, or the monster's own or family
 * overlay, else the only one where the list reads (`scriptOverlay`). Lists
 * species share change once. Returns, by list, its species and its default
 * before and after; and the species whose list wasn't found.
 */
export function lengthenAreaTimes(
  edits: Edits,
  gameTask: LoadedOverlay,
  emOverlays: ReadonlyMap<number, LoadedOverlay>,
  tableAt: number,
  largeIds: Iterable<number>,
  factor: number,
): { lists: { emIds: number[]; before: number; after: number }[]; missing: number[] } {
  const reads = (file: LoadedOverlay, vaddr: number) =>
    file.ovl.isOwnVaddr(vaddr)
      ? readAreaTimes(file.ovl.reader.buf, file.ovl.vaddrToOffset(vaddr))
      : null;
  const lists = new Map<string, { emIds: number[]; before: number; after: number }>();
  const missing: number[] = [];
  const chunks = gameTask.ovl.reader.buf;
  for (const emId of [...new Set(largeIds)].sort((a, b) => a - b)) {
    if (emId <= 0 || emId >= MONSTER_CHUNK_COUNT) continue;
    const vaddr = chunks.readUInt32LE(tableAt + emId * MONSTER_CHUNK_SIZE + AREA_TIMES_OFFSET);
    const file = reads(gameTask, vaddr)
      ? gameTask
      : scriptOverlay(emId, emOverlays, (f) => reads(f, vaddr) !== null)?.[1];
    const frames = file && reads(file, vaddr);
    if (!file || !frames) {
      missing.push(emId);
      continue;
    }
    const key = `${file.index}:${vaddr}`;
    const known = lists.get(key);
    if (known) {
      known.emIds.push(emId);
      continue;
    }
    const buf = edits.overlay(file);
    const last = frames[frames.length - 1]!;
    const before = buf.readInt16LE(last);
    scaleFrames(buf, frames, factor, AREA_TIMES_CAP);
    lists.set(key, { emIds: [emId], before, after: buf.readInt16LE(last) });
  }
  return { lists: [...lists.values()], missing };
}

/**
 * Monster reach (`monsterAi.reach`): in every choice that mixes taking off or
 * digging in with other moves (`monster-reach.ts`), those entries' weights
 * are divided by the level's factor, and in the few that mix landing or
 * surfacing with staying away, those are multiplied by it; each choice goes
 * back to 32. It works on the weights as they are, so it runs after
 * `randomizeMonsterAi` and `makeMonstersAggressive`. Every large monster in
 * `largeIds` also keeps after a hunter it lost sight of for longer before it
 * gives up and wanders off to another area, and fights in each area for
 * longer before it leaves mid-fight (its area times, found through
 * `emOverlays`).
 */
export function keepMonstersInReach(
  level: ReachLevel,
  edits: Edits,
  scripts: ReturnType<typeof readScripts>,
  gameTask: LoadedOverlay,
  largeIds: Iterable<number>,
  monsterName: MonsterNames,
  {
    emOverlays = new Map<number, LoadedOverlay>(),
    data = MONSTER_REACH,
    tableAt = locateMonsterChunks(gameTask.ovl)?.offset,
  }: {
    emOverlays?: ReadonlyMap<number, LoadedOverlay>;
    data?: Readonly<Record<string, AttackData>>;
    tableAt?: number;
  } = {},
): ShuffleReport {
  if (tableAt === undefined) throw new Error("game_task.ovl: the monster table wasn't found");
  const factor = REACH_FACTOR[level];
  const timeFactor = REACH_ENGAGED_FACTOR[level];
  const { lines, unmatched, total } = leanFiles(
    scripts.files,
    edits,
    data,
    (choices, buf, known) => leanTowardsReach(choices, buf, known, factor),
    monsterName,
  );
  const engaged = lengthenEngagement(edits.overlay(gameTask), tableAt, largeIds, timeFactor);
  const areas = lengthenAreaTimes(edits, gameTask, emOverlays, tableAt, largeIds, timeFactor);
  const seconds = (frames: number) => `${Math.round(frames / 30)} s`;
  const byTime = new Map<string, number[]>();
  for (const e of engaged) {
    const key = `${seconds(e.before)} → ${seconds(e.after)}`;
    byTime.set(key, [...(byTime.get(key) ?? []), e.emId]);
  }
  for (const [time, ids] of byTime) {
    lines.push({
      where: "game_task.ovl",
      text: `stays after a lost hunter ${time}: ${ids.map(monsterName).join(", ")}`,
    });
  }
  const minutes = (frames: number) => `${Math.round(frames / 180) / 10} min`;
  for (const list of areas.lists) {
    lines.push({
      where: "area times",
      text: `${list.emIds.map(monsterName).join(", ")}: ${minutes(list.before)} → ${minutes(list.after)} in most areas, the rest ×${timeFactor}`,
    });
  }
  const notes = [
    `In each choice between taking off or digging in and other moves, taking off or digging in is ${factor} times less likely than before, and landing or surfacing ${factor} times likelier where a choice mixes it with staying away; every move stays possible.`,
    `A large monster that can't see a hunter stays after them ${timeFactor} times as long before it gives up and may leave the area.`,
    `A large monster fights in each area ${timeFactor} times as long before it leaves mid-fight (at most about 15 minutes, before the 0 to 3 the game adds).`,
  ];
  if (areas.missing.length) {
    notes.push(
      `Area times left alone, their list not found: ${areas.missing.map(monsterName).join(", ")}.`,
    );
  }
  const list = unmatched.join(", ");
  if (unmatched.length) {
    notes.push(
      `Flights and burrows left alone, their scripts aren't the ones the data was made from (EU and FUC discs): ${list}.`,
    );
  }
  return {
    title: "Monster reach",
    notes,
    lines,
    summary: `Monster reach: ${total} choices, ${engaged.length} species stay longer, ${areas.lists.length} area-time lists${areas.missing.length ? ` (${areas.missing.length} species' not found)` : ""}${unmatched.length ? `; warning: flights and burrows left alone, not the scripts the data was made from: ${list}` : ""}`,
  };
}
