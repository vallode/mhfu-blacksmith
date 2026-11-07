import Link from "next/link";
import { cn } from "@/lib/cn";

interface CardProps {
  children: React.ReactNode;
  variant?: "weapon-tree";
  className?: string;
  href?: string;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
}

// Link cards show the green highlight inside the frame on hover/focus.
const linkGlow =
  "after:absolute after:top-2 after:left-[10px] after:z-1 after:block after:h-[calc(100%-16px)] after:w-[calc(100%-20px)] after:bg-(image:--gradient-hover-glow) after:invisible hover:after:visible focus:after:visible";

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
    // card-copy: paragraph defaults (globals.scss, components layer)
    "card-frame card-copy relative z-1 flex flex-1 flex-col overflow-hidden px-5 py-[2.6rem] text-[2.6rem] mobile:text-[2rem]",
    variant === "weapon-tree" && "h-full overflow-auto px-[0.9rem] py-[0.8rem]",
    href && linkGlow,
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
