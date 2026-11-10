"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import BorderRule from "./BorderRule";
import Icon from "./Icon";
import { cn } from "@/lib/cn";

interface PageBarProps {
  /**
   * The page's heading ("Great Sword weapons"), for screen readers only: the
   * active tab and the sidebar already show where you are.
   */
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
 * The top of every page inside the app shell: the section's tabs, any
 * actions at the right-hand end, then the tiled divider. App-wide navigation
 * (home, other sections, search) lives in the sidebar, not here. On phones a
 * detail page also gets a back arrow to its list, before the tabs.
 */
export default function PageBar({ title, back, tabs, actions }: PageBarProps) {
  return (
    <>
      <header className="flex min-h-[52px] w-full flex-none items-center gap-x-2">
        {back && (
          <Link href={back.href} aria-label={back.label} className="hidden flex-none mobile:block">
            <Icon type="arrow" nav alt="" />
          </Link>
        )}

        {tabs}

        {actions && <div className="ml-auto flex flex-none items-center">{actions}</div>}

        <h1 className="sr-only">{title}</h1>
      </header>

      <BorderRule />
    </>
  );
}

/**
 * The strip of section tabs in a PageBar. On phones it is one row that
 * scrolls sideways, bleeding to the screen's right edge (and its left, unless
 * the back arrow is there), starting with the active tab in view; on desktop
 * the tabs wrap if they don't fit.
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
        "relative flex min-w-0 flex-wrap items-center",
        "mobile:mr-[-1.4rem] mobile:flex-1 mobile:[scrollbar-width:none] mobile:flex-nowrap mobile:overflow-x-auto mobile:pr-[1.4rem]",
        "mobile:first:ml-[-1.4rem] mobile:first:pl-[1.4rem]",
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
