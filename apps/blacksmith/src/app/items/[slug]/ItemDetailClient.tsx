"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ItemAreaMap } from "@/components/AreaMap";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import MapIcon from "@/components/MapIcon";
import { DropGrid, dropQuantity } from "@/components/MonsterDrops";
import Tabs, { type Tab } from "@/components/Tabs";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import {
  useCombinations,
  useItemPlaces,
  useItems,
  useItemSources,
  useItemTrades,
  useQuests,
  type ItemLookup,
} from "@/lib/client-data";
import {
  quantityLabel,
  quantityOdds,
  type Combination,
  type ItemCombinations,
} from "@/lib/combinations";
import { ownedItemCounts } from "@/lib/hunter-progress";
import type { Messages } from "@/lib/i18n/messages";
import { itemCategory } from "@/lib/item-categories";
import type { GatherPlace, ShopPlace } from "@/lib/item-places";
import { groupBy, itemHref, type MonsterSource, type QuestSource } from "@/lib/item-sources";
import {
  clearedQuestIds,
  type Quest,
  questHref,
  questStarLevel,
  rewardTableHeading,
} from "@/lib/quests";
import { groupTrades, tradeMapsLabel, type ItemTrades, type Trade } from "@/lib/veggie-trades";
import { dropSourceLabel, groundName, groupLabel } from "../source-labels";

interface Props {
  slug: string;
}

export default function ItemDetailClient({ slug }: Props) {
  const { items, error } = useItems();
  const { sources, error: sourcesError } = useItemSources();
  const { places, error: placesError } = useItemPlaces();
  const { combinations, error: combinationsError } = useCombinations();
  const { trades, error: tradesError } = useItemTrades();
  const { quests } = useQuests();
  const { save } = useSave();
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  const { showMaterialCounts, markCleared } = usePreferences().prefs;
  const owned = useMemo(
    () => (showMaterialCounts ? ownedItemCounts(save) : null),
    [showMaterialCounts, save],
  );
  const cleared = useMemo(() => (markCleared ? clearedQuestIds(save) : null), [markCleared, save]);

  // The nav and the item list on the left come from the items layout
  // (ItemShell), which stays mounted; this is only the detail panel.
  const item = items?.bySlug(slug);
  if (!items || !item) {
    return (
      <DetailCard>
        {items ? (
          <p>{t.items.detail.notFound}</p>
        ) : error ? (
          <p className="text-negative">{t.items.list.loadError}</p>
        ) : (
          <Loading>{t.common.loading}</Loading>
        )}
      </DetailCard>
    );
  }

  const own = owned?.get(item.id) ?? (owned ? 0 : null);
  const found = sources?.get(item.id);
  const placed = places?.get(item.id);
  const tabs: Tab[] = [];
  if (found?.monsters.length) {
    tabs.push({
      id: "monsters",
      label: t.items.detail.tabs.monsters,
      content: <MonsterSources sources={found.monsters} />,
    });
  }
  if (found?.quests.length) {
    tabs.push({
      id: "quests",
      label: t.items.detail.tabs.quests,
      content: <QuestSources sources={found.quests} cleared={cleared} />,
    });
  }
  if (placed?.gathering.length) {
    tabs.push({
      id: "gathering",
      label: t.items.detail.tabs.gathering,
      content: <GatherPlaces places={placed.gathering} quests={quests} cleared={cleared} />,
    });
  }
  if (placed?.gathering.some((p) => p.mapQuest !== undefined)) {
    tabs.push({
      id: "map",
      label: t.items.detail.tabs.map,
      content: (
        <ItemAreaMap
          places={placed.gathering}
          quests={new Map(quests?.map((q) => [q.id, q]))}
          gives={(name) => items.idOf(name) === item.id}
        />
      ),
    });
  }
  if (placed?.shops.length) {
    tabs.push({
      id: "shops",
      label: t.items.detail.tabs.shops,
      content: <ShopPlaces places={placed.shops} />,
    });
  }
  const traded = trades?.get(item.id);
  if (traded) {
    tabs.push({
      id: "trades",
      label: t.items.detail.tabs.trades,
      content: <VeggieTrades trades={traded} items={items} />,
    });
  }
  const combos = combinations?.byItem.get(item.id);
  if (combinations && combos) {
    tabs.push({
      id: "combining",
      label: t.items.detail.tabs.combining,
      content: (
        <CombinationSources
          itemId={item.id}
          combos={combos}
          items={items}
          bookBonus={combinations.bookBonus}
        />
      ),
    });
  }
  // The tabs wait for every bundle to load or fail, so they don't reorder
  // under the reader; one that fails leaves the others' tabs and a note.
  const settled =
    (sources || sourcesError) &&
    (places || placesError) &&
    (combinations || combinationsError) &&
    (trades || tradesError);
  const failed = sourcesError || placesError || combinationsError || tradesError;

  return (
    <DetailCard>
      <DetailHeader>
        <Icon type={item.type} color={item.color} size="large" alt="" />
        <DetailName>{game.name("item", item.name)}</DetailName>
      </DetailHeader>

      <DetailBody>
        <StatList>
          <Stat label={t.items.detail.category}>
            <StatValue>{t.items.categories[itemCategory(item.id)]}</StatValue>
          </Stat>
          {item.rarity !== undefined && (
            <Stat label={t.items.detail.rarity}>
              <StatValue>{item.rarity}</StatValue>
            </Stat>
          )}
          {item.carry !== undefined && (
            <Stat label={t.items.detail.carry}>
              <StatValue>{item.carry === 255 ? "∞" : formatNumber(item.carry)}</StatValue>
            </Stat>
          )}
          {!!item.price && (
            <Stat label={t.items.detail.price}>
              <StatValue>{t.common.zenny(formatNumber(item.price))}</StatValue>
            </Stat>
          )}
          {own !== null && (
            <Stat label={t.items.detail.owned}>
              <StatValue>{own === Infinity ? "∞" : formatNumber(own)}</StatValue>
            </Stat>
          )}
        </StatList>

        <DetailRule />

        {!settled ? (
          <Loading>{t.common.loading}</Loading>
        ) : tabs.length > 0 ? (
          <Tabs key={slug} tabs={tabs} label={t.items.detail.tabsLabel} />
        ) : (
          !failed && <p className="whitespace-normal text-white">{t.items.detail.noSources}</p>
        )}
        {settled && failed && (
          <p className="text-negative">{t.items.detail.loadError(tabs.length > 0)}</p>
        )}
      </DetailBody>
    </DetailCard>
  );
}

/** "×3", or nothing for one */
const amountLabel = (n: number) => (n > 1 ? `×${n}` : undefined);

/** The item's monster drops, one list per rank, best chance first. */
function MonsterSources({ sources }: { sources: MonsterSource[] }) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  return (
    <DropGrid>
      {groupBy(sources, (s) => s.rank).map(([rank, rows]) => (
        <SourceList
          key={rank}
          title={groupLabel(t, rank)}
          rows={rows.map((s) => ({
            name: game.name("monster", s.monster.name),
            href: s.monster.href,
            detail: dropSourceLabel(t, s.source),
            amount: amountLabel(s.quantity),
            value: `${formatNumber(s.chance)}%`,
            strong: s.chance >= 100,
          }))}
        />
      ))}
    </DropGrid>
  );
}

/** The item's quest rewards, one list per quest board, best chance first. */
function QuestSources({
  sources,
  cleared,
}: {
  sources: QuestSource[];
  cleared: ReadonlySet<number> | null;
}) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  return (
    <DropGrid>
      {groupBy(sources, (s) => s.quest.hub).map(([hub, rows]) => (
        <SourceList
          key={hub}
          title={t.quests.hubs[rows[0]!.quest.hub]}
          rows={rows.map(({ quest, table, amount, chance }) => {
            const { g, stars } = questStarLevel(quest.hub, quest.stars);
            const { count } = rewardTableHeading(table);
            const kind = t.quests.rewards.kinds[table.kind];
            return {
              name: game.quest(quest.id, "title", quest.title),
              href: questHref(quest),
              prefix: `${g ? "G" : ""}${stars}★`,
              detail: [
                count !== undefined ? `${kind} ×${count}` : kind,
                table.kind === "conditional" &&
                  table.condition !== null &&
                  t.quests.rewards.condition(table.condition),
              ]
                .filter(Boolean)
                .join(" · "),
              cleared: cleared?.has(quest.id),
              amount: amountLabel(amount),
              value: `${formatNumber(chance)}%`,
              strong: chance >= 100,
            };
          })}
        />
      ))}
    </DropGrid>
  );
}

/**
 * The item's gathering points, one list per rank or quest board: a row per
 * map, or per quest where only that quest's points give it.
 */
function GatherPlaces({
  places,
  quests,
  cleared,
}: {
  places: GatherPlace[];
  quests: Quest[] | null;
  cleared: ReadonlySet<number> | null;
}) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  const byId = new Map(quests?.map((q) => [q.id, q]));
  return (
    <DropGrid>
      {groupBy(places, (p) => p.group).map(([group, rows]) => (
        <SourceList
          key={group}
          title={groupLabel(t, group)}
          rows={rows.flatMap((p): SourceRow[] => {
            const value = `${formatNumber(p.chance)}%`;
            const points = gatherPointsLabel(t.items.gathering, p.points);
            const mapName = game.name("map", p.map);
            if (!p.quests) return [{ name: mapName, map: p.map, detail: points, value }];
            return p.quests.map((id) => {
              const quest = byId.get(id);
              return {
                name: quest
                  ? game.quest(quest.id, "title", quest.title)
                  : t.items.detail.unknownQuest(id),
                href: quest && questHref(quest),
                map: p.map,
                detail: `${mapName} · ${points}`,
                cleared: cleared?.has(id),
                value,
              };
            });
          })}
        />
      ))}
    </DropGrid>
  );
}

/** "Mining: areas 2, 5 · Gathering: Base Camp, area 3", in the site's language. */
function gatherPointsLabel(t: Messages["items"]["gathering"], points: GatherPlace["points"]) {
  return points
    .map(({ kind, areas }) => {
      const numbered = areas.filter((a) => a > 0);
      const places = [
        ...(areas.includes(0) ? [t.baseCamp] : []),
        ...(numbered.length > 0 ? [t.areas(numbered)] : []),
      ];
      return t.points(t.kinds[kind], places.join(", "));
    })
    .join(" · ");
}

/** Which stages of a shop's stock have the item: "From the start", "Stages 1, 3 and 5 of 5". */
function shopStagesLabel(t: Messages["items"]["shops"], { stages, stageCount }: ShopPlace) {
  const first = stages[0]!;
  if (stages.length === stageCount - first + 1) {
    return first === 1 ? t.fromStart : t.fromStage(first, stageCount);
  }
  return t.stagesOf(stages, stageCount);
}

/** The shops that sell the item, with its price and the stages of their stock that have it. */
function ShopPlaces({ places }: { places: ShopPlace[] }) {
  const t = useT();
  const { formatNumber } = useLocale();
  const shops = t.items.shops;
  return (
    <DropGrid>
      <SourceList
        title={shops.title}
        rows={places.map((p) => ({
          name: shops.names[p.shop] ?? p.shop,
          detail: [shopStagesLabel(shops, p), p.currency === "pokke-points" && shops.pokkePoints]
            .filter(Boolean)
            .join(" · "),
          value: p.price === null ? "—" : t.common.zenny(formatNumber(p.price)),
        }))}
      />
    </DropGrid>
  );
}

/**
 * The Veggie Elder trades that give the item and the ones that take it, a
 * row per distinct trade with the grounds that make it and the list number
 * there, which decides which one he makes.
 */
function VeggieTrades({ trades, items }: { trades: ItemTrades; items: ItemLookup }) {
  const t = useT();
  const tv = t.items.veggieElder;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const grounds = (maps: string[]) => tradeMapsLabel(maps, (m) => groundName(game, m));
  // One row per distinct trade, with every ground that makes it, not a row per ground.
  const rows = (list: Trade[]): SourceRow[] =>
    groupTrades(list).map((g) => {
      const it = items.get(g.item);
      return {
        name: it.known ? game.name("item", it.name) : t.quests.rewards.unknownItem(g.item),
        href: it.known ? itemHref(it.name) : undefined,
        icon: { type: it.type, color: it.color },
        detail: [
          g.rare && tv.rareTrade,
          // The list place only where it's one ground: on several it is a different one on each.
          g.places.length === 1
            ? tv.listPlace(grounds(g.places[0]!.maps), g.places[0]!.row)
            : g.places.map((p) => grounds(p.maps)).join(", "),
        ]
          .filter(Boolean)
          .join(" · "),
        value: `${formatNumber(g.chance)}%`,
        strong: g.chance >= 100,
      };
    });
  return (
    <div className="flex flex-col gap-[1.6rem]">
      <DropGrid>
        {trades.gives.length > 0 && <SourceList title={tv.gives} rows={rows(trades.gives)} />}
        {trades.takes.length > 0 && <SourceList title={tv.takes} rows={rows(trades.takes)} />}
      </DropGrid>
      <p className="m-0 text-fine whitespace-normal text-white/60">{tv.itemNote}</p>
    </div>
  );
}

const sourceName = "min-w-0 flex-1 truncate text-white underline-offset-4 mobile:whitespace-normal";

/**
 * The combinations that make the item and the ones it goes into, in
 * Combination List order, with the book bonus the rates leave out.
 */
function CombinationSources({
  itemId,
  combos,
  items,
  bookBonus,
}: {
  itemId: number;
  combos: ItemCombinations;
  items: ItemLookup;
  bookBonus: number[];
}) {
  const t = useT();
  const tc = t.items.combining;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const link = (id: number): LinkedName => {
    const it = items.get(id);
    return it.known
      ? { name: game.name("item", it.name), href: itemHref(it.name) }
      : { name: t.quests.rewards.unknownItem(id) };
  };
  const books = bookBonus
    .slice(1)
    .map((b) => `+${b}%`)
    .join(", ");
  // Amounts only where a combine can give more than one, as in the other lists.
  const amount = (c: Combination) => {
    const label = quantityLabel(c.quantity);
    return label === "×1" ? undefined : label;
  };
  const rate = (c: Combination) => ({
    value: `${formatNumber(c.successRate)}%`,
    strong: c.successRate >= 100,
  });
  // What it needs and what makes it certain, then its place in the list.
  const detail = (c: Combination) => {
    const odds = quantityOdds(c.quantity);
    return [
      c.alchemy && tc.alchemy,
      c.bomb && tc.bomber,
      c.trap && tc.trapMaster,
      odds && tc.makes(odds),
      tc.listNumber(c.number),
    ]
      .filter(Boolean)
      .join(" · ");
  };
  return (
    <div className="flex flex-col gap-[1.6rem]">
      <DropGrid>
        {combos.madeFrom.length > 0 && (
          <SourceList
            title={tc.madeFrom}
            rows={combos.madeFrom.map((c) => ({
              name: c.ingredients.map(link),
              detail: detail(c),
              amount: amount(c),
              ...rate(c),
            }))}
          />
        )}
        {combos.usedIn.length > 0 && (
          <SourceList
            title={tc.usedIn}
            rows={combos.usedIn.map((c) => {
              const other = c.ingredients.find((id) => id !== itemId) ?? itemId;
              return {
                ...link(c.result),
                detail: (
                  <>
                    {tc.with(<NameLink {...link(other)} />)}
                    {` · ${detail(c)}`}
                  </>
                ),
                amount: amount(c),
                ...rate(c),
              };
            })}
          />
        )}
      </DropGrid>
      {bookBonus.length > 1 && (
        <p className="m-0 text-fine whitespace-normal text-white/60">
          {tc.booksNote(bookBonus.length - 1, books)}
        </p>
      )}
    </div>
  );
}

interface LinkedName {
  name: string;
  /** Its page, when it has one */
  href?: string;
}

function NameLink({ name, href }: LinkedName) {
  return href ? (
    <Link href={href} title={name} className="text-white underline-offset-4 hover:underline">
      {name}
    </Link>
  ) : (
    <span className="text-white">{name}</span>
  );
}

interface SourceRow {
  /** One name, or several joined by "+" (a combination's ingredients), which wrap rather than cut */
  name: string | LinkedName[];
  /** The row's page, when it has one */
  href?: string;
  /** Before the name: a quest's star level */
  prefix?: string;
  /** Before the name: the map's icon (gathering points) */
  map?: string;
  /** Before the name: an item's icon */
  icon?: { type: string; color: string };
  /** How it's obtained, on the line below */
  detail: ReactNode;
  /** The loaded hunter has cleared this quest */
  cleared?: boolean;
  /** How many each success gives ("×3", "×1-3"), when it can be more than one */
  amount?: string;
  /** Right-hand column: a chance or a price */
  value: string;
  /** Highlight the value (a sure drop) */
  strong?: boolean;
}

/**
 * A titled list of sources: the monster, quest, map or shop (linked where it
 * has a page), how many each success gives, and the chance or price, with
 * how it's obtained on a line below.
 */
function SourceList({ title, rows }: { title: string; rows: SourceRow[] }) {
  const cleared = useT().quests.cleared;
  // Only lists with amounts get the amount column, so chances stay next to the names.
  const showAmount = rows.some((r) => r.amount);
  // "×3" fits three cells; a range ("×1-3") takes five.
  const wideAmount = rows.some((r) => (r.amount?.length ?? 0) > 3);
  // Chances fit four cells ("100%"); prices can take more ("12000z").
  const wide = rows.some((r) => r.value.length > 4);
  return (
    <section className="flex min-w-0 flex-col gap-[0.6rem]">
      <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-[0.8rem] p-0">
        {rows.map((r, i) => (
          <li key={i} className="flex min-w-0 gap-[0.8rem] leading-[1.25]">
            {r.prefix && <span className="w-cells-4 flex-none text-stat">{r.prefix}</span>}
            {r.map && <MapIcon map={r.map} />}
            {r.icon && <Icon type={r.icon.type} color={r.icon.color} />}
            <div className="flex min-w-0 flex-1 flex-col gap-[0.2rem]">
              <div className="flex min-w-0 items-baseline gap-[0.8rem]">
                {typeof r.name !== "string" ? (
                  <span className="min-w-0 flex-1 whitespace-normal">
                    {r.name.map((n, j) => (
                      <Fragment key={j}>
                        {j > 0 && <span className="text-muted"> + </span>}
                        <NameLink {...n} />
                      </Fragment>
                    ))}
                  </span>
                ) : r.href ? (
                  <Link href={r.href} title={r.name} className={cn(sourceName, "hover:underline")}>
                    {r.name}
                  </Link>
                ) : (
                  <span title={r.name} className={sourceName}>
                    {r.name}
                  </span>
                )}
                {showAmount && (
                  <span className={wideAmount ? "w-cells-5 flex-none text-muted" : dropQuantity}>
                    {r.amount}
                  </span>
                )}
                <span
                  className={cn(
                    "flex-none text-right text-white tabular-nums",
                    wide ? "w-cells-7" : "w-cells-4",
                    r.strong && "text-positive",
                  )}
                >
                  {r.value}
                </span>
              </div>
              <p className="flex min-w-0 gap-[0.8rem] text-fine whitespace-normal text-white/60">
                <span className="min-w-0 flex-1">{r.detail}</span>
                {r.cleared && <span className="flex-none text-stat">{cleared}</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
