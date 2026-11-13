/**
 * The smithy's store (`mhfu-extract/src/shops/equipment.ts`, in
 * `lobby_task.ovl`): the weapons and armor it sells outright. It follows the
 * weapons and armor shuffles: where it sold a weapon or piece, it sells the
 * one now in that one's place in the smithy. The shuffles call `followStore`
 * with their substitution; `storeReport` lists what changed, in a report of
 * its own so the shuffles' reports count only their places.
 */
import {
  findEquipmentStore,
  storeEntries,
  type EquipmentEntry,
} from "mhfu-extract/src/shops/equipment.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { ShuffleReport, SpoilerLine } from "./shuffle.js";

export interface SmithyStore {
  lobby: LoadedOverlay;
  /** Every entry once (lists the store's table repeats are counted once). */
  entries: EquipmentEntry[];
  /** Spoiler lines, as the shuffles add them. */
  lines: SpoilerLine[];
}

/** The store in `lobby`, or null when there's none. */
export function findSmithyStore(lobby: LoadedOverlay): SmithyStore | null {
  const data = findEquipmentStore(lobby.ovl);
  return data ? { lobby, entries: storeEntries(data), lines: [] } : null;
}

/**
 * Rewrites the store's entries of `category` to `map(id)`, the one now in
 * that ID's place, with one spoiler line per ID under `where`.
 */
export function followStore(
  store: SmithyStore,
  category: number,
  map: (id: number) => number,
  name: (id: number) => string,
  where: string,
  edits: Edits,
): void {
  const out = edits.overlay(store.lobby);
  const listed = new Set<number>();
  for (const entry of store.entries) {
    if (entry.category !== category) continue;
    const now = map(entry.id);
    out.writeUInt16LE(now, entry.at + 2);
    if (listed.has(entry.id)) continue;
    listed.add(entry.id);
    store.lines.push({
      where,
      text:
        now === entry.id ? `${name(entry.id)} (unchanged)` : `${name(entry.id)} -> ${name(now)}`,
    });
  }
}

export function storeReport(store: SmithyStore | null): ShuffleReport {
  return {
    title: "Smithy store",
    notes: store
      ? [
          "The store follows the weapon and armor shuffles: where it sold a weapon or piece, it sells the one now in that one's place in the smithy (the same rarity, and type or slot), at the new one's own price.",
          "Anything it sells that the shuffles leave alone stays.",
        ]
      : ["The smithy's store wasn't found on this disc, so it sells the same equipment as before."],
    lines: store?.lines ?? [],
  };
}
