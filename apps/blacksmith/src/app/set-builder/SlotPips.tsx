"use client";

/**
 * A piece's or weapon's slots with the jewels in them, as the game shows
 * them: a circle for a free slot, the circle filled in for one a jewel
 * takes, "-" for none. A jewel two slots big fills two.
 */
import SlotMark from "@/components/SlotMark";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { DecoBin, PlacedDeco } from "@/lib/set-search";

const MAX_SLOTS = 3;

export default function SlotPips({
  total,
  decorations,
  bin,
  className,
}: {
  /** The piece's or weapon's slots. */
  total: number;
  /** The set's decorations; only the bin's count. */
  decorations: readonly PlacedDeco[];
  bin: DecoBin;
  className?: string;
}) {
  const label = useT().setBuilder.result.slotsUsed;
  // Can be more than `total` in the editor: the label says so and the slots turn red.
  const used = decorations.reduce((n, d) => (d.bin === bin ? n + d.deco.slots : n), 0);
  const over = used > total;
  return (
    <span
      role="img"
      aria-label={label(used, total)}
      className={cn("inline-flex items-center", className)}
    >
      {Array.from({ length: MAX_SLOTS }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "inline-flex w-[0.9em] justify-center",
            over ? "text-negative" : i < total ? "text-white" : "text-white/40",
          )}
        >
          {i < total ? <SlotMark filled={i < Math.min(used, total)} /> : "-"}
        </span>
      ))}
    </span>
  );
}
