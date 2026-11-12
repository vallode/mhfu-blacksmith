import { cn } from "@/lib/cn";
import { CROWN_LABELS, type Crown } from "@/lib/crowns";

/**
 * The Guild Card's crown sprites, from its award sheet (`cockpit/guild.tmh`
 * image 0): the gold crown (21x22) and the small silver one (13x13) used for
 * mini crowns. The game has no silver crown of the big size, so
 * `crown-silver.png` is the gold one in the small crown's silvers. Drawn
 * at 1x.
 */
const SPRITES: Record<Crown, { src: string; size: string }> = {
  gold: { src: "/images/crown-gold.png", size: "h-[22px] w-[21px]" },
  silver: { src: "/images/crown-silver.png", size: "h-[22px] w-[21px]" },
  mini: { src: "/images/crown-mini.png", size: "h-[13px] w-[13px]" },
};

export default function CrownIcon({
  crown,
  title,
  className,
}: {
  crown: Crown;
  /** Hover text; the crown's name ("Gold crown") when left out. */
  title?: string;
  className?: string;
}) {
  const { src, size } = SPRITES[crown];
  const label = title ?? `${CROWN_LABELS[crown]} crown`;
  return (
    <img
      src={src}
      alt={label}
      title={label}
      className={cn("inline-block flex-none pixelated", size, className)}
    />
  );
}
