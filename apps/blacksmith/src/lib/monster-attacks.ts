/**
 * A monster's attacks for its Attacks tab, from the attack file next to its
 * model (`/models/monsters/emNN.attacks.json`, packages/mhfu-extract
 * `monsters/attacks.ts`). The file has one entry per attack object a motion
 * makes; the tab lists each motion once per set of numbers, with how many
 * of its hits share them.
 */
import type { MonsterAttack } from "./models";

export interface AttackRow {
  /** The motion's slot, as the 3D model's motion list numbers it. */
  slot: number;
  /** Hits in the motion with these numbers. */
  hits: number;
  damage: number;
  stun: number;
  guard?: number;
  elements?: string[];
  statuses?: string[];
  statusValue?: number;
}

const key = (a: MonsterAttack) =>
  JSON.stringify([
    a.slot,
    a.power,
    a.stun,
    a.guard ?? null,
    a.elements ?? [],
    a.statuses ?? [],
    a.statusValue ?? 0,
  ]);

/** One row per motion and set of numbers, in motion order, the hardest hit first within a motion. */
export function attackRows(attacks: readonly MonsterAttack[]): AttackRow[] {
  const rows = new Map<string, AttackRow>();
  for (const a of attacks) {
    const k = key(a);
    const row = rows.get(k);
    if (row) {
      row.hits++;
      continue;
    }
    const next: AttackRow = { slot: a.slot, hits: 1, damage: a.power, stun: a.stun };
    if (a.guard !== undefined) next.guard = a.guard;
    if (a.elements?.length) next.elements = a.elements;
    if (a.statuses?.length) {
      next.statuses = a.statuses;
      next.statusValue = a.statusValue ?? 0;
    }
    rows.set(k, next);
  }
  return [...rows.values()].sort((a, b) => a.slot - b.slot || b.damage - a.damage);
}
