import Link from "next/link";

interface Props {
  /** The list down the left: the section's tree or list card. */
  list: React.ReactNode;
  /**
   * Where closing the detail leads (the list's own page), on an item's page.
   * Absent on the list's own page, which has no detail to close.
   */
  closeHref?: string;
  /** The detail pane: an item's DetailCard, or NO DATA on the list's own page. */
  children: React.ReactNode;
}

/**
 * A list-and-detail page (weapons, armor, monsters): the list on the left and
 * the detail on the right. On phones, where there is room for one pane, the
 * list fills the screen and scrolls inside its card (data-fill-screen, see
 * AppShell), and an item's detail slides up over it as a sheet. Closing the
 * sheet (its ×, or a tap on the dimmed list above it) goes back to the list's
 * page, where the list is still scrolled to where you left it.
 */
export default function SplitPage({ list, closeHref, children }: Props) {
  return (
    <div className="split-page" data-fill-screen>
      {list}
      {closeHref ? (
        <>
          {/* The dimmed list behind the sheet. Keyboards and screen readers
              get the × instead, so this one is left out of both. */}
          <Link
            href={closeHref}
            scroll={false}
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 z-9 hidden bg-black/60 mobile:block"
          />
          {/* Wider screens: no box of its own (contents), so the detail is the
              split's right-hand pane. Phones: the sheet, leaving the list's
              top rows in view. Cards are see-through, so a solid fill just
              inside the frame keeps the list from showing through the detail. */}
          <div className="contents mobile:absolute mobile:inset-x-0 mobile:top-[9rem] mobile:bottom-0 mobile:z-10 mobile:flex mobile:flex-col mobile:before:absolute mobile:before:inset-[6px] mobile:before:bg-[#1b1f17] mobile:motion-safe:animate-sheet-in">
            <Link
              href={closeHref}
              scroll={false}
              aria-label="Close"
              className="absolute -top-[4.6rem] right-[1rem] z-20 hidden size-[4rem] items-center justify-center text-[3.2rem] leading-none text-white mobile:flex"
            >
              ×
            </Link>
            {children}
          </div>
        </>
      ) : (
        // Phones show only the list on its own page.
        <div className="contents mobile:hidden">{children}</div>
      )}
    </div>
  );
}
