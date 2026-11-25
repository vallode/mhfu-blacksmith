"use client";

import { useMemo } from "react";
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
import { DropGrid } from "@/components/MonsterDrops";
import Tabs, { type Tab } from "@/components/Tabs";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import {
  useCombinations,
  useItemPlaces,
  useItems,
  useItemSources,
  useItemTrades,
  useItemUses,
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
import type { FarmPlace, GatherPlace, ShopPlace } from "@/lib/item-places";
import { groupBy, itemHref, type MonsterSource, type QuestSource } from "@/lib/item-sources";
import {
  clearedQuestIds,
  type Quest,
  questHref,
  questStarLevel,
  rewardTableHeading,
} from "@/lib/quests";
import { groupTrades, tradeMapsLabel, type ItemTrades, type Trade } from "@/lib/veggie-trades";
import {
  dropSourceLabel,
  farmLabel,
  farmPointName,
  groundName,
  groupLabel,
} from "../source-labels";
import ItemUses from "./ItemUses";
import { NameLink, SourceList, type LinkedName, type SourceRow } from "./SourceList";

interface Props {
  slug: string;
}

export default function ItemDetailClient({ slug }: Props) {
  const { items, error } = useItems();
  const { sources, error: sourcesError } = useItemSources();
  const { places, error: placesError } = useItemPlaces();
  const { combinations, error: combinationsError } = useCombinations();
  const { trades, error: tradesError } = useItemTrades();
  const { uses, error: usesError } = useItemUses();
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
  if (placed?.gathering.length || placed?.farm.length) {
    tabs.push({
      id: "gathering",
      label: t.items.detail.tabs.gathering,
      content: (
        <GatherPlaces
          places={placed.gathering}
          farm={placed.farm}
          quests={quests}
          cleared={cleared}
        />
      ),
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
  const used = uses?.get(item.id);
  if (used?.length) {
    tabs.push({
      id: "uses",
      label: t.items.detail.tabs.uses,
      content: <ItemUses uses={used} />,
    });
  }
  // The tabs wait for every bundle to load or fail, so they don't reorder
  // under the reader; one that fails leaves the others' tabs and a note.
  const settled =
    (sources || sourcesError) &&
    (places || placesError) &&
    (combinations || combinationsError) &&
    (trades || tradesError) &&
    (uses || usesError);
  const failed = sourcesError || placesError || combinationsError || tradesError || usesError;

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
 * map, or per quest where only that quest's points give it. Then Pokke
 * Farm's points, a row per upgrade.
 */
function GatherPlaces({
  places,
  farm,
  quests,
  cleared,
}: {
  places: GatherPlace[];
  farm: FarmPlace[];
  quests: Quest[] | null;
  cleared: ReadonlySet<number> | null;
}) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  const byId = new Map(quests?.map((q) => [q.id, q]));
  const grid = (
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
      {farm.length > 0 && (
        <SourceList
          title={t.items.farm.title}
          rows={farm.map((p) => ({
            name: farmPointName(t, p.point),
            detail: farmLabel(t, p),
            amount: amountLabel(p.amount),
            value: `${formatNumber(p.chance)}%`,
          }))}
        />
      )}
    </DropGrid>
  );
  if (farm.length === 0) return grid;
  return (
    <div className="flex flex-col gap-[1.6rem]">
      {grid}
      <p className="m-0 text-fine whitespace-normal text-white/60">
        {t.items.farm.restocks}
        {farm.some((p) => p.spot === "mining" || p.spot === "insects") &&
          ` ${t.items.farm.upgradesStack}`}
      </p>
    </div>
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
