"use client";

import { usePathname } from "next/navigation";
import WeaponNav from "@/components/WeaponNav";
import WeaponTreePanel from "@/components/WeaponTreePanel";
import { useWeaponTree } from "@/lib/client-data";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";

/** The weapon type and slug in /blacksmith/<type>/<slug>/, where present. */
function parseWeaponPath(pathname: string): { type?: WeaponType; slug?: string } {
  const [section, type, slug] = pathname.split("/").filter(Boolean);
  if (section !== "blacksmith") return {};
  if (!WEAPON_TYPES.includes(type as WeaponType)) return {};
  return { type: type as WeaponType, slug };
}

/** The type's weapon tree, down the left. */
function WeaponSidebar({ type, slug }: { type: WeaponType; slug?: string }) {
  const { tree, loading } = useWeaponTree(type);
  return (
    <WeaponTreePanel
      type={type}
      tree={loading ? null : tree}
      activeSlug={slug}
      // Phones show one pane at a time: on a weapon's page, its detail.
      className={slug ? "mobile:hidden" : undefined}
    />
  );
}

/**
 * The blacksmith frame: page bar with the weapon-type tabs, and the type's
 * tree down the left, with the page (a weapon's details, or NO DATA on the
 * type's own page) on the right. It lives in the blacksmith layout so it
 * stays mounted while you move between weapons; only the right-hand card
 * re-renders, so the tabs and the tree's icons don't flash.
 */
export function WeaponShell({
  type,
  slug,
  children,
}: {
  type?: WeaponType;
  slug?: string;
  children: React.ReactNode;
}) {
  if (!type) return children;
  return (
    <>
      <WeaponNav activeType={type} detail={!!slug} />
      {/* On phones the type's own page is just the tree, which fills the
          screen and scrolls inside its card (see AppShell). */}
      <div className="split-page" data-fill-screen={slug ? undefined : true}>
        <WeaponSidebar type={type} slug={slug} />
        {children}
      </div>
    </>
  );
}

/** WeaponShell for the current route (used by the blacksmith layout). */
export default function WeaponRouteShell({ children }: { children: React.ReactNode }) {
  const { type, slug } = parseWeaponPath(usePathname());
  return (
    <WeaponShell type={type} slug={slug}>
      {children}
    </WeaponShell>
  );
}
