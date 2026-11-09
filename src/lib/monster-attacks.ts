/**
 * Monster attack records (data/monster-attacks.json). The disc has no attack
 * names, and many records share their numbers (separate hitboxes), so records
 * with identical numbers are grouped into one row with a count.
 */
import type { MonsterAttackRow } from "./types";

/** A record as in data/monster-attacks.json (the internal `record` reference is dropped). */
export interface RawAttack {
  damage: number;
  guard: number;
  elements?: string[];
  statuses?: string[];
  statusValue?: number;
  stun?: number;
}

const key = (a: RawAttack) =>
  JSON.stringify([
    a.damage,
    a.guard,
    a.elements ?? [],
    a.statuses ?? [],
    a.statusValue ?? 0,
    a.stun ?? 0,
  ]);

/** Groups identical records into rows with a count, highest damage first. */
export function groupAttacks(attacks: RawAttack[]): MonsterAttackRow[] {
  const rows = new Map<string, MonsterAttackRow>();
  for (const a of attacks) {
    const k = key(a);
    const row = rows.get(k);
    if (row) {
      row.count++;
      continue;
    }
    const next: MonsterAttackRow = { damage: a.damage, guard: a.guard, count: 1 };
    if (a.elements?.length) next.elements = a.elements;
    if (a.statuses?.length) next.statuses = a.statuses;
    if (a.statusValue) next.statusValue = a.statusValue;
    if (a.stun) next.stun = a.stun;
    rows.set(k, next);
  }
  // Stable: ties keep the disc's order.
  return [...rows.values()].sort((a, b) => b.damage - a.damage);
}
