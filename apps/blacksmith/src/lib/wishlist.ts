/**
 * The wishlist: weapons, armor and decorations the player wants to make, items
 * they want to get, the materials they add up to, and where each is best
 * found. Pure, so the wishlist page builds it from the bundles it loads and
 * the tests build it from data/. The list itself is kept in localStorage
 * (wishlist-store.ts).
 */
import { ARMOR_SLOTS, type ArmorRank, type ArmorSlot, type WeaponType } from "./constants";
import { weaponHref } from "./equipment-ref";
import { normalizeItemName } from "./items";
import { farmPlaceLabel, type FarmPlace, type GatherKind, type ItemPlaces } from "./item-places";
import { itemHref, type ItemSources } from "./item-sources";
import type { DropSource } from "./monster-drops";
import { questHref, questHubLabel, questStarLevel, type QuestHubSlug } from "./quests";
import type { ArmorPiece, Decoration, Material, Weapon, WeaponTreeNode } from "./types";

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * Which of the gear's recipes to make it with: its create recipe, its
 * alternative create recipe, or upgrading the weapon before it in the tree.
 */
export type Recipe = "create" | "alt" | "improve";

interface EntryBase {
  slug: string;
  /** Unset: the gear's default recipe (`defaultRecipe`). */
  recipe?: Recipe;
  addedAt: number;
}

export interface WeaponEntry extends EntryBase {
  kind: "weapon";
  type: WeaponType;
  /**
   * Upgrades only: the weapon up the tree the player starts from (already
   * owns), by slug, or null to make the whole path from the nearest weapon
   * with a create recipe. Unset: the nearest one the loaded hunter owns, or
   * the weapon just before it.
   */
  from?: string | null;
  /**
   * Upgrade paths of more than one craft: the furthest weapon along the path
   * the player has made, by slug. It and every craft before it are ticked off
   * (`madeSteps`). Ignored while it isn't on the path the entry makes.
   */
  made?: string;
}

export interface ArmorEntry extends EntryBase {
  kind: "armor";
  slot: ArmorSlot;
  rank: ArmorRank;
}

export interface DecorationEntry extends EntryBase {
  kind: "decoration";
  /**
   * How many of the jewel to have: a set often wants several of one. Unset:
   * one. Jewels already in the loaded hunter's item box count towards it.
   */
  count?: number;
}

export interface ItemEntry extends EntryBase {
  kind: "item";
  /** How many of the item to get, in addition to any materials gear needs. Unset: one. */
  count?: number;
}

export type GearEntry = WeaponEntry | ArmorEntry | DecorationEntry;
export type WishlistEntry = GearEntry | ItemEntry;

/** The most of one decoration or item an entry can ask for. */
export const MAX_ENTRY_COUNT = 99;

/** The gear an entry is for, without its choices: what `entryKey` reads. */
export type GearRef =
  | Pick<WeaponEntry, "kind" | "type" | "slug">
  | Pick<ArmorEntry, "kind" | "slot" | "rank" | "slug">
  | Pick<DecorationEntry, "kind" | "slug">;

export type ItemRef = Pick<ItemEntry, "kind" | "slug">;
export type WishlistRef = GearRef | ItemRef;

/**
 * An entry's identity, which is also its page: "weapon/<type>/<slug>",
 * "armor/<slot>/<rank>/<slug>", "decoration/<slug>", "item/<slug>".
 */
export function entryKey(ref: WishlistRef): string {
  switch (ref.kind) {
    case "weapon":
      return `weapon/${ref.type}/${ref.slug}`;
    case "armor":
      return `armor/${ref.slot}/${ref.rank}/${ref.slug}`;
    case "decoration":
      return `decoration/${ref.slug}`;
    case "item":
      return `item/${ref.slug}`;
  }
}

export function entryHref(ref: WishlistRef): string {
  switch (ref.kind) {
    case "weapon":
      return weaponHref(ref.type, ref.slug);
    case "armor":
      return `/armorsmith/${ref.slot}/${ref.rank}/${ref.slug}/`;
    case "decoration":
      return `/decorations/${ref.slug}/`;
    case "item":
      return `/items/${ref.slug}/`;
  }
}

/** How many an entry wants: a decoration's or item's count, else one. */
export function entryCount(entry: WishlistEntry): number {
  return entry.kind === "decoration" || entry.kind === "item" ? (entry.count ?? 1) : 1;
}

/** Gear to add from a set; a decoration with how many (1 if unset). */
export type GearWant = GearRef & { count?: number };
/** Anything to add to the wishlist; a decoration or item with how many (1 if unset). */
export type WishlistWant = WishlistRef & { count?: number };

/** A decoration or item count kept to 1…MAX_ENTRY_COUNT. */
const clampCount = (n: number) =>
  Math.min(MAX_ENTRY_COUNT, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));

/**
 * What an armor set needs made: each piece, head to legs, then each jewel
 * (the weapon's and the pieces') with how many of it, in the order placed.
 */
export function setWants(set: {
  pieces: readonly ({ slot: ArmorSlot; rank: ArmorRank; slug: string } | null)[];
  decorations: readonly { deco: { slug: string } }[];
}): GearWant[] {
  const pieces = set.pieces
    .filter((p) => p !== null)
    .sort((a, b) => ARMOR_SLOTS.indexOf(a.slot) - ARMOR_SLOTS.indexOf(b.slot))
    .map((p): GearWant => ({ kind: "armor", slot: p.slot, rank: p.rank, slug: p.slug }));
  const jewels = new Map<string, number>();
  for (const { deco } of set.decorations) jewels.set(deco.slug, (jewels.get(deco.slug) ?? 0) + 1);
  return [
    ...pieces,
    ...[...jewels].map(([slug, count]): GearWant => ({ kind: "decoration", slug, count })),
  ];
}

/** How many a want asks for: a decoration's or item's count, clamped, else one. */
const wantCount = (w: WishlistWant) =>
  w.kind === "decoration" || w.kind === "item" ? clampCount(w.count ?? 1) : 1;

/**
 * Adds everything wanted that the list doesn't have, first and in the order
 * given; a decoration or item already listed is raised to the count wanted
 * (never lowered), so adding the same set twice changes nothing. Anything
 * wanted more than once takes the largest count. Returns the list and how
 * many entries were added or raised.
 */
export function addEntries(
  entries: readonly WishlistEntry[],
  wants: readonly WishlistWant[],
  now = Date.now(),
): [WishlistEntry[], number] {
  // Each entry once, in the order first wanted, with the most of it wanted.
  const merged = new Map<string, { ref: WishlistRef; n: number }>();
  for (const { count, ...ref } of wants) {
    const key = entryKey(ref);
    const n = wantCount({ ...ref, count });
    const had = merged.get(key);
    if (!had || n > had.n) merged.set(key, { ref: had?.ref ?? ref, n });
  }
  const listed = new Map(entries.map((e) => [entryKey(e), e]));
  const raised = new Map<string, number>();
  const added: WishlistEntry[] = [];
  for (const [key, { ref, n }] of merged) {
    const had = listed.get(key);
    if (!had) {
      added.push(
        (n > 1 ? { ...ref, count: n, addedAt: now } : { ...ref, addedAt: now }) as WishlistEntry,
      );
    } else if ((had.kind === "decoration" || had.kind === "item") && n > entryCount(had)) {
      raised.set(key, n);
    }
  }
  if (added.length === 0 && raised.size === 0) return [[...entries], 0];
  const kept = entries.map((e) => {
    const n = raised.get(entryKey(e));
    return n === undefined ? e : ({ ...e, count: n } as WishlistEntry);
  });
  return [[...added, ...kept], added.length + raised.size];
}

/** Whether the list has every want, each decoration or item at least as many times. */
export function hasAll(entries: readonly WishlistEntry[], wants: readonly WishlistWant[]): boolean {
  const listed = new Map(entries.map((e) => [entryKey(e), e]));
  return wants.every((w) => {
    const e = listed.get(entryKey(w));
    return !!e && entryCount(e) >= wantCount(w);
  });
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/** In English; the site's pages take theirs from the messages (`items.wishlist.recipes`). */
export const RECIPE_LABELS: Record<Recipe, string> = {
  create: "Create",
  alt: "Alt. recipe",
  improve: "Upgrade",
};

const has = (mats: Material[] | null | undefined): mats is Material[] => !!mats?.length;

/**
 * Each weapon's tree parent, by name, from the weapon bundles' trees (the
 * bundles leave `improve_from` out: the trees hold the links). A weapon
 * listed under several parents takes the one its branch hangs from (the row
 * that isn't an alias). Trees list parents from other types too, so Dual
 * Blades find their Sword and Shield parents.
 */
export function treeParents(trees: readonly WeaponTreeNode[][]): Map<string, string> {
  const primary = new Map<string, string>();
  const alias = new Map<string, string>();
  const walk = (nodes: readonly WeaponTreeNode[], parent: string | undefined) => {
    for (const n of nodes) {
      if (parent) {
        const into = n.alias ? alias : primary;
        if (!into.has(n.name)) into.set(n.name, parent);
      }
      if (n.children) walk(n.children, n.name);
    }
  };
  for (const t of trees) walk(t, undefined);
  for (const [name, parent] of alias) if (!primary.has(name)) primary.set(name, parent);
  return primary;
}

/** The first weapon a weapon is upgraded from (the one the tree nests it under). */
function parentName(w: Weapon): string | undefined {
  const from = w.improve_from;
  return Array.isArray(from) ? from[0] : (from ?? undefined);
}

/** Anything the wishlist can hold. */
export type Gear = Weapon | ArmorPiece | Decoration;

/** The recipes a weapon, armor piece or decoration has, in the order the detail pages show them. */
export function recipesOf(gear: Gear): Recipe[] {
  const out: Recipe[] = [];
  if ("improve_mats" in gear && has(gear.improve_mats) && parentName(gear)) out.push("improve");
  if (has(gear.create_mats)) out.push("create");
  if (has(gear.alternative_create_mats)) out.push("alt");
  return out;
}

/** Create where it can be made outright, else the upgrade, else the alternative recipe. */
export function defaultRecipe(gear: Gear): Recipe | undefined {
  const recipes = recipesOf(gear);
  return recipes.includes("create") ? "create" : recipes[0];
}

/** One craft at the smithy: a weapon, armor piece or decoration, by one recipe. */
export interface CraftStep {
  name: string;
  slug: string;
  href: string;
  recipe: Recipe;
  /** Per craft */
  cost: number;
  /** Per craft */
  materials: Material[];
  /** How many times it's made (decorations); unset, once */
  times?: number;
}

/** A weapon up the tree from another, nearest first. */
export interface Ancestor {
  name: string;
  slug: string;
  href: string;
  /** Has a create recipe, so a path from scratch can start here. */
  creatable: boolean;
}

/**
 * The weapons a weapon is upgraded from, nearest first, through each one's
 * first parent (the tree's own path) up to the root. Stops on a name the
 * weapon list doesn't have, or a loop.
 */
export function upgradeAncestors(weapon: Weapon, byName: ReadonlyMap<string, Weapon>): Ancestor[] {
  const out: Ancestor[] = [];
  const seen = new Set([weapon.slug]);
  let name = parentName(weapon);
  while (name) {
    const w = byName.get(name);
    if (!w || seen.has(w.slug)) break;
    seen.add(w.slug);
    out.push({
      name: w.name,
      slug: w.slug,
      href: weaponHref(w.type, w.slug),
      creatable: has(w.create_mats),
    });
    name = parentName(w);
  }
  return out;
}

function step(gear: Gear, href: string, recipe: Recipe): CraftStep {
  const materials =
    recipe === "alt"
      ? gear.alternative_create_mats
      : recipe === "improve" && "improve_mats" in gear
        ? gear.improve_mats
        : gear.create_mats;
  const cost =
    recipe === "improve" && "improve_cost" in gear ? gear.improve_cost : gear.create_cost;
  return {
    name: gear.name,
    slug: gear.slug,
    href,
    recipe,
    cost: Number(cost) || 0,
    materials: materials ?? [],
  };
}

/**
 * The crafts that make a weapon by a recipe, in the order they're made.
 * An upgrade starts from `from`, a weapon up the tree the player already has
 * (by slug): every upgrade from there down. With `from` null it's made from
 * scratch: create the nearest weapon up the tree that has a create recipe,
 * then upgrade from there. Unset, or a weapon not up its path: the one
 * upgrade from the weapon just before it.
 */
export function weaponSteps(
  weapon: Weapon,
  recipe: Recipe,
  from: string | null | undefined,
  byName: ReadonlyMap<string, Weapon>,
): CraftStep[] {
  const make = (w: Weapon, r: Recipe) => step(w, weaponHref(w.type, w.slug), r);
  if (recipe !== "improve") return [make(weapon, recipe)];

  const steps = [make(weapon, "improve")];
  if (from === undefined) return steps;
  const seen = new Set([weapon.slug]);
  for (let w = byName.get(parentName(weapon) ?? ""); w; w = byName.get(parentName(w) ?? "")) {
    if (seen.has(w.slug)) break;
    seen.add(w.slug);
    if (w.slug === from) return steps.reverse();
    if (from === null && has(w.create_mats)) {
      steps.push(make(w, "create"));
      return steps.reverse();
    }
    steps.push(make(w, "improve"));
  }
  // From scratch with nothing creatable up the tree: the whole path found.
  // A start that isn't up the path: just the one upgrade.
  return from === null ? steps.reverse() : [make(weapon, "improve")];
}

/**
 * How many of the crafts, from the first, are made: up to and including
 * `made` (a weapon's slug). Never the last craft, which makes the gear itself;
 * 0 when `made` isn't one of the others.
 */
export function madeSteps(steps: readonly CraftStep[], made: string | undefined): number {
  if (made === undefined) return 0;
  const i = steps.findIndex((s) => s.slug === made);
  return i >= 0 && i < steps.length - 1 ? i + 1 : 0;
}

/**
 * How many of the crafts, from the first, the loaded hunter is past: up to
 * and including the furthest one whose weapon they own (`owned` holds the
 * hrefs of their gear). Upgrading uses up the weapon before, so owning one
 * along the path counts every craft before it as made too. Never the last
 * craft: owning that is owning the gear.
 */
export function ownedSteps(steps: readonly CraftStep[], owned: ReadonlySet<string> | null): number {
  if (!owned) return 0;
  for (let i = steps.length - 2; i >= 0; i--) if (owned.has(steps[i].href)) return i + 1;
  return 0;
}

/**
 * How many of the crafts, from the first, are made (`done`): those ticked off
 * by hand up to `made`, or the loaded hunter is past (`fromSave`, which they
 * can't untick), whichever reaches further.
 */
export function stepsDone(
  steps: readonly CraftStep[],
  made: string | undefined,
  owned: ReadonlySet<string> | null,
): { done: number; fromSave: number } {
  const fromSave = ownedSteps(steps, owned);
  return { done: Math.max(madeSteps(steps, made), fromSave), fromSave };
}

/**
 * The `made` to store when the craft at `index` is unticked: the craft before
 * it, or nothing when that one is ticked by the save (`fromSave`), so the
 * save's ticks don't stay behind as the player's own once it's gone.
 */
export function untickedMade(
  steps: readonly CraftStep[],
  index: number,
  fromSave: number,
): string | undefined {
  return index - 1 >= fromSave ? steps[index - 1]?.slug : undefined;
}

/** An armor piece's craft by a recipe. */
export function armorSteps(piece: ArmorPiece, href: string, recipe: Recipe): CraftStep[] {
  return [step(piece, href, recipe)];
}

/**
 * How many of a decoration are still to make: the entry's count less the
 * jewels free in the hunter's item box and pouch (`have`, null without a
 * save). Jewels set in equipment don't count: taking one out breaks it.
 * Owned once there are enough.
 */
export function decorationNeed(
  count: number,
  have: number | null,
): { toMake: number; owned: boolean } {
  const free = Math.max(0, have ?? 0);
  return { toMake: Math.max(0, count - free), owned: have !== null && free >= count };
}

/** A decoration's craft by a recipe, made `count` times (none for none). */
export function decorationSteps(
  deco: Decoration,
  href: string,
  recipe: Recipe,
  count: number,
): CraftStep[] {
  const times = Math.max(0, Math.floor(count));
  return times > 0 ? [{ ...step(deco, href, recipe), times }] : [];
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** One material the wishlist needs, summed over every craft. */
export interface MaterialNeed {
  name: string;
  /** In-game item ID, where the material links to an item. */
  itemId?: number;
  href: string;
  type: string;
  color: string;
  amount: number;
  /** The gear it's for, in wishlist order. */
  for: string[];
}

/** An item wanted for itself, in addition to whatever the crafts need. */
export interface ItemRequirement {
  id: number;
  name: string;
  type: string;
  color: string;
  amount: number;
}

/**
 * Every material the crafts and explicit item entries need, summed by item
 * (a material spelt two ways is one item), in the order they're first needed.
 * Each craft is tagged with the gear it's for; an item wanted for itself adds
 * to the same total rather than making a second row.
 */
export function totalMaterials(
  crafts: { gear: string; steps: CraftStep[] }[],
  idOf: (name: string) => number | undefined,
  wantedItems: readonly ItemRequirement[] = [],
): MaterialNeed[] {
  const needs = new Map<string, MaterialNeed>();
  for (const { gear, steps } of crafts) {
    for (const s of steps) {
      for (const m of s.materials) {
        const amount = Number(m.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const itemId = idOf(m.name);
        const key = itemId !== undefined ? `#${itemId}` : normalizeItemName(m.name);
        let need = needs.get(key);
        if (!need) {
          need = {
            name: m.name,
            ...(itemId !== undefined ? { itemId } : {}),
            href: itemHref(m.name),
            type: m.type,
            color: m.color,
            amount: 0,
            for: [],
          };
          needs.set(key, need);
        }
        need.amount += amount * (s.times ?? 1);
        if (!need.for.includes(gear)) need.for.push(gear);
      }
    }
  }
  for (const item of wantedItems) {
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const key = `#${item.id}`;
    let need = needs.get(key);
    if (!need) {
      need = {
        name: item.name,
        itemId: item.id,
        href: itemHref(item.name),
        type: item.type,
        color: item.color,
        amount: 0,
        for: [],
      };
      needs.set(key, need);
    } else {
      // An explicitly listed item has the canonical name, link and icon.
      need.name = item.name;
      need.href = itemHref(item.name);
      need.type = item.type;
      need.color = item.color;
    }
    need.amount += amount;
  }
  return [...needs.values()];
}

/** Total zenny the crafts cost. */
export function totalCost(crafts: { steps: CraftStep[] }[]): number {
  return crafts.reduce(
    (sum, c) => sum + c.steps.reduce((s, st) => s + st.cost * (st.times ?? 1), 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Where to get a material
// ---------------------------------------------------------------------------

export type WayKind = "shop" | "monster" | "gather" | "farm" | "quest" | "combine";

/** One way to get a material. */
export interface Way {
  kind: WayKind;
  /** The monster, map, quest or shop, or Pokke Farm */
  name: string;
  href?: string;
  /** The map, for a gathering point's icon */
  map?: string;
  /** "Low Rank", "Guild High Rank", "Training School" … ("" for shops, the farm and combinations) */
  group: string;
  /**
   * How, in English: "Body carves ×3", "Mining · only on 2 quests", "G3★ reward",
   * "Shop · Stage 2 stock". The fields below say the same as data, for pages
   * that put it in another language.
   */
  detail: string;
  /** Monsters: the drop table it comes from */
  source?: DropSource;
  /** Gathering: the kinds of point that give it */
  gatherKinds?: GatherKind[];
  /** Quests: the quest's ID and star level ("G3★") */
  questId?: number;
  stars?: string;
  /** Shops: the first stage of stock that has it, when the opening stock doesn't */
  stage?: number;
  /** Combinations: the ingredients' item IDs */
  ingredients?: number[];
  /** Pokke Farm: the point (its upgrade, kind and gathers per quest) */
  farm?: FarmPlace;
  /** Percent per attempt, or null where it's certain (a shop) */
  chance: number | null;
  /** Shops: price in `currency`, null where it isn't known */
  price?: number | null;
  /** Shops: what the price is in */
  currency?: "zenny" | "pokke-points";
  /** Gathering: only these quests' points on the map give it, not the map's usual points */
  quests?: number[];
  /**
   * How far into the game it opens: 0 Village and Low Rank, 1 High Rank,
   * 2 G Rank, 3 the side boards. A shop's opening stock with a zenny price
   * is -1: it's always there; later stock, Pokke Points and the farm are 3.
   */
  tier: number;
  /** About how many each try gives: chance × amount × attempts. */
  yield: number;
}

/** A rank or quest board label to how far into the game it opens. */
export function groupTier(group: string): number {
  switch (group) {
    case "Village":
    case "Low Rank":
    case "Guild Low Rank":
      return 0;
    case "High Rank":
    case "Guild High Rank":
      return 1;
    case "G Rank":
    case "Guild G Rank":
      return 2;
    default:
      return 3;
  }
}

const HUB_TIERS: Partial<Record<QuestHubSlug, number>> = {
  village: 0,
  "low-rank": 0,
  "high-rank": 1,
  "g-rank": 2,
};

/** The Village's 7★ and up come after its Elder's urgent quests, as hard as High Rank. */
const VILLAGE_HIGH_STARS = 7;

function questTier(hub: QuestHubSlug, stars: number): number {
  if (hub === "village" && stars >= VILLAGE_HIGH_STARS) return 1;
  return HUB_TIERS[hub] ?? 3;
}

function dropDetail({ title, count, note }: DropSource): string {
  return [count !== undefined ? `${title} ×${count}` : title, note].filter(Boolean).join(" · ");
}

/** A map without its time of day: its day and night gathering are one place to go. */
export const mapArea = (map: string) => map.replace(/ \((Day|Night)\)$/, "");

const GATHER_VERBS = {
  gather: "Gathering",
  mine: "Mining",
  bug: "Bug catching",
  fish: "Fishing",
} as const;

/** What the ways need from the item lookup, for combinations' names. */
export interface WayItems {
  get(id: number): { name: string; known: boolean };
}

/** The quest fields the ways need, to place quest-only gathering in the game. */
export interface WayQuest {
  hub: QuestHubSlug;
  stars: number;
}

/** The item's combinations that make it (ItemCombinations.madeFrom). */
export interface WayCombination {
  ingredients: number[];
  successRate: number;
}

/**
 * Every way to get an item, best first: shops (it's only zenny), then by how
 * early in the game the way opens, then by how many each try gives, so a
 * Low Rank carve beats a G Rank one and a sure reward beats a rare drop.
 * Combinations come last, as they need their own ingredients.
 */
export function itemWays(
  sources: ItemSources | undefined,
  places: ItemPlaces | undefined,
  combos: readonly WayCombination[] | undefined,
  items: WayItems | null,
  quests?: ReadonlyMap<number, WayQuest>,
): Way[] {
  const ways: Way[] = [];
  for (const p of places?.shops ?? []) {
    // Only the opening stock, at a known zenny price, is a sure buy from the start.
    const sure = p.currency === "zenny" && p.price !== null && p.stages.includes(1);
    ways.push({
      kind: "shop",
      name: p.shop,
      group: "",
      detail: [
        p.currency === "pokke-points" ? "Pokke Points" : "Shop",
        !p.stages.includes(1) && `Stage ${p.stages[0]} stock`,
      ]
        .filter(Boolean)
        .join(" · "),
      ...(!p.stages.includes(1) && { stage: p.stages[0] }),
      chance: null,
      price: p.price,
      currency: p.currency,
      tier: sure ? -1 : 3,
      yield: sure ? Infinity : 1,
    });
  }
  for (const s of sources?.monsters ?? []) {
    ways.push({
      kind: "monster",
      name: s.monster.name,
      href: s.monster.href,
      group: s.rank,
      detail: dropDetail(s.source),
      source: s.source,
      chance: s.chance,
      tier: groupTier(s.rank),
      yield: (s.chance / 100) * s.quantity * (s.source.count ?? 1),
    });
  }
  for (const p of places?.gathering ?? []) {
    const kinds = p.points.map((pt) => pt.kind);
    const verbs = kinds.map((k) => GATHER_VERBS[k]).join(", ");
    // Only some quests' points give it: as early as the earliest of them.
    const tiers = (p.quests ?? []).flatMap((id) => {
      const q = quests?.get(id);
      return q ? [questTier(q.hub, q.stars)] : [];
    });
    ways.push({
      kind: "gather",
      name: mapArea(p.map),
      map: p.map,
      group: p.group,
      detail: p.quests
        ? `${verbs} · only on ${p.quests.length} ${p.quests.length === 1 ? "quest" : "quests"}`
        : verbs,
      gatherKinds: kinds,
      chance: p.chance,
      ...(p.quests ? { quests: p.quests } : {}),
      tier: tiers.length ? Math.min(...tiers) : groupTier(p.group),
      yield: p.chance / 100,
    });
  }
  for (const p of places?.farm ?? []) {
    // Bought with Pokke Points, like the Pokke shop; when each upgrade opens isn't known.
    ways.push({
      kind: "farm",
      name: "Pokke Farm",
      group: "",
      detail: `${p.point} · ${farmPlaceLabel(p)}`,
      farm: p,
      chance: p.chance,
      tier: 3,
      yield: (p.chance / 100) * p.amount,
    });
  }
  for (const s of sources?.quests ?? []) {
    const { g, stars } = questStarLevel(s.quest.hub, s.quest.stars);
    const level = `${g ? "G" : ""}${stars}★`;
    ways.push({
      kind: "quest",
      name: s.quest.title,
      href: questHref(s.quest),
      group: questHubLabel(s.quest.hub),
      detail: `${level} reward`,
      questId: s.quest.id,
      stars: level,
      chance: s.chance,
      tier: questTier(s.quest.hub, s.quest.stars),
      yield: (s.chance / 100) * s.amount,
    });
  }
  for (const c of combos ?? []) {
    const names = c.ingredients.map((id) => items?.get(id).name ?? `#${id}`);
    ways.push({
      kind: "combine",
      name: names.join(" + "),
      group: "",
      detail: "Combine",
      ingredients: c.ingredients,
      chance: c.successRate,
      tier: 4,
      yield: c.successRate / 100,
    });
  }
  // One row per monster, map or quest and rank: its best way (a quest's
  // several reward tables, a monster's carves and its breaks). A map's
  // quest-only points stay apart from its usual ones.
  const seen = new Set<string>();
  return ways.sort(compareWays).filter((w) => {
    const key = `${w.kind}|${w.name}|${w.group}|${w.quests ? "quests" : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compareWays(a: Way, b: Way): number {
  return a.tier - b.tier || b.yield - a.yield || a.name.localeCompare(b.name);
}

// ---------------------------------------------------------------------------
// Where to go
// ---------------------------------------------------------------------------

/** A monster to hunt or a map to gather on, and the wanted materials it gives. */
export interface Destination {
  kind: "monster" | "gather";
  name: string;
  href?: string;
  map?: string;
  group: string;
  tier: number;
  /** Each material it gives, with its best way there. */
  materials: { need: MaterialNeed; way: Way }[];
}

/**
 * The monsters and gathering maps that give the most of the materials still
 * missing, one entry per monster or map and rank: most materials first, then
 * earliest in the game, then the better odds. Materials a shop sells from the
 * start are left out: they're bought, not hunted. So are a map's quest-only
 * gathering points: going to the map doesn't give them.
 */
export function bestDestinations(
  missing: { need: MaterialNeed; ways: Way[] }[],
  limit = 6,
): Destination[] {
  const out = new Map<string, Destination>();
  for (const { need, ways } of missing) {
    if (ways.some((w) => w.kind === "shop" && w.tier < 0)) continue;
    for (const way of ways) {
      if (way.kind !== "monster" && way.kind !== "gather") continue;
      if (way.quests) continue;
      const key = `${way.kind}|${way.name}|${way.group}`;
      let d = out.get(key);
      if (!d) {
        d = {
          kind: way.kind,
          name: way.name,
          ...(way.href ? { href: way.href } : {}),
          ...(way.map ? { map: way.map } : {}),
          group: way.group,
          tier: way.tier,
          materials: [],
        };
        out.set(key, d);
      }
      const had = d.materials.find((m) => m.need === need);
      if (!had) d.materials.push({ need, way });
      else if (compareWays(way, had.way) < 0) had.way = way;
    }
  }
  const score = (d: Destination) => d.materials.reduce((s, m) => s + m.way.yield, 0);
  return [...out.values()]
    .sort(
      (a, b) =>
        b.materials.length - a.materials.length ||
        a.tier - b.tier ||
        score(b) - score(a) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
