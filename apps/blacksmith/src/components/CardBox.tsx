import { cn } from "@/lib/cn";

/**
 * The box a card sits in, in the row of a split page: a stacking context
 * (z-2) around the Card, filling the row's space. Safari stops drawing a
 * card's frame and fill behind a scrolling, pulsing body unless the card sits
 * in one. That is an empirical workaround, found by bisecting, not an
 * understood cause: put a Card whose body scrolls in a CardBox, and don't
 * take the box out without checking in Safari.
 *
 * The tree panels that carry a filter bar pass `data-tree-panel` (see
 * `.split-page:has(> [data-tree-panel] …)` in globals.css) and sit above the
 * detail card, so the bar's arrows can overlap it.
 */
export default function CardBox({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { "data-tree-panel"?: boolean }) {
  return (
    <div className={cn("relative z-2 flex min-h-0 min-w-0 flex-1 flex-col", className)} {...props}>
      {children}
    </div>
  );
}
