/**
 * The wishlist: weapons and armor the player wants to make, the materials
 * they add up to, and where each material is best found. Pure, so the
 * wishlist page builds it from the bundles it loads and the tests build it
 * from data/. The list itself is kept in localStorage (wishlist-store.ts).
 */
import type { ArmorRank, ArmorSlot, WeaponType } from "./constants";
import { weaponHref } from "./equipment-ref";
import { normalizeItemName } from "./items";
import type { GatherKind, ItemPlaces } from "./item-places";
import { itemHref, type ItemSources } from "./item-sources";
import type { DropSource } from "./monster-drops";
import { questHref, questHubLabel, questStarLevel, type QuestHubSlug } from "./quests";
import type { ArmorPiece, Material, Weapon, WeaponTreeNode } from "./types";

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
}

export interface ArmorEntry extends EntryBase {
  kind: "armor";
  slot: ArmorSlot;
  rank: ArmorRank;
}

export type WishlistEntry = WeaponEntry | ArmorEntry;

/** The gear an entry is for, without its choices: what `entryKey` reads. */
export type GearRef =
  Pick<WeaponEntry, "kind" | "type" | "slug"> | Pick<ArmorEntry, "kind" | "slot" | "rank" | "slug">;

/** An entry's identity, which is also its page: "weapon/<type>/<slug>", "armor/<slot>/<rank>/<slug>". */
export function entryKey(ref: GearRef): string {
  return ref.kind === "weapon"
    ? `weapon/${ref.type}/${ref.slug}`
    : `armor/${ref.slot}/${ref.rank}/${ref.slug}`;
}

export function entryHref(ref: GearRef): string {
  return ref.kind === "weapon"
    ? weaponHref(ref.type, ref.slug)
    : `/armorsmith/${ref.slot}/${ref.rank}/${ref.slug}/`;
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

/** The recipes a weapon or armor piece has, in the order the detail pages show them. */
export function recipesOf(gear: Weapon | ArmorPiece): Recipe[] {
  const out: Recipe[] = [];
  if ("improve_mats" in gear && has(gear.improve_mats) && parentName(gear)) out.push("improve");
  if (has(gear.create_mats)) out.push("create");
  if (has(gear.alternative_create_mats)) out.push("alt");
  return out;
}

/** Create where it can be made outright, else the upgrade, else the alternative recipe. */
export function defaultRecipe(gear: Weapon | ArmorPiece): Recipe | undefined {
  const recipes = recipesOf(gear);
  return recipes.includes("create") ? "create" : recipes[0];
}

/** One craft at the smithy: a weapon or armor piece, by one recipe. */
export interface CraftStep {
  name: string;
  href: string;
  recipe: Recipe;
  cost: number;
  materials: Material[];
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

function step(gear: Weapon | ArmorPiece, href: string, recipe: Recipe): CraftStep {
  const materials =
    recipe === "alt"
      ? gear.alternative_create_mats
      : recipe === "improve" && "improve_mats" in gear
        ? gear.improve_mats
        : gear.create_mats;
  const cost =
    recipe === "improve" && "improve_cost" in gear ? gear.improve_cost : gear.create_cost;
  return { name: gear.name, href, recipe, cost: Number(cost) || 0, materials: materials ?? [] };
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

/** An armor piece's craft by a recipe. */
export function armorSteps(piece: ArmorPiece, href: string, recipe: Recipe): CraftStep[] {
  return [step(piece, href, recipe)];
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

/**
 * Every material the crafts need, summed by item (a material spelt two ways
 * is one item), in the order they're first needed. Each craft is tagged with
 * the gear it's for.
 */
export function totalMaterials(
  crafts: { gear: string; steps: CraftStep[] }[],
  idOf: (name: string) => number | undefined,
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
        need.amount += amount;
        if (!need.for.includes(gear)) need.for.push(gear);
      }
    }
  }
  return [...needs.values()];
}

/** Total zenny the crafts cost. */
export function totalCost(crafts: { steps: CraftStep[] }[]): number {
  return crafts.reduce((sum, c) => sum + c.steps.reduce((s, st) => s + st.cost, 0), 0);
}

// ---------------------------------------------------------------------------
// Where to get a material
// ---------------------------------------------------------------------------

export type WayKind = "shop" | "monster" | "gather" | "quest" | "combine";

/** One way to get a material. */
export interface Way {
  kind: WayKind;
  /** The monster, map, quest or shop */
  name: string;
  href?: string;
  /** The map, for a gathering point's icon */
  map?: string;
  /** "Low Rank", "Guild High Rank", "Training School" … ("" for shops and combinations) */
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
   * is -1: it's always there; later stock and Pokke Points are 3.
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

const GATHER_VERBS = { gather: "Gathering", mine: "Mining", bug: "Bug catching" } as const;

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
