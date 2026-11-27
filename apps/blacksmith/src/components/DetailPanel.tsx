"use client";

import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import MaterialRow from "@/components/MaterialRow";
import SlotMark from "@/components/SlotMark";
import Tabs, { type Tab } from "@/components/Tabs";
import { cn } from "@/lib/cn";
import type { Material } from "@/lib/types";
import { useGameText, useT } from "@/context/LanguageContext";

// Building blocks for the right-hand detail panel on weapon, armor,
// decoration and monster pages. Text in the panel is yellow (text-stat) by
// default; values are white.

/**
 * The detail card; shares the row with the tree card. Long content
 * (a quest's rewards, a monster's drops) scrolls inside it where the card is
 * the height of the page, as beside a tree (SplitPage); elsewhere on a phone
 * the card grows instead.
 */
export function DetailCard({
  children,
  className,
  bar,
}: {
  children: React.ReactNode;
  className?: string;
  /** A `SelectorBar` drawn over the card (the content leaves room for it). */
  bar?: React.ReactNode;
}) {
  return (
    // In a CardBox like the tree cards (see CardBox), but z-1 as the card was,
    // under a tree panel's filter-bar arrows. The 4rem basis keeps the row
    // split it had when Card's 4rem of side padding sat on this flex item
    // (tree card 530px, this 570px at 1400px).
    <CardBox className={cn("z-1 basis-[4rem] mobile:basis-[0%]", className)}>
      <Card scroll>{children}</Card>
      {bar}
    </CardBox>
  );
}

/**
 * Icon + name (+ sharpness) row at the top of the panel. On phones it starts
 * a little lower, under the sheet's × (SplitPage) in the card's corner.
 */
export function DetailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[38px] flex-none flex-row flex-wrap items-center text-white no-underline mobile:mt-[1rem]">
      {children}
    </div>
  );
}

/** The item's name in the header; wraps (mid-word if it must) when it doesn't fit on a phone. */
export function DetailName({
  children,
  id,
  className,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <p
      id={id}
      className={cn("min-w-0 wrap-anywhere whitespace-normal mobile:leading-[1.25]", className)}
    >
      {children}
    </p>
  );
}

/**
 * The detail card with nothing selected (a section's own page, beside its
 * tree): NO DATA where the item's name would be, plus an optional note.
 * Phones show the list alone on that page, unless there is a note.
 */
export function NoDataCard({ children }: { children?: React.ReactNode }) {
  const t = useT();
  return (
    <DetailCard className={children ? undefined : "mobile:hidden"}>
      <DetailHeader>
        <p className="uppercase">{t.equipment.detail.noData}</p>
      </DetailHeader>
      {children && <DetailBody>{children}</DetailBody>}
    </DetailCard>
  );
}

/** Everything below the header. */
export function DetailBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[2rem] flex flex-none flex-col gap-[1.3rem] text-stat mobile:mt-[1.4rem]">
      {children}
    </div>
  );
}

/** Divider between sections of the panel. */
export function DetailRule() {
  return <hr className="m-0" />;
}

/**
 * Stat block: one column of rows, like the game's stat panel. Armor rows are
 * a fixed-width table (label, value) laid out in as many columns as fit.
 */
export function StatList({ children, armor }: { children: React.ReactNode; armor?: boolean }) {
  return (
    <div
      className={cn(
        // Tighter on phones, where the sheet has the height of a phone screen.
        "flex flex-col gap-y-[13px] mobile:gap-y-[0.9rem]",
        "[&>div]:flex [&>div]:gap-[0.5rem] [&>div]:leading-none",
        armor &&
          "grid grid-cols-[repeat(auto-fill,minmax(calc(17*var(--cell)),1fr))] gap-x-[1.6rem]",
      )}
    >
      {children}
    </div>
  );
}

/** One "Label: value" row in a StatList. */
export function Stat({
  label,
  children,
  armor,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  armor?: boolean;
}) {
  return (
    // Unless the value's longest word fits beside the label (min-content
    // basis), it drops below it rather than running out of the card.
    <div className={cn(!armor && "flex-wrap")}>
      <h3
        className={cn(
          "m-0 shrink-0 leading-none font-normal",
          armor ? "inline-flex w-cells-12 text-stat" : "inline-block",
        )}
      >
        {label}
      </h3>
      <p
        className={cn(
          "flex min-w-0 flex-wrap gap-y-[0.6rem]",
          armor ? "w-cells-4 justify-end text-white" : "grow basis-[min-content]",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/** A stat value: white unless coloured (positive/negative/raw). */
export function StatValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("text-white", className)}>{children}</span>;
}

const STAT_ARROW_MASK = { "--icon-mask": 'url("/images/stat-arrow.png")' } as React.CSSProperties;

/**
 * A column of arrows before a stat value, at twice the sprite's size: each
 * step from the stat's own baseline (the caller picks it) draws a green arrow
 * pointing up when positive and a red one pointing down when negative. One
 * neutral sprite, tinted like an Icon (a multiplied mask) with the
 * positive/negative tokens and flipped for down. Stacked arrows share their
 * 1px outline. The column is one line tall, so a taller stack overhangs the
 * row evenly instead of making it taller than its text. Null or 0: nothing.
 */
export function StatArrows({ steps }: { steps: number | null }) {
  if (!steps) return null;
  return (
    <span
      className={cn(
        "mr-[0.6rem] flex h-[1lh] flex-col justify-center self-center",
        steps < 0 && "-scale-y-100",
      )}
    >
      {Array.from({ length: Math.abs(steps) }, (_, i) => (
        <span
          key={i}
          style={STAT_ARROW_MASK}
          className={cn(
            "relative isolate h-[10px] w-[14px] shrink-0 not-first:-mt-[2px] before:icon-mask",
            steps > 0 ? "before:bg-positive" : "before:bg-negative",
          )}
        >
          <img src="/images/stat-arrow.png" alt="" className="block h-full w-full pixelated" />
        </span>
      ))}
    </span>
  );
}

/** Decoration slots as circles: one per slot, dashes for the rest. */
export function Slots({ count }: { count?: number }) {
  const label = useT().setBuilder.form.slotCount(count ?? 0);
  // One line tall: an armor row stretched by a second max-defence line would
  // otherwise centre the circles below the label's line.
  return (
    <span
      id="weaponSlots"
      role="img"
      aria-label={label}
      className="inline-flex h-[1lh] items-center text-white opacity-50"
    >
      {Array.from({ length: 3 }, (_, i) =>
        i < (count ?? 0) ? (
          <SlotMark key={i} />
        ) : (
          <span key={i} aria-hidden="true" className="inline-flex w-[0.9em] justify-center">
            -
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Skill points, one row each: the skill tree's name and its points, green
 * when they add and red when they take away (armor and decorations).
 */
export function SkillPoints({ skills }: { skills: { name: string; amount: string | number }[] }) {
  const game = useGameText();
  return (
    <div className="flex flex-1 flex-col gap-[13px]">
      {skills.map((skill, i) => (
        <div key={i} className="flex">
          <h3 className="m-0 flex w-cells-10 leading-none font-normal">
            {game.name("skill", skill.name)}
          </h3>
          <p
            className={cn(
              "w-cells-4 text-right",
              Number(skill.amount) < 0 ? "text-negative" : "text-positive",
            )}
          >
            {skill.amount}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Recipe section: cost line and materials. White text, yellow labels. */
export function Requirements({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-row flex-wrap gap-[32px] text-white">{children}</div>;
}

/** A materials list with its cost line ("Improve cost: 1200z"). */
export function MaterialList({
  label,
  cost,
  materials,
}: {
  label: string;
  cost: number | string | null | undefined;
  materials: Material[];
}) {
  const t = useT();
  return (
    <div className="flex flex-auto flex-col gap-x-0 gap-y-[13px]">
      <p className="whitespace-normal">
        <span className="text-stat">{label}: </span>
        <span className="whitespace-nowrap">{t.common.zenny(String(cost ?? ""))}</span>
      </p>
      {materials.map((m, i) => (
        <MaterialRow key={i} material={m} />
      ))}
    </div>
  );
}

/** One page of the requirements section, shown as a tab in `RequirementTabs`. */
export function RequirementsPage({
  children,
  stacked,
}: {
  children: React.ReactNode;
  /** Lay the lists out as one column instead of wrapping side by side. */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 gap-x-[3.2rem] gap-y-[1.6rem] mobile:gap-x-[1.6rem]",
        stacked ? "flex-col" : "flex-row flex-wrap",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The requirements pages (materials, ammo, melodies, …) as tabs, like the
 * monster pages. Pages that don't apply are passed as `false` and dropped;
 * a single page is shown without a tab row. On phones the tabs are one row
 * that stays at the top of the sheet as it scrolls, so the other pages are a
 * tap away from anywhere in the list.
 */
export function RequirementTabs({
  tabs,
  label,
}: {
  tabs: (Tab | false | null | undefined)[];
  label: string;
}) {
  const pages = tabs.filter((t): t is Tab => !!t);
  if (pages.length === 0) return null;
  if (pages.length === 1) return <>{pages[0]!.content}</>;
  return (
    <div className="min-w-0 flex-1">
      <Tabs tabs={pages} label={label} oneRow sticky />
    </div>
  );
}
