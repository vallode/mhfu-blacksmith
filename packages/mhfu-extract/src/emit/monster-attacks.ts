/**
 * `data/monster-attacks.json` from the attack usage in `raw/attacks.json`
 * (`emit/attacks-raw.ts`, `monsters/attack-usage.ts`): per monster family,
 * the attack records its code spawns.
 *
 * A family is the code that spawns the attacks: a per-monster
 * `overlay/emNN.ovl`, or a `game_task.ovl` code unit. Monsters sharing that
 * code (subspecies, and species without an overlay of their own) share its
 * records, and the disc doesn't say which of them uses which, so the file
 * lists the family's monsters and its records together.
 * `overlay/attack-families.json` names each family's monsters; families it
 * doesn't list (player weapons, shells spawning shells) are left out.
 *
 * Only the record fields matched against the Monster Hunter Wiki's numbers
 * are written: damage, guard knockback, stun, and the named element and
 * status bits with the status's value. Attack names aren't: the crib that
 * names records is the wiki's (CC BY-SA), kept out of `data/`.
 */
import type { AttackRawDump, UsedRecord } from "./attacks-raw.js";

/** `overlay/attack-families.json`. */
export interface AttackFamilies {
  families: Record<string, string[]>;
}

export interface MonsterAttack {
  /** The record, as "file@0xtable#index" in `raw/attacks.json`. */
  record: string;
  damage: number;
  /** Guard knockback. */
  guard: number;
  elements?: string[];
  statuses?: string[];
  /** Buildup of `statuses`. */
  statusValue?: number;
  stun?: number;
}

export interface MonsterAttackFamily {
  /** The calling code: "overlay/em14.ovl", or a `game_task.ovl` unit ("game_task.ovl:em51"). */
  code: string;
  monsters: string[];
  attacks: MonsterAttack[];
}

export interface MonsterAttacksFile {
  families: MonsterAttackFamily[];
}

/** "game_task.ovl@0x1a0c60" -> ["game_task.ovl", 0x1a0c60]. */
function tableKey(table: string): [string, number] {
  const at = table.lastIndexOf("@");
  return [table.slice(0, at), Number.parseInt(table.slice(at + 3), 16)];
}

function attackOf(used: UsedRecord): MonsterAttack {
  const r = used.record;
  // Bits without a name are left out (`readAttackRecord` writes them as hex).
  const named = (list: string[]) => list.filter((name) => !name.startsWith("0x"));
  const elements = named(r.elements);
  const statuses = named(r.statuses);
  return {
    record: `${used.table}#${used.index}`,
    damage: r.damage,
    guard: r.guard,
    ...(elements.length ? { elements } : {}),
    ...(statuses.length ? { statuses, statusValue: r.statusValue } : {}),
    ...(r.stun ? { stun: r.stun } : {}),
  };
}

/** The families `families` names, in its order, each with its records in table order. */
export function emitMonsterAttacks(
  dump: AttackRawDump,
  families: AttackFamilies,
): MonsterAttacksFile {
  const usage = dump.usage;
  if (!usage) throw new Error("raw/attacks.json has no attack usage");
  return {
    families: Object.entries(families.families).flatMap(([code, monsters]) => {
      const used = usage.families[code];
      if (!used?.length) return [];
      const sorted = [...used].sort((a, b) => {
        const [fa, oa] = tableKey(a.table);
        const [fb, ob] = tableKey(b.table);
        return fa.localeCompare(fb) || oa - ob || a.index - b.index;
      });
      return [{ code, monsters, attacks: sorted.map(attackOf) }];
    }),
  };
}
