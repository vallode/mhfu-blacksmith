import Card from "@/components/Card";
import MaterialRow from "@/components/MaterialRow";
import Tabs, { type Tab } from "@/components/Tabs";
import { cn } from "@/lib/cn";
import type { Material } from "@/lib/types";

// Building blocks for the right-hand detail panel on weapon, armor,
// decoration and monster pages. Text in the panel is yellow (text-stat) by
// default; values are white.

/**
 * The detail card; shares the row with the tree card. Long content
 * (a quest's rewards, a monster's drops) scrolls inside it on desktop, where
 * the card is the height of the page; on a phone the card grows instead.
 */
export function DetailCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // The 4rem basis keeps the row split it had when Card's 4rem of side
    // padding sat on this flex item (tree card 530px, this 570px at 1400px).
    <Card className={cn("basis-[4rem] mobile:basis-[0%]", className)} scroll>
      {children}
    </Card>
  );
}

/** Icon + name (+ sharpness) row at the top of the panel. */
export function DetailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[38px] flex-none flex-row flex-wrap items-center text-white no-underline">
      {children}
    </div>
  );
}

/** The item's name in the header; wraps (mid-word if it must) when it doesn't fit on a phone. */
export function DetailName({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="min-w-0 wrap-anywhere whitespace-normal mobile:leading-[1.25]">
      {children}
    </p>
  );
}

/**
 * The detail card with nothing selected (a section's own page, beside its
 * tree): NO DATA where the item's name would be, plus an optional note.
 */
export function NoDataCard({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <DetailCard className={className}>
      <DetailHeader>
        <p className="uppercase">No data</p>
      </DetailHeader>
      {children && <DetailBody>{children}</DetailBody>}
    </DetailCard>
  );
}

/** Everything below the header. */
export function DetailBody({ children }: { children: React.ReactNode }) {
  return <div className="mt-[2rem] flex flex-none flex-col gap-[1.3rem] text-stat">{children}</div>;
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
        "flex flex-col gap-y-[13px]",
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

/** Decoration slots as "OO-": filled for each slot, dashes for the rest. */
export function Slots({ count }: { count?: number }) {
  return (
    <span id="weaponSlots" className="text-white opacity-50">
      {Array.from({ length: 3 }, (_, i) => (i < (count ?? 0) ? "O" : "-")).join("")}
    </span>
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
  cost: React.ReactNode;
  materials: Material[];
}) {
  return (
    <div className="flex flex-auto flex-col gap-x-0 gap-y-[13px]">
      <p className="whitespace-normal">
        <span className="text-stat">{label}: </span>
        <span className="whitespace-nowrap">{cost}z</span>
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
 * a single page is shown without a tab row.
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
      <Tabs tabs={pages} label={label} />
    </div>
  );
}
