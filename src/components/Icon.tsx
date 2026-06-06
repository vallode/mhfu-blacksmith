import styles from "@/styles/icon.module.scss";

interface IconProps {
  type: string;
  rarity?: number;
  color?: string;
  element?: string;
  rank?: string;
  size?: "default" | "large" | "mini";
  nav?: boolean;
  active?: boolean;
  monster?: boolean;
  alt?: string;
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
}: IconProps) {
  const classes = [
    styles.icon,
    size === "large" ? styles["icon--large"] : null,
    size === "mini" ? styles["icon--mini"] : null,
    nav ? styles["icon--nav"] : null,
    active ? styles["icon--rarity-4"] : null,
    monster ? styles["icon--monster"] : null,
    type ? styles[`icon--${type}`] : null,
    rarity ? styles[`icon--rarity-${rarity}`] : null,
    color ? styles[`icon--${color}`] : null,
    element ? styles[`icon--${element}`] : null,
    rank ? styles[`icon--${rank}`] : null,
  ]
    .filter(Boolean)
    .join(" ");

  const imgSrc =
    size === "mini" ? `/images/${type}-mini.png` : `/images/${type}.png`;

  return (
    <div className={classes}>
      <img src={imgSrc} alt={alt} />
    </div>
  );
}
