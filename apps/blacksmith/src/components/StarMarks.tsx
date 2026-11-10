import { cn } from "@/lib/cn";

/**
 * Sizes of the game's 13x14 star sprite: 1x beside body text, 2x in a
 * selector bar. G Rank's "G" is sized to stand as tall as the stars.
 */
const SIZES = {
  1: { star: "w-[13px]", gap: "gap-[2px]", g: "text-[16px]" },
  2: { star: "w-[26px]", gap: "gap-[4px]", g: "text-[32px]" },
} as const;

/**
 * A star level as the game draws it: one star sprite per star, after a "G"
 * for G Rank (see `questStarLevel`). Read out as "3 stars" or "G 1 star".
 * At 2x the stars may shrink to fit a narrow bar (the Village has 9).
 */
export default function StarMarks({
  stars,
  g = false,
  scale = 1,
  className,
}: {
  stars: number;
  /** A G Rank level: a "G" before the stars. */
  g?: boolean;
  scale?: keyof typeof SIZES;
  className?: string;
}) {
  const size = SIZES[scale];
  return (
    <span
      role="img"
      aria-label={`${g ? "G " : ""}${stars} ${stars === 1 ? "star" : "stars"}`}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center align-middle",
        size.gap,
        className,
      )}
    >
      {g && (
        <span
          aria-hidden="true"
          className={cn("flex-none leading-none tracking-normal text-stat", size.g)}
        >
          G
        </span>
      )}
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
