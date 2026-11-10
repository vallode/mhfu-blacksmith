/**
 * Monster stats and weaknesses, in each monster's `emChunk` in
 * `game_task.ovl` (mhfu-extract `monsters/hitzones.ts`). They belong to the
 * species, so a change applies in every quest. Only monsters some quest
 * spawns change; the rest of the 90 chunks (None, Veggie Elder, Poogie, ...)
 * stay as they are. Everything is edited in place.
 *
 *   +0x040 f32 base scale (size)
 *   +0x100 u16 base HP
 *   +0x10C u32 pointer to the hitzone table list
 *   +0x110 tolerances: paralysis, KO, sleep, unknown (5 u16 each), poison (7 u16)
 *
 * Hitzone rows are 10 bytes: a lead byte (meaning unknown, left in place),
 * then cut, bash, shot, fire, water, ice, thunder, dragon and KO. Variants
 * can share their base species' tables; a shared table changes once, with
 * the first monster's shuffle.
 */
import type { OvlFile } from "../../../mhfu-extract/src/container/ovl.js";
import {
  BASE_HP_OFFSET,
  HITZONE_COLUMNS,
  HITZONE_POINTER_OFFSET,
  HITZONE_ROW_SIZE,
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
  TOLERANCE_OFFSET,
  locateMonsterChunks,
  readHitzoneRows,
} from "../../../mhfu-extract/src/monsters/hitzones.js";
import { MONSTER_OVERLAY } from "../../../mhfu-extract/src/overlay/monsters.js";
import type { ParsedQuest } from "../../../mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import { monsterName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

const BASE_SCALE_OFFSET = 0x40;
/** Fire, water, ice, thunder, dragon: byte offsets in a hitzone row. */
const ELEMENT_BYTES = [4, 5, 6, 7, 8];
const ELEMENT_NAMES = HITZONE_COLUMNS.slice(3, 8);

/** Tolerance blocks: name, offset from +0x110, and the `initial` and `increase` fields. */
const STATUSES = [
  { name: "paralysis", at: 0, increase: 8 },
  { name: "KO", at: 10, increase: 8 },
  { name: "sleep", at: 20, increase: 8 },
  { name: "poison", at: 40, increase: 12 },
] as const;

export interface MonsterChunkRef {
  emId: number;
  /** File offset of the chunk. */
  offset: number;
  /** A chunk no quest spawns (None, Poogie, ...) uses the same hitzone tables: leave them. */
  hitzonesShared: boolean;
}

/** The chunks of every monster any quest spawns, large or small. */
export function collectMonsterChunks(
  ovl: OvlFile,
  quests: readonly ParsedQuest[],
): MonsterChunkRef[] {
  const found = locateMonsterChunks(ovl);
  if (!found) throw new Error("game_task.ovl: the monster table wasn't found");
  const ids = new Set<number>();
  for (const quest of quests) {
    for (const m of quest.largeMonsters) ids.add(m.monsterId);
    for (const table of quest.smallMonsters) for (const m of table.monsters) ids.add(m.monsterId);
  }
  const chunkAt = (emId: number) => found.offset + emId * MONSTER_CHUNK_SIZE;
  const selected = [...ids]
    .filter((id) => id > 0 && id < MONSTER_CHUNK_COUNT)
    .filter((id) => ovl.reader.u16(chunkAt(id) + BASE_HP_OFFSET) > 0)
    .sort((a, b) => a - b);
  const pointer = (emId: number) => ovl.reader.u32(chunkAt(emId) + HITZONE_POINTER_OFFSET);
  const others = new Set<number>();
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    if (!selected.includes(emId)) others.add(pointer(emId));
  }
  return selected.map((emId) => ({
    emId,
    offset: chunkAt(emId),
    hitzonesShared: others.has(pointer(emId)),
  }));
}

const factor = (rng: Rng, spread: number) => 1 - spread + 2 * spread * rng.float();
const percent = (x: number) => `${Math.round(x * 100)}%`;

export interface StatOptions {
  /** Null leaves the stat alone. */
  hpSpread: number | null;
  sizeSpread: number | null;
  statusSpread: number | null;
}

export function randomizeMonsterStats(
  chunks: readonly MonsterChunkRef[],
  options: StatOptions,
  rngs: { hp: Rng; size: Rng; status: Rng },
  edits: Edits,
  gameTask: LoadedOverlay,
): ShuffleReport {
  const buf = edits.overlay(gameTask);
  const lines: ShuffleReport["lines"] = [];
  for (const { emId, offset } of chunks) {
    const where = monsterName(emId);
    if (options.hpSpread !== null) {
      const at = offset + BASE_HP_OFFSET;
      const old = buf.readUInt16LE(at);
      const next = Math.min(
        0xffff,
        Math.max(1, Math.round(old * factor(rngs.hp, options.hpSpread))),
      );
      buf.writeUInt16LE(next, at);
      lines.push({ where, text: `HP ${next} (was ${old})` });
    }
    if (options.sizeSpread !== null) {
      const at = offset + BASE_SCALE_OFFSET;
      const old = buf.readFloatLE(at);
      const f = factor(rngs.size, options.sizeSpread);
      buf.writeFloatLE(old * f, at);
      lines.push({ where, text: `size ${percent(f)} of normal` });
    }
    if (options.statusSpread !== null) {
      const parts: string[] = [];
      for (const status of STATUSES) {
        const f = factor(rngs.status, options.statusSpread);
        const base = offset + TOLERANCE_OFFSET + status.at;
        for (const field of [base, base + status.increase]) {
          const old = buf.readUInt16LE(field);
          // 0 and 0xFFFF may be "never" or "immune": left alone.
          if (old === 0 || old === 0xffff) continue;
          buf.writeUInt16LE(Math.min(0xfffe, Math.max(1, Math.round(old * f))), field);
        }
        parts.push(`${status.name} ${percent(f)}`);
      }
      lines.push({ where, text: `status resistance: ${parts.join(", ")}` });
    }
  }
  const notes: string[] = [];
  if (options.hpSpread !== null) notes.push(`Base HP moved by up to ${percent(options.hpSpread)}.`);
  if (options.sizeSpread !== null)
    notes.push(`Base size moved by up to ${percent(options.sizeSpread)}.`);
  if (options.statusSpread !== null) {
    notes.push(
      `Status resistance (the first dose, and the increase after each) moved by up to ${percent(options.statusSpread)}.`,
    );
  }
  return { title: "Monster stats", notes, lines };
}

/** File offsets and rows of each hitzone table a chunk points to. */
function hitzoneTables(ovl: OvlFile, chunkOffset: number): { offset: number; rows: number }[] {
  const pointer = ovl.reader.u32(chunkOffset + HITZONE_POINTER_OFFSET);
  if (!ovl.isOwnVaddr(pointer)) return [];
  const out: { offset: number; rows: number }[] = [];
  for (
    let at = ovl.vaddrToOffset(pointer);
    at + 4 <= ovl.reader.length && out.length < 8;
    at += 4
  ) {
    const table = ovl.reader.u32(at);
    if (!ovl.isOwnVaddr(table)) break;
    const offset = ovl.vaddrToOffset(table);
    const rows = readHitzoneRows(ovl, offset);
    if (!rows) break;
    out.push({ offset, rows: rows.length });
  }
  return out;
}

/**
 * Each monster's body parts by hitzone row, from mhfu-extract's
 * `overlay/monsters.json` (the site's part names, matched to rows on the EU
 * disc): rows the monster really uses, as opposed to filler.
 */
function partRows(emId: number): Map<number, string[]> {
  const entry = MONSTER_OVERLAY.find((m) => m.id === emId);
  const rows = new Map<number, string[]>();
  for (const [part, [table, row]] of Object.entries(entry?.hitzones ?? {})) {
    if (table !== 0) continue;
    rows.set(row, [...(rows.get(row) ?? []), part]);
  }
  return rows;
}

export function shuffleWeaknesses(
  chunks: readonly MonsterChunkRef[],
  options: { elements: boolean; parts: boolean },
  rngs: { elements: Rng; parts: Rng },
  edits: Edits,
  gameTask: LoadedOverlay,
): ShuffleReport {
  const ovl = gameTask.ovl;
  const buf = edits.overlay(gameTask);
  const done = new Map<number, number>(); // table offset -> emID that changed it
  const lines: ShuffleReport["lines"] = [];

  let skipped = 0;
  for (const { emId, offset, hitzonesShared } of chunks) {
    const where = monsterName(emId);
    if (hitzonesShared) {
      skipped++;
      continue;
    }
    const tables = hitzoneTables(ovl, offset);
    const shared = tables.find((t) => done.has(t.offset));
    if (shared) {
      lines.push({ where, text: `shares hitzones with ${monsterName(done.get(shared.offset)!)}` });
      continue;
    }
    if (tables.length === 0) continue;
    for (const t of tables) done.set(t.offset, emId);

    if (options.parts) {
      const named = partRows(emId);
      const rows = [...named.keys()].sort((a, b) => a - b);
      if (rows.length > 1) {
        const order = rngs.parts.shuffle([...rows]);
        // Row rows[i] takes the values row order[i] had; the lead byte stays.
        for (const t of tables) {
          if (rows.at(-1)! >= t.rows) continue;
          const values = rows.map((r) =>
            Buffer.from(
              buf.subarray(
                t.offset + r * HITZONE_ROW_SIZE + 1,
                t.offset + (r + 1) * HITZONE_ROW_SIZE,
              ),
            ),
          );
          rows.forEach((r, i) =>
            values[rows.indexOf(order[i]!)]!.copy(buf, t.offset + r * HITZONE_ROW_SIZE + 1),
          );
        }
        rows.forEach((r, i) => {
          if (order[i] === r) return;
          const name = (row: number) => named.get(row)!.join("/");
          lines.push({ where, text: `${name(r)} now takes hits like ${name(order[i]!)} did` });
        });
      }
    }

    if (options.elements) {
      const order = rngs.elements.shuffle([0, 1, 2, 3, 4]);
      for (const t of tables) {
        for (let r = 0; r < t.rows; r++) {
          const at = t.offset + r * HITZONE_ROW_SIZE;
          const old = ELEMENT_BYTES.map((b) => buf[at + b]!);
          ELEMENT_BYTES.forEach((b, i) => (buf[at + b] = old[order[i]!]!));
        }
      }
      const moved = order
        .map((from, to) =>
          from === to ? null : `${ELEMENT_NAMES[to]} as ${ELEMENT_NAMES[from]} was`,
        )
        .filter((x) => x !== null);
      if (moved.length > 0) lines.push({ where, text: `elements: ${moved.join(", ")}` });
    }
  }

  const notes: string[] = [];
  if (options.parts) {
    notes.push(
      "Weak spots: each large monster's parts traded hitzone values (cut, bash, shot, elements, KO), in every state (broken, enraged).",
    );
  }
  if (options.elements) {
    notes.push(
      'Elements: "ice as fire was" means the monster now takes ice damage the way it took fire damage, on every part.',
    );
  }
  if (skipped > 0) {
    notes.push(
      `${skipped} monsters share their hitzones with chunks that aren't monsters and are unchanged.`,
    );
  }
  return { title: "Monster weaknesses", notes, lines };
}
