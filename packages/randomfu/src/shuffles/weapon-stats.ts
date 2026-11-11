/**
 * Weapon stats: new attack, affinity and element or status values for every
 * weapon, written into its own record (`WepBMValues` / `WepGunValues`), so
 * they go with the weapon wherever the weapons shuffle puts it.
 *
 * Fields, as mhfu-extract's `tables/weapons.ts` reads them:
 *
 * - attack: u16, Blademaster +10, Gunner +8. The game shows it times the
 *   weapon type's class modifier (`WepClassMod`) / 100.
 * - affinity: s8 at +13 in both: the base value. For some Blademaster
 *   weapons with positive affinity, mhfu-extract's `blademasterAffinity`
 *   adds up to 10 points by sharpness, from a correlation with the site's
 *   data; that isn't written here.
 * - element value: u8, Blademaster +15, Gunner +18; status value: u8,
 *   Blademaster +17. Both are a tenth of what the game shows. Only weapons
 *   that already have an element or status change, and keep its kind. The
 *   dual-element weapons keep theirs: those live in `WepDualAttr`.
 *
 * Attack and element values are multiplied by a random factor within the
 * spread; affinity moves by up to the spread in points, in steps of 5. Each
 * is then kept within what weapons of the same type have from one rarity
 * below to one above (`range`), on this disc, so a weapon stays plausible
 * for where it is in the game. Sharpness, slots, defense bonus, horn notes,
 * shelling, ammo, rarity and price never change.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import type { NameTable } from "mhfu-extract/src/strings/names.js";
import {
  TABLE_COUNTS,
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
  resolveTableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import {
  readModelToWeaponType,
  readWeaponClassModifiers,
  type WeaponClassModifiers,
  type WeaponTypeName,
} from "mhfu-extract/src/tables/weapons.js";
import type { Edits } from "../edits.js";
import { tableName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport, SpoilerLine } from "./shuffle.js";
import { TYPE_NAMES } from "./weapons.js";

/** A stat field in a weapon record: its offset in the record and how it's stored. */
interface Field {
  at: number;
  size: "u8" | "s8" | "u16";
}

interface Layout {
  family: "Blademaster" | "Gunner";
  table: "weaponsBlademaster" | "weaponsGunner";
  names: NameTable;
  size: number;
  count: number;
  attack: Field;
  /** Element type (u8) and value. */
  element: { type: number; value: Field };
  /** Status type (u8) and value, Blademaster only. */
  status: { type: number; value: Field } | null;
}

const AFFINITY: Field = { at: 13, size: "s8" };

const LAYOUTS: Layout[] = [
  {
    family: "Blademaster",
    table: "weaponsBlademaster",
    names: "WepBMID",
    size: WEAPON_BM_ENTRY_SIZE,
    count: TABLE_COUNTS.weaponsBlademaster,
    attack: { at: 10, size: "u16" },
    element: { type: 14, value: { at: 15, size: "u8" } },
    status: { type: 16, value: { at: 17, size: "u8" } },
  },
  {
    family: "Gunner",
    table: "weaponsGunner",
    names: "WepGunID",
    size: WEAPON_GUN_ENTRY_SIZE,
    count: TABLE_COUNTS.weaponsGunner,
    attack: { at: 8, size: "u16" },
    element: { type: 17, value: { at: 18, size: "u8" } },
    status: null,
  },
];

const ELEMENTS: Record<number, string> = {
  1: "Fire",
  2: "Water",
  3: "Thunder",
  4: "Dragon",
  5: "Ice",
};
const STATUSES: Record<number, string> = { 1: "Poison", 2: "Paralysis", 3: "Sleep" };

const CLASS_MOD: Record<WeaponTypeName, keyof WeaponClassModifiers> = {
  "great-sword": "greatSword",
  "long-sword": "longSword",
  "sword-and-shield": "swordAndShield",
  "dual-blades": "dualBlades",
  hammer: "hammer",
  "hunting-horn": "huntingHorn",
  lance: "lance",
  gunlance: "gunLance",
  "light-bowgun": "lightBowgun",
  "heavy-bowgun": "heavyBowgun",
  bow: "bow",
};

/** Affinity moves in steps of this many points, as the game's do. */
export const AFFINITY_STEP = 5;

export interface WeaponStatSpreads {
  /** Attack factor spread (0.2 = 80% to 120%), or null to leave attack alone. */
  attack: number | null;
  /** Points affinity can move, or null. */
  affinity: number | null;
  /** Element and status value factor spread, or null. */
  element: number | null;
}

/** One weapon's stats, as stored. */
export interface WeaponStats {
  family: Layout["family"];
  index: number;
  name: string;
  type: WeaponTypeName;
  /** Raw rarity (shown as rarity + 1). */
  rarity: number;
  /** EBOOT offset of the record. */
  offset: number;
  attack: number;
  affinity: number;
  /** The element or status the record has, if any: which field and its value. */
  element: { kind: "element" | "status"; name: string; field: Field; value: number } | null;
  classMod: number;
}

function read(reader: BinaryReader, at: number, field: Field): number {
  if (field.size === "u16") return reader.u16(at + field.at);
  return field.size === "s8" ? reader.s8(at + field.at) : reader.u8(at + field.at);
}

function write(buf: Buffer, at: number, field: Field, value: number): void {
  if (field.size === "u16") buf.writeUInt16LE(value, at + field.at);
  else if (field.size === "s8") buf.writeInt8(value, at + field.at);
  else buf.writeUInt8(value, at + field.at);
}

const LIMITS: Record<Field["size"], [number, number]> = {
  u8: [0, 0xff],
  s8: [-0x80, 0x7f],
  u16: [0, 0xffff],
};

/** Every named weapon of a known type with an attack, in table order (Blademaster, then Gunner). */
export function collectWeaponStats(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): WeaponStats[] {
  const reader = new BinaryReader(eboot);
  const modelType = readModelToWeaponType(reader, resolver);
  const classMods = readWeaponClassModifiers(reader, resolver);
  const out: WeaponStats[] = [];
  for (const layout of LAYOUTS) {
    const base = resolveTableOffset(layout.table, reader, resolver);
    for (let index = 1; index < layout.count; index++) {
      const name = tableName(layout.names, index);
      const offset = base + index * layout.size;
      const type = modelType[reader.u16(offset)] ?? null;
      // Records with no attack aren't real weapons (unused entries).
      if (!name || !type || read(reader, offset, layout.attack) === 0) continue;
      const elementType = reader.u8(offset + layout.element.type);
      const statusType = layout.status ? reader.u8(offset + layout.status.type) : 0;
      let element: WeaponStats["element"] = null;
      if (ELEMENTS[elementType]) {
        const field = layout.element.value;
        element = {
          kind: "element",
          name: ELEMENTS[elementType],
          field,
          value: read(reader, offset, field),
        };
      } else if (layout.status && STATUSES[statusType]) {
        const field = layout.status.value;
        element = {
          kind: "status",
          name: STATUSES[statusType],
          field,
          value: read(reader, offset, field),
        };
      }
      out.push({
        family: layout.family,
        index,
        name,
        type,
        rarity: reader.u8(offset + 2),
        offset,
        attack: read(reader, offset, layout.attack),
        affinity: read(reader, offset, AFFINITY),
        element,
        classMod: classMods[CLASS_MOD[type]],
      });
    }
  }
  return out;
}

/**
 * The lowest and highest `value` among weapons of `w`'s type within one
 * rarity of it (`w` included, so the range is never empty).
 */
function range(
  weapons: readonly WeaponStats[],
  w: WeaponStats,
  value: (other: WeaponStats) => number | null,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const other of weapons) {
    if (other.type !== w.type || Math.abs(other.rarity - w.rarity) > 1) continue;
    const v = value(other);
    if (v === null) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

export function randomizeWeaponStats(
  weapons: readonly WeaponStats[],
  spreads: WeaponStatSpreads,
  rngs: { attack: Rng; affinity: Rng; element: Rng },
  edits: Edits,
): ShuffleReport {
  const buf = edits.eboot();
  const layoutOf = (w: WeaponStats) => LAYOUTS.find((l) => l.family === w.family)!;
  const shown = (w: WeaponStats, attack: number) =>
    w.classMod > 0 ? Math.round((attack * w.classMod) / 100) : attack;
  const factor = (spread: number, rng: Rng) => 1 - spread + rng.float() * 2 * spread;
  const lines: SpoilerLine[] = [];

  // Every weapon draws from each stream whether or not the value can move,
  // so a weapon's roll depends only on the seed and its place in the table.
  for (const w of weapons) {
    const changes: string[] = [];
    if (spreads.attack !== null) {
      const field = layoutOf(w).attack;
      const bounds = range(weapons, w, (o) => o.attack);
      const roll = factor(spreads.attack, rngs.attack);
      const attack = clamp(clamp(Math.round(w.attack * roll), bounds), LIMITS[field.size]);
      write(buf, w.offset, field, attack);
      if (attack !== w.attack) {
        changes.push(`attack ${shown(w, w.attack)} -> ${shown(w, attack)}`);
      }
    }
    if (spreads.affinity !== null) {
      const steps = Math.floor(spreads.affinity / AFFINITY_STEP);
      const roll = rngs.affinity.int(2 * steps + 1) - steps;
      const bounds = range(weapons, w, (o) => o.affinity);
      const affinity = clamp(w.affinity + roll * AFFINITY_STEP, bounds);
      write(buf, w.offset, AFFINITY, affinity);
      if (affinity !== w.affinity) {
        changes.push(`affinity ${w.affinity}% -> ${affinity}%`);
      }
    }
    if (spreads.element !== null) {
      const roll = factor(spreads.element, rngs.element);
      const element = w.element;
      if (element) {
        const bounds = range(weapons, w, (o) =>
          o.element?.kind === element.kind ? o.element.value : null,
        );
        const value = clamp(Math.max(1, Math.round(element.value * roll)), bounds);
        write(buf, w.offset, element.field, value);
        if (value !== element.value) {
          changes.push(`${element.name} ${element.value * 10} -> ${value * 10}`);
        }
      }
    }
    if (changes.length > 0) {
      lines.push({
        where: `${w.family}: ${TYPE_NAMES[w.type]}, rarity ${w.rarity + 1}`,
        text: `${w.name}: ${changes.join(", ")}`,
      });
    }
  }

  lines.sort((a, b) => a.where.localeCompare(b.where));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const notes = [
    "Each weapon's own stats, so they go with it wherever the weapons shuffle puts it.",
  ];
  if (spreads.attack !== null) {
    notes.push(
      `Attack is ${pct(1 - spreads.attack)} to ${pct(1 + spreads.attack)} of what it was, as the game shows it.`,
    );
  }
  if (spreads.affinity !== null) {
    notes.push(
      `Affinity moves by up to ${Math.floor(spreads.affinity / AFFINITY_STEP) * AFFINITY_STEP} points, in steps of ${AFFINITY_STEP}. This is the base affinity: for some Blademaster weapons with positive affinity, the Blacksmith site lists up to 10 points more.`,
    );
  }
  if (spreads.element !== null) {
    notes.push(
      `Element and status values are ${pct(1 - spreads.element)} to ${pct(1 + spreads.element)} of what they were, in steps of 10. Weapons keep their element or status, and weapons with none stay without. The dual-element weapons keep theirs.`,
    );
  }
  notes.push(
    "Each value stays within what weapons of the same type have, from one rarity below to one above.",
    "Sharpness, slots, defense bonus, horn notes, shelling, ammo, rarity and price don't change.",
    `${lines.length} weapons changed.`,
  );
  return { title: "Weapon stats", notes, lines };
}
