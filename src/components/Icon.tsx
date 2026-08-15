import { cn } from "@/lib/cn";
import styles from "./Icon.module.scss";

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

// The icon base class is scoped via Icon.module.scss (styles.icon); modifiers
// are scoped too. Components that build an icon by hand (GlobalSearch) reuse
// the same hashed base via `iconBaseClass`.
export const iconBaseClass = styles.icon;

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

  const classes = cn(
    iconBaseClass,
    size === "large" && styles["icon--large"],
    size === "mini" && styles["icon--mini"],
    nav && styles["icon--nav"],
    active && styles["icon--rarity-4"],
    monster && styles["icon--monster"],
    type && type !== "arrow" && styles[`icon--${type}`],
    rarity && styles[`icon--rarity-${rarity}`],
    color && styles[`icon--${color}`],
    element && styles[`icon--${element}`],
    rank && styles[`icon--${rank}`],
    className
  );

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
    <div className={classes}>
      <img src={src} alt={alt} />
    </div>
  );
}
