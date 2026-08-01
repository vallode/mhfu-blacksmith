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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only hide if there's a position to restore or an active item to reveal;
    // a plain first visit with neither needs no work and stays visible.
    const needsRestore =
      sessionStorage.getItem(`tree-scroll:${treeKey}`) !== null || !!activeSlug;
    if (!needsRestore) {
      // Still track scrolling so later visits restore correctly.
      const onScrollPassive = () => {
        sessionStorage.setItem(`tree-scroll:${treeKey}`, String(el.scrollTop));
      };
      el.addEventListener("scroll", onScrollPassive, { passive: true });
      return () => el.removeEventListener("scroll", onScrollPassive);
    }

    // Hide before paint; everything below either reveals in this same frame
    // (cached data, rows already in the DOM) or when rows arrive.
    el.style.visibility = "hidden";

    // Save the scroll position continuously.
    const onScroll = () => {
      sessionStorage.setItem(`tree-scroll:${treeKey}`, String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const reveal = () => {
      el.style.visibility = "";
    };

    let restored = false;
    const restore = () => {
      if (restored) return;
      // No content yet — wait for it (empty tree renders zero rows).
      if (!el.querySelector("li")) return;
      restored = true;

      const saved = sessionStorage.getItem(`tree-scroll:${treeKey}`);
      if (saved !== null) {
        el.scrollTop = Number(saved);
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
      el.removeEventListener("scroll", onScroll);
      reveal();
    };
  }, [treeKey, activeSlug]);

  return (
    <div className="weapon-tree" ref={ref}>
      {children}
    </div>
  );
}
