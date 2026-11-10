"use client";

import { useMemo } from "react";
import Link from "next/link";
import Card from "@/components/Card";
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
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { useItemPlaces, useItems, useItemSources, useQuests } from "@/lib/client-data";
import { ownedItemCounts } from "@/lib/hunter-progress";
import { itemCategory, itemCategoryLabel } from "@/lib/item-categories";
import {
  gatherPointsLabel,
  shopStagesLabel,
  type GatherPlace,
  type ShopPlace,
} from "@/lib/item-places";
import { groupBy, type MonsterSource, type QuestSource } from "@/lib/item-sources";
import type { DropSource } from "@/lib/monster-drops";
import {
  clearedQuestIds,
  type Quest,
  questHref,
  questHubLabel,
  questStarLevel,
  rewardTableHeading,
} from "@/lib/quests";

interface Props {
  slug: string;
}

export default function ItemDetailClient({ slug }: Props) {
  const { items, error } = useItems();
  const { sources, error: sourcesError } = useItemSources();
  const { places, error: placesError } = useItemPlaces();
  const { quests } = useQuests();
  const { save } = useSave();
  const { showMaterialCounts, markCleared } = usePreferences().prefs;
  const owned = useMemo(
    () => (showMaterialCounts ? ownedItemCounts(save) : null),
    [showMaterialCounts, save],
  );
  const cleared = useMemo(() => (markCleared ? clearedQuestIds(save) : null), [markCleared, save]);

  // The nav and the item list on the left come from the items layout
  // (ItemShell), which stays mounted; this is only the detail panel.
  const item = items?.bySlug(slug);
  if (!item) {
    return (
      <Card>
        {items ? (
          <p>Not found.</p>
        ) : error ? (
          <p className="text-negative">Couldn&apos;t load items.</p>
        ) : (
          <Loading>Loading…</Loading>
        )}
      </Card>
    );
  }

  const own = owned?.get(item.id) ?? (owned ? 0 : null);
  const found = sources?.get(item.id);
  const placed = places?.get(item.id);
  const tabs: Tab[] = [];
  if (found?.monsters.length) {
    tabs.push({
      id: "monsters",
      label: "Monsters",
      content: <MonsterSources sources={found.monsters} />,
    });
  }
  if (found?.quests.length) {
    tabs.push({
      id: "quests",
      label: "Quests",
      content: <QuestSources sources={found.quests} cleared={cleared} />,
    });
  }
  if (placed?.gathering.length) {
    tabs.push({
      id: "gathering",
      label: "Gathering",
      content: <GatherPlaces places={placed.gathering} quests={quests} cleared={cleared} />,
    });
  }
  if (placed?.shops.length) {
    tabs.push({ id: "shops", label: "Shops", content: <ShopPlaces places={placed.shops} /> });
  }

  return (
    <DetailCard>
      <DetailHeader>
        <Icon type={item.type} color={item.color} size="large" alt="" />
        <DetailName>{item.name}</DetailName>
      </DetailHeader>

      <DetailBody>
        <StatList>
          <Stat label="Category:">
            <StatValue>{itemCategoryLabel(itemCategory(item.id))}</StatValue>
          </Stat>
          {item.rarity !== undefined && (
            <Stat label="Rarity:">
              <StatValue>{item.rarity}</StatValue>
            </Stat>
          )}
          {own !== null && (
            <Stat label="Owned:">
              <StatValue>{own === Infinity ? "∞" : own}</StatValue>
            </Stat>
          )}
        </StatList>

        <DetailRule />

        {sources && places ? (
          tabs.length > 0 ? (
            <Tabs key={slug} tabs={tabs} label="Where to get it" />
          ) : (
            <p className="whitespace-normal text-white">
              No monster drop, quest reward, gathering point or shop gives this item.
            </p>
          )
        ) : sourcesError || placesError ? (
          <p className="text-negative">Couldn&apos;t load where to get this item.</p>
        ) : (
          <Loading>Loading…</Loading>
        )}
      </DetailBody>
    </DetailCard>
  );
}

/** "Body carves ×3 · fished out, using frog as bait" */
function dropSourceLabel({ title, count, note }: DropSource): string {
  return [count !== undefined ? `${title} ×${count}` : title, note].filter(Boolean).join(" · ");
}

/** The item's monster drops, one list per rank, best chance first. */
function MonsterSources({ sources }: { sources: MonsterSource[] }) {
  return (
    <DropGrid>
      {groupBy(sources, (s) => s.rank).map(([rank, rows]) => (
        <SourceList
          key={rank}
          title={rank}
          rows={rows.map((s) => ({
            name: s.monster.name,
            href: s.monster.href,
            detail: dropSourceLabel(s.source),
            quantity: s.quantity,
            value: `${s.chance}%`,
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
  return (
    <DropGrid>
      {groupBy(sources, (s) => s.quest.hub).map(([hub, rows]) => (
        <SourceList
          key={hub}
          title={questHubLabel(hub)}
          rows={rows.map(({ quest, table, amount, chance }) => {
            const { g, stars } = questStarLevel(quest.hub, quest.stars);
            const heading = rewardTableHeading(table);
            return {
              name: quest.title,
              href: questHref(quest),
              prefix: `${g ? "G" : ""}${stars}★`,
              detail: [
                heading.count !== undefined ? `${heading.title} ×${heading.count}` : heading.title,
                heading.note,
              ]
                .filter(Boolean)
                .join(" · "),
              cleared: cleared?.has(quest.id),
              quantity: amount,
              value: `${chance}%`,
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
  const byId = new Map(quests?.map((q) => [q.id, q]));
  return (
    <DropGrid>
      {groupBy(places, (p) => p.group).map(([group, rows]) => (
        <SourceList
          key={group}
          title={group}
          rows={rows.flatMap((p): SourceRow[] => {
            const value = `${p.chance}%`;
            const points = gatherPointsLabel(p.points);
            if (!p.quests) return [{ name: p.map, map: p.map, detail: points, quantity: 1, value }];
            return p.quests.map((id) => {
              const quest = byId.get(id);
              return {
                name: quest?.title ?? `Quest ${id}`,
                href: quest && questHref(quest),
                map: p.map,
                detail: `${p.map} · ${points}`,
                cleared: cleared?.has(id),
                quantity: 1,
                value,
              };
            });
          })}
        />
      ))}
    </DropGrid>
  );
}

/** The shops that sell the item, with its price and the stages of their stock that have it. */
function ShopPlaces({ places }: { places: ShopPlace[] }) {
  return (
    <DropGrid>
      <SourceList
        title="Shops"
        rows={places.map((p) => ({
          name: p.shop,
          detail: [shopStagesLabel(p), p.currency === "pokke-points" && "Pokke Points"]
            .filter(Boolean)
            .join(" · "),
          quantity: 1,
          value: p.price === null ? "—" : `${p.price}z`,
        }))}
      />
    </DropGrid>
  );
}

const sourceName = "min-w-0 flex-1 truncate text-white underline-offset-4 mobile:whitespace-normal";

interface SourceRow {
  name: string;
  /** The row's page, when it has one */
  href?: string;
  /** Before the name: a quest's star level */
  prefix?: string;
  /** Before the name: the map's icon (gathering points) */
  map?: string;
  /** How it's obtained, on the line below */
  detail: string;
  /** The loaded hunter has cleared this quest */
  cleared?: boolean;
  quantity: number;
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
  // Only lists with amounts get the quantity column, so chances stay next to the names.
  const showQuantity = rows.some((r) => r.quantity > 1);
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
            <div className="flex min-w-0 flex-1 flex-col gap-[0.2rem]">
              <div className="flex min-w-0 items-baseline gap-[0.8rem]">
                {r.href ? (
                  <Link href={r.href} title={r.name} className={cn(sourceName, "hover:underline")}>
                    {r.name}
                  </Link>
                ) : (
                  <span title={r.name} className={sourceName}>
                    {r.name}
                  </span>
                )}
                {showQuantity && (
                  <span className={dropQuantity}>{r.quantity > 1 && `×${r.quantity}`}</span>
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
                {r.cleared && <span className="flex-none text-stat">CLEAR!!</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
