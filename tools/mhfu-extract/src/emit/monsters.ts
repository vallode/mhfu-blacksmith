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
 * the `ItemID` enum name. `baseHp` and `tolerances` have no committed
 * counterpart yet.
 *
 * Monsters are named by the `emID` enum, so `compare` recovers their IDs the
 * same way it does for equipment.
 */
import type { HitzoneColumn, MonsterChunk } from "../monsters/hitzones.js";
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
  /** Base HP before the quest's multiplier; no committed counterpart yet. */
  baseHp: number;
  hitzones?: Record<string, Record<string, number>>;
  drops?: Record<string, Record<string, EmittedDrop[]>>;
  tolerances: MonsterChunk["tolerances"];
}

export interface MonsterTables {
  chunks: MonsterChunk[];
  carves: CarveTables[];
  capBreak: CapBreakTable[];
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
      baseHp: chunk.baseHp,
      tolerances: chunk.tolerances,
    };

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
    }

    const list = byFile.get(entry.file) ?? [];
    list.push(monster);
    byFile.set(entry.file, list);
  }

  const output: EmitOutput = {};
  for (const [file, monsters] of byFile) output[file] = { monsters };
  return output;
}
