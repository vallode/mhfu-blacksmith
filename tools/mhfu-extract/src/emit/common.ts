/**
 * Shared derived-value transforms used across every emit/*.ts module —
 * turning raw disc bytes into the display-ready values `data/*.json`
 * expects. Each transform's derivation is documented at its definition;
 * see also `tools/mhfu-extract/README.md`'s "Derived values" section for
 * the consolidated writeup with the real-EBOOT evidence.
 */
import type { CraftMaterial, EquipCreateEntry } from "../tables/recipes.js";
import type { NameResolver } from "../strings/names.js";
import { resolveMaterialStyle } from "../overlay/materials.js";

export type Rank = "low-rank" | "high-rank" | "g-rank";

/**
 * `data/`'s `rank` field from a piece's *display* rarity (post `+1`, see
 * `displayRarity()`). Breakpoints confirmed against every rarity value
 * actually used in the committed `data/armor/*.json`: rarity 1-5 is always
 * "low-rank", 6-8 "high-rank", 9-10 "g-rank", with no exceptions.
 */
export function rankFromRarity(displayRarity: number): Rank {
  if (displayRarity <= 5) return "low-rank";
  if (displayRarity <= 8) return "high-rank";
  return "g-rank";
}

/**
 * Raw `rarity` bytes are 0-based (the dummy/"None" slot at index 0 in every
 * equipment table has `rarity=0`); `data/`'s schema requires `rarity >= 1`.
 * Confirmed against real weapon data: raw rarity 5 -> committed rarity 6,
 * raw 0 -> committed 1, etc., with zero exceptions across 20 spot-checked
 * great swords.
 */
export function displayRarity(rawRarity: number): number {
  return rawRarity + 1;
}

/**
 * `data/`'s `create_cost`/`improve_cost` (the zenny cost to craft/upgrade)
 * is exactly half of the equipment struct's own `price` field (the
 * *sell* price) — confirmed against real armor data across four different
 * head pieces (Leather Helm 300->150, Chain Helm 600->300, Hunter's
 * Helm/Cap both 900->450), with no exceptions. Rounds in case of odd raw
 * prices (none observed in practice, but `price` is read as an unsigned
 * int so this keeps output always integral).
 */
export function halveCost(price: number): number {
  return Math.round(price / 2);
}

export interface EmittedMaterial {
  name: string;
  amount: number;
  type: string;
  color: string;
}

/**
 * Resolves one `CraftMaterial` (itemId + quantity) to the `data/` material
 * shape, or `null` for an unused craft slot (`itemId === 0` — every
 * `EquipCreate`/`EquipUpgrade` craft list is a fixed-size array with unused
 * trailing slots zeroed, not a length-prefixed list).
 */
export function resolveMaterial(material: CraftMaterial, names: NameResolver): EmittedMaterial | null {
  if (material.itemId === 0 || material.quantity === 0) return null;
  const name = names.resolve("ItemID", material.itemId);
  if (!name) return null;
  const style = resolveMaterialStyle(name);
  return { name, amount: material.quantity, type: style.type, color: style.color };
}

/** Resolves a fixed-size `CraftMaterial[]` (from readCraftItems), dropping unused slots. */
export function resolveMaterials(materials: CraftMaterial[], names: NameResolver): EmittedMaterial[] {
  const out: EmittedMaterial[] = [];
  for (const m of materials) {
    const resolved = resolveMaterial(m, names);
    if (resolved) out.push(resolved);
  }
  return out;
}

/** `data/`'s material array fields are `null`, not `[]`, when there's nothing to craft with. */
export function materialsOrNull(materials: EmittedMaterial[]): EmittedMaterial[] | null {
  return materials.length > 0 ? materials : null;
}

/** Formats a signed skill point value the way `data/` displays it (e.g. `+3`, `-1`, `+0`). */
export function formatSignedAmount(amount: number): string {
  return amount >= 0 ? `+${amount}` : `${amount}`;
}

/**
 * Groups an `EquipCreate` section by its own `equipId` field, which is the
 * *real* absolute name-table index for what it crafts (confirmed against
 * real decoration data — `EquipCreate.decoration[i].equipId` is directly an
 * `ItemID` index, e.g. `equipId=948` -> `ItemID[948]` = "Paralysis Jewel",
 * matching `DecorationValues[0]` = `ItemID[0 + 948]`). This is needed
 * because an `EquipCreate` section's own array position does **not** line
 * up 1:1 with its corresponding stat table's position/order — only
 * `equipId` reliably identifies which stat entry a craft recipe belongs to.
 *
 * A handful of items have *two* `EquipCreate` entries sharing one
 * `equipId` (confirmed against real decoration data: 24 duplicated
 * `equipId`s, closely matching the ~22 decorations `data/decorations.json`
 * already lists an `alternative_create_mats` for) — an alternate recipe.
 * Callers should treat entries[0] as the primary recipe and entries[1] (if
 * present) as the alternative.
 */
export function groupEquipCreateByEquipId(entries: EquipCreateEntry[]): Map<number, EquipCreateEntry[]> {
  const byEquipId = new Map<number, EquipCreateEntry[]>();
  for (const entry of entries) {
    const group = byEquipId.get(entry.equipId);
    if (group) group.push(entry);
    else byEquipId.set(entry.equipId, [entry]);
  }
  return byEquipId;
}
