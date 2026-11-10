"use client";

import { Fragment, useMemo } from "react";
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
import { DropGrid, dropQuantity } from "@/components/MonsterDrops";
import Tabs, { type Tab } from "@/components/Tabs";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { useItems, useItemSources, type ItemLookup } from "@/lib/client-data";
import {
  combinationNotes,
  quantityLabel,
  type Combination,
  type ItemCombinations,
} from "@/lib/combinations";
import { ownedItemCounts } from "@/lib/hunter-progress";
import { itemCategory, itemCategoryLabel } from "@/lib/item-categories";
import { groupBy, itemHref, type MonsterSource, type QuestSource } from "@/lib/item-sources";
import type { DropSource } from "@/lib/monster-drops";
import {
  clearedQuestIds,
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
  const combos = items.combinations.get(item.id);
  if (combos) {
    tabs.push({
      id: "combining",
      label: "Combining",
      content: (
        <CombinationSources
          itemId={item.id}
          combos={combos}
          items={items}
          bookBonus={items.bookBonus}
        />
      ),
    });
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

        {sources ? (
          tabs.length > 0 ? (
            <Tabs key={slug} tabs={tabs} label="Where to get it and what it makes" />
          ) : (
            <p className="whitespace-normal text-white">
              No monster drops, quest rewards or combinations give this item.
            </p>
          )
        ) : sourcesError ? (
          <p className="text-negative">Couldn&apos;t load monster drops and quest rewards.</p>
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
            chance: s.chance,
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
              chance,
            };
          })}
        />
      ))}
    </DropGrid>
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
  const link = (id: number) => {
    const it = items.get(id);
    return it.known ? { name: it.name, href: itemHref(it.name) } : { name: it.name };
  };
  const books = bookBonus
    .slice(1)
    .map((b) => `+${b}%`)
    .join(", ");
  return (
    <div className="flex flex-col gap-[1.6rem]">
      <DropGrid>
        {combos.madeFrom.length > 0 && (
          <CombinationList
            title="Made by combining"
            rows={combos.madeFrom.map((c) => ({
              combo: c,
              main: c.ingredients.map(link),
              detail: combinationNotes(c),
            }))}
          />
        )}
        {combos.usedIn.length > 0 && (
          <CombinationList
            title="Used to make"
            rows={combos.usedIn.map((c) => {
              const other = c.ingredients.find((id) => id !== itemId) ?? itemId;
              return {
                combo: c,
                main: [link(c.result)],
                with: link(other),
                detail: combinationNotes(c),
              };
            })}
          />
        )}
      </DropGrid>
      {books && (
        <p className="m-0 text-fine whitespace-normal text-white/60">
          Rates are before Books of Combos 1–5 ({books} for owning them in order from 1) and the
          Combination skill.
        </p>
      )}
    </div>
  );
}

interface LinkedName {
  name: string;
  href?: string;
}

interface CombinationRow {
  combo: Combination;
  /** The ingredients, or the item made */
  main: LinkedName[];
  /** The other ingredient, when the row is what this item makes */
  with?: LinkedName;
  detail: string[];
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

/** A titled list of combinations: the items (linked), how many it makes and the success rate. */
function CombinationList({ title, rows }: { title: string; rows: CombinationRow[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-[0.6rem]">
      <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-[0.8rem] p-0">
        {rows.map((r) => (
          <li key={r.combo.number} className="flex min-w-0 flex-col gap-[0.2rem] leading-[1.25]">
            <div className="flex min-w-0 items-baseline gap-[0.8rem]">
              <span className="min-w-0 flex-1 whitespace-normal">
                {r.main.map((m, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="text-muted"> + </span>}
                    <NameLink {...m} />
                  </Fragment>
                ))}
              </span>
              <span className="w-cells-5 flex-none text-muted">
                {quantityLabel(r.combo.quantity)}
              </span>
              <span
                className={cn(
                  "w-cells-4 flex-none text-right text-white tabular-nums",
                  r.combo.successRate >= 100 && "text-positive",
                )}
              >
                {r.combo.successRate}%
              </span>
            </div>
            <p className="m-0 text-fine whitespace-normal text-white/60">
              {r.with && (
                <>
                  {"with "}
                  <NameLink {...r.with} />
                  {" · "}
                </>
              )}
              {[...r.detail, `List No. ${r.combo.number}`].join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface SourceRow {
  name: string;
  href: string;
  /** Before the name: a quest's star level */
  prefix?: string;
  /** How it's obtained, on the line below */
  detail: string;
  /** The loaded hunter has cleared this quest */
  cleared?: boolean;
  quantity: number;
  chance: number;
}

/**
 * A titled list of sources: the monster or quest (linked), how many each
 * success gives, and the chance, with how it's obtained on a line below.
 */
function SourceList({ title, rows }: { title: string; rows: SourceRow[] }) {
  // Only lists with amounts get the quantity column, so chances stay next to the names.
  const showQuantity = rows.some((r) => r.quantity > 1);
  return (
    <section className="flex min-w-0 flex-col gap-[0.6rem]">
      <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-[0.8rem] p-0">
        {rows.map((r, i) => (
          <li key={i} className="flex min-w-0 gap-[0.8rem] leading-[1.25]">
            {r.prefix && <span className="w-cells-4 flex-none text-stat">{r.prefix}</span>}
            <div className="flex min-w-0 flex-1 flex-col gap-[0.2rem]">
              <div className="flex min-w-0 items-baseline gap-[0.8rem]">
                <Link
                  href={r.href}
                  title={r.name}
                  className="min-w-0 flex-1 truncate text-white underline-offset-4 hover:underline mobile:whitespace-normal"
                >
                  {r.name}
                </Link>
                {showQuantity && (
                  <span className={dropQuantity}>{r.quantity > 1 && `×${r.quantity}`}</span>
                )}
                <span
                  className={cn(
                    "w-cells-4 flex-none text-right text-white tabular-nums",
                    r.chance >= 100 && "text-positive",
                  )}
                >
                  {r.chance}%
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
