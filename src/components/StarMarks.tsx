import { cn } from "@/lib/cn";

/** Sizes of the game's 13x14 star sprite: 1x beside body text, 2x in a selector bar. */
const SIZES = {
  1: { star: "w-[13px]", gap: "gap-[2px]" },
  2: { star: "w-[26px]", gap: "gap-[4px]" },
} as const;

/**
 * A star level as the game draws it: one star sprite per star. Read out as
 * "3 stars". At 2x the stars may shrink to fit a narrow bar (G Rank has 11).
 */
export default function StarMarks({
  stars,
  scale = 1,
  className,
}: {
  stars: number;
  scale?: keyof typeof SIZES;
  className?: string;
}) {
  const size = SIZES[scale];
  return (
    <span
      role="img"
      aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center align-middle",
        size.gap,
        className,
      )}
    >
      {Array.from({ length: stars }, (_, i) => (
        <img
          key={i}
          src="/images/star.png"
          alt=""
          className={cn("aspect-[13/14] h-auto min-w-0 shrink pixelated", size.star)}
        />
      ))}
    </span>
  );
}
