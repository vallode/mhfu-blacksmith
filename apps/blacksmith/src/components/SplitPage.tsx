"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/context/LanguageContext";
import { PHONE } from "@/lib/media";

interface Props {
  /** The list down the left: the section's tree or list card. */
  list: React.ReactNode;
  /**
   * Where closing the detail leads (the list's own page), on an item's page.
   * Absent on the list's own page, which has no detail to close.
   */
  closeHref?: string;
  /** The detail pane: an item's DetailCard, or NoDataCard on the list's own page. */
  children: React.ReactNode;
}

/**
 * A list-and-detail page (weapons, armor, monsters): the list on the left and
 * the detail on the right. On phones, where there is room for one pane, the
 * list fills the screen and scrolls inside its card (data-fill-screen, see
 * AppShell), and an item's detail slides up over it as a sheet, from the top
 * of the screen down to the tab bar. Closing the sheet (its ×) goes back to
 * the list's page, where the list is still scrolled to where you left it.
 */
export default function SplitPage({ list, closeHref, children }: Props) {
  const closeLabel = useT().common.close;
  const router = useRouter();
  const pathname = usePathname();
  const pageRef = useRef<HTMLDivElement>(null);

  // Whether the page before this one in the history is the list: then closing
  // the sheet goes back to it, so the browser's Back button doesn't reopen the
  // sheet. Otherwise (opened from a link or a bookmark) the list replaces it.
  const lastPath = useRef<string | null>(null);
  const openedFromList = useRef(false);
  useEffect(() => {
    openedFromList.current = !!closeHref && lastPath.current === closeHref;
    lastPath.current = pathname;
  }, [pathname, closeHref]);

  const close = (event: React.MouseEvent) => {
    if (!openedFromList.current || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    router.back();
  };

  // While the sheet covers the list on a phone, take the list out of the tab
  // order and the accessibility tree, so the sheet comes next.
  useEffect(() => {
    const covered = pageRef.current?.firstElementChild;
    if (!closeHref || !(covered instanceof HTMLElement)) return;
    const phone = window.matchMedia(PHONE);
    const update = () => {
      covered.inert = phone.matches;
    };
    update();
    phone.addEventListener("change", update);
    return () => {
      phone.removeEventListener("change", update);
      covered.inert = false;
    };
  }, [closeHref]);

  return (
    <div ref={pageRef} className="split-page" data-fill-screen>
      {list}
      {closeHref ? (
        // Wider screens: no box of its own (contents), so the detail is the
        // split's right-hand pane. Phones: the sheet, over the page bar and the
        // list (fixed, so it leaves the split page) and flush with the screen's
        // sides like the tab bar, with its cards filled (Card's --card-fill) so
        // the list doesn't show through them.
        <div className="contents mobile:fixed mobile:inset-x-0 mobile:top-[calc(env(safe-area-inset-top)+0.6rem)] mobile:bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+0.2rem)] mobile:z-10 mobile:flex mobile:flex-col mobile:[--card-fill:var(--color-sheet)] mobile:motion-safe:animate-sheet-in">
          {children}
          {/* Over the card's top-right corner, like the 3D model's close button. */}
          <Link
            href={closeHref}
            replace
            scroll={false}
            aria-label={closeLabel}
            onClick={close}
            className="absolute top-[0.6rem] right-[1.2rem] z-20 hidden px-2 text-[3rem] leading-none text-stat hover:opacity-75 focus-visible:opacity-75 mobile:block"
          >
            <span aria-hidden="true">×</span>
          </Link>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
