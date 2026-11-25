/**
 * A hunter's registered equipment sets (src/lib/save-store.ts's
 * SaveEquipmentSet) turned into the set builder's data: armor pieces and
 * decorations looked up by the game's IDs, and the weapon that was registered.
 * Pure, so the Save file tab and the tests share it.
 */
import { ARMOR_SLOTS, type ArmorSlot } from "./constants";
import { resolveEquip, type ResolvedEquip } from "./equipment-ref";
import type { EquipSlot, SaveEquipmentSet } from "./save-store";
import type { EquipmentIds } from "./schema";
import type { CodecTables } from "./set-codec";
import type { BuildSet } from "./set-build";
import type { DecoBin, Piece, PlacedDeco } from "./set-search";
import { slugify } from "./slug";

/** The weapon a save set registered, looked up. Its slots come from its bundle. */
export interface SaveSetWeapon {
  equip: EquipSlot;
  ref: ResolvedEquip;
  /** The weapon's page slug, to load its bundle (client-data's useWeaponOrNull). */
  slug: string;
}

/** A registered set, looked up. */
export interface ResolvedSaveSet {
  /** The in-game registration number, 1-20; gaps are deleted registrations. */
  number: number;
  weapon: SaveSetWeapon | null;
  /** Pieces in ARMOR_SLOTS order; null where the registration has none. */
  armor: (Piece | null)[];
  decorations: PlacedDeco[];
  /** Equipment the site can't place, left out of the stats. */
  unknown: SaveSetUnknown[];
}

export type SaveSetUnknown =
  | { kind: "weapon"; gameId: number; type: number }
  | { kind: "armor"; slot: ArmorSlot; gameId: number }
  | { kind: "decoration"; itemId: number; bin: DecoBin };

/**
 * Look up a save set's equipment. IDs with no page on the site are listed in
 * `unknown` and left out, so the set still shows what does resolve.
 */
export function resolveSaveSet(
  set: SaveEquipmentSet,
  ids: EquipmentIds,
  tables: CodecTables,
): ResolvedSaveSet {
  const unknown: SaveSetUnknown[] = [];
  let weapon: SaveSetWeapon | null = null;
  if (set.weapon) {
    const ref = resolveEquip(ids, set.weapon);
    if (ref && (set.weapon.type === 5 || set.weapon.type === 6)) {
      weapon = { equip: set.weapon, ref, slug: slugify(ref.name) };
    } else {
      unknown.push({ kind: "weapon", gameId: set.weapon.id, type: set.weapon.type });
    }
  }

  const armor = ARMOR_SLOTS.map((slot, i) => {
    const equip = set.armor[i];
    if (!equip) return null;
    const piece = tables.pieceByGameId.get(`${slot}:${equip.id}`);
    if (!piece) unknown.push({ kind: "armor", slot, gameId: equip.id });
    return piece ?? null;
  });

  const decorations: PlacedDeco[] = [];
  const addDecorations = (equip: EquipSlot | null, bin: DecoBin) => {
    for (const itemId of equip?.decorations ?? []) {
      const deco = tables.decoByItemId.get(itemId);
      if (deco) decorations.push({ deco, bin });
      else unknown.push({ kind: "decoration", itemId, bin });
    }
  };
  // A weapon or armor slot with no page can't say how many slots hold its
  // decorations, so those are unknown too rather than counted in an empty bin.
  if (weapon) addDecorations(weapon.equip, "weapon");
  else {
    for (const itemId of set.weapon?.decorations ?? []) {
      unknown.push({ kind: "decoration", itemId, bin: "weapon" });
    }
  }
  ARMOR_SLOTS.forEach((slot, i) => {
    if (armor[i]) addDecorations(set.armor[i], slot);
    else {
      for (const itemId of set.armor[i]?.decorations ?? []) {
        unknown.push({ kind: "decoration", itemId, bin: slot });
      }
    }
  });

  return { number: set.number, weapon, armor, decorations, unknown };
}

/** A resolved save set as a BuildSet, once its weapon's slots are known. */
export function buildFromSaveSet(
  set: ResolvedSaveSet,
  weaponSlots: number,
  hunterType: BuildSet["hunterType"],
  sex: BuildSet["sex"],
): BuildSet {
  return {
    pieces: set.armor,
    decorations: set.decorations,
    weaponSlots,
    hunterType,
    sex,
  };
}
