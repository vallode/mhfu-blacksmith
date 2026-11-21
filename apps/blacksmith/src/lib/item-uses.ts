/**
 * What an item is used for: the weapons, armor and decorations whose recipes
 * take it, indexed by in-game item ID. scripts/generate-data.ts builds it
 * from the gear data (`buildItemUses`, `encodeItemUses`) into
 * item-uses.json, so the item pages don't need every gear bundle; they read
 * it back with `decodeItemUses`.
 */
import {
  ARMOR_RANKS,
  ARMOR_SLOTS,
  WEAPON_TYPES,
  type ArmorRank,
  type ArmorSlot,
  type WeaponType,
} from "./constants";
import { weaponHref } from "./equipment-ref";
import type { Material } from "./types";

/** Which recipe takes the item: forging outright, the upgrade, or the second recipe. */
export type UseRecipe = "create" | "improve" | "alt";
const RECIPES: UseRecipe[] = ["create", "improve", "alt"];

interface UseBase {
  name: string;
  href: string;
  rarity?: number;
  color?: string;
  recipe: UseRecipe;
  /** How many of the item the recipe takes */
  amount: number;
}

export type ItemUse =
  | (UseBase & {
      kind: "weapon";
      type: WeaponType;
      /** The weapon an upgrade starts from */
      from?: string;
    })
  | (UseBase & { kind: "armor"; slot: ArmorSlot; rank: ArmorRank })
  | (UseBase & { kind: "decoration" });

/** A piece of gear with its recipes, as `buildItemUses` reads it. */
interface GearRecipes {
  name: string;
  slug: string;
  rarity?: number | string | null;
  color?: string | null;
  create_mats?: Material[] | null;
  alternative_create_mats?: Material[] | null;
}

export interface UseGear {
  weapons: {
    type: WeaponType;
    items: (GearRecipes & { improve_mats?: Material[] | null })[];
  }[];
  armor: { slot: ArmorSlot; rank: ArmorRank; items: GearRecipes[] }[];
  decorations: GearRecipes[];
  /** Each weapon's tree parent, by name: an upgrade recipe counts only where it has one */
  parents: Map<string, string>;
}

const amountOf = (m: Material) => Number(m.amount) || 1;

/** The gear's rarity and icon colour, each only where it has one. */
function looks(g: GearRecipes): { rarity?: number; color?: string } {
  const rarity = Number(g.rarity);
  return { ...(rarity > 0 && { rarity }), ...(g.color && { color: g.color }) };
}

/** Every item's uses, by item ID, in `sortUses` order. */
export function buildItemUses(
  gear: UseGear,
  itemId: (name: string) => number | undefined,
): Map<number, ItemUse[]> {
  const out = new Map<number, ItemUse[]>();
  const add = (mats: Material[] | null | undefined, make: (amount: number) => ItemUse) => {
    for (const m of mats ?? []) {
      const id = itemId(m.name);
      if (id === undefined) continue;
      const list = out.get(id) ?? [];
      list.push(make(amountOf(m)));
      out.set(id, list);
    }
  };

  for (const { type, items } of gear.weapons) {
    for (const w of items) {
      const base = {
        kind: "weapon" as const,
        type,
        name: w.name,
        href: weaponHref(type, w.slug),
        ...looks(w),
      };
      const from = gear.parents.get(w.name);
      if (from) add(w.improve_mats, (amount) => ({ ...base, recipe: "improve", from, amount }));
      add(w.create_mats, (amount) => ({ ...base, recipe: "create", amount }));
      add(w.alternative_create_mats, (amount) => ({ ...base, recipe: "alt", amount }));
    }
  }

  for (const { slot, rank, items } of gear.armor) {
    for (const a of items) {
      const base = {
        kind: "armor" as const,
        slot,
        rank,
        name: a.name,
        href: `/armorsmith/${slot}/${rank}/${a.slug}/`,
        ...looks(a),
      };
      add(a.create_mats, (amount) => ({ ...base, recipe: "create", amount }));
      add(a.alternative_create_mats, (amount) => ({ ...base, recipe: "alt", amount }));
    }
  }

  for (const d of gear.decorations) {
    const base = {
      kind: "decoration" as const,
      name: d.name,
      href: `/decorations/${d.slug}/`,
      ...looks(d),
    };
    add(d.create_mats, (amount) => ({ ...base, recipe: "create", amount }));
    add(d.alternative_create_mats, (amount) => ({ ...base, recipe: "alt", amount }));
  }

  for (const list of out.values()) sortUses(list);
  return out;
}

/** A use's group on the item page: its weapon type, its armor rank, or "decoration". */
export const groupOfUse = (u: ItemUse): string =>
  u.kind === "weapon" ? u.type : u.kind === "armor" ? u.rank : "decoration";

/** The icon a use shows: its weapon type, armor slot, or the decoration's. */
export const iconOfUse = (u: ItemUse): string =>
  u.kind === "weapon" ? u.type : u.kind === "armor" ? u.slot : "decoration";

/** Weapon types in the site's order, then armor by rank, then decorations. */
const GROUP_ORDER: string[] = [...WEAPON_TYPES, ...ARMOR_RANKS, "decoration"];

/** Uses in group order; within a group, rarity then name. Sorts in place. */
export function sortUses(uses: ItemUse[]): ItemUse[] {
  return uses.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(groupOfUse(a)) - GROUP_ORDER.indexOf(groupOfUse(b)) ||
      (a.rarity ?? 0) - (b.rarity ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

// ---------------------------------------------------------------------------
// item-uses.json
// ---------------------------------------------------------------------------

/** Where gear lives: each weapon type, then each armor slot and rank, then the decorations. */
const GEAR_GROUPS: (
  | { kind: "weapon"; type: WeaponType }
  | { kind: "armor"; slot: ArmorSlot; rank: ArmorRank }
  | { kind: "decoration" }
)[] = [
  ...WEAPON_TYPES.map((type) => ({ kind: "weapon" as const, type })),
  ...ARMOR_SLOTS.flatMap((slot) =>
    ARMOR_RANKS.map((rank) => ({ kind: "armor" as const, slot, rank })),
  ),
  { kind: "decoration" },
];

const groupIndex = (u: ItemUse): number =>
  GEAR_GROUPS.findIndex((g) =>
    g.kind === "weapon"
      ? u.kind === "weapon" && u.type === g.type
      : g.kind === "armor"
        ? u.kind === "armor" && u.slot === g.slot && u.rank === g.rank
        : u.kind === "decoration",
  );

/**
 * One piece of gear: [group (GEAR_GROUPS), name, rarity, icon colour, slug
 * where it isn't the name's, the weapon an upgrade starts from (its gear row,
 * or its name when it has none)], with trailing nulls left off.
 */
export type CompactUseGear = [
  group: number,
  name: string,
  rarity?: number | null,
  color?: string | null,
  slug?: string | null,
  from?: number | string | null,
];

export interface ItemUsesBundle {
  gear: CompactUseGear[];
  /** Item ID -> flat [gear row, recipe (create 0, improve 1, alt 2), amount] triples, in order */
  uses: Record<string, number[]>;
}

/** `buildItemUses`'s index as item-uses.json; `slugOf` is how the site slugs a name. */
export function encodeItemUses(
  uses: Map<number, ItemUse[]>,
  slugOf: (name: string) => string,
): ItemUsesBundle {
  const gear: CompactUseGear[] = [];
  const rows = new Map<string, number>(); // by href
  for (const list of uses.values()) {
    for (const u of list) {
      if (rows.has(u.href)) continue;
      const slug = u.href.split("/").at(-2)!;
      rows.set(u.href, gear.length);
      gear.push([
        groupIndex(u),
        u.name,
        u.rarity ?? null,
        u.color ?? null,
        slug === slugOf(u.name) ? null : slug,
        null,
      ]);
    }
  }
  const weaponRows = new Map<string, number>();
  for (const [i, g] of gear.entries()) {
    if (GEAR_GROUPS[g[0]]!.kind === "weapon" && !weaponRows.has(g[1])) weaponRows.set(g[1], i);
  }

  const out: Record<string, number[]> = {};
  for (const [id, list] of uses) {
    out[id] = list.flatMap((u) => {
      const row = rows.get(u.href)!;
      if (u.kind === "weapon" && u.from !== undefined) {
        gear[row]![5] = weaponRows.get(u.from) ?? u.from;
      }
      return [row, RECIPES.indexOf(u.recipe), u.amount];
    });
  }
  // Trailing nulls left off.
  for (const g of gear) while (g.length > 2 && g[g.length - 1] === null) g.pop();
  return { gear, uses: out };
}

/** item-uses.json back into `buildItemUses`'s index. */
export function decodeItemUses(
  bundle: ItemUsesBundle,
  slugOf: (name: string) => string,
): Map<number, ItemUse[]> {
  const out = new Map<number, ItemUse[]>();
  for (const [id, flat] of Object.entries(bundle.uses)) {
    const list: ItemUse[] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) {
      const [group, name, rarity = null, color = null, slug = null, from = null] =
        bundle.gear[flat[i]!]!;
      const g = GEAR_GROUPS[group]!;
      const s = slug ?? slugOf(name);
      const base = {
        name,
        ...(rarity !== null && { rarity }),
        ...(color !== null && { color }),
        recipe: RECIPES[flat[i + 1]!]!,
        amount: flat[i + 2]!,
      };
      if (g.kind === "weapon") {
        const parent = typeof from === "number" ? bundle.gear[from]![1] : from;
        list.push({
          ...base,
          kind: "weapon",
          type: g.type,
          href: weaponHref(g.type, s),
          ...(base.recipe === "improve" && parent !== null && { from: parent }),
        });
      } else if (g.kind === "armor") {
        list.push({
          ...base,
          kind: "armor",
          slot: g.slot,
          rank: g.rank,
          href: `/armorsmith/${g.slot}/${g.rank}/${s}/`,
        });
      } else {
        list.push({ ...base, kind: "decoration", href: `/decorations/${s}/` });
      }
    }
    out.set(Number(id), list);
  }
  return out;
}
