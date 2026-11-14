"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import { useGameText, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { itemHref } from "@/lib/item-sources";
import { parseDropSource } from "@/lib/monster-drops";
import type { MonsterDrop } from "@/lib/types";

interface MonsterDropsProps {
  /** source -> items for one rank, as on the Monster type */
  sources: Record<string, MonsterDrop[]>;
}

/**
 * An item name in a drop or supply row, padded to the game's 16-character
 * name cap (`ITEM_NAME_LENGTH`) so the columns after it line up. It shrinks
 * (truncated, wrapped on a phone) only when the row has no room for it.
 */
export const dropName =
  "w-cells-16 min-w-0 truncate mobile:leading-[1.25] mobile:wrap-anywhere mobile:whitespace-normal";

/** An item name that links to the item's page. */
export const itemLink = "underline-offset-4 hover:underline";

/** The "×N" column: three cells fit the largest amount, ×99. */
export const dropQuantity = "w-cells-3 flex-none text-muted";

/**
 * Two-across grid of DropLists; one across on phones and in a compact
 * screen's narrower detail pane, where two would cut the item names short.
 */
export function DropGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] text-small mobile:grid-cols-1 compact:grid-cols-1">
      {children}
    </div>
  );
}

/**
 * One rank's drop tables: a titled list per source (carves, breaks, shiny
 * drops, capture) laid out two across. Each row is icon, item, quantity and
 * chance.
 */
export default function MonsterDrops({ sources }: MonsterDropsProps) {
  const t = useT().monsters.drops;
  const game = useGameText();
  return (
    <DropGrid>
      {Object.entries(sources).map(([source, items]) => {
        const { title, count, note } = parseDropSource(source);
        return (
          <DropList
            key={source}
            title={t.sources[title] ?? title}
            count={count}
            note={note && (t.notes[note] ?? note)}
            // The page is found by the English name; the row shows the translation.
            items={items.map((drop) => ({
              ...drop,
              name: game.name("item", drop.name),
              href: itemHref(drop.name),
            }))}
          />
        );
      })}
    </DropGrid>
  );
}

interface DropListProps {
  /** How the items are obtained, translated: "Body carves", "Main reward" */
  title: string;
  /** How many attempts, shown as "×N" */
  count?: number;
  /** Condition or detail, in small text */
  note?: string;
  /**
   * The rows, with item names already in the site's language, each with the
   * item's page (from its English name), where it has one.
   */
  items: LinkedDrop[];
}

export type LinkedDrop = MonsterDrop & { href?: string };

/** A titled list of drops: icon, item, quantity and chance per row. Shared by monster drops and quest rewards. */
export function DropList({ title, count, note, items }: DropListProps) {
  // Only lists with amounts get the quantity column, so chances stay next to the names.
  const showQuantity = items.some((drop) => drop.quantity !== undefined);
  return (
    <section className="flex min-w-0 flex-col gap-[0.6rem]">
      <h3 className="m-0 flex flex-wrap items-baseline gap-x-[0.8rem] text-small leading-[1.25] font-normal text-gold">
        {title}
        {count !== undefined && <span className="text-muted">×{count}</span>}
        {note && (
          <span className="text-fine leading-[1.25] whitespace-normal text-white/60">{note}</span>
        )}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-[0.2rem] p-0">
        {items.map((drop, i) => (
          <DropRow key={i} drop={drop} showQuantity={showQuantity} />
        ))}
      </ul>
    </section>
  );
}

function DropRow({ drop, showQuantity }: { drop: LinkedDrop; showQuantity: boolean }) {
  return (
    <li className="flex items-center gap-[0.8rem] leading-none text-white">
      <Icon type={drop.type || "ukwn"} color={drop.color} />
      {drop.href ? (
        <Link href={drop.href} className={cn(dropName, itemLink)}>
          {drop.name}
        </Link>
      ) : (
        <span className={dropName}>{drop.name}</span>
      )}
      {showQuantity && (
        <span className={dropQuantity}>{drop.quantity !== undefined && `×${drop.quantity}`}</span>
      )}
      <span
        className={cn(
          "w-cells-4 flex-none text-right tabular-nums",
          drop.chance === "100%" && "text-positive",
        )}
      >
        {drop.chance}
      </span>
    </li>
  );
}
