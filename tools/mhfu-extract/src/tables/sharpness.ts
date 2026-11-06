/**
 * Sharpness table reader, transcribed from `SharpnessTable`/`WeaponSharpness`
 * in vendor/mhp2g-patterns/patterns/eboot.hexpat — MIT, see ../../NOTICE.md.
 *
 * Each of the 7 named fields is a *cumulative* threshold, not a step width
 * (see the pattern's own field names, e.g. `Orange` is labelled
 * `this - Red`) — callers wanting per-color pixel/step widths must take
 * consecutive differences themselves; we deliberately keep the raw
 * cumulative values here since that's the literal on-disk layout.
 */
import { BinaryReader } from "../binary/reader.js";
import { SHARPNESS_ENTRY_SIZE, TABLE_COUNTS, resolveTableOffset } from "./offsets.js";
import type { TableAddressResolver } from "./resolver.js";

export const SHARPNESS_COLORS = ["red", "orange", "yellow", "green", "blue", "white", "purple"] as const;
export type SharpnessColor = (typeof SHARPNESS_COLORS)[number];

export interface SharpnessEntry {
  /** Index into the sharpness table — this is WepBMValue.sharpnessId. */
  index: number;
  /** Cumulative thresholds, in ascending color order (see SHARPNESS_COLORS). */
  cumulative: Record<SharpnessColor, number>;
}

/**
 * SharpnessTable.Sharpness[40] @ 0x08976508 — 14 bytes/entry (7x u16).
 * `resolver` defaults to JP's static table — pass e.g. `MHP2G_EU_RESOLVER`
 * (games/mhp2g.ts) to read from a different region.
 */
export function readSharpnessTable(reader: BinaryReader, resolver?: TableAddressResolver): SharpnessEntry[] {
  const base = resolveTableOffset("sharpnessTable", reader, resolver);
  const out: SharpnessEntry[] = [];
  for (let i = 0; i < TABLE_COUNTS.sharpnessEntries; i++) {
    const off = base + i * SHARPNESS_ENTRY_SIZE;
    const cumulative = {} as Record<SharpnessColor, number>;
    for (let c = 0; c < SHARPNESS_COLORS.length; c++) {
      cumulative[SHARPNESS_COLORS[c]!] = reader.u16(off + c * 2);
    }
    out.push({ index: i, cumulative });
  }
  return out;
}

/** Converts cumulative thresholds into per-color step widths (pixel/hit counts). */
export function sharpnessStepWidths(entry: SharpnessEntry): Record<SharpnessColor, number> {
  const widths = {} as Record<SharpnessColor, number>;
  let previous = 0;
  for (const color of SHARPNESS_COLORS) {
    const cumulative = entry.cumulative[color];
    widths[color] = cumulative - previous;
    previous = cumulative;
  }
  return widths;
}
