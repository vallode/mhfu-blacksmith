import Link from "next/link";
import { cn } from "@/lib/cn";

interface CardProps {
  children: React.ReactNode;
  /** A list that fills the card, scrolling, with no padding. */
  variant?: "weapon-tree";
  /** The body scrolls (under the frame, which stays put). */
  scroll?: boolean;
  /** Alternative in-game border; the default is the standard card frame. */
  frame?: "teal" | "green" | "blue";
  /** The card's box: its size, its place in the layout and its text size. */
  className?: string;
  /**
   * The content inside the frame: its gaps and direction, and its padding as
   * `card-p*` utilities (`card-py-7`), which count from the card's outer edge.
   */
  bodyClassName?: string;
  href?: string;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
}

// Link cards show the green highlight inside the frame on hover/focus.
const linkGlow =
  "before:absolute before:top-2 before:left-[10px] before:block before:h-[calc(100%-16px)] before:w-[calc(100%-20px)] before:bg-(image:--gradient-hover-glow) before:invisible hover:before:visible focus:before:visible";

/**
 * An in-game card: the frame, and a body inside it that holds the children.
 *
 * The frame is drawn under the body and again over it (see `card-frame` in
 * globals.css), so rows that run out to the edge pass under the frame's
 * notches and bands. The body is also masked where the frame is opaque
 * (`card-body`), since Safari can composite a scrolling body over the
 * overlay. The frame is on the outer box, which never scrolls; the
 * body is what scrolls (`scroll`), so the frame stays put over a scrolling
 * list.
 *
 * Cards are see-through. A `--card-fill` colour set on an ancestor fills the
 * body, which ends at the frame's outline (SplitPage's sheet, over the list).
 */
export default function Card({
  children,
  variant,
  frame,
  scroll,
  className,
  bodyClassName,
  href,
  onDragOver,
  onDragLeave,
  onDrop,
}: CardProps) {
  // Defaults first, caller's classes last: cn() lets later utilities
  // override earlier ones (e.g. <Card className="text-small">).
  const classes = cn(
    frame === "teal"
      ? "card-frame-teal"
      : frame === "green"
        ? "card-frame-green"
        : frame === "blue"
          ? "card-frame-blue"
          : "card-frame",
    "frame-cover relative z-1 flex min-h-0 min-w-0 flex-1 flex-col text-main",
    // The 12px basis keeps the row split a tree card had when its 12px of
    // side borders sat on the flex item (see DetailCard's 4rem).
    variant === "weapon-tree" && "h-full basis-[12px] mobile:basis-[0%]",
    href && linkGlow,
    className,
  );
  const bodyClasses = cn(
    // card-body: at the frame's outline, with card-p* padding (globals.css).
    // card-copy: paragraph defaults (globals.css, components layer).
    // isolate keeps the content's own z-indexes under the frame.
    "card-copy isolate card-body flex min-h-0 flex-1 flex-col overflow-hidden bg-(color:--card-fill)",
    (scroll || variant === "weapon-tree") && "overflow-auto",
    // Tree lists run their rows out to the outline on the sides; the first
    // and last rows start below and end above the frame's 11px bands.
    variant === "weapon-tree" && "card-px-0 card-py-[1.1rem]",
    bodyClassName,
  );
  const body = <div className={bodyClasses}>{children}</div>;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <div className={classes} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {body}
    </div>
  );
}
