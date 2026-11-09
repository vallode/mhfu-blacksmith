/**
 * `extract --raw`: candidate monster attack tables. Numbers only.
 *
 * Nobody has mapped where the game keeps a monster attack's damage, stun
 * and guard knockback. `MonChunk`'s `emPTRChunk` has 27 pointers no one has
 * identified (`vendor/mhp2g-patterns/patterns/game_task.hexpat`), and the
 * player's own attack records (`PlayerMotVal`, one byte per field) suggest
 * the shape. So, as for the horn note sets (`melody-raw.ts`), this searches
 * the files for numbers we already know: the crib in
 * `overlay/attack-crib.json`, the Monster Hunter Wiki's damage, stun and
 * guard knockback per MHFU attack.
 *
 * 1. **Anchors.** For each crib attack with all three numbers non-zero,
 *    every place they sit within `WINDOW` bytes of each other, as bytes or
 *    as aligned f32s. Bytes also catch little-endian u16 and u32 fields,
 *    whose low byte holds a value under 256. An anchor's pattern is the
 *    field type and where stun and knockback sit relative to damage.
 * 2. **Tables.** A table holds one monster's attacks as records of one
 *    layout, so, one monster at a time, a pattern's anchors in one file are
 *    grouped while neighbours are at most `CLUSTER_GAP` apart. A group is
 *    kept if at least `MIN_ATTACKS` different attacks in it line up as rows
 *    of one stride (`tableLayout`); anchors that don't line up are dropped.
 * 3. **Patterns** are ranked by the number of monsters whose tables agree
 *    on one stride, then by monsters with any table: the real layout should
 *    turn up for many monsters with one record size, chance for few.
 *
 * Each kept cluster carries the rows around it (one stride each) and every
 * pointer into it from the overlays, with the `MonChunk` slot when one
 * holds it, for working out the format offline from `raw/attacks.json`.
 */
import type { OvlFile } from "../container/ovl.js";
import { isUserAddress } from "../monsters/collision.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../monsters/hitzones.js";
import { monsterIdOf } from "../overlay/monsters.js";

/** One crib attack whose damage, stun and guard knockback are all known. */
export interface CribAttack {
  monster: string;
  name: string;
  damage: number;
  stun: number;
  guard: number;
}

/** A file to search. `ovl` is set for overlays, so pointers into them can be found. */
export interface SearchFile {
  name: string;
  buf: Buffer;
  ovl?: OvlFile;
  /** emID of a per-monster `overlay/emNN.ovl` or `emmodel/emNN.pac` entry. */
  emId?: number;
}

export type FieldKind = "u8" | "f32";

export interface AttackPattern {
  kind: FieldKind;
  /** Byte offset of stun and of guard knockback from damage. */
  stun: number;
  guard: number;
}

export interface AttackHit {
  attack: string;
  /** File offset of the damage field. */
  offset: number;
}

export interface PointerRef {
  file: string;
  /** File offset of the u32 holding the pointer. */
  offset: number;
  value: string;
  /** The `MonChunk` slot holding it, when it is in `game_task.ovl`'s chunk array. */
  chunk?: { emId: number; at: string };
  /**
   * When the pointer sits in a run of pointers (a list): where the run
   * starts, how many it holds, and the pointers to its first entry.
   */
  list?: { offset: number; length: number; refs: PointerRef[] };
}

export interface AttackCluster {
  file: string;
  /** emID of the file, when it belongs to one monster. */
  fileEmId?: number;
  start: number;
  end: number;
  /** The monster whose attacks matched, its emID, and how many of them. */
  monster: string;
  monsterEmId: number | null;
  monsterAttacks: number;
  /** That monster's crib attacks with all three numbers. */
  monsterCrib: number;
  /** Record size the matched attacks line up on (`tableLayout`). */
  stride: number;
  hits: AttackHit[];
  /** `stride` bytes per row, from 4 rows before the cluster to 4 after. */
  rows: { offset: number; hex: string }[];
  refs: PointerRef[];
}

export interface PatternResult {
  pattern: AttackPattern;
  /** Monsters with a kept cluster. */
  monsters: number;
  /** The record size most monsters' clusters agree on, and how many do. */
  stride: number;
  monstersAtStride: number;
  clusters: AttackCluster[];
}

export interface AttackRawDump {
  /** Crib attacks searched (all three numbers known) and their monsters. */
  crib: { monsters: number; attacks: number };
  files: { name: string; length: number; anchors: number }[];
  patterns: PatternResult[];
}

/** How far stun and knockback may sit from damage. `PlayerMotVal` is 24 bytes. */
export const WINDOW = 0x20;
/** Leaves room for a few rows the crib doesn't know between two it does. */
export const CLUSTER_GAP = 0x200;
export const MIN_ATTACKS = 3;
/** Caps that keep `raw/attacks.json` to a few MB (it is uploaded as a zip). */
const MAX_PATTERNS = 12;
const MAX_CLUSTERS_PER_PATTERN = 40;
const ROWS_AROUND = 4;
const MAX_ROWS = 48;
/** How far before a cluster a pointer to the table's start may point. */
const REF_SLACK = 0x100;

const FIELD = {
  u8: { size: 1, read: (buf: Buffer, at: number) => buf[at]! },
  f32: { size: 4, read: (buf: Buffer, at: number) => buf.readFloatLE(at) },
} as const;

export interface Anchor {
  /** Index into the searched attacks. */
  attack: number;
  /** File offset of the damage field. */
  offset: number;
}

/** Sorted offsets of each value in `values`, read as `kind` at its alignment. */
export function indexValues(
  buf: Buffer,
  values: ReadonlySet<number>,
  kind: FieldKind,
): Map<number, number[]> {
  const { size, read } = FIELD[kind];
  const index = new Map<number, number[]>();
  for (const v of values) index.set(v, []);
  for (let at = 0; at + size <= buf.length; at += size) {
    const v = read(buf, at);
    if (values.has(v)) index.get(v)!.push(at);
  }
  return index;
}

/** Map key for a pattern of one kind: stun and guard offsets, both within `WINDOW`. */
const patternKey = (stun: number, guard: number) => (stun + 0x80) * 0x100 + (guard + 0x80);

/**
 * Anchors are packed as `offset * ATTACK_SLOTS + attack` so a pattern's
 * anchors are one number array that sorts by offset. No monster has more
 * than 31 crib attacks (Congalala has 13), so a cluster's distinct attacks
 * fit in a 32-bit mask.
 */
const ATTACK_SLOTS = 32;

interface PackedPattern {
  pattern: AttackPattern;
  packed: number[];
}

/**
 * Every place `attacks`' numbers sit within `WINDOW` of their damage field,
 * grouped by pattern, packed. Fields don't overlap.
 */
function packedAnchors(
  attacks: readonly CribAttack[],
  kind: FieldKind,
  index: ReadonlyMap<number, readonly number[]>,
): Map<number, PackedPattern> {
  if (attacks.length > ATTACK_SLOTS - 1) {
    throw new Error(`${attacks[0]!.monster} has over ${ATTACK_SLOTS - 1} crib attacks`);
  }
  const { size } = FIELD[kind];
  // Attacks with the same three numbers share one search.
  const byTriple = new Map<string, { attack: CribAttack; indexes: number[] }>();
  attacks.forEach((attack, i) => {
    const key = `${attack.damage},${attack.stun},${attack.guard}`;
    const entry = byTriple.get(key) ?? { attack, indexes: [] };
    entry.indexes.push(i);
    byTriple.set(key, entry);
  });
  const empty: readonly number[] = [];
  const stunAt = new Int32Array(2 * WINDOW + 1);
  const guardAt = new Int32Array(2 * WINDOW + 1);
  const out = new Map<number, PackedPattern>();
  for (const { attack, indexes } of byTriple.values()) {
    const damages = index.get(attack.damage) ?? empty;
    const stuns = index.get(attack.stun) ?? empty;
    const guards = index.get(attack.guard) ?? empty;
    let s0 = 0;
    let g0 = 0;
    for (const at of damages) {
      // Stuns within the window, then guards; both lists are sorted, so their
      // cursors only move forward.
      while (s0 < stuns.length && stuns[s0]! < at - WINDOW) s0++;
      let ns = 0;
      for (let j = s0; j < stuns.length && stuns[j]! <= at + WINDOW; j++) {
        const d = stuns[j]! - at;
        if (Math.abs(d) >= size) stunAt[ns++] = d;
      }
      if (ns === 0) continue;
      while (g0 < guards.length && guards[g0]! < at - WINDOW) g0++;
      let ng = 0;
      for (let j = g0; j < guards.length && guards[j]! <= at + WINDOW; j++) {
        const d = guards[j]! - at;
        if (Math.abs(d) >= size) guardAt[ng++] = d;
      }
      for (let si = 0; si < ns; si++) {
        const stun = stunAt[si]!;
        for (let gi = 0; gi < ng; gi++) {
          const guard = guardAt[gi]!;
          if (Math.abs(stun - guard) < size) continue;
          const key = patternKey(stun, guard);
          let entry = out.get(key);
          if (!entry) {
            entry = { pattern: { kind, stun, guard }, packed: [] };
            out.set(key, entry);
          }
          for (const i of indexes) entry.packed.push(at * ATTACK_SLOTS + i);
        }
      }
    }
  }
  return out;
}

const unpack = (p: number): Anchor => ({
  attack: p % ATTACK_SLOTS,
  offset: Math.floor(p / ATTACK_SLOTS),
});

/**
 * Every place `attacks`' numbers sit within `WINDOW` of their damage field,
 * grouped by pattern, sorted by offset. Fields don't overlap.
 */
export function findAnchors(
  buf: Buffer,
  attacks: readonly CribAttack[],
  kind: FieldKind,
): { pattern: AttackPattern; anchors: Anchor[] }[] {
  const values = new Set<number>();
  for (const a of attacks) values.add(a.damage).add(a.stun).add(a.guard);
  return [...packedAnchors(attacks, kind, indexValues(buf, values, kind)).values()].map(
    ({ pattern, packed }) => ({
      pattern,
      anchors: Array.from(Float64Array.from(packed).sort(), unpack),
    }),
  );
}

/**
 * Splits one pattern's packed anchors where neighbours are over
 * `CLUSTER_GAP` apart, keeping groups with `MIN_ATTACKS` different attacks.
 */
function packedClusters(packed: readonly number[]): Anchor[][] {
  const sorted = Float64Array.from(packed).sort();
  const groups: Anchor[][] = [];
  let from = 0;
  let mask = 0;
  let distinct = 0;
  const flush = (to: number) => {
    if (distinct >= MIN_ATTACKS) groups.push(Array.from(sorted.subarray(from, to), unpack));
  };
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (
      i > from &&
      Math.floor(p / ATTACK_SLOTS) - Math.floor(sorted[i - 1]! / ATTACK_SLOTS) > CLUSTER_GAP
    ) {
      flush(i);
      from = i;
      mask = 0;
      distinct = 0;
    }
    const bit = 1 << (p % ATTACK_SLOTS);
    if (!(mask & bit)) {
      mask |= bit;
      distinct++;
    }
  }
  flush(sorted.length);
  return groups;
}

/** Longest record considered (`PlayerMotVal` is 24 bytes). */
export const MAX_STRIDE = 0x80;
/** Most rows a table may span between its first and last matched attack. */
export const MAX_TABLE_ROWS = 48;
/**
 * The matched attacks must fill at least one row in this many between the
 * first and the last: the crib lists a good part of each monster's attacks,
 * and chance alignments of a few numbers are spread out.
 */
export const ROWS_PER_HIT = 4;

/**
 * Strides that at least `C(MIN_ATTACKS, 2)` pairs of different attacks sit
 * a whole number of rows apart on, within `MAX_TABLE_ROWS` rows: any table
 * of `MIN_ATTACKS` attacks has that many pairs on its stride.
 */
function candidateStrides(anchors: readonly Anchor[], minStride: number): number[] {
  const votes = new Map<number, number>();
  const needed = (MIN_ATTACKS * (MIN_ATTACKS - 1)) / 2;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const d = anchors[j]!.offset - anchors[i]!.offset;
      if (d > MAX_STRIDE * MAX_TABLE_ROWS) break;
      if (d === 0 || anchors[j]!.attack === anchors[i]!.attack) continue;
      const maxRows = Math.min(MAX_TABLE_ROWS, Math.floor(d / minStride));
      for (let rows = Math.ceil(d / MAX_STRIDE); rows <= maxRows; rows++) {
        if (d % rows === 0) votes.set(d / rows, (votes.get(d / rows) ?? 0) + 1);
      }
    }
  }
  return [...votes].filter(([, v]) => v >= needed).map(([stride]) => stride);
}

/**
 * The record layout that best explains a cluster (sorted by offset): the
 * stride and starting residue under which the most different attacks line
 * up, on rows at most `MAX_TABLE_ROWS` apart and filling at least one row
 * in `ROWS_PER_HIT`. Strides run from `minStride` (records can't be
 * shorter than the fields they hold) to `MAX_STRIDE`; ties go to the
 * longer stride, since a table's rows also line up on every divisor of
 * its stride. Null unless `MIN_ATTACKS` different attacks line up.
 */
export function tableLayout(
  anchors: readonly Anchor[],
  minStride: number,
): { stride: number; anchors: Anchor[] } | null {
  let best: { stride: number; from: number; to: number; list: Anchor[]; attacks: number } | null =
    null;
  const counts = new Uint16Array(ATTACK_SLOTS);
  for (const stride of candidateStrides(anchors, Math.max(minStride, 1))) {
    const byResidue = new Map<number, Anchor[]>();
    for (const a of anchors) {
      const r = a.offset % stride;
      const list = byResidue.get(r);
      if (list) list.push(a);
      else byResidue.set(r, [a]);
    }
    for (const list of byResidue.values()) {
      if (list.length < MIN_ATTACKS) continue;
      // Slide a window of rows no more than MAX_TABLE_ROWS apart end to end,
      // counting the different attacks in it.
      counts.fill(0);
      let distinct = 0;
      let from = 0;
      for (let to = 0; to < list.length; to++) {
        if (counts[list[to]!.attack]!++ === 0) distinct++;
        while (list[to]!.offset - list[from]!.offset > MAX_TABLE_ROWS * stride) {
          if (--counts[list[from]!.attack]! === 0) distinct--;
          from++;
        }
        if (distinct < MIN_ATTACKS) continue;
        const rows = (list[to]!.offset - list[from]!.offset) / stride + 1;
        if (rows > ROWS_PER_HIT * distinct) continue;
        if (
          !best ||
          distinct > best.attacks ||
          (distinct === best.attacks && stride > best.stride)
        ) {
          best = { stride, from, to, list, attacks: distinct };
        }
      }
    }
  }
  return best && { stride: best.stride, anchors: best.list.slice(best.from, best.to + 1) };
}

type ScoredCluster = Omit<AttackCluster, "rows" | "refs">;

/**
 * Scores one cluster of one monster's anchors under `pattern` (`attacks` is
 * that monster's crib): the attacks that line up as table rows
 * (`tableLayout`), or null if fewer than `MIN_ATTACKS` do.
 */
export function scoreCluster(
  file: Pick<SearchFile, "name" | "emId">,
  pattern: AttackPattern,
  anchors: readonly Anchor[],
  attacks: readonly CribAttack[],
): ScoredCluster | null {
  const offsets = [0, pattern.stun, pattern.guard];
  const span = Math.max(...offsets) - Math.min(...offsets) + FIELD[pattern.kind].size;
  const layout = tableLayout(anchors, span);
  if (!layout) return null;
  const rows = layout.anchors;
  const monster = attacks[0]!.monster;
  return {
    file: file.name,
    ...(file.emId !== undefined ? { fileEmId: file.emId } : {}),
    start: rows[0]!.offset,
    end: rows[rows.length - 1]!.offset,
    monster,
    monsterEmId: monsterIdOf(monster),
    monsterAttacks: new Set(rows.map((a) => a.attack)).size,
    monsterCrib: attacks.length,
    stride: layout.stride,
    hits: rows.map((a) => ({ attack: attacks[a.attack]!.name, offset: a.offset })),
  };
}

/**
 * The stride the most monsters' clusters agree on: a cluster agrees with
 * `s` if its own stride is a multiple of `s` (a few hits can share a larger
 * divisor by chance). Ties go to the larger stride.
 */
export function agreedStride(clusters: readonly ScoredCluster[]): {
  stride: number;
  monsters: number;
} {
  let best = { stride: 0, monsters: 0 };
  for (const s of new Set(clusters.map((c) => c.stride))) {
    const monsters = new Set(clusters.filter((c) => c.stride % s === 0).map((c) => c.monster)).size;
    if (monsters > best.monsters || (monsters === best.monsters && s > best.stride)) {
      best = { stride: s, monsters };
    }
  }
  return best;
}

/** `game_task.ovl` and the file offset of its `MonChunk[90]`. */
export interface ChunkArray {
  ovl: OvlFile;
  offset: number;
}

/**
 * Every u32 in the overlays among `files` that holds a user-memory address,
 * sorted by value, for finding the pointers into a range.
 */
export class PointerIndex {
  private readonly values: Uint32Array;
  private readonly entries: { file: SearchFile; offset: number }[];

  constructor(
    private readonly files: readonly SearchFile[],
    private readonly chunks: ChunkArray | null,
  ) {
    const found: { value: number; file: SearchFile; offset: number }[] = [];
    for (const file of files) {
      if (!file.ovl) continue;
      const r = file.ovl.reader;
      for (let at = 0; at + 4 <= r.length; at += 4) {
        const value = r.u32(at);
        if (isUserAddress(value)) found.push({ value, file, offset: at });
      }
    }
    found.sort((a, b) => a.value - b.value || a.offset - b.offset);
    this.values = Uint32Array.from(found, (f) => f.value);
    this.entries = found.map(({ file, offset }) => ({ file, offset }));
  }

  /** Pointers whose value is in [lo, hi). */
  into(lo: number, hi: number): PointerRef[] {
    const refs: PointerRef[] = [];
    for (let i = this.lowerBound(lo); i < this.values.length && this.values[i]! < hi; i++) {
      const { file, offset } = this.entries[i]!;
      const ref: PointerRef = {
        file: file.name,
        offset,
        value: `0x${this.values[i]!.toString(16)}`,
      };
      const chunks = this.chunks;
      if (chunks && file.ovl === chunks.ovl) {
        const rel = offset - chunks.offset;
        if (rel >= 0 && rel < MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE) {
          ref.chunk = {
            emId: Math.floor(rel / MONSTER_CHUNK_SIZE),
            at: `0x${(rel % MONSTER_CHUNK_SIZE).toString(16)}`,
          };
        }
      }
      refs.push(ref);
    }
    return refs;
  }

  /**
   * Pointers into `file` from `REF_SLACK` before `start` to `end`. For one in
   * a run of pointers, the run and the pointers to its first entry.
   * Per-monster overlays share load addresses, so a pointer into one
   * emNN.ovl's range can mean another's: each ref names the file it was
   * read from.
   */
  refsTo(file: SearchFile, start: number, end: number): PointerRef[] {
    const ovl = file.ovl;
    if (!ovl) return [];
    const lo = ovl.loadBase + Math.max(0, start - REF_SLACK);
    return this.into(lo, ovl.loadBase + end + 1).map((ref) => {
      const holder = this.files.find((f) => f.name === ref.file)!.ovl!;
      const r = holder.reader;
      let first = ref.offset;
      while (first >= 4 && isUserAddress(r.u32(first - 4))) first -= 4;
      let after = ref.offset + 4;
      while (after + 4 <= r.length && isUserAddress(r.u32(after))) after += 4;
      const length = (after - first) / 4;
      if (length < 2) return ref;
      const listAt = holder.loadBase + first;
      return { ...ref, list: { offset: first, length, refs: this.into(listAt, listAt + 1) } };
    });
  }

  private lowerBound(value: number): number {
    let lo = 0;
    let hi = this.values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.values[mid]! < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

function rowsAround(
  buf: Buffer,
  start: number,
  end: number,
  stride: number,
): AttackCluster["rows"] {
  const step = stride;
  const from = Math.max(0, start - ROWS_AROUND * step);
  const to = Math.min(buf.length, end + (ROWS_AROUND + 1) * step);
  const rows: AttackCluster["rows"] = [];
  for (let at = from; at < to && rows.length < MAX_ROWS; at += step) {
    rows.push({ offset: at, hex: buf.subarray(at, Math.min(at + step, to)).toString("hex") });
  }
  return rows;
}

const sum = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/**
 * Searches every file for `attacks` and returns the best patterns, each with
 * its kept clusters. `chunks` locates `MonChunk[90]` so pointers from it can
 * be named.
 */
export function dumpAttacksRaw(
  files: readonly SearchFile[],
  attacks: readonly CribAttack[],
  chunks: ChunkArray | null,
): AttackRawDump {
  const usable = attacks.filter((a) => a.damage > 0 && a.stun > 0 && a.guard > 0);
  const byMonster = new Map<string, CribAttack[]>();
  for (const a of usable) byMonster.set(a.monster, [...(byMonster.get(a.monster) ?? []), a]);
  const values = new Set<number>();
  for (const a of usable) values.add(a.damage).add(a.stun).add(a.guard);

  const byPattern = new Map<string, { pattern: AttackPattern; clusters: ScoredCluster[] }>();
  const fileStats: AttackRawDump["files"] = [];
  for (const file of files) {
    let anchorCount = 0;
    for (const kind of ["u8", "f32"] as const) {
      const index = indexValues(file.buf, values, kind);
      // One monster at a time: a table holds one monster's attacks.
      for (const monsterAttacks of byMonster.values()) {
        for (const { pattern, packed } of packedAnchors(monsterAttacks, kind, index).values()) {
          anchorCount += packed.length;
          for (const group of packedClusters(packed)) {
            const cluster = scoreCluster(file, pattern, group, monsterAttacks);
            if (!cluster) continue;
            const key = `${pattern.kind}:${pattern.stun}:${pattern.guard}`;
            const entry = byPattern.get(key) ?? { pattern, clusters: [] };
            entry.clusters.push(cluster);
            byPattern.set(key, entry);
          }
        }
      }
    }
    fileStats.push({ name: file.name, length: file.buf.length, anchors: anchorCount });
  }

  const ranked = [...byPattern.values()]
    .map((p) => {
      const agreed = agreedStride(p.clusters);
      return {
        ...p,
        monsters: new Set(p.clusters.map((c) => c.monster)).size,
        stride: agreed.stride,
        monstersAtStride: agreed.monsters,
      };
    })
    .sort(
      (a, b) =>
        b.monstersAtStride - a.monstersAtStride ||
        b.monsters - a.monsters ||
        sum(b.clusters, (c) => c.monsterAttacks) - sum(a.clusters, (c) => c.monsterAttacks),
    )
    .slice(0, MAX_PATTERNS);

  const byName = new Map(files.map((f) => [f.name, f]));
  const pointers = new PointerIndex(files, chunks);
  return {
    crib: { monsters: new Set(usable.map((a) => a.monster)).size, attacks: usable.length },
    files: fileStats,
    patterns: ranked.map(({ pattern, monsters, stride, monstersAtStride, clusters }) => ({
      pattern,
      monsters,
      stride,
      monstersAtStride,
      clusters: [...clusters]
        .sort((a, b) => b.monsterAttacks - a.monsterAttacks || a.start - b.start)
        .slice(0, MAX_CLUSTERS_PER_PATTERN)
        .map((c) => {
          const file = byName.get(c.file)!;
          return {
            ...c,
            rows: rowsAround(file.buf, c.start, c.end, c.stride),
            refs: pointers.refsTo(file, c.start, c.end),
          };
        }),
    })),
  };
}

/** `overlay/attack-crib.json`. */
export interface AttackCrib {
  monsters: Record<string, { name: string; damage?: number; stun?: number; guard?: number }[]>;
}

/** The crib's attacks with damage, stun and guard knockback all given. */
export function cribAttacks(crib: AttackCrib): CribAttack[] {
  const out: CribAttack[] = [];
  for (const [monster, list] of Object.entries(crib.monsters)) {
    for (const { name, damage, stun, guard } of list) {
      if (damage === undefined || stun === undefined || guard === undefined) continue;
      out.push({ monster, name, damage, stun, guard });
    }
  }
  return out;
}
