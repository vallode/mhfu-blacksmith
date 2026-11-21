"use client";

/**
 * The item page's Used in tab: the weapons, armor and decorations whose
 * recipes take the item, one list per weapon type, armor rank and the
 * decorations, long ones cut short. Items used across kinds get a filter
 * by kind.
 */
import { useState } from "react";
import { DropGrid } from "@/components/MonsterDrops";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";
import { groupBy } from "@/lib/item-sources";
import { groupOfUse, iconOfUse, type ItemUse } from "@/lib/item-uses";
import { SourceList } from "./SourceList";

/** Lists longer than this, plus one, show this many rows until opened. */
const LIST_LIMIT = 6;

type Kind = "all" | ItemUse["kind"];
const KINDS: Kind[] = ["all", "weapon", "armor", "decoration"];

export default function ItemUses({ uses }: { uses: ItemUse[] }) {
  const t = useT();
  const tu = t.items.uses;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const [kind, setKind] = useState<Kind>("all");

  const count = (k: Kind) => (k === "all" ? uses.length : uses.filter((u) => u.kind === k).length);
  const kinds = KINDS.filter((k) => count(k) > 0);
  const shown = kind === "all" ? uses : uses.filter((u) => u.kind === kind);
  const total = uses.reduce((n, u) => n + u.amount, 0);
  const kindLabel: Record<Kind, string> = {
    all: tu.all,
    weapon: tu.weapons,
    armor: tu.armor,
    decoration: tu.decorations,
  };

  const groupLabel = (g: string) =>
    g === "decoration"
      ? tu.decorations
      : g in t.common.ranks
        ? tu.armorRank(t.common.ranks[g as keyof Messages["common"]["ranks"]])
        : t.common.weaponTypes[g as keyof Messages["common"]["weaponTypes"]];
  const recipe = (u: ItemUse) =>
    u.recipe === "improve"
      ? u.kind === "weapon" && u.from
        ? tu.improve(game.name("weapon", u.from))
        : tu.upgrade
      : u.recipe === "alt"
        ? tu.alt
        : tu.create;

  return (
    <div className="flex flex-col gap-[1.6rem]">
      <div className="flex flex-wrap items-center gap-x-[1.6rem] gap-y-[0.8rem]">
        <p className="m-0 text-small whitespace-normal text-white/80">
          {tu.summary(uses.length, formatNumber(uses.length), formatNumber(total))}
        </p>
        {/* "All" and two or more kinds */}
        {kinds.length > 2 && (
          <div role="group" aria-label={tu.filterLabel} className="flex flex-wrap gap-[0.6rem]">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "cursor-pointer border border-hr/60 bg-transparent px-[1rem] py-[0.2rem] font-[inherit] text-fine text-parchment",
                  "hover:text-white aria-pressed:border-stat aria-pressed:bg-selector aria-pressed:text-stat",
                )}
              >
                {tu.kindCount(kindLabel[k], formatNumber(count(k)))}
              </button>
            ))}
          </div>
        )}
      </div>
      <DropGrid>
        {groupBy(shown, groupOfUse).map(([g, rows]) => (
          <CutList key={`${kind}-${g}`} count={rows.length}>
            {(n) => (
              <SourceList
                title={tu.groupCount(groupLabel(g), formatNumber(rows.length))}
                rows={rows.slice(0, n).map((u) => ({
                  name: game.name(u.kind, u.name),
                  href: u.href,
                  icon: { type: iconOfUse(u), color: u.color, rarity: u.rarity },
                  detail: recipe(u),
                  value: `×${formatNumber(u.amount)}`,
                }))}
              />
            )}
          </CutList>
        ))}
      </DropGrid>
    </div>
  );
}

/** A list that shows its first LIST_LIMIT rows until "Show all" is pressed. */
function CutList({
  count,
  children,
}: {
  count: number;
  children: (shown: number) => React.ReactNode;
}) {
  const tu = useT().items.uses;
  const { formatNumber } = useLocale();
  const [open, setOpen] = useState(false);
  // Cutting a single row would only swap it for the button.
  const cut = count > LIST_LIMIT + 1;
  return (
    <div className="flex min-w-0 flex-col gap-[0.8rem]">
      {children(cut && !open ? LIST_LIMIT : count)}
      {cut && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 font-[inherit] text-fine text-stat underline-offset-4 hover:underline"
        >
          {open ? tu.showFewer : tu.showAll(formatNumber(count))}
        </button>
      )}
    </div>
  );
}
