"use client";

import SelectorArrow from "./SelectorArrow";
import { cn } from "@/lib/cn";

interface Props {
  /** Text, or text with an icon. */
  label: React.ReactNode;
  /** Accessible name of the group, e.g. "Rank". */
  groupLabel: string;
  previousLabel: string;
  nextLabel: string;
  /** Which option shows, from 0, and how many there are. */
  index: number;
  count: number;
  /** Screen-reader version of the "2/3" count, in the site's language ("2 of 3"). */
  countLabel?: string;
  /** Called with the new index; wraps around at either end. */
  onChange: (index: number) => void;
}

/**
 * The game's "◀ High Rank  2/3 ▶" selector as a bar in the page, for
 * choosing among a few options in place (`SelectorBar` is the one drawn over
 * a tree card). With a single option it shows only the label.
 */
export default function StepSelector({
  label,
  groupLabel,
  previousLabel,
  nextLabel,
  index,
  count,
  countLabel,
  onChange,
}: Props) {
  const many = count > 1;
  const step = (by: 1 | -1) => onChange((index + by + count) % count);
  return (
    <div
      role="group"
      aria-label={groupLabel}
      onKeyDown={(event) => {
        if (!many || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        step(event.key === "ArrowLeft" ? -1 : 1);
      }}
      className={cn(
        "flex h-[4.4rem] min-w-0 items-center gap-[0.8rem] bg-selector",
        many ? "px-[0.4rem]" : "px-[1.2rem]",
      )}
    >
      {many && (
        <SelectorArrow
          className="size-[3.2rem] flex-none"
          label={previousLabel}
          onClick={() => step(-1)}
        />
      )}
      <span
        aria-live="polite"
        className="flex min-w-0 flex-auto items-center gap-[0.8rem] overflow-hidden text-sub whitespace-nowrap text-stat"
      >
        {label}
      </span>
      {many && (
        <>
          <span className="flex-none text-sub text-white tabular-nums">
            <span aria-hidden={countLabel ? true : undefined}>
              {index + 1}/{count}
            </span>
            {countLabel && <span className="sr-only">{countLabel}</span>}
          </span>
          <SelectorArrow
            next
            className="size-[3.2rem] flex-none"
            label={nextLabel}
            onClick={() => step(1)}
          />
        </>
      )}
    </div>
  );
}
