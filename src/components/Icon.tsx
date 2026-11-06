import { cn } from "@/lib/cn";
import { iconStyle } from "@/lib/icon-style";

interface IconProps {
  type: string;
  rarity?: number | null;
  color?: string | null;
  element?: string | null;
  rank?: string | null;
  size?: "default" | "large" | "mini";
  nav?: boolean;
  active?: boolean;
  monster?: boolean;
  alt?: string;
  /** Overrides the <img> src (defaults to /images/<type>[-mini].png). */
  imgSrc?: string;
  /** Extra classes (e.g. an explicit size variant when not using `size`). */
  className?: string;
}

export default function Icon({
  type,
  rarity,
  color,
  element,
  rank,
  size,
  nav,
  active,
  monster,
  alt = "",
  imgSrc,
  className,
}: IconProps) {
  const isNote = color?.startsWith("note-") ?? false;

  const { className: iconClassName, style } = iconStyle({
    type,
    rarity,
    color,
    element,
    rank,
    size,
    nav,
    active,
    monster,
  });

  // Note icons share a single base image; the note colour is a mask overlay.
  // Monster category icons live under /images/monsters/.
  const src =
    imgSrc ??
    (isNote
      ? "/images/note.png"
      : monster
        ? `/images/monsters/${type}.png`
        : size === "mini"
          ? `/images/${type}-mini.png`
          : `/images/${type}.png`);

  return (
    <div className={cn(iconClassName, className)} style={style}>
      <img src={src} alt={alt} />
    </div>
  );
}
