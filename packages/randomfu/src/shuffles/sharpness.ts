/**
 * Blademaster sharpness: which bar each weapon has, and (in "new" mode)
 * the bars themselves.
 *
 * A weapon's bar comes from two bytes in its record (`WepBMValues`):
 * `SharpnessID` (u8 at +8) picks a curve from its weapon type's run of
 * `SharpnessTable` entries, and `SharpnessAmount` (u8 at +9) how much of
 * that curve it shows, `50 * (amount + 3)` raw units (one notch more with
 * Sharpness+1). A curve is 7 cumulative u16 thresholds, red to purple,
 * ending at 450 on the EU and JP discs (mhfu-extract's `tables/sharpness.ts`
 * and `emitSharpness`). Types share runs: Great Sword and Long Sword,
 * Hammer and Hunting Horn, Lance and Gunlance; Sword and Shield and Dual
 * Blades have their own.
 *
 * - shuffle: weapons of the same type and rarity trade (ID, amount) pairs.
 *   An ID means the same curve for every weapon of a type, so each weapon
 *   gets a bar another of its kind had.
 * - new: the same, and every curve those IDs pick is rewritten: six random
 *   cuts, in steps of 10, of the curve's own length. The amounts keep each
 *   bar's length tied to rarity; the colors along it are anyone's.
 *
 * The record moves with the weapon, so a weapon's sharpness goes with it
 * wherever the weapons shuffle puts it. The Blacksmith site's affinity
 * bonus is by amount (`blademasterAffinity`), so a line also gives the
 * affinity shown when the new amount changes it; the weapon stats read the
 * edited records after this, and bound the affinity shown with the new bar.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { blademasterAffinity, emitSharpness } from "mhfu-extract/src/emit/weapons.js";
import {
  SHARPNESS_COLORS,
  readSharpnessTables,
  type SharpnessEntry,
} from "mhfu-extract/src/tables/sharpness.js";
import {
  SHARPNESS_ENTRY_SIZE,
  TABLE_COUNTS,
  resolveTableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import { WEAPON_TYPE_NAMES } from "mhfu-extract/src/tables/weapons.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport, SpoilerLine } from "./shuffle.js";
import { collectWeaponStats, compareWeapons, type WeaponStats } from "./weapon-stats.js";
import { TYPE_NAMES } from "./weapons.js";

export type SharpnessMode = "shuffle" | "new";

const ID_AT = 8;
const AMOUNT_AT = 9;
/** Thresholds are multiples of this, as the game's are. */
const STEP = 10;
/** A curve's length when its entry has none (an empty table). */
const DEFAULT_LENGTH = 450;

interface Blade {
  w: WeaponStats;
  id: number;
  amount: number;
  /** File offset of the curve `id` picks for this weapon's type. */
  curveAt(id: number): number;
}

const readCurve = (reader: BinaryReader, at: number): number[] =>
  SHARPNESS_COLORS.map((_, c) => reader.u16(at + c * 2));

const asEntry = (curve: number[]): SharpnessEntry => ({
  index: 0,
  cumulative: Object.fromEntries(
    SHARPNESS_COLORS.map((c, k) => [c, curve[k]!]),
  ) as SharpnessEntry["cumulative"],
});

/** A bar as the game shows it: each color's width, initial first (`R8 O3 Y11`). */
function describe(curve: number[], amount: number): string {
  return emitSharpness(asEntry(curve), amount)
    .sharpness.map((width, k) =>
      width > 0 ? `${SHARPNESS_COLORS[k]![0]!.toUpperCase()}${width}` : "",
    )
    .filter(Boolean)
    .join(" ");
}

/** A new cumulative curve of `length`: six sorted cuts in steps of `STEP`, then the end. */
function newCurve(length: number, rng: Rng): number[] {
  const places = Math.max(1, Math.floor(length / STEP) - 1);
  const cuts = Array.from(
    { length: SHARPNESS_COLORS.length - 1 },
    () => (rng.int(places) + 1) * STEP,
  );
  return [...cuts.sort((a, b) => a - b), length];
}

/** The weapon stats' Blademaster weapons whose type's run is in the EBOOT, in table order. */
function collectBlades(eboot: Buffer, resolver: TableAddressResolver | undefined): Blade[] {
  const reader = new BinaryReader(eboot);
  const tables = readSharpnessTables(reader, resolver);
  const out: Blade[] = [];
  for (const w of collectWeaponStats(eboot, resolver)) {
    if (w.family !== "Blademaster") continue;
    const pointer = tables.pointers[WEAPON_TYPE_NAMES.indexOf(w.type)];
    // A type whose run isn't in the EBOOT can't be read or written.
    if (pointer && !pointer.valid) continue;
    const start = pointer?.offset ?? tables.tableOffset;
    out.push({
      w,
      id: reader.u8(w.offset + ID_AT),
      amount: reader.u8(w.offset + AMOUNT_AT),
      curveAt: (id) => start + id * SHARPNESS_ENTRY_SIZE,
    });
  }
  return out;
}

export function randomizeSharpness(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  mode: SharpnessMode,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const reader = new BinaryReader(eboot);
  const tableStart = resolveTableOffset("sharpnessTable", reader, resolver);
  const tableEnd = tableStart + TABLE_COUNTS.sharpnessEntries * SHARPNESS_ENTRY_SIZE;
  const blades = collectBlades(eboot, resolver);
  const buf = edits.eboot();

  // Weapons of a type and rarity trade their (ID, amount) pairs.
  const groups = new Map<string, Blade[]>();
  for (const b of blades) {
    const key = `${b.w.type}:${b.w.rarity}`;
    const group = groups.get(key);
    if (group) group.push(b);
    else groups.set(key, [b]);
  }
  const pairRng = rng.fork("pairs");
  const now = new Map<Blade, { id: number; amount: number }>();
  for (const group of groups.values()) {
    const pairs = pairRng.shuffle(group.map(({ id, amount }) => ({ id, amount })));
    group.forEach((b, k) => now.set(b, pairs[k]!));
  }

  // New curves for every entry a weapon now picks, each written once
  // (types that share a run share its curves).
  const curves = new Map<number, number[]>();
  const curveRng = rng.fork("curves");
  if (mode === "new") {
    const used = [...new Set(blades.map((b) => b.curveAt(now.get(b)!.id)))].sort((a, b) => a - b);
    for (const at of used) {
      if (at < tableStart || at + SHARPNESS_ENTRY_SIZE > tableEnd) continue;
      const length = readCurve(reader, at).at(-1) || DEFAULT_LENGTH;
      const curve = newCurve(length, curveRng);
      curve.forEach((v, c) => buf.writeUInt16LE(v, at + c * 2));
      curves.set(at, curve);
    }
  }

  const lines: { w: WeaponStats; line: SpoilerLine }[] = [];
  for (const b of blades) {
    const { w } = b;
    const { id, amount } = now.get(b)!;
    buf.writeUInt8(id, w.offset + ID_AT);
    buf.writeUInt8(amount, w.offset + AMOUNT_AT);
    const was = describe(readCurve(reader, b.curveAt(b.id)), b.amount);
    const at = b.curveAt(id);
    const is = describe(curves.get(at) ?? readCurve(reader, at), amount);
    if (was === is) continue;
    const affinityWas = blademasterAffinity(w.affinity, b.amount);
    const affinityIs = blademasterAffinity(w.affinity, amount);
    const affinity =
      affinityWas === affinityIs ? "" : `, affinity ${affinityWas}% -> ${affinityIs}%`;
    lines.push({
      w,
      line: {
        where: `Blademaster: ${TYPE_NAMES[w.type]}, rarity ${w.rarity + 1}`,
        text: `${w.name}: ${was} -> ${is}${affinity}`,
      },
    });
  }

  // A stable sort keeps table order within each group.
  lines.sort((x, y) => compareWeapons(x.w, y.w));
  const notes = [
    "Blademaster sharpness, without Sharpness+1, as each color's width: Red, Orange, Yellow, Green, Blue, White, Purple. It goes with the weapon wherever the weapons shuffle puts it.",
    "Weapons of the same type and rarity trade sharpness, so each bar is one a weapon of its kind had, and bar lengths stay as they were for each rarity.",
    "Where a weapon's new bar length changes the sharpness bonus the Blacksmith site adds to positive affinity, the line gives its affinity as shown before and after (before any affinity randomizing).",
  ];
  if (mode === "new") {
    notes.push(
      `Every sharpness bar's colors are new: each color takes a random share of the bar, so any weapon can have any color, purple included, at any rarity. Bars still end where they did. ${curves.size} curves rewritten.`,
    );
  }
  notes.push(`${lines.length} weapons changed.`);
  return { title: "Weapon sharpness", notes, lines: lines.map((l) => l.line) };
}
