"use client";

import { cn } from "@/lib/cn";
import { breakConditions, breakKey } from "@/lib/monster-breaks";
import type { MonsterBreak } from "@/lib/types";

/** "wings" and "wing" name the same part. */
const singular = (name: string) => name.replace(/s$/, "");

interface Props {
  breaks: MonsterBreak[];
  /** Hitzone parts each break's body parts belong to, by break index; empty without hitboxes. */
  hitzones: string[][];
  /** The highlighted part or break key, to mark its row. */
  highlight: string | null;
  /** A break row hovered (mouse only) or left; null when it leaves. */
  onHover?: (key: string | null) => void;
}

/**
 * Under the hitzone table: each break reward, the hitzone parts it's on
 * (when its hitboxes are known and the name doesn't already say), and what
 * it takes ("2nd flinch", "dragon damage"). With the model open, hovering a
 * row highlights the break's hitboxes.
 */
export default function MonsterBreaks({ breaks, hitzones, highlight, onHover }: Props) {
  return (
    <section className="mt-[1.6rem] flex flex-col gap-[0.6rem]">
      <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">Breakable parts</h3>
      <ul className="m-0 flex list-none flex-col gap-[0.4rem] p-0 text-small">
        {breaks.map((b, i) => {
          const key = breakKey(i);
          const on = hitzones[i]?.filter((part) => singular(part) !== singular(b.name)) ?? [];
          const conditions = breakConditions(b);
          return (
            <li
              key={key}
              onPointerEnter={(e) => onHover && e.pointerType === "mouse" && onHover(key)}
              onPointerLeave={() => onHover?.(null)}
              className={cn(
                "flex flex-wrap items-baseline gap-x-[0.8rem] leading-[1.25] whitespace-normal",
                highlight === key && "bg-white/10",
              )}
            >
              <span className="text-white capitalize">{b.name}</span>
              {on.length > 0 && <span className="text-muted">on {on.join(", ")}</span>}
              {conditions.length > 0 && (
                <span className="text-fine text-white/60">{conditions.join(", ")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
