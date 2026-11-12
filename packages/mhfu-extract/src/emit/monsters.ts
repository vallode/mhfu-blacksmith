/**
 * `data/monsters/*.json`-shaped output from the monster overlays
 * (vallode/mhfu-blacksmith#35), for `compare` and `build-data`.
 *
 * The disc gives numbers: hitzone rows by table and row, drop lists by kind
 * and rank slot. `overlay/monsters.json` says which of those each committed
 * hitzone part and drop group shows, so the output uses the site's part
 * names and group labels, in the committed order. Only parts and groups the
 * overlay maps are emitted. Values stay numeric: hitzones as numbers under
 * the site's column keys, drops as `{ itemId, name, chance, amount }` with
 * the `ItemID` enum name. `base_hp` is the chunk's base HP; `tolerances`
 * its status tolerances (`siteTolerances`). `breaks` lists the parts behind each
 * of the monster's break rewards (`monsters/breaks.ts`, `overlay/breaks.ts`),
 * named after its `break …` drop group. `flinch_thresholds` is each body
 * part's flinch threshold (`hitzones.ts` `readFlinchThresholds`).
 *
 * Monsters are named by the `emID` enum, so `compare` recovers their IDs the
 * same way it does for equipment.
 */
import type { BreakRecord } from "../monsters/breaks.js";
import type {
  HitzoneColumn,
  MonsterChunk,
  PoisonTolerance,
  StatusTolerance,
  Tolerances,
} from "../monsters/hitzones.js";
import { codeBreaks, type BreakDamage } from "../overlay/breaks.js";
import type { CapBreakTable, CarveTables, RewardEntry, RewardRank } from "../monsters/rewards.js";
import { MONSTER_OVERLAY, parseDropSlot } from "../overlay/monsters.js";
import { getNameResolver } from "../strings/names.js";
import type { EmitOutput } from "./index.js";

/** The site's hitzone keys, in its column order, for each disc column. */
export const SITE_HITZONE_KEYS: [string, HitzoneColumn][] = [
  ["cut", "cut"],
  ["bash", "bash"],
  ["shot", "shot"],
  ["fir", "fire"],
  ["wtr", "water"],
  ["thn", "thunder"],
  ["ice", "ice"],
  ["drg", "dragon"],
  ["ko", "ko"],
];

export interface EmittedDrop {
  itemId: number;
  name: string;
  chance: number;
  amount: number;
}

export interface EmittedMonster {
  name: string;
  /** Base HP before the quest's multiplier (`base_hp` on the site). */
  base_hp: number;
  hitzones?: Record<string, Record<string, number>>;
  drops?: Record<string, Record<string, EmittedDrop[]>>;
  tolerances: EmittedTolerances;
  breaks?: EmittedBreak[];
  /** Damage each body part (hitbox capsule `part`) takes before a flinch; null: no such part. */
  flinch_thresholds?: (number | null)[];
}

/** A status tolerance (`hitzones.ts` `StatusTolerance`) in the site's keys. */
export interface EmittedStatusTolerance {
  initial: number;
  increase: number;
  recovery: number;
  recovery_time: number;
  duration: number;
}

/** Poison's tolerance (`hitzones.ts` `PoisonTolerance`) in the site's keys. */
export interface EmittedPoisonTolerance {
  initial: number;
  increase: number;
  recovery: number;
  recovery_time: number;
  damage: number;
  damage_interval: number;
  total_time: number;
}

/** Status tolerances by status; null where the monster is immune. */
export interface EmittedTolerances {
  paralysis: EmittedStatusTolerance | null;
  sleep: EmittedStatusTolerance | null;
  ko: EmittedStatusTolerance | null;
  poison: EmittedPoisonTolerance | null;
}

/** `initial` 0xFFFF: the status never builds up. */
const IMMUNE = 0xffff;

/**
 * The chunk's tolerances in `data/`'s shape. The fourth status (`unknown`)
 * is left out until it is identified. Poison's `damagePerSecond` is
 * written as `damage_interval`: it is 150 on every monster, so it is
 * likely the ticks between hits, not a damage figure.
 */
export function siteTolerances(t: Tolerances): EmittedTolerances {
  const status = (s: StatusTolerance): EmittedStatusTolerance | null =>
    s.initial === IMMUNE
      ? null
      : {
          initial: s.initial,
          increase: s.increase,
          recovery: s.recovery,
          recovery_time: s.recoveryTime,
          duration: s.duration,
        };
  const poison = (p: PoisonTolerance): EmittedPoisonTolerance | null =>
    p.initial === IMMUNE
      ? null
      : {
          initial: p.initial,
          increase: p.increase,
          recovery: p.recovery,
          recovery_time: p.recoveryTime,
          damage: p.damage,
          damage_interval: p.damagePerSecond,
          total_time: p.totalTime,
        };
  return {
    paralysis: status(t.paralysis),
    sleep: status(t.sleep),
    ko: status(t.ko),
    poison: poison(t.poison),
  };
}

/** One break reward and the body parts behind it. */
export interface EmittedBreak {
  /** The break's drop group label without "break " ("head", "wing"). */
  name: string;
  /** Body parts: the hitbox capsules' `part` numbers. */
  parts: number[];
  /** Flinches of a part that break it; null when an event counter does. */
  flinches: number | null;
  /** Every listed part must reach the count (else any one). */
  all_parts?: true;
  /** Fraction of max HP the monster must be under. */
  below_hp?: number;
  /** Damage the part must have taken. */
  damage?: BreakDamage;
}

export interface MonsterTables {
  chunks: MonsterChunk[];
  carves: CarveTables[];
  capBreak: CapBreakTable[];
  /** The break table; absent, no breaks are emitted. */
  breaks?: BreakRecord[];
  /** Species of each emID (EBOOT); absent, each monster is its own. */
  species?: number[] | null;
}

const BREAK_LABEL = /^break\s+/i;

/** The monster's break reward labels by break type, from its first drop rank that has each. */
function breakLabels(drops: Record<string, Record<string, string>>): Map<number, string> {
  const labels = new Map<number, string>();
  for (const groups of Object.values(drops))
    for (const [label, slot] of Object.entries(groups)) {
      const { kind, breakType } = parseDropSlot(slot);
      if (kind === "break" && breakType !== undefined && !labels.has(breakType))
        labels.set(breakType, label.replace(BREAK_LABEL, ""));
    }
  return labels;
}

/**
 * The parts behind each of a monster's break rewards: the break table's
 * records for its species, then its species' code-set breaks. Records of
 * one break with the same flinch count merge into one entry.
 */
export function monsterBreaks(
  tables: MonsterTables,
  emId: number,
  drops: Record<string, Record<string, string>>,
): EmittedBreak[] {
  const labels = breakLabels(drops);
  if (labels.size === 0 || !tables.breaks) return [];
  const species = tables.species?.[emId] ?? emId;
  const out: EmittedBreak[] = [];
  const add = (entry: EmittedBreak) => {
    const same = out.find(
      (b) =>
        b.name === entry.name &&
        b.flinches === entry.flinches &&
        !b.all_parts &&
        !entry.all_parts &&
        b.below_hp === entry.below_hp &&
        b.damage === entry.damage,
    );
    if (same) same.parts = [...new Set([...same.parts, ...entry.parts])].sort((a, b) => a - b);
    else out.push(entry);
  };
  for (const [type, name] of [...labels].sort(([a], [b]) => a - b)) {
    for (const r of tables.breaks)
      if (r.emId === species && r.breakType === type)
        add({ name, parts: [r.part], flinches: r.flinches });
    for (const c of codeBreaks(species, emId))
      if (c.break === type)
        add({
          name,
          parts: [...c.parts],
          flinches: c.flinches,
          ...(c.all_parts ? { all_parts: true as const } : {}),
          ...(c.below_hp !== undefined ? { below_hp: c.below_hp } : {}),
          ...(c.damage ? { damage: c.damage } : {}),
        });
  }
  return out;
}

function dropList(tables: MonsterTables, emId: number, slot: string): RewardEntry[] | undefined {
  const { kind, breakType, rank } = parseDropSlot(slot);
  const r = rank as RewardRank;
  if (kind === "body" || kind === "tail" || kind === "shiny") {
    return tables.carves.find((c) => c.emId === emId)?.[kind][r];
  }
  const type = kind === "capture" ? 128 : breakType;
  return tables.capBreak.find((c) => c.emId === emId && c.type === type)?.ranks[r];
}

export function emitMonsters(tables: MonsterTables): EmitOutput {
  const names = getNameResolver();
  const enumName = (emId: number) => names.resolve("emID", emId) ?? `Monster ${emId}`;
  const itemName = (id: number) => names.resolve("ItemID", id) ?? `Item ${id}`;
  const byFile = new Map<string, EmittedMonster[]>();

  for (const entry of MONSTER_OVERLAY) {
    const chunk = tables.chunks[entry.id];
    if (!chunk) continue;
    const monster: EmittedMonster = {
      name: enumName(entry.id),
      base_hp: chunk.baseHp,
      tolerances: siteTolerances(chunk.tolerances),
    };
    if (chunk.flinchThresholds) monster.flinch_thresholds = chunk.flinchThresholds;

    if (entry.hitzones && chunk.hitzones) {
      const hitzones: Record<string, Record<string, number>> = {};
      for (const [part, [table, row]] of Object.entries(entry.hitzones)) {
        const values = chunk.hitzones[table]?.[row]?.values;
        if (!values) continue;
        hitzones[part] = Object.fromEntries(
          SITE_HITZONE_KEYS.map(([key, col]) => [key, values[col]]),
        );
      }
      monster.hitzones = hitzones;
    }

    if (entry.drops) {
      const drops: Record<string, Record<string, EmittedDrop[]>> = {};
      for (const [rank, groups] of Object.entries(entry.drops)) {
        for (const [label, slot] of Object.entries(groups)) {
          const list = dropList(tables, entry.id, slot);
          if (!list) continue;
          (drops[rank] ??= {})[label] = list.map((e) => ({
            itemId: e.itemId,
            name: itemName(e.itemId),
            chance: e.chance,
            amount: e.amount ?? 1,
          }));
        }
      }
      monster.drops = drops;
      const breaks = monsterBreaks(tables, entry.id, entry.drops);
      if (breaks.length > 0) monster.breaks = breaks;
    }

    const list = byFile.get(entry.file) ?? [];
    list.push(monster);
    byFile.set(entry.file, list);
  }

  const output: EmitOutput = {};
  for (const [file, monsters] of byFile) output[file] = { monsters };
  return output;
}
