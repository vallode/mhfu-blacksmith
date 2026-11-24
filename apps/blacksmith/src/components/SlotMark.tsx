import { cn } from "@/lib/cn";

const SPRITES = {
  empty: "/images/slot-empty.png",
  filled: "/images/slot-filled.png",
};

/**
 * One decoration slot circle, tinted by the surrounding text colour: a ring
 * when free, filled once a jewel takes it. The pips are 16px sprites from
 * public/images, used as masks so the game palette's colours still apply.
 */
export default function SlotMark({
  filled = false,
  className,
}: {
  /** A jewel takes the slot. */
  filled?: boolean;
  className?: string;
}) {
  const src = filled ? SPRITES.filled : SPRITES.empty;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-[0.9em] bg-current pixelated", className)}
      style={{
        WebkitMaskImage: `url("${src}")`,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "100% 100%",
        maskImage: `url("${src}")`,
        maskRepeat: "no-repeat",
        maskSize: "100% 100%",
      }}
    />
  );
}
