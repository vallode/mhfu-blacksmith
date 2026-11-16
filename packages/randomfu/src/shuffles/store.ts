/**
 * Equipment the game hands out outside the smithy's create entries, which
 * follows the weapons and armor shuffles: where it had a weapon or piece,
 * it has the one now in that one's place in the smithy.
 *
 * - The smithy's store (`mhfu-extract/src/shops/equipment.ts`, in
 *   `lobby_task.ovl`): the weapons and armor it sells outright.
 * - A new hunter's equipment box (`mhfu-extract/src/shops/starter.ts`, in
 *   `edit_task.ovl`): the starting weapons are the ones the smithy's first
 *   create entries make, so following the shuffle gives what those entries
 *   make now.
 *
 * The shuffles call `followGear` with their substitution; `gearReport`
 * lists what changed, in a report of its own so the shuffles' reports count
 * only their places.
 */
import { findEquipmentStore, storeEntries } from "mhfu-extract/src/shops/equipment.js";
import { findStarterGear } from "mhfu-extract/src/shops/starter.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { ShuffleReport, SpoilerLine } from "./shuffle.js";

export type GearTitle = "Smithy store" | "Starting equipment";

export interface GearEntry {
  /** File offset of the entry's ID, a u16. */
  idAt: number;
  category: number;
  id: number;
  /** Worn from the start (the starting box only). */
  worn?: boolean;
}

export interface GearList {
  /** The spoiler section's title. */
  title: GearTitle;
  overlay: LoadedOverlay;
  entries: GearEntry[];
  /** IDs must be below this to fit where they're written. */
  maxId: number;
  /** Spoiler lines, as the shuffles add them. */
  lines: SpoilerLine[];
}

/** The smithy's store in `lobby`, or null when there's none. */
export function findSmithyStore(lobby: LoadedOverlay): GearList | null {
  const data = findEquipmentStore(lobby.ovl);
  if (!data) return null;
  // Every entry once (lists the store's table repeats are counted once).
  const entries = storeEntries(data).map(({ at, category, id }) => ({
    idAt: at + 2,
    category,
    id,
  }));
  return { title: "Smithy store", overlay: lobby, entries, maxId: 0x10000, lines: [] };
}

/** A new hunter's equipment box in `edit`, or null when it isn't found (or there's no `edit`). */
export function findStarterBox(edit: LoadedOverlay | null): GearList | null {
  const data = edit && findStarterGear(edit.ovl);
  if (!edit || !data) return null;
  const entries = data.entries.map(({ at, category, id, worn }) => ({
    idAt: at,
    category,
    id,
    worn,
  }));
  // The IDs are sign-extended `addiu` immediates.
  return { title: "Starting equipment", overlay: edit, entries, maxId: 0x8000, lines: [] };
}

/**
 * Rewrites each list's entries of `category` to `map(id)`, the one now in
 * that ID's place, with one spoiler line per ID under `where`. Throws,
 * before writing anything to that list, when a new ID doesn't fit.
 */
export function followGear(
  lists: GearList[],
  category: number,
  map: (id: number) => number,
  name: (id: number) => string,
  where: string,
  edits: Edits,
): void {
  for (const list of lists) {
    const entries = list.entries.filter((e) => e.category === category);
    if (entries.length === 0) continue;
    const now = entries.map((e) => map(e.id));
    const tooBig = now.find((id) => id >= list.maxId);
    if (tooBig !== undefined) throw new Error(`${list.title}: ID ${tooBig} doesn't fit`);
    // Copied only when an ID changes, so an unchanged list leaves its file alone.
    const out = now.some((id, k) => id !== entries[k]!.id) ? edits.overlay(list.overlay) : null;
    const listed = new Set<number>();
    entries.forEach((entry, k) => {
      out?.writeUInt16LE(now[k]!, entry.idAt);
      if (listed.has(entry.id)) return;
      listed.add(entry.id);
      const worn = entries.some((e) => e.id === entry.id && e.worn) ? " (worn)" : "";
      list.lines.push({
        where,
        text:
          now[k] === entry.id
            ? `${name(entry.id)} (unchanged)${worn}`
            : `${name(entry.id)} -> ${name(now[k]!)}${worn}`,
      });
    });
  }
}

const NOTES: Record<GearTitle, { found: string[]; missing: string }> = {
  "Smithy store": {
    found: [
      "The store follows the weapon and armor shuffles: where it sold a weapon or piece, it sells the one now in that one's place in the smithy (the same rarity, and type or slot), at the new one's own price.",
      "Anything it sells that the shuffles leave alone stays.",
    ],
    missing:
      "The smithy's store wasn't found on this disc, so it sells the same equipment as before.",
  },
  "Starting equipment": {
    found: [
      "A new hunter's equipment box follows the weapon and armor shuffles: where it gave a weapon or piece, it gives the one now in that one's place in the smithy, so you start with what the smithy's first places make now.",
      "Lines marked (worn) are worn from the start, and so are their replacements.",
      "A hunter made on this image starts with it. One run of these also gives the Mafumofu pieces to a save that hasn't had them (by a save flag); when that runs for an existing save isn't known.",
    ],
    missing:
      "A new hunter's equipment wasn't found on this disc, so a new hunter starts with the same equipment as before.",
  },
};

/** The spoiler section for the list titled `title`, or for its absence when `list` is null. */
export function gearReport(title: GearTitle, list: GearList | null): ShuffleReport {
  const notes = NOTES[title];
  return {
    title,
    notes: list ? notes.found : [notes.missing],
    lines: list?.lines ?? [],
  };
}
