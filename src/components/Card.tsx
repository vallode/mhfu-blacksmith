import styles from "@/styles/card.module.scss";

interface CardProps {
  children: React.ReactNode;
  variant?: "weapon-tree";
  className?: string;
  href?: string;
}

export default function Card({ children, variant, className, href }: CardProps) {
  const classes = [
    styles.card,
    variant === "weapon-tree" ? styles["card--weapon-tree"] : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return <div className={classes}>{children}</div>;
}
