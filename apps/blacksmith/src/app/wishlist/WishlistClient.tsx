"use client";

/**
 * The wishlist page: the weapons and armor the player starred, each with the
 * recipe to make it by (and, for an upgrade, the weapon to start from); every
 * material they add up to, with what the loaded hunter already has and the
 * best ways to get the rest; and the monsters and maps that give the most of
 * what's missing. The list lives in localStorage (wishlist-store.ts); the
 * sums and rankings are wishlist.ts.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import MapIcon from "@/components/MapIcon";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import {
  getBundle,
  getDictionaries,
  peekBundle,
  peekDictionaries,
  useCombinations,
  useItemPlaces,
  useItems,
  useItemSources,
  useQuests,
  decodeWeaponBundle,
  type ItemLookup,
} from "@/lib/client-data";
import { cn } from "@/lib/cn";
import { WEAPON_TYPES } from "@/lib/constants";
import { useEquipmentIds } from "@/lib/equipment";
import { ownedHrefs, ownedItemCounts } from "@/lib/hunter-progress";
import type { GameText } from "@/lib/i18n/game-text";
import type { Messages } from "@/lib/i18n/messages";
import {
  decodeArmor,
  decodeTree,
  type ArmorBundle,
  type Bundle,
  type Dictionaries,
  type WeaponBundle,
} from "@/lib/schema";
import type { ArmorPiece, Weapon } from "@/lib/types";
import {
  armorSteps,
  bestDestinations,
  defaultRecipe,
  entryHref,
  entryKey,
  itemWays,
  recipesOf,
  totalCost,
  totalMaterials,
  treeParents,
  upgradeAncestors,
  weaponSteps,
  type Ancestor,
  type CraftStep,
  type Destination,
  type MaterialNeed,
  type Recipe,
  type Way,
  type WishlistEntry,
} from "@/lib/wishlist";
import { useWishlist, type Wishlist } from "@/lib/wishlist-store";
import * as ui from "@/styles/settings";
import { dropSourceLabel, groundName, groupLabel } from "../items/source-labels";

// ---------------------------------------------------------------------------
// Loading the gear
// ---------------------------------------------------------------------------

const bundleFile = (e: WishlistEntry) =>
  e.kind === "weapon" ? `weapon-${e.type}` : `armor-${e.slot}-${e.rank}`;

/** Each armor bundle's pieces, decoded once. */
const decodedArmor = new WeakMap<ArmorBundle, ArmorPiece[]>();

function decodeBundle(bundle: Bundle, dict: Dictionaries): (Weapon | ArmorPiece)[] {
  if (bundle.kind === "weapon") return decodeWeaponBundle(bundle, dict);
  const b = bundle as ArmorBundle;
  let list = decodedArmor.get(b);
  if (!list) {
    list = b.items.map((a) => decodeArmor(dict, a, b.slot));
    decodedArmor.set(b, list);
  }
  return list;
}

/** Every weapon by name, with its tree parent as `improve_from`, once every type has loaded. */
let allWeaponsByName: Map<string, Weapon> | null = null;

/**
 * Every loaded weapon by name, each a copy with its tree parent as
 * `improve_from` (the bundles leave it out). Built from whichever weapon
 * bundles have loaded; kept once all of them have.
 */
function weaponsByName(dict: Dictionaries): Map<string, Weapon> {
  if (allWeaponsByName) return allWeaponsByName;
  const bundles = WEAPON_TYPES.flatMap((t) => {
    const b = peekBundle(`weapon-${t}`) as WeaponBundle | null;
    return b ? [b] : [];
  });
  const parents = treeParents(bundles.map((b) => decodeTree(b.tree, b.type)));
  const byName = new Map<string, Weapon>();
  for (const b of bundles) {
    for (const w of decodeWeaponBundle(b, dict)) {
      byName.set(w.name, { ...w, improve_from: parents.get(w.name) ?? null });
    }
  }
  if (bundles.length === WEAPON_TYPES.length) allWeaponsByName = byName;
  return byName;
}

interface LoadedGear {
  /** Each needed bundle's gear, by bundle file */
  bundles: Map<string, (Weapon | ArmorPiece)[]>;
  /** Every loaded weapon by name (empty when the wishlist has none) */
  byName: Map<string, Weapon>;
}

/** The decoded gear of the entries' own bundles, or null while any is loading. */
function loadedGear(filesKey: string, weapons: boolean): LoadedGear | null {
  const dict = peekDictionaries();
  if (!dict) return null;
  const bundles = new Map<string, (Weapon | ArmorPiece)[]>();
  for (const f of filesKey ? filesKey.split(",") : []) {
    const b = peekBundle(f);
    if (!b) return null;
    bundles.set(f, decodeBundle(b, dict));
  }
  return { bundles, byName: weapons ? weaponsByName(dict) : new Map() };
}

function useGearBundles(entries: WishlistEntry[]): {
  gear: LoadedGear | null;
  error: boolean;
  retry: () => void;
} {
  const weapons = entries.some((e) => e.kind === "weapon");
  const filesKey = [...new Set(entries.map(bundleFile))].sort().join(",");
  const [loads, setLoads] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const list = filesKey ? filesKey.split(",") : [];
    Promise.all([getDictionaries(), ...list.map(getBundle)]).then(
      () => !cancelled && setLoads((n) => n + 1),
      () => !cancelled && setError(true),
    );
    // Every other weapon type too, for upgrade paths that cross types (Dual
    // Blades from Sword and Shield); one that fails only shortens those paths.
    if (weapons) {
      for (const t of WEAPON_TYPES) {
        getBundle(`weapon-${t}`).then(
          () => !cancelled && setLoads((n) => n + 1),
          () => {},
        );
      }
    }
    return () => {
      cancelled = true;
    };
  }, [filesKey, weapons, attempt]);

  // `loads` re-reads the cache once a fetch lands.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gear = useMemo(() => loadedGear(filesKey, weapons), [filesKey, weapons, loads]);
  return { gear, error: error && !gear, retry: () => setAttempt((n) => n + 1) };
}

// ---------------------------------------------------------------------------
// Resolving entries
// ---------------------------------------------------------------------------

interface GearRow {
  entry: WishlistEntry;
  key: string;
  href: string;
  /** null when the data no longer has it */
  gear: Weapon | ArmorPiece | null;
  recipes: Recipe[];
  recipe: Recipe | undefined;
  /** Upgrades: the weapons up its tree, nearest first */
  ancestors: Ancestor[];
  /** Upgrades: where the path starts (see `WeaponEntry.from`) */
  from: string | null | undefined;
  steps: CraftStep[];
  /** The loaded hunter has it already */
  owned: boolean;
}

function resolveRows(
  entries: WishlistEntry[],
  {
    bundles,
    byName,
  }: { bundles: Map<string, (Weapon | ArmorPiece)[]>; byName: Map<string, Weapon> },
  owned: Set<string> | null,
): GearRow[] {
  return entries.map((entry) => {
    const key = entryKey(entry);
    const href = entryHref(entry);
    const list = bundles.get(bundleFile(entry)) ?? [];
    const listed = list.find((g) => g.slug === entry.slug) ?? null;
    // A weapon as `byName` has it: with its tree parent.
    const found = (listed && entry.kind === "weapon" && byName.get(listed.name)) || listed;
    const row: GearRow = {
      entry,
      key,
      href,
      gear: found,
      recipes: [],
      recipe: undefined,
      ancestors: [],
      from: undefined,
      steps: [],
      owned: owned?.has(href) ?? false,
    };
    if (!found) return row;
    row.recipes = recipesOf(found);
    if (entry.kind === "armor") {
      row.recipe =
        entry.recipe && row.recipes.includes(entry.recipe) ? entry.recipe : defaultRecipe(found);
      if (row.recipe) row.steps = armorSteps(found as ArmorPiece, href, row.recipe);
      return row;
    }
    const weapon = found as Weapon;
    row.ancestors = upgradeAncestors(weapon, byName);
    // Unless chosen: upgrade when the hunter has a weapon up the tree, else create where it can.
    const ownsAncestor = row.ancestors.some((a) => owned?.has(a.href));
    row.recipe =
      entry.recipe && row.recipes.includes(entry.recipe)
        ? entry.recipe
        : ownsAncestor && row.recipes.includes("improve")
          ? "improve"
          : defaultRecipe(found);
    if (!row.recipe) return row;
    if (row.recipe === "improve") {
      // Unless chosen: the nearest weapon up the tree the hunter owns, else the one just before.
      const chosen =
        entry.from === null || row.ancestors.some((a) => a.slug === entry.from)
          ? entry.from
          : undefined;
      row.from =
        chosen !== undefined
          ? chosen
          : (row.ancestors.find((a) => owned?.has(a.href))?.slug ?? row.ancestors[0]?.slug);
    }
    row.steps = weaponSteps(weapon, row.recipe, row.from, byName);
    return row;
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WishlistClient() {
  const wishlist = useWishlist();
  const entries = wishlist.entries;
  const { gear, error: gearError, retry } = useGearBundles(entries ?? []);
  const { items, error: itemsError } = useItems();
  const { sources } = useItemSources();
  const { places } = useItemPlaces();
  const { combinations } = useCombinations();
  const { quests } = useQuests();
  const questById = useMemo(() => new Map(quests?.map((q) => [q.id, q])), [quests]);
  const { save } = useSave();
  const { showMaterialCounts } = usePreferences().prefs;
  const { ids } = useEquipmentIds(!!save);
  const t = useT();
  const tw = t.items.wishlist;
  const game = useGameText();

  const owned = useMemo(
    () => (showMaterialCounts ? ownedItemCounts(save) : null),
    [showMaterialCounts, save],
  );
  const ownedGear = useMemo(() => (ids && save ? ownedHrefs(ids, save) : null), [ids, save]);

  const rows = useMemo(
    () => (entries && gear ? resolveRows(entries, gear, ownedGear) : null),
    [entries, gear, ownedGear],
  );

  const plan = useMemo(() => {
    if (!rows || !items) return null;
    const crafts = rows
      .filter((r) => r.gear && !r.owned && r.steps.length > 0)
      .map((r) => ({ gear: r.gear!.name, steps: r.steps }));
    const needs = totalMaterials(crafts, items.idOf).map((need) => {
      const id = need.itemId;
      const ways =
        id === undefined
          ? []
          : itemWays(
              sources?.get(id),
              places?.get(id),
              combinations?.byItem.get(id)?.madeFrom,
              items,
              questById,
            );
      const have = owned && id !== undefined ? (owned.get(id) ?? 0) : null;
      const short = have === null ? need.amount : Math.max(0, need.amount - have);
      return { need, ways, have, short };
    });
    // Still to get first, then the ones already in hand; each in the order first needed.
    needs.sort((a, b) => Number(a.short === 0) - Number(b.short === 0));
    const missing = needs.filter((n) => n.short > 0);
    return {
      cost: totalCost(crafts),
      needs,
      missing: missing.length,
      destinations: sources || places ? bestDestinations(missing) : [],
    };
  }, [rows, items, sources, places, combinations, questById, owned]);

  // The gear's names in the site's language, by English name, as a material's `for` lists them.
  const gearNames = useMemo(
    () =>
      new Map(
        (rows ?? []).flatMap((r) =>
          r.gear ? [[r.gear.name, game.name(r.entry.kind, r.gear.name)] as const] : [],
        ),
      ),
    [rows, game],
  );

  return (
    <div className="flex w-full max-w-[120rem] flex-col gap-[1.3rem]">
      {entries === null || (entries.length > 0 && !rows && !gearError) ? (
        <WishCard title={tw.title}>
          <Loading>{t.common.loading}</Loading>
        </WishCard>
      ) : entries.length === 0 ? (
        <WishCard title={tw.title}>
          <p className={ui.note}>{tw.empty}</p>
          <div className={ui.actions}>
            <Link href="/blacksmith/" className={ui.button}>
              {t.common.sections.weapons}
            </Link>
            <Link href="/armorsmith/" className={ui.button}>
              {t.common.sections.armor}
            </Link>
          </div>
        </WishCard>
      ) : gearError ? (
        <WishCard title={tw.title}>
          <p className={ui.error}>{tw.loadError}</p>
          <div className={ui.actions}>
            <button type="button" className={ui.button} onClick={retry}>
              {tw.retry}
            </button>
          </div>
        </WishCard>
      ) : (
        // Gear, then Where to go under it, with Materials beside both; one
        // column (gear, materials, where to go) where the page is narrow.
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] grid-rows-[auto_1fr] items-start gap-[1.3rem] mobile:grid-cols-1 mobile:grid-rows-none compact:grid-cols-1 compact:grid-rows-none">
          <WishCard title={tw.title}>
            <GearList rows={rows!} wishlist={wishlist} ownedGear={ownedGear} />
          </WishCard>
          <WishCard
            title={tw.materials}
            className="col-start-2 row-span-2 row-start-1 mobile:col-start-auto mobile:row-span-1 mobile:row-start-auto compact:col-start-auto compact:row-span-1 compact:row-start-auto"
          >
            {!plan ? (
              itemsError ? (
                <p className={ui.error}>{t.items.list.loadError}</p>
              ) : (
                <Loading>{t.common.loading}</Loading>
              )
            ) : (
              <Materials
                needs={plan.needs}
                cost={plan.cost}
                missing={plan.missing}
                zenny={owned ? save?.zenny : undefined}
                sourcesLoaded={!!sources && !!places}
                gearNames={gearNames}
              />
            )}
          </WishCard>
          {plan && plan.destinations.length > 0 && (
            <WishCard title={tw.whereToGo}>
              <p className={ui.note}>{tw.whereToGoNote}</p>
              <Destinations destinations={plan.destinations} />
            </WishCard>
          )}
        </div>
      )}
    </div>
  );
}

function WishCard({
  title,
  className,
  children,
}: {
  title: string;
  /** Its place in the page's grid */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <CardBox className={cn("flex-none", className)}>
      <Card frame="teal" className="text-small" bodyClassName={ui.sectionBody}>
        <div className={ui.menuHeader}>
          <h2 className={ui.menuTitle}>{title}</h2>
        </div>
        {children}
      </Card>
    </CardBox>
  );
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

const select =
  "max-w-full min-w-0 cursor-pointer border border-hr bg-black/45 px-[0.6rem] py-[0.3rem] font-[inherit] text-fine text-white focus-visible:border-white focus-visible:outline-none";

/** "4,500z", in the site's language. */
function useZenny(): (n: number) => string {
  const t = useT();
  const { formatNumber } = useLocale();
  return (n) => t.common.zenny(formatNumber(n));
}

function GearList({
  rows,
  wishlist,
  ownedGear,
}: {
  rows: GearRow[];
  wishlist: Wishlist;
  /** Hrefs of the gear the loaded hunter owns */
  ownedGear: Set<string> | null;
}) {
  const tw = useT().items.wishlist;
  const game = useGameText();
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((r) => {
        const name = r.gear ? game.name(r.entry.kind, r.gear.name) : r.entry.slug;
        return (
          <li
            key={r.key}
            className="flex flex-col gap-[0.6rem] border-b border-white/15 py-[0.8rem] last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-[0.6rem]">
              <GearIcon row={r} />
              <Link
                href={r.href}
                className="min-w-0 flex-1 truncate text-sub text-white underline-offset-4 hover:underline"
              >
                {name}
              </Link>
              {r.owned && <span className="flex-none text-fine text-positive">{tw.owned}</span>}
              <button
                type="button"
                aria-label={tw.removeLabel(name)}
                title={tw.remove}
                className="size-[3rem] flex-none cursor-pointer border-none bg-transparent p-0 text-[2.4rem] leading-none text-white/50 hover:text-negative focus-visible:text-negative"
                onClick={() => wishlist.remove(r.key)}
              >
                ×
              </button>
            </div>

            {!r.gear ? (
              <p className={ui.error}>{tw.missingGear}</p>
            ) : r.owned ? (
              <p className={ui.note}>{tw.ownedNote}</p>
            ) : (
              <GearRecipe row={r} wishlist={wishlist} ownedGear={ownedGear} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GearIcon({ row }: { row: GearRow }) {
  const g = row.gear;
  if (row.entry.kind === "weapon") {
    const w = g as Weapon | null;
    return <Icon type={row.entry.type} rarity={w?.rarity} color={w?.color} alt="" />;
  }
  return (
    <Icon
      type={row.entry.slot}
      rarity={Number((g as ArmorPiece | null)?.rarity) || undefined}
      alt=""
    />
  );
}

function GearRecipe({
  row,
  wishlist,
  ownedGear,
}: {
  row: GearRow;
  wishlist: Wishlist;
  /** Hrefs of the gear the loaded hunter owns */
  ownedGear: Set<string> | null;
}) {
  const tw = useT().items.wishlist;
  const game = useGameText();
  const zenny = useZenny();
  const { recipes, recipe, ancestors, from, steps } = row;
  if (!recipe) return <p className={ui.note}>{tw.noRecipe}</p>;
  const cost = steps.reduce((s, st) => s + st.cost, 0);
  return (
    <div className="flex flex-col gap-[0.6rem] text-fine text-white/60">
      <div className="flex flex-wrap items-center gap-x-[1.2rem] gap-y-[0.6rem]">
        {recipes.length > 1 ? (
          <label className="flex items-center gap-[0.6rem]">
            <span className="text-stat">{tw.recipe}</span>
            <select
              className={select}
              value={recipe}
              onChange={(e) => wishlist.update(row.key, { recipe: e.target.value as Recipe })}
            >
              {recipes.map((r) => (
                <option key={r} value={r}>
                  {tw.recipes[r]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-stat">{tw.recipes[recipe]}</span>
        )}
        {recipe === "improve" && ancestors.length > 0 && (
          <label className="flex min-w-0 items-center gap-[0.6rem]">
            <span className="flex-none text-stat">{tw.from}</span>
            <select
              className={select}
              value={from === null ? "" : (from ?? "")}
              onChange={(e) =>
                wishlist.update(row.key, { from: e.target.value === "" ? null : e.target.value })
              }
            >
              {ancestors.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {ownedGear?.has(a.href)
                    ? tw.ownedOption(game.name("weapon", a.name))
                    : game.name("weapon", a.name)}
                </option>
              ))}
              <option value="">{tw.wholePath}</option>
            </select>
          </label>
        )}
        <span className="ml-auto text-white">{zenny(cost)}</span>
      </div>
      {steps.length > 1 && (
        <ol className="m-0 flex list-none flex-wrap gap-x-[0.6rem] gap-y-[0.2rem] p-0 whitespace-normal">
          {steps.map((s, i) => (
            <li key={i}>
              {i > 0 && <span className="text-muted">→ </span>}
              <Link href={s.href} className="text-white/80 underline-offset-4 hover:underline">
                {game.name(row.entry.kind, s.name)}
              </Link>
              {s.recipe !== "improve" && (
                <span className="text-white/50"> {tw.stepRecipes[s.recipe]}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface NeedRow {
  need: MaterialNeed;
  ways: Way[];
  have: number | null;
  short: number;
}

/** How many ways to show under each material before the link to the item's page. */
const WAYS_SHOWN = 3;

function Materials({
  needs,
  cost,
  missing,
  zenny: have,
  sourcesLoaded,
  gearNames,
}: {
  needs: NeedRow[];
  cost: number;
  missing: number;
  zenny: number | undefined;
  sourcesLoaded: boolean;
  /** The gear's names in the site's language, by English name */
  gearNames: ReadonlyMap<string, string>;
}) {
  const tw = useT().items.wishlist;
  const { formatNumber } = useLocale();
  const zenny = useZenny();
  if (needs.length === 0) {
    return <p className={ui.note}>{tw.nothingLeft}</p>;
  }
  const counted = needs.some((n) => n.have !== null);
  return (
    <>
      <p className="flex flex-wrap gap-x-[1.6rem] gap-y-[0.4rem] text-white">
        <span>
          <span className="text-stat">{tw.cost} </span>
          {zenny(cost)}
          {have !== undefined && (
            <span className={cn("text-fine", have < cost ? "text-negative" : "text-white/60")}>
              {" "}
              {tw.youHave(zenny(have))}
            </span>
          )}
        </span>
        <span>
          <span className="text-stat">{tw.materialsCount} </span>
          {counted
            ? tw.stillToGet(missing, formatNumber(missing), formatNumber(needs.length))
            : formatNumber(needs.length)}
        </span>
      </p>
      {!counted && <p className={ui.note}>{tw.loadSave}</p>}
      <ul className="m-0 flex list-none flex-col p-0">
        {needs.map((n) => (
          <MaterialItem
            key={n.need.href}
            row={n}
            sourcesLoaded={sourcesLoaded}
            gearNames={gearNames}
          />
        ))}
      </ul>
    </>
  );
}

/** Amounts padded to keep the column steady, as on the recipe lists. */
const pad = (n: number | string) => String(n).padStart(2, " ");

function MaterialItem({
  row,
  sourcesLoaded,
  gearNames,
}: {
  row: NeedRow;
  sourcesLoaded: boolean;
  gearNames: ReadonlyMap<string, string>;
}) {
  const tw = useT().items.wishlist;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const { need, ways, have, short } = row;
  const done = have !== null && short === 0;
  const shown = ways.slice(0, WAYS_SHOWN);
  return (
    <li
      className={cn(
        "flex flex-col gap-[0.4rem] border-b border-white/15 py-[0.8rem] last:border-b-0",
        done && "opacity-50",
      )}
    >
      <div
        className="flex min-w-0 items-center"
        title={tw.forGear(need.for.map((g) => gearNames.get(g) ?? g).join(", "))}
      >
        <Icon type={need.type} color={need.color} />
        <Link
          href={need.href}
          className="min-w-0 flex-1 truncate text-main text-white underline-offset-4 hover:underline mobile:whitespace-normal"
        >
          {game.name("item", need.name)}
        </Link>
        <span className="flex-none text-main whitespace-pre text-white">
          {have === null ? (
            `:${pad(need.amount)}`
          ) : (
            <>
              :
              <span className={short > 0 ? "text-negative" : "text-positive"}>
                {pad(have === Infinity ? "∞" : have)}
              </span>
              /{pad(need.amount)}
            </>
          )}
        </span>
      </div>
      {!done &&
        (shown.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-[0.3rem] p-0 pl-[3.6rem] mobile:pl-0">
            {shown.map((w, i) => (
              <WayLine key={i} way={w} />
            ))}
            {ways.length > shown.length && (
              <li className="text-fine">
                <Link href={need.href} className="text-white/50 underline-offset-4 hover:underline">
                  {tw.more(ways.length - shown.length, formatNumber(ways.length - shown.length))}
                </Link>
              </li>
            )}
          </ul>
        ) : (
          sourcesLoaded && (
            <p className="pl-[3.6rem] text-fine text-white/50 mobile:pl-0">{tw.noSource}</p>
          )
        ))}
    </li>
  );
}

/** The monster, map, quest, shop or ingredients, in the site's language. */
function wayName(t: Messages, game: GameText, items: ItemLookup | null, way: Way): string {
  switch (way.kind) {
    case "monster":
      return game.name("monster", way.name);
    case "gather":
      return way.map ? groundName(game, way.map) : way.name;
    case "quest":
      return way.questId !== undefined ? game.quest(way.questId, "title", way.name) : way.name;
    case "shop":
      return t.items.shops.names[way.name] ?? way.name;
    case "combine":
      if (!way.ingredients || !items) return way.name;
      return way.ingredients
        .map((id) => {
          const it = items.get(id);
          return it.known ? game.name("item", it.name) : t.quests.rewards.unknownItem(id);
        })
        .join(" + ");
  }
}

/** How: the drop table, the kinds of gathering point, the reward or the shop's stock. */
function wayDetail(t: Messages, formatNumber: (n: number) => string, way: Way): string | null {
  const tw = t.items.wishlist.ways;
  switch (way.kind) {
    case "monster":
      return way.source ? dropSourceLabel(t, way.source) : way.detail;
    case "gather": {
      if (!way.gatherKinds) return way.detail;
      const kinds = way.gatherKinds.map((k) => tw.gatherKinds[k]).join(", ");
      return way.quests
        ? `${kinds} · ${tw.onlyOnQuests(way.quests.length, formatNumber(way.quests.length))}`
        : kinds;
    }
    case "quest":
      return way.stars ? tw.questReward(way.stars) : way.detail;
    case "shop":
      return [
        way.currency === "pokke-points" ? t.items.shops.pokkePoints : tw.shop,
        way.stage !== undefined && tw.stageStock(way.stage),
      ]
        .filter(Boolean)
        .join(" · ");
    case "combine":
      return null;
  }
}

/** One way to get a material: what to do, where, how, and the odds or price. */
function WayLine({ way }: { way: Way }) {
  const t = useT();
  const game = useGameText();
  const { items } = useItems();
  const { formatNumber } = useLocale();
  const zenny = useZenny();
  const value =
    way.kind === "shop"
      ? way.price === null || way.price === undefined
        ? "—"
        : way.currency === "pokke-points"
          ? t.items.wishlist.ways.pokkePoints(formatNumber(way.price))
          : zenny(way.price)
      : `${formatNumber(way.chance ?? 0)}%`;
  const meta = [way.group && groupLabel(t, way.group), wayDetail(t, formatNumber, way)]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex min-w-0 items-baseline gap-[0.8rem] text-fine leading-[1.3]">
      <span className="w-cells-8 flex-none text-stat">{t.items.wishlist.ways.kinds[way.kind]}</span>
      <span className="min-w-0 flex-1 whitespace-normal text-white/60">
        {way.href ? (
          <Link href={way.href} className="text-white underline-offset-4 hover:underline">
            {wayName(t, game, items, way)}
          </Link>
        ) : (
          <span className="text-white">{wayName(t, game, items, way)}</span>
        )}
        {meta && <span> · {meta}</span>}
      </span>
      <span
        className={cn(
          "flex-none text-right tabular-nums",
          way.chance !== null && way.chance >= 100 ? "text-positive" : "text-white",
        )}
      >
        {value}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Where to go
// ---------------------------------------------------------------------------

function Destinations({ destinations }: { destinations: Destination[] }) {
  const t = useT();
  const tw = t.items.wishlist;
  const game = useGameText();
  const { formatNumber } = useLocale();
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {destinations.map((d) => {
        const name =
          d.kind === "gather"
            ? d.map
              ? groundName(game, d.map)
              : d.name
            : game.name("monster", d.name);
        const group = groupLabel(t, d.group);
        return (
          <li
            key={`${d.kind}|${d.name}|${d.group}`}
            className="flex flex-col gap-[0.4rem] border-b border-white/15 py-[0.8rem] last:border-b-0"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-[0.8rem] gap-y-[0.2rem]">
              {d.map && <MapIcon map={d.map} className="size-[2.8rem] flex-none" />}
              {d.href ? (
                <Link
                  href={d.href}
                  className="min-w-0 truncate text-sub text-white underline-offset-4 hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-sub text-white">{name}</span>
              )}
              <span className="flex-none text-fine text-white/60">
                {d.kind === "gather" ? tw.gatheringIn(group) : group}
              </span>
              <span className="ml-auto flex-none text-fine text-stat">
                {tw.materialCount(d.materials.length, formatNumber(d.materials.length))}
              </span>
            </div>
            <p className="m-0 text-fine leading-[1.4] whitespace-normal text-white/60">
              {d.materials.map((m, i) => (
                <span key={m.need.href}>
                  {i > 0 && ", "}
                  <span className="text-white/85">{game.name("item", m.need.name)}</span>{" "}
                  {formatNumber(m.way.chance ?? 0)}%
                </span>
              ))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
