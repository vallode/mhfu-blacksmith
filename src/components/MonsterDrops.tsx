import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import { parseDropSource } from "@/lib/monster-drops";
import type { MonsterDrop } from "@/lib/types";

interface MonsterDropsProps {
  /** source -> items for one rank, as on the Monster type */
  sources: Record<string, MonsterDrop[]>;
}

/** An item name in a drop or supply row: truncated, but wrapped on a phone, where the column is narrow. */
export const dropName =
  "min-w-0 flex-auto truncate mobile:leading-[1.25] mobile:wrap-anywhere mobile:whitespace-normal";

/** Two-across grid of DropLists (one per column on phones). */
export function DropGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] text-small mobile:grid-cols-1">
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
  return (
    <DropGrid>
      {Object.entries(sources).map(([source, items]) => (
        <DropList key={source} {...parseDropSource(source)} items={items} />
      ))}
    </DropGrid>
  );
}

interface DropListProps {
  /** How the items are obtained: "Body carves", "Main reward" */
  title: string;
  /** How many attempts, shown as "×N" */
  count?: number;
  /** Condition or detail, in small text */
  note?: string;
  items: MonsterDrop[];
}

/** A titled list of drops: icon, item, quantity and chance per row. Shared by monster drops and quest rewards. */
export function DropList({ title, count, note, items }: DropListProps) {
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
          <DropRow key={i} drop={drop} />
        ))}
      </ul>
    </section>
  );
}

function DropRow({ drop }: { drop: MonsterDrop }) {
  return (
    <li className="flex items-center gap-[0.8rem] leading-none text-white">
      <Icon type={drop.type || "ukwn"} color={drop.color} />
      <span className={dropName}>{drop.name}</span>
      {drop.quantity !== undefined && (
        <span className="flex-none text-muted">×{drop.quantity}</span>
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
