"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Persistent-scroll wrapper for the weapon/armor/decoration tree sidebar.
 *
 * The tree is re-rendered on every navigation (static export: each detail is
 * its own page), which resets scrollTop to 0. This wrapper:
 *  - restores the previous scroll position for this tree (keyed by `treeKey`)
 *  - otherwise scrolls the active item into view on first visit
 *  - saves the scroll position continuously so back/forward and item clicks
 *    land exactly where you left off
 *
 * To avoid a visible jump (paint at top → effect scrolls → repaint), the tree
 * is hidden synchronously in a layout effect — before the browser paints the
 * newly rendered page — and revealed in the same frame the scroll position is
 * applied. If the data bundle resolves later, a MutationObserver finishes the
 * restore as soon as rows appear. SSR HTML stays visible for no-JS robustness.
 */
/**
 * The element that actually scrolls the tree: the wrapper itself if it is a
 * scroll container, otherwise its nearest scrolling ancestor (the tree card's
 * body, which scrolls under the card's frame).
 */
function scrollContainer(el: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return el;
}

export default function TreeScroll({
  treeKey,
  activeSlug,
  children,
}: {
  treeKey: string;
  activeSlug?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The tree this instance has already put on screen. A list that stays
  // mounted while the active item changes (the bestiary sidebar, which lives
  // in a layout) is left where the user has it instead of being re-scrolled.
  const shownTree = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = scrollContainer(el);

    // Only hide if there's a position to restore or an active item to reveal;
    // a plain first visit with neither needs no work and stays visible.
    const needsRestore =
      shownTree.current !== treeKey &&
      (sessionStorage.getItem(`tree-scroll:${treeKey}`) !== null || !!activeSlug);
    if (!needsRestore) {
      shownTree.current = treeKey;
      // Still track scrolling so later visits restore correctly.
      const onScrollPassive = () => {
        sessionStorage.setItem(`tree-scroll:${treeKey}`, String(scroller.scrollTop));
      };
      scroller.addEventListener("scroll", onScrollPassive, { passive: true });
      return () => scroller.removeEventListener("scroll", onScrollPassive);
    }

    // Hide before paint; everything below either reveals in this same frame
    // (cached data, rows already in the DOM) or when rows arrive.
    el.style.visibility = "hidden";

    // Save the scroll position continuously.
    const onScroll = () => {
      sessionStorage.setItem(`tree-scroll:${treeKey}`, String(scroller.scrollTop));
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const reveal = () => {
      el.style.visibility = "";
    };

    let restored = false;
    const restore = () => {
      if (restored) return;
      // No content yet — wait for it (empty tree renders zero rows). Tree
      // rows are <li>s; flat lists (the bestiary sidebar) are bare links.
      if (!el.querySelector("li, a")) return;
      restored = true;
      shownTree.current = treeKey;

      const saved = sessionStorage.getItem(`tree-scroll:${treeKey}`);
      if (saved !== null) {
        scroller.scrollTop = Number(saved);
      } else if (activeSlug) {
        // First visit to this tree: bring the active item into view.
        const active = el.querySelector<HTMLElement>(`#${CSS.escape(activeSlug)}`);
        active?.scrollIntoView({ block: "center" });
      }
      // Reveal in the same frame the scroll is applied — no jump.
      reveal();
    };

    restore();

    let observer: MutationObserver | null = null;
    if (!restored) {
      observer = new MutationObserver(restore);
      observer.observe(el, { childList: true, subtree: true });
    }

    // Safety net: never leave the tree invisible (e.g. a genuinely empty tree).
    const failsafe = window.setTimeout(reveal, 500);

    return () => {
      observer?.disconnect();
      window.clearTimeout(failsafe);
      scroller.removeEventListener("scroll", onScroll);
      reveal();
    };
  }, [treeKey, activeSlug]);

  return (
    // Every tree list is unstyled and sizes to its content, so deep branches
    // scroll horizontally instead of being clipped; nested branches indent.
    // The wrapper is as tall as its rows (flex-none, not the card's height), so
    // anything after it in the scrolling card, such as a spacer clearing a
    // selector bar, comes after the last row.
    <div
      className="flex-none pl-[13px] [&_li_ul]:pl-[26px] [&_ul]:m-0 [&_ul]:w-max [&_ul]:min-w-full [&_ul]:list-none [&_ul]:p-0"
      ref={ref}
    >
      {children}
    </div>
  );
}
