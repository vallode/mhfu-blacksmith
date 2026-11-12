"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import Link from "next/link";
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
import {
  useCombinations,
  useItemPlaces,
  useItems,
  useItemSources,
  useQuests,
  type ItemLookup,
} from "@/lib/client-data";
import {
  combinationNotes,
  quantityLabel,
  type Combination,
  type ItemCombinations,
} from "@/lib/combinations";
import { ownedItemCounts } from "@/lib/hunter-progress";
import { itemCategory, itemCategoryLabel } from "@/lib/item-categories";
import {
  gatherPointsLabel,
  shopStagesLabel,
  type GatherPlace,
  type ShopPlace,
} from "@/lib/item-places";
import { groupBy, itemHref, type MonsterSource, type QuestSource } from "@/lib/item-sources";
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
  const { combinations, error: combinationsError } = useCombinations();
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
  if (!items || !item) {
    return (
      <DetailCard>
        {items ? (
          <p>Not found.</p>
        ) : error ? (
          <p className="text-negative">Couldn&apos;t load items.</p>
        ) : (
          <Loading>Loading…</Loading>
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
  const combos = combinations?.byItem.get(item.id);
  if (combinations && combos) {
    tabs.push({
      id: "combining",
      label: "Combining",
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
    (sources || sourcesError) && (places || placesError) && (combinations || combinationsError);
  const failed = sourcesError || placesError || combinationsError;

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
          {item.carry !== undefined && (
            <Stat label="Carry:">
              <StatValue>{item.carry === 255 ? "∞" : item.carry}</StatValue>
            </Stat>
          )}
          {!!item.price && (
            <Stat label="Price:">
              <StatValue>{item.price}z</StatValue>
            </Stat>
          )}
          {own !== null && (
            <Stat label="Owned:">
              <StatValue>{own === Infinity ? "∞" : own}</StatValue>
            </Stat>
          )}
        </StatList>

        <DetailRule />

        {!settled ? (
          <Loading>Loading…</Loading>
        ) : tabs.length > 0 ? (
          <Tabs key={slug} tabs={tabs} label="Where to get it and what it makes" />
        ) : (
          !failed && (
            <p className="whitespace-normal text-white">
              No monster drop, quest reward, gathering point, shop or combination gives this item.
            </p>
          )
        )}
        {settled && failed && (
          <p className="text-negative">
            Couldn&apos;t load {tabs.length > 0 ? "all of " : ""}where to get this item.
          </p>
        )}
      </DetailBody>
    </DetailCard>
  );
}

/** "×3", or nothing for one */
const amountLabel = (n: number) => (n > 1 ? `×${n}` : undefined);

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
            amount: amountLabel(s.quantity),
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
              amount: amountLabel(amount),
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
            if (!p.quests) return [{ name: p.map, map: p.map, detail: points, value }];
            return p.quests.map((id) => {
              const quest = byId.get(id);
              return {
                name: quest?.title ?? `Quest ${id}`,
                href: quest && questHref(quest),
                map: p.map,
                detail: `${p.map} · ${points}`,
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
          value: p.price === null ? "—" : `${p.price}z`,
        }))}
      />
    </DropGrid>
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
  const link = (id: number) => {
    const it = items.get(id);
    return it.known ? { name: it.name, href: itemHref(it.name) } : { name: it.name };
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
    value: `${c.successRate}%`,
    strong: c.successRate >= 100,
  });
  const detail = (c: Combination) => [...combinationNotes(c), `List No. ${c.number}`].join(" · ");
  return (
    <div className="flex flex-col gap-[1.6rem]">
      <DropGrid>
        {combos.madeFrom.length > 0 && (
          <SourceList
            title="Made by combining"
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
            title="Used to make"
            rows={combos.usedIn.map((c) => {
              const other = c.ingredients.find((id) => id !== itemId) ?? itemId;
              return {
                ...link(c.result),
                detail: (
                  <>
                    {"with "}
                    <NameLink {...link(other)} />
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
          Rates are before Books of Combos 1–{bookBonus.length - 1} ({books} for owning them in
          order from 1) and the Combination skill.
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
                {r.cleared && <span className="flex-none text-stat">CLEAR!!</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
