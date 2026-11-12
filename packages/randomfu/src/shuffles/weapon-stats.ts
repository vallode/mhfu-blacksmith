/**
 * Weapon stats: new attack, affinity and element or status values for every
 * weapon, written into its own record (`WepBMValues` / `WepGunValues`), so
 * they go with the weapon wherever the weapons shuffle puts it.
 *
 * Fields, as mhfu-extract's `tables/weapons.ts` reads them:
 *
 * - attack: u16, Blademaster +10, Gunner +8. The game shows it times the
 *   weapon type's class modifier (`WepClassMod`) / 100.
 * - affinity: s8 at +13 in both: the base value. For Blademaster weapons
 *   with positive affinity, mhfu-extract's `blademasterAffinity` adds up
 *   to 10 points by sharpness (`SharpnessAmount`, u8 at +9), from a
 *   correlation with the site's data. Bounds and the spread apply to that
 *   shown value, so crossing from 0% to positive can't add a hidden bonus.
 * - element value: u8, Blademaster +15, Gunner +18; status value: u8,
 *   Blademaster +17. Both are a tenth of what the game shows. Only weapons
 *   that already have an element or status change, and keep its kind. The
 *   dual-element weapons (`WepDualAttr`) are skipped by ID.
 *
 * Attack and element values are multiplied by a random factor within the
 * spread; affinity moves by up to the spread in points, in steps of 5. Each
 * is then kept within what weapons of the same type have from one rarity
 * below to one above (`Bounds`), on this disc, so a weapon stays plausible
 * for where it is in the game. A weapon with no other of its type (and, for
 * elements, of its kind) in that window is held only by the spread. Sharpness, slots, defense bonus, horn notes,
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
import { readDualAttributeWeapons } from "mhfu-extract/src/tables/dual-attributes.js";
import {
  CLASS_MODIFIER_KEYS,
  ELEMENT_NAMES,
  STATUS_NAMES,
  readModelToWeaponType,
  readWeaponClassModifiers,
  type WeaponTypeName,
} from "mhfu-extract/src/tables/weapons.js";
import { blademasterAffinity } from "mhfu-extract/src/emit/weapons.js";
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
  /** Offset of `SharpnessAmount` (u8), Blademaster only. */
  sharpnessAmount: number | null;
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
    sharpnessAmount: 9,
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
    sharpnessAmount: null,
  },
];

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
  attackField: Field;
  attack: number;
  affinity: number;
  /** Blademaster sharpness amount, for the shown affinity; null for Gunner weapons. */
  sharpnessAmount: number | null;
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

/** Every named weapon of a known type with an attack, in table order (Blademaster, then Gunner). */
export function collectWeaponStats(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): WeaponStats[] {
  const reader = new BinaryReader(eboot);
  const modelType = readModelToWeaponType(reader, resolver);
  const classMods = readWeaponClassModifiers(reader, resolver);
  // Their elements are in WepDualAttr; all-zero entries are padding.
  const dual = new Set(
    readDualAttributeWeapons(reader, resolver)
      .filter((d) => d.attributes.some((a) => a.flag !== 0))
      .map((d) => d.weaponId),
  );
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
      const isDual = layout.family === "Blademaster" && dual.has(index);
      if (isDual) {
        // Left alone: the game reads this weapon's elements from WepDualAttr.
      } else if (ELEMENT_NAMES[elementType]) {
        const field = layout.element.value;
        element = {
          kind: "element",
          name: ELEMENT_NAMES[elementType],
          field,
          value: read(reader, offset, field),
        };
      } else if (layout.status && STATUS_NAMES[statusType]) {
        const field = layout.status.value;
        element = {
          kind: "status",
          name: STATUS_NAMES[statusType],
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
        attackField: layout.attack,
        attack: read(reader, offset, layout.attack),
        affinity: read(reader, offset, AFFINITY),
        sharpnessAmount:
          layout.sharpnessAmount === null ? null : reader.u8(offset + layout.sharpnessAmount),
        element,
        classMod: classMods[CLASS_MODIFIER_KEYS[type]],
      });
    }
  }
  return out;
}

/**
 * The lowest and highest `value` among weapons of each type and rarity,
 * built once; `of(w)` merges `w`'s rarity with the ones either side. It's
 * null when no other weapon in that window has a value, so a lone weapon
 * is held only by the spread.
 */
class Bounds {
  private readonly groups = new Map<string, { lo: number; hi: number; n: number }>();

  constructor(
    weapons: readonly WeaponStats[],
    private readonly value: (w: WeaponStats) => number | null,
  ) {
    for (const w of weapons) {
      const v = value(w);
      if (v === null) continue;
      const key = `${w.type}:${w.rarity}`;
      const g = this.groups.get(key);
      if (g) {
        g.lo = Math.min(g.lo, v);
        g.hi = Math.max(g.hi, v);
        g.n++;
      } else this.groups.set(key, { lo: v, hi: v, n: 1 });
    }
  }

  of(w: WeaponStats): [number, number] | null {
    let lo = Infinity;
    let hi = -Infinity;
    let n = 0;
    for (const r of [w.rarity - 1, w.rarity, w.rarity + 1]) {
      const g = this.groups.get(`${w.type}:${r}`);
      if (!g) continue;
      lo = Math.min(lo, g.lo);
      hi = Math.max(hi, g.hi);
      n += g.n;
    }
    return n > 1 ? [lo, hi] : null;
  }
}

const clamp = (v: number, bounds: [number, number] | null) =>
  bounds ? Math.min(bounds[1], Math.max(bounds[0], v)) : v;

/** The affinity a weapon shows: base plus the Blademaster sharpness bonus. */
const shownAffinity = (w: WeaponStats, affinity: number) =>
  w.sharpnessAmount === null ? affinity : blademasterAffinity(affinity, w.sharpnessAmount);

/** Family, then type, then rarity as a number, so rarity 10 comes after 9. */
const FAMILY_ORDER = ["Blademaster", "Gunner"];
function compareWeapons(a: WeaponStats, b: WeaponStats): number {
  return (
    FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) ||
    TYPE_NAMES[a.type].localeCompare(TYPE_NAMES[b.type]) ||
    a.rarity - b.rarity
  );
}

export function randomizeWeaponStats(
  weapons: readonly WeaponStats[],
  spreads: WeaponStatSpreads,
  rngs: { attack: Rng; affinity: Rng; element: Rng },
  edits: Edits,
): ShuffleReport {
  const buf = edits.eboot();
  const attackBounds = new Bounds(weapons, (o) => o.attack);
  const affinityBounds = new Bounds(weapons, (o) => shownAffinity(o, o.affinity));
  const elementBounds = {
    element: new Bounds(weapons, (o) => (o.element?.kind === "element" ? o.element.value : null)),
    status: new Bounds(weapons, (o) => (o.element?.kind === "status" ? o.element.value : null)),
  };
  const shown = (w: WeaponStats, attack: number) =>
    w.classMod > 0 ? Math.round((attack * w.classMod) / 100) : attack;
  const factor = (spread: number, rng: Rng) => 1 - spread + rng.float() * 2 * spread;
  const changed: { w: WeaponStats; line: SpoilerLine }[] = [];

  // Every weapon draws from each stream whether or not the value can move,
  // so a weapon's roll depends only on the seed and its place in the table.
  for (const w of weapons) {
    const changes: string[] = [];
    if (spreads.attack !== null) {
      const roll = factor(spreads.attack, rngs.attack);
      const attack = clamp(Math.round(w.attack * roll), attackBounds.of(w));
      write(buf, w.offset, w.attackField, attack);
      if (attack !== w.attack) {
        changes.push(`attack ${shown(w, w.attack)} -> ${shown(w, attack)}`);
      }
    }
    if (spreads.affinity !== null) {
      const steps = Math.floor(spreads.affinity / AFFINITY_STEP);
      const roll = rngs.affinity.int(2 * steps + 1) - steps;
      // Bounds and spread apply to the shown affinity (sharpness bonus
      // included): step back toward the old value until it fits. The old
      // value always fits, so this ends.
      const bounds = affinityBounds.of(w);
      const was = shownAffinity(w, w.affinity);
      const fits = (base: number) => {
        const shown = shownAffinity(w, base);
        return (
          Math.abs(shown - was) <= steps * AFFINITY_STEP &&
          (!bounds || (shown >= bounds[0] && shown <= bounds[1]))
        );
      };
      let affinity = w.affinity + roll * AFFINITY_STEP;
      while (!fits(affinity)) affinity -= Math.sign(roll) * AFFINITY_STEP;
      write(buf, w.offset, AFFINITY, affinity);
      if (affinity !== w.affinity) {
        changes.push(`affinity ${was}% -> ${shownAffinity(w, affinity)}%`);
      }
    }
    if (spreads.element !== null) {
      const roll = factor(spreads.element, rngs.element);
      const element = w.element;
      if (element) {
        const bounds = elementBounds[element.kind].of(w);
        const value = clamp(Math.max(1, Math.round(element.value * roll)), bounds);
        write(buf, w.offset, element.field, value);
        if (value !== element.value) {
          changes.push(`${element.name} ${element.value * 10} -> ${value * 10}`);
        }
      }
    }
    if (changes.length > 0) {
      changed.push({
        w,
        line: {
          where: `${w.family}: ${TYPE_NAMES[w.type]}, rarity ${w.rarity + 1}`,
          text: `${w.name}: ${changes.join(", ")}`,
        },
      });
    }
  }

  // A stable sort keeps table order within each group.
  const lines = changed.sort((a, b) => compareWeapons(a.w, b.w)).map((c) => c.line);
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
      `Affinity moves by up to ${Math.floor(spreads.affinity / AFFINITY_STEP) * AFFINITY_STEP} points, in steps of ${AFFINITY_STEP}, as shown with the sharpness bonus the Blacksmith site adds to positive Blademaster affinity.`,
    );
  }
  if (spreads.element !== null) {
    notes.push(
      `Element and status values are ${pct(1 - spreads.element)} to ${pct(1 + spreads.element)} of what they were, in steps of 10. Weapons keep their element or status, and weapons with none stay without. The dual-element weapons keep theirs.`,
    );
  }
  notes.push(
    "Each value stays within what weapons of the same type have, from one rarity below to one above. A weapon with no other of its type (or element or status) in that window is limited by the spread alone.",
    "Sharpness, slots, defense bonus, horn notes, shelling, ammo, rarity and price don't change.",
    `${lines.length} weapons changed.`,
  );
  return { title: "Weapon stats", notes, lines };
}
