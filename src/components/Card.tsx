import Link from "next/link";
import { cn } from "@/lib/cn";
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
  // Defaults first, caller's className last: cn() lets later utilities
  // override earlier ones (e.g. <Card className="overflow-auto py-7">).
  const classes = cn(
    styles.card,
    "card-frame relative z-1 flex flex-1 flex-col overflow-hidden px-5 py-[2.6rem] text-[2.6rem] mobile:text-[2rem]",
    variant === "weapon-tree" && "h-full overflow-auto px-[0.9rem] py-[0.8rem]",
    className
  );

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
