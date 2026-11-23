"use client";

/**
 * A piece's or weapon's slots with the jewels in them, as the game shows
 * them: "O" for a free slot, the O filled in for one a jewel takes, "-" for
 * none. A jewel two slots big fills two.
 */
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
            "relative inline-flex w-cells-1 justify-center",
            over ? "text-negative" : i < total ? "text-white" : "text-white/40",
          )}
        >
          {i < total ? "O" : "-"}
          {/* The O's inside, filled: an oval over BIZ UDGothic's O (0.44em
              wide, from 0.8em above the baseline to just under it). */}
          {i < Math.min(used, total) && (
            <span className="absolute top-[0.16em] left-[0.03em] h-[0.8em] w-[0.44em] rounded-[50%] bg-current" />
          )}
        </span>
      ))}
    </span>
  );
}
