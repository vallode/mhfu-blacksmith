"use client";

import { Fragment, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import AfterLoadLink from "@/components/AfterLoadLink";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import { useSectionHref, type MenuSection } from "@/app/MenuLink";
import { cn } from "@/lib/cn";
import { useT } from "@/context/LanguageContext";
import { SITE_GAME } from "@/lib/constants";
import type { GameSections } from "game-data/games";
import { useSave } from "@/context/SaveContext";
import type { Messages } from "@/lib/i18n/messages";

type NavLabel = keyof Messages["site"]["nav"];

interface NavItem {
  /** Its name, in `site.nav`. */
  label: NavLabel;
  /** Icon sprite, from /images/<icon>.png. */
  icon: string;
  /** Pages under this path light the entry up. */
  match: string;
  /** Another path that lights it up: a page the section's own tabs reach. */
  alsoMatch?: string;
  /** Plain link; entries with a `section` open the page last viewed there. */
  href?: string;
  section?: MenuSection;
  /** Shown in the phone tab bar (the rest are in its menu drawer). */
  tab?: boolean;
  /** Uses the 16px /images/<icon>-mini.png sprite (drawn at 2x) in the sidebar and tab bar. */
  mini?: boolean;
  /** The game's section (its config's `sections`) the entry needs; the entry is left out without it. */
  needs?: keyof GameSections;
}

/**
 * The sidebar's entries, in groups with a divider between them: the game's
 * data, then your own. Search, the options and the hunter sit at the
 * bottom (OPTIONS_NAV, HunterRow).
 */
const ALL_NAV_GROUPS: NavItem[][] = [
  [
    {
      label: "weapons",
      icon: "great-sword",
      match: "/blacksmith/",
      section: "weapons",
      needs: "blacksmith",
      tab: true,
      mini: true,
    },
    {
      label: "armor",
      icon: "helmet",
      match: "/armorsmith/",
      section: "armor",
      needs: "armorsmith",
      tab: true,
      mini: true,
    },
    {
      label: "monsters",
      icon: "claw",
      match: "/monsters/",
      section: "monsters",
      tab: true,
      needs: "monsters",
    },
    {
      label: "decorations",
      icon: "decoration",
      match: "/decorations/",
      href: "/decorations/",
      mini: true,
      needs: "decorations",
    },
    {
      label: "quests",
      icon: "ticket",
      match: "/quests/",
      section: "quests",
      tab: true,
      needs: "quests",
    },
    // Items also covers the Veggie Elder's trades (ItemNav's tabs).
    {
      label: "items",
      icon: "fluid",
      match: "/items/",
      alsoMatch: "/veggie-elder/",
      href: "/items/",
      needs: "items",
    },
    { label: "maps", icon: "item-29", match: "/maps/", href: "/maps/", needs: "maps" },
  ],
  [
    {
      label: "sets",
      icon: "plate",
      match: "/set-builder/",
      href: "/set-builder/",
      mini: true,
      needs: "setBuilder",
    },
    { label: "wishlist", icon: "sac", match: "/wishlist/", href: "/wishlist/", needs: "wishlist" },
    { label: "damage", icon: "ko", match: "/damage/", href: "/damage/", needs: "damage" },
  ],
];
/** The entries the game has sections for. */
const NAV_GROUPS = ALL_NAV_GROUPS.map((group) =>
  group.filter((item) => !item.needs || SITE_GAME.sections[item.needs]),
);
const OPTIONS_NAV: NavItem = {
  label: "options",
  icon: "part",
  match: "/options/",
  href: "/options/",
};
const NAV = NAV_GROUPS.flat();

/** Whether the page is in the entry's section. */
const isActive = (item: NavItem, pathname: string) =>
  pathname.startsWith(item.match) || (!!item.alsoMatch && pathname.startsWith(item.alsoMatch));
const HUNTER_MATCH = "/hunter/";

const COLLAPSED_KEY = "sidebar-collapsed";

/** The community Discord server, opened in a new tab from the sidebar. */
const DISCORD_URL = "https://discord.gg/jqZZsDK4mz";

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

const WEAPONS_NAV = NAV_GROUPS[0][0];

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
  "group relative flex h-[4.4rem] flex-none cursor-pointer items-center gap-4 border-none bg-transparent px-6 text-left whitespace-nowrap text-white short:h-[3.6rem]",
  "hover:hover-glow focus-visible:hover-glow focus-visible:outline-none",
);
const sidebarRowActive = "bg-(image:--gradient-hover-glow)";

// Nav icons are grey until hovered; brighten them with their row too.
const rowIcon = "mr-0 group-hover:before:bg-white";

/**
 * The hunter's entry at the foot of the sidebar, like an account row: the
 * loaded hunter's name over their HR, or "Load hunter" without one. It leads
 * to the hunter's pages (/hunter/), where a save is loaded too.
 */
function HunterRow({
  pathname,
  railLabel,
  rail,
}: {
  pathname: string;
  railLabel: boolean;
  rail: (wide: string, compact: string) => string | false | undefined;
}) {
  const t = useT().site;
  const { save } = useSave();
  const active = pathname.startsWith(HUNTER_MATCH);
  const label = save ? save.name : t.nav.loadHunter;
  const rank = save?.hunterRank !== undefined ? t.hunter.rankShort(save.hunterRank) : null;
  return (
    <AfterLoadLink
      href={HUNTER_MATCH}
      title={railLabel ? [label, rank].filter(Boolean).join(" · ") : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(sidebarRow, "h-[5.2rem] short:h-[4.4rem]", active && sidebarRowActive)}
    >
      {/* Lit green while a hunter is loaded, like the chosen slot on the hunter page. */}
      <Icon type="coin" nav active={active || !!save} className={rowIcon} />
      <span
        className={cn(
          "flex min-w-0 flex-col leading-tight",
          rail("wide:sr-only", "compact:sr-only"),
        )}
      >
        <span className={cn("truncate", !save && "text-white/70")}>{label}</span>
        {rank && <span className="text-fine text-muted">{rank}</span>}
      </span>
    </AfterLoadLink>
  );
}

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
  const t = useT().site;
  // Rail classes, by width: wide screens follow the saved preference, compact
  // ones are a rail unless opened. (Phones show the drawer, never a rail.)
  // Both classes are spelled out at each use so Tailwind finds them.
  const rail = (wide: string, compact: string) =>
    onToggle && cn(collapsed && wide, !open && compact);
  return (
    <>
      {/* `/` opens the last weapon type viewed; link there directly so a client
          navigation doesn't draw the default type on the way. */}
      <AfterLoadLink
        href={hrefFor(WEAPONS_NAV)}
        aria-label={t.nav.home}
        className={cn(
          "mx-6 mt-2 mb-4 block flex-none short:hidden",
          rail("wide:hidden", "compact:hidden"),
        )}
      >
        <img className="h-auto w-full" src="/images/blacksmith.png" alt={t.logoAlt} />
      </AfterLoadLink>

      <nav className="flex flex-col" aria-label={t.nav.main}>
        {NAV_GROUPS.map((group, i) => (
          <Fragment key={i}>
            {i > 0 && <hr className="mx-6 my-[1rem] h-[3px] w-auto short:my-[0.6rem]" />}
            {group.map((item) => {
              const active = isActive(item, pathname);
              return (
                <AfterLoadLink
                  key={item.match}
                  href={hrefFor(item)}
                  title={railLabel ? t.nav[item.label] : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(sidebarRow, active && sidebarRowActive)}
                >
                  <Icon
                    type={item.icon}
                    size={item.mini ? "mini" : undefined}
                    nav
                    active={active}
                    className={rowIcon}
                  />
                  <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>
                    {t.nav[item.label]}
                  </span>
                </AfterLoadLink>
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
          title={railLabel ? t.nav.search : undefined}
          onClick={onSearch}
        >
          <span className="flex size-[32px] flex-none items-center justify-center">
            <img
              className="size-[32px] opacity-75 pixelated group-hover:opacity-100"
              src="/images/binoculars-mini.png"
              alt=""
            />
          </span>
          <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>{t.nav.search}</span>
        </button>

        <AfterLoadLink
          href={hrefFor(OPTIONS_NAV)}
          title={railLabel ? t.nav.options : undefined}
          aria-current={pathname.startsWith(OPTIONS_NAV.match) ? "page" : undefined}
          className={cn(sidebarRow, pathname.startsWith(OPTIONS_NAV.match) && sidebarRowActive)}
        >
          <Icon
            type={OPTIONS_NAV.icon}
            nav
            active={pathname.startsWith(OPTIONS_NAV.match)}
            className={rowIcon}
          />
          <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>{t.nav.options}</span>
        </AfterLoadLink>

        {/* The community server, in its own tab: the logo is drawn inline,
            in the nav icons' grey, since there is no game sprite for it. */}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          title={railLabel ? t.discord : undefined}
          className={sidebarRow}
        >
          <span className="flex h-[32px] w-[32px] flex-[0_0_3.2rem] items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-[26px] fill-[#bdbdbd] group-hover:fill-white"
            >
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.01c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </span>
          <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>{t.discord}</span>
        </a>

        {SITE_GAME.sections.hunterImport && (
          <HunterRow pathname={pathname} railLabel={railLabel} rail={rail} />
        )}

        {onToggle && (
          <button
            type="button"
            className={sidebarRow}
            onClick={onToggle}
            aria-label={railLabel ? t.nav.expandSidebar : t.nav.collapseSidebar}
            aria-expanded={!railLabel}
            title={railLabel ? t.nav.expandSidebar : undefined}
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
            <span className={cn(rail("wide:sr-only", "compact:sr-only"))}>{t.nav.collapse}</span>
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
  const t = useT().site;
  const tab =
    "group flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[0.3rem] border-none bg-transparent p-0 text-white";
  const tabActive = "bg-(image:--gradient-hover-glow)";
  // The scale's smallest size, without the game's wide tracking so
  // "Monsters" fits a fifth of a phone's width.
  const label = "text-fine leading-none tracking-normal";
  const tabs = NAV.filter((item) => item.tab);
  const inTab = tabs.some((item) => isActive(item, pathname));

  return (
    // Dips 1.8rem (the frame's band) under the bottom of the screen, like the
    // sidebar under the left edge, so only the frame's top band shows. The
    // card is that much taller, and taller still by the bottom safe
    // area, which the tabs stay clear of.
    <nav
      aria-label={t.nav.main}
      className="fixed inset-x-0 -bottom-[1.8rem] z-800 hidden mobile:flex"
    >
      <Card
        frame="teal"
        className="h-[calc(var(--spacing-tabbar)+1.8rem+env(safe-area-inset-bottom))] bg-black/60 backdrop-blur-sm"
        // 2.4rem from the card's edge is 0.6rem inside the frame's 1.8rem
        // bands on every side.
        bodyClassName="flex-row items-stretch card-p-[2.4rem] [&>*]:mb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((item) => {
          const active = !menuOpen && isActive(item, pathname);
          return (
            <AfterLoadLink
              key={item.match}
              href={hrefFor(item)}
              aria-current={active ? "page" : undefined}
              className={cn(tab, active && tabActive)}
            >
              <Icon
                type={item.icon}
                size={item.mini ? "mini" : undefined}
                nav
                active={active}
                className={rowIcon}
              />
              <span className={label}>{t.nav[item.label]}</span>
            </AfterLoadLink>
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
          <span className={label}>{t.nav.menu}</span>
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
  const t = useT().site;
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
        aria-label={t.nav.menu}
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
