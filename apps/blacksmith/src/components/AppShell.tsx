"use client";

import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import { useSectionHref, type MenuSection } from "@/app/MenuLink";
import { cn } from "@/lib/cn";

interface NavItem {
  label: string;
  /** Icon sprite, from /images/<icon>.png. */
  icon: string;
  /** Pages under this path light the entry up. */
  match: string;
  /** Plain link; entries with a `section` open the page last viewed there. */
  href?: string;
  section?: MenuSection;
  /** Shown in the phone tab bar (the rest are in its menu drawer). */
  tab?: boolean;
  /** Tab bar uses the 16px /images/<icon>-mini.png sprite. */
  tabMini?: boolean;
}

/** The sidebar's entries, in groups with a divider between them: the game's data, then your own. */
const NAV_GROUPS: NavItem[][] = [
  [
    {
      label: "Weapons",
      icon: "great-sword",
      match: "/blacksmith/",
      section: "weapons",
      tab: true,
      tabMini: true,
    },
    {
      label: "Armor",
      icon: "helmet",
      match: "/armorsmith/",
      section: "armor",
      tab: true,
      tabMini: true,
    },
    { label: "Monsters", icon: "claw", match: "/monsters/", section: "monsters", tab: true },
    { label: "Decorations", icon: "decoration", match: "/decorations/", href: "/decorations/" },
    { label: "Quests", icon: "ticket", match: "/quests/", section: "quests", tab: true },
    { label: "Items", icon: "fluid", match: "/items/", href: "/items/" },
  ],
  [
    { label: "Sets", icon: "plate", match: "/set-builder/", href: "/set-builder/" },
    { label: "Wishlist", icon: "sac", match: "/wishlist/", href: "/wishlist/" },
    { label: "Hunter", icon: "coin", match: "/hunter/", href: "/hunter/" },
    { label: "Options", icon: "part", match: "/options/", href: "/options/" },
  ],
];
const NAV = NAV_GROUPS.flat();

const COLLAPSED_KEY = "sidebar-collapsed";

/** The `compact` variant's width (globals.css), where the sidebar is a rail that opens over the page. */
const COMPACT = "(min-width: 900px) and (max-width: 1199px)";

/** Whether the window is in the compact range (false while prerendering). */
function useCompact(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(COMPACT);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COMPACT).matches,
    () => false,
  );
}

/** Where each entry goes: its own href, or the last page viewed in its section. */
function useNavHrefs(pathname: string): (item: NavItem) => string {
  const sections: Record<MenuSection, string> = {
    weapons: useSectionHref("weapons", pathname),
    armor: useSectionHref("armor", pathname),
    monsters: useSectionHref("monsters", pathname),
    quests: useSectionHref("quests", pathname),
  };
  return (item) => item.href ?? sections[item.section!];
}

// A sidebar entry, like a row in the trees and lists: plain white text with
// the green glow on hover. The current page's entry holds the glow still.
const sidebarRow = cn(
  "group relative flex h-[4.4rem] flex-none cursor-pointer items-center gap-4 border-none bg-transparent px-6 text-left whitespace-nowrap text-white",
  "hover:hover-glow focus-visible:hover-glow focus-visible:outline-none",
);
const sidebarRowActive = "bg-(image:--gradient-hover-glow)";

// Nav icons are grey until hovered; brighten them with their row too.
const rowIcon = "mr-0 group-hover:before:bg-white";

/**
 * The entries of the sidebar (and the phone menu drawer): logo, sections,
 * search and, on desktop, the collapse toggle. `collapsed` shrinks it to an
 * icon rail on wide screens; on compact ones it is a rail unless `open`.
 */
function SidebarContents({
  pathname,
  hrefFor,
  collapsed = false,
  open = false,
  railLabel = false,
  onToggle,
  onSearch,
}: {
  pathname: string;
  hrefFor: (item: NavItem) => string;
  collapsed?: boolean;
  open?: boolean;
  /** Whether the toggle currently expands (the sidebar shows as a rail). */
  railLabel?: boolean;
  onToggle?: () => void;
  onSearch?: () => void;
}) {
  // Rail classes, by width: wide screens follow the saved preference, compact
  // ones are a rail unless opened. (Phones show the drawer, never a rail.)
  // Both classes are spelled out at each use so Tailwind finds them.
  const rail = (wide: string, compact: string) =>
    onToggle && cn(collapsed && wide, !open && compact);
  return (
    <>
      <Link
        href="/"
        aria-label="Home"
        className={cn("mx-6 mt-2 mb-4 block flex-none", rail("wide:hidden", "compact:hidden"))}
      >
        <img className="h-auto w-full" src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <nav className="flex flex-col" aria-label="Main">
        {NAV_GROUPS.map((group, i) => (
          <Fragment key={i}>
            {i > 0 && <hr className="mx-6 my-[1rem] h-[3px] w-auto" />}
            {group.map((item) => {
              const active = pathname.startsWith(item.match);
              return (
                <Link
                  key={item.match}
                  href={hrefFor(item)}
                  title={railLabel ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(sidebarRow, active && sidebarRowActive)}
                >
                  <Icon type={item.icon} nav active={active} className={rowIcon} />
                  <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>{item.label}</span>
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>

      <div className="mt-auto flex flex-col pt-4">
        {/* GlobalSearch opens on any click inside a .search-trigger. */}
        <button
          type="button"
          className={cn(sidebarRow, "search-trigger")}
          title={railLabel ? "Search" : undefined}
          onClick={onSearch}
        >
          <span className="flex size-[32px] flex-none items-center justify-center">
            <img
              className="size-[24px] opacity-75 group-hover:opacity-100"
              src="/images/binoculars.png"
              alt=""
            />
          </span>
          <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>Search</span>
        </button>

        {onToggle && (
          <button
            type="button"
            className={sidebarRow}
            onClick={onToggle}
            aria-label={railLabel ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!railLabel}
            title={railLabel ? "Expand sidebar" : undefined}
          >
            <span className="flex size-[32px] flex-none items-center justify-center">
              <img
                className={cn(
                  "h-[20px] w-[19px] pixelated",
                  rail("wide:rotate-180", "compact:rotate-180"),
                )}
                src="/images/arrow.png"
                alt=""
              />
            </span>
            <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>Collapse</span>
          </button>
        )}
      </div>
    </>
  );
}

/** Phone tab bar: the main sections, plus a Menu tab that opens the drawer. */
function TabBar({
  pathname,
  hrefFor,
  menuOpen,
  onMenu,
}: {
  pathname: string;
  hrefFor: (item: NavItem) => string;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const tab =
    "group flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[0.3rem] border-none bg-transparent p-0 text-white";
  const tabActive = "bg-(image:--gradient-hover-glow)";
  // The scale's smallest size, without the game's wide tracking so
  // "Monsters" fits a fifth of a phone's width.
  const label = "text-fine leading-none tracking-normal";
  const tabs = NAV.filter((item) => item.tab);
  const inTab = tabs.some((item) => pathname.startsWith(item.match));

  return (
    // Dips 1.8rem (the frame's band) under the bottom of the screen, like the
    // sidebar under the left edge, so only the frame's top band shows. The
    // card is that much taller, and taller still by the bottom safe
    // area, which the tabs stay clear of.
    <nav aria-label="Main" className="fixed inset-x-0 -bottom-[1.8rem] z-800 hidden mobile:flex">
      <Card
        frame="teal"
        className="h-[calc(var(--spacing-tabbar)+1.8rem+env(safe-area-inset-bottom))] bg-black/60 backdrop-blur-sm"
        // 2.4rem from the card's edge is 0.6rem inside the frame's 1.8rem
        // bands on every side.
        bodyClassName="flex-row items-stretch card-p-[2.4rem] [&>*]:mb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((item) => {
          const active = !menuOpen && pathname.startsWith(item.match);
          return (
            <Link
              key={item.match}
              href={hrefFor(item)}
              aria-current={active ? "page" : undefined}
              className={cn(tab, active && tabActive)}
            >
              <Icon
                type={item.icon}
                size={item.tabMini ? "mini" : undefined}
                nav
                active={active}
                className={rowIcon}
              />
              <span className={label}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={cn(tab, (menuOpen || (!inTab && pathname !== "/")) && tabActive)}
          onClick={onMenu}
          aria-expanded={menuOpen}
          aria-controls="app-menu-drawer"
        >
          {/* Three bars, drawn in the nav icons' grey. */}
          <span className="flex size-[32px] flex-col items-center justify-center gap-[4px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-[4px] w-[22px] bg-[#bdbdbd] group-hover:bg-white",
                  menuOpen && "bg-rarity-4",
                )}
              />
            ))}
          </span>
          <span className={label}>Menu</span>
        </button>
      </Card>
    </nav>
  );
}

/**
 * The app frame around every page: a sidebar of the site's sections in the
 * game's card frame down the left, and the page beside it. On wide screens
 * the sidebar collapses to an icon rail (remembered per browser). On compact
 * screens (landscape tablets, small laptops) it is always a rail, and its
 * toggle opens the full sidebar over the page rather than squeezing it. On
 * phones and portrait tablets it becomes a tab bar along the bottom, whose
 * Menu tab slides the full list in as a drawer.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hrefFor = useNavHrefs(pathname);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((was) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, was ? "0" : "1");
      } catch {}
      return !was;
    });
  }, []);

  // The compact rail, opened over the page.
  const compact = useCompact();
  const [railOpen, setRailOpen] = useState(false);
  const railShown = compact ? !railOpen : collapsed;
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia(COMPACT).matches) setRailOpen((open) => !open);
    else toggleCollapsed();
  }, [toggleCollapsed]);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setRailOpen(false);
  }, []);
  // A link in the drawer (or the opened rail) navigates; close it behind the
  // new page. Leaving the compact width closes the rail too.
  useEffect(closeMenu, [pathname, compact, closeMenu]);
  useEffect(() => {
    if (!menuOpen && !railOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, railOpen, closeMenu]);

  return (
    // On phones the document scrolls, unless the page holds an element marked
    // data-fill-screen (a list pane): then the shell is exactly the screen
    // (less the body's padding) and that pane scrolls inside it, under a page
    // bar that stays put.
    <div className="flex min-h-0 flex-1 gap-[1.3rem] mobile:flex-col mobile:has-data-fill-screen:max-h-[calc(100dvh-3.9rem)]">
      {/* Pulled left past the body's 1.4rem padding, so the frame's left edge
          dips 1.5rem under the edge of the screen; the card's left padding
          gives that back to its rows. On compact screens the aside keeps the
          rail's width, and the opened sidebar lies over the page. */}
      <aside
        className={cn(
          "relative -ml-[2.9rem] flex flex-none mobile:hidden compact:w-[10.1rem]",
          // A stacking context around the card, like a CardBox (Safari
          // workaround). Open, it also lifts the rail's overlay and card
          // (z-840, z-850) above the page.
          railOpen ? "z-850" : "z-2",
        )}
      >
        {railOpen && (
          <div
            className="fixed inset-0 z-840 hidden bg-black/60 compact:block"
            onClick={closeMenu}
          />
        )}
        <Card
          frame="teal"
          className={cn(
            "w-[27.5rem] flex-none text-sub transition-[width] duration-150",
            collapsed && "wide:w-[10.1rem]",
            railOpen
              ? "compact:absolute compact:inset-y-0 compact:left-0 compact:z-850 compact:bg-black/70"
              : "compact:w-[10.1rem]",
          )}
          scroll
          bodyClassName="overflow-x-hidden card-py-[2.2rem] card-pr-0 card-pl-[1.5rem]"
        >
          <SidebarContents
            pathname={pathname}
            hrefFor={hrefFor}
            collapsed={collapsed}
            open={railOpen}
            railLabel={railShown}
            onToggle={toggleSidebar}
            onSearch={closeMenu}
          />
        </Card>
      </aside>

      {/* A size container, so full-bleed pieces (BorderRule) span the page
          column rather than the window. */}
      <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>

      {/* Room for the fixed tab bar at the end of the page. */}
      <div className="hidden h-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom))] flex-none mobile:block" />

      <TabBar
        pathname={pathname}
        hrefFor={hrefFor}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((open) => !open)}
      />

      <div
        id="app-menu-drawer"
        className={cn("fixed inset-0 z-850 hidden", menuOpen && "mobile:flex")}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="absolute inset-0 bg-black/60" onClick={closeMenu} />
        {/* Dips under the screen's left edge, like the desktop sidebar. */}
        <CardBox className="-ml-[1.5rem] h-full w-[29.5rem] max-w-[85vw] flex-none animate-drawer-in">
          <Card
            frame="teal"
            className="bg-black/70 text-sub"
            scroll
            bodyClassName="card-py-[2.2rem] card-pr-0 card-pl-[1.5rem]"
          >
            <SidebarContents pathname={pathname} hrefFor={hrefFor} onSearch={closeMenu} />
          </Card>
        </CardBox>
      </div>
    </div>
  );
}
