"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import BorderRule from "./BorderRule";
import Icon from "./Icon";
import { cn } from "@/lib/cn";

interface PageBarProps {
  /** The app section, shown small above the title ("Weapons"). */
  section: string;
  /** Where in the section you are ("Great Sword"). */
  title: string;
  /**
   * Back link for phones, where a list-and-detail page shows one pane at a
   * time: the detail pane's bar leads back to its list. Desktop shows both
   * panes, so it has none.
   */
  back?: { href: string; label: string };
  /** The section's own navigation: PageTab links. */
  tabs?: React.ReactNode;
  /** Page actions at the right-hand end. */
  actions?: React.ReactNode;
}

/**
 * The top of every page inside the app shell: section and title on the left,
 * the section's tabs beside them and any actions on the right, then the tiled
 * divider. App-wide navigation (home, other sections, search) lives in the
 * sidebar, not here.
 */
export default function PageBar({ section, title, back, tabs, actions }: PageBarProps) {
  return (
    <>
      <header className="flex min-h-[52px] w-full flex-none items-center gap-x-8 mobile:flex-wrap mobile:gap-y-3">
        {back && (
          <Link href={back.href} aria-label={back.label} className="hidden mobile:block">
            <Icon type="arrow" nav alt="" />
          </Link>
        )}

        {/* Fixed width, so the tabs don't shift as the title changes. */}
        <h1 className="m-0 flex w-cells-16 flex-none flex-col font-normal mobile:w-auto mobile:flex-1">
          <span className="text-[1.3rem] leading-[1.2] tracking-[0.4em] text-parchment uppercase text-shadow-[0.15rem_0.15rem_black]">
            {section}
          </span>
          <span className="text-[2.2rem] leading-[1.2] text-white text-shadow-[0.2rem_0.2rem_black] mobile:text-[2rem]">
            {title}
          </span>
        </h1>

        {tabs}

        {actions && <div className="ml-auto flex flex-none items-center">{actions}</div>}
      </header>

      <BorderRule />
    </>
  );
}

/**
 * The strip of section tabs in a PageBar. On phones it is one row that
 * scrolls sideways (bleeding to the screen edges), starting with the active
 * tab in view; on desktop the tabs wrap if they don't fit.
 */
export function PageTabs({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  // Bring the active tab into view (only the strip scrolls; on desktop the
  // strip doesn't overflow, so this does nothing).
  useLayoutEffect(() => {
    const strip = ref.current;
    const active = strip?.querySelector<HTMLElement>("[aria-current]");
    if (!strip || !active) return;
    strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, []);

  return (
    <nav
      ref={ref}
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-wrap items-center",
        "mobile:mx-[-1.4rem] mobile:w-[calc(100%+2.8rem)] mobile:[scrollbar-width:none] mobile:flex-nowrap mobile:overflow-x-auto mobile:px-[1.4rem]",
      )}
    >
      {children}
    </nav>
  );
}

/** One tab in PageTabs: a large nav icon, grey until hovered, green when active. */
export function PageTab({
  href,
  label,
  icon,
  monster,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  monster?: boolean;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      className="flex-none"
    >
      <Icon type={icon} size="large" monster={monster} nav active={active} alt={label} />
    </Link>
  );
}
