import Link from "next/link";
import { cn } from "@/lib/cn";

interface CardProps {
  children: React.ReactNode;
  /** A list that fills the card, scrolling, with no padding. */
  variant?: "weapon-tree";
  /**
   * The body scrolls. It then sits inside the frame's bands, so the scrollbar
   * is clear of the frame; Card's default padding shrinks to match, so a
   * `bodyClassName` padding counts from the band rather than the card edge.
   */
  scroll?: boolean;
  /** Alternative in-game border; the default is the standard card frame. */
  frame?: "teal" | "green" | "blue";
  /** The card's box: its size, its place in the layout and its text size. */
  className?: string;
  /** The content inside the frame: its padding, gaps, direction and scrolling. */
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
 * notches and bands. The frame is on the outer box, which never scrolls; the
 * body is what scrolls (`scroll`), so the frame stays put over a scrolling
 * list.
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
  // override earlier ones (e.g. <Card bodyClassName="gap-[1.3rem] py-7">).
  const classes = cn(
    frame === "teal"
      ? "card-frame-teal"
      : frame === "green"
        ? "card-frame-green"
        : frame === "blue"
          ? "card-frame-blue"
          : "card-frame",
    "relative z-1 flex min-h-0 min-w-0 flex-1 flex-col text-main",
    variant === "weapon-tree" && "h-full",
    href && linkGlow,
    className,
  );
  const bodyClasses = cn(
    // card-copy: paragraph defaults (globals.css, components layer).
    // isolate keeps the content's own z-indexes under the frame, and the
    // clip (--card-clip, set by the frame) keeps it out of the transparent
    // notches around the frame's outer edge.
    "card-copy isolate flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-[2.6rem] [clip-path:inset(var(--card-clip))]",
    // A scrolling body sits at --card-inset-* instead (inside the frame's
    // outline, so it needs no clip), with the default padding less the inset
    // so its content starts where it would have.
    (scroll || variant === "weapon-tree") && [
      "mt-(--card-inset-t) mr-(--card-inset-r) mb-(--card-inset-b) ml-(--card-inset-l) overflow-auto [clip-path:none]",
      "pt-[calc(2.6rem-var(--card-inset-t))] pr-[calc(2rem-var(--card-inset-r))] pb-[calc(2.6rem-var(--card-inset-b))] pl-[calc(2rem-var(--card-inset-l))]",
    ],
    // Tree lists run their rows as wide as they can: past the band on the
    // right too, to the notches (7px deep there), so a highlighted row shows
    // between the notches on both sides. A desktop scrollbar's outer edge
    // goes under them.
    variant === "weapon-tree" && "mr-[7px] p-0",
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
