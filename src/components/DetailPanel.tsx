import Card from "@/components/Card";
import MaterialRow from "@/components/MaterialRow";
import { cn } from "@/lib/cn";
import type { Material } from "@/lib/types";

// Building blocks for the right-hand detail panel on weapon, armor,
// decoration and monster pages. Text in the panel is yellow (text-stat) by
// default; values are white.

/** The detail card; shares the row equally with the tree card. */
export function DetailCard({ children }: { children: React.ReactNode }) {
  return <Card className="min-w-0">{children}</Card>;
}

/** Icon + name (+ sharpness) row at the top of the panel. */
export function DetailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[38px] flex-none flex-row flex-wrap items-center text-white no-underline">
      {children}
    </div>
  );
}

/** Everything below the header. */
export function DetailBody({ children }: { children: React.ReactNode }) {
  return <div className="mt-[2rem] flex h-full flex-col gap-[1.3rem] text-stat">{children}</div>;
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
    <div>
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
          armor && "w-cells-4 justify-end text-white",
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
      <p>
        <span className="text-stat">{label}: </span>
        {cost}z
      </p>
      {materials.map((m, i) => (
        <MaterialRow key={i} material={m} />
      ))}
    </div>
  );
}

/**
 * One page of the requirements section. Only the first (active) page is
 * shown; the others are kept in the markup for a future page switcher.
 */
export function RequirementsPage({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      data-tab
      className={cn(
        "flex-1 flex-row flex-wrap gap-x-[3.2rem] gap-y-[1.6rem] mobile:gap-x-[1.6rem]",
        active ? "flex" : "hidden",
      )}
    >
      {children}
    </div>
  );
}
