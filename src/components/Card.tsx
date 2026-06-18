import Link from "next/link";
import styles from "./Card.module.scss";

interface CardProps {
  children: React.ReactNode;
  variant?: "weapon-tree";
  className?: string;
  href?: string;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
}

export default function Card({
  children,
  variant,
  className,
  href,
  onDragOver,
  onDragLeave,
  onDrop,
}: CardProps) {
  const classes = [
    styles.card,
    variant === "weapon-tree" ? styles["weaponTree"] : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <div
      className={classes}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}
