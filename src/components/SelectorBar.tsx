"use client";

/**
 * The game's "◀ Set 7  7/20 ▶" selector, drawn over the bottom of a tree card.
 * `onStep` is called with -1 / 1 from the arrows and the left/right keys.
 */
import SelectorArrow from "./SelectorArrow";
import { cn } from "@/lib/cn";

// The arrows stick out 1.2rem past the card frame, which stays inside the
// body's 1.4rem gutter beside the tree card: no clipped arrow and no
// horizontal page scroll.
//   bar inset 4px, bar height 56px, arrow 44px

/** Height of the bar; trees leave this much room to scroll clear of it. */
export const SELECTOR_BAR_HEIGHT = 56;

/** The bar's arrows: 44px, centred on the bar's ends. */
const arrowPosition = "absolute top-[calc(50%-22px)] size-[44px]";

/** Label and count text in the bar. */
const barText =
  "text-[25px] leading-none tracking-[0.08em] whitespace-nowrap text-shadow-[2px_2px_0_rgb(0_0_0/0.6)] mobile:text-[20px]";

interface Props {
  label: string;
  /** Screen-reader version of `label`, e.g. "3 stars" for "★★★". */
  labelText?: string;
  /** Accessible name of the group, e.g. "Weapon tree filter". */
  groupLabel: string;
  previousLabel: string;
  nextLabel: string;
  onStep: (by: 1 | -1) => void;
  /** Right-hand count, e.g. "7/20". */
  count?: string;
  /** Screen-reader version of `count`. */
  countLabel?: string;
}

export default function SelectorBar({
  label,
  labelText,
  groupLabel,
  previousLabel,
  nextLabel,
  onStep,
  count,
  countLabel,
}: Props) {
  return (
    <div
      data-filter-bar
      // A flat grey rectangle, as in the game's selector: no border or frame.
      // Side padding clears the arrows, which overlap the bar's ends.
      className="absolute right-[4px] bottom-[4px] left-[4px] z-2 flex h-[56px] items-center gap-[1.6rem] bg-selector px-[calc(44px-1.2rem-4px+0.8rem)] py-0"
      role="group"
      aria-label={groupLabel}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onStep(event.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <SelectorArrow
        className={cn(arrowPosition, "left-[calc(-1*(1.2rem+4px))]")}
        label={previousLabel}
        onClick={() => onStep(-1)}
      />
      <span className={cn(barText, "min-w-0 flex-auto truncate text-stat")} aria-live="polite">
        {labelText ? (
          <>
            <span aria-hidden="true">{label}</span>
            <span className="sr-only">{labelText}</span>
          </>
        ) : (
          label
        )}
      </span>
      {count && (
        <span className={cn(barText, "flex-none text-white")}>
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{countLabel ?? count}</span>
        </span>
      )}
      <SelectorArrow
        next
        className={cn(arrowPosition, "right-[calc(-1*(1.2rem+4px))]")}
        label={nextLabel}
        onClick={() => onStep(1)}
      />
    </div>
  );
}
