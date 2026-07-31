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
}

// Icon classes (icon, icon--nav, icon--<type>, icon--rarity-N, …) are global
// — see src/styles/icon.scss, a plain global stylesheet imported in layout.tsx.
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
}: IconProps) {
  const isNote = color?.startsWith("note-") ?? false;

  const classes = [
    "icon",
    size === "large" ? "icon--large" : null,
    size === "mini" ? "icon--mini" : null,
    nav ? "icon--nav" : null,
    active ? "icon--rarity-4" : null,
    monster ? "icon--monster" : null,
    type && type !== "arrow" ? `icon--${type}` : null,
    rarity ? `icon--rarity-${rarity}` : null,
    color ? `icon--${color}` : null,
    element ? `icon--${element}` : null,
    rank ? `icon--${rank}` : null,
  ]
    .filter(Boolean)
    .join(" ");

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
