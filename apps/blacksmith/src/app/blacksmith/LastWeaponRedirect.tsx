"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SITE_NAME, weaponTreeTitle } from "@/lib/embed-format";
import { DEFAULT_WEAPON, readLastWeapon } from "@/lib/last-weapon";
import { WeaponShell } from "./WeaponShell";
import WeaponTreeListClient from "./[type]/WeaponTreeListClient";

/**
 * `/` and `/blacksmith/` have no page of their own: they open the weapon type
 * you last viewed. They render the default type's tree page next to this, so
 * the first paint needs no redirect; this then moves the URL to that page
 * (without a navigation, so nothing re-renders), or goes to the type you last
 * viewed if LAST_WEAPON_SCRIPT hasn't already.
 */
export default function LastWeaponRedirect() {
  const router = useRouter();
  const stayed = useRef(false);
  // A layout effect, to read the stored type before WeaponNav's effect
  // stores the default type it is showing.
  useLayoutEffect(() => {
    const type = readLastWeapon();
    stayed.current = type === DEFAULT_WEAPON;
    if (!stayed.current) router.replace(`/blacksmith/${type}/${location.search}${location.hash}`);
  }, [router]);
  // Staying: move the URL to the default type's page. Only Next's own
  // replaceState makes its router (and usePathname) take the new URL, given
  // a null state. On a first load Next installs it in an effect that runs
  // after this one in the same pass, so wait a task for it.
  useEffect(() => {
    if (!stayed.current) return;
    const href = `/blacksmith/${DEFAULT_WEAPON}/${location.search}${location.hash}`;
    const timer = setTimeout(() => window.history.replaceState(null, "", href));
    return () => clearTimeout(timer);
  }, []);
  // Once the URL is the default type's page, give the tab that page's title.
  // After Next has taken the new URL: its re-render puts this page's back.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === `/blacksmith/${DEFAULT_WEAPON}/`) {
      document.title = `${weaponTreeTitle(DEFAULT_WEAPON)} — ${SITE_NAME}`;
    }
  }, [pathname]);
  return null;
}

/**
 * `/` outside the blacksmith layout (and `/blacksmith/` when rendered offline):
 * the default type's tree page, then on to the type you last viewed.
 */
export function DefaultWeaponPage() {
  return (
    <WeaponShell type={DEFAULT_WEAPON}>
      <WeaponTreeListClient type={DEFAULT_WEAPON} />
      <LastWeaponRedirect />
    </WeaponShell>
  );
}
