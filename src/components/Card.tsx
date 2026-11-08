import Link from "next/link";
import { cn } from "@/lib/cn";

interface CardProps {
  children: React.ReactNode;
  variant?: "weapon-tree";
  /** Alternative in-game border; the default is the standard card frame. */
  frame?: "teal" | "green" | "blue";
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
  frame,
  className,
  href,
  onDragOver,
  onDragLeave,
  onDrop,
}: CardProps) {
  // Defaults first, caller's className last: cn() lets later utilities
  // override earlier ones (e.g. <Card className="overflow-auto py-7">).
  const classes = cn(
    frame === "teal"
      ? "card-frame-teal"
      : frame === "green"
        ? "card-frame-green"
        : frame === "blue"
          ? "card-frame-blue"
          : "card-frame",
    // card-copy: paragraph defaults (globals.css, components layer)
    "card-copy relative z-1 flex flex-1 flex-col overflow-hidden px-5 py-[2.6rem] text-[2.6rem] mobile:text-[2rem]",
    // Border widths are deliberately thinner than the frame art's
    // border-image-width, so the scroll area (and its rows) runs close to the
    // card edges and slightly under the frame.
    variant === "weapon-tree" && "h-full overflow-auto border-x-[11px] border-y-[4px] p-0",
    href && linkGlow,
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <div className={classes} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {children}
    </div>
  );
}
