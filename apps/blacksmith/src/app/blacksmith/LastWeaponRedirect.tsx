"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_WEAPON, readLastWeapon } from "@/lib/last-weapon";

/**
 * `/` and `/blacksmith/` have no page of their own: they open the weapon type
 * you last viewed. They render the default type's tree page next to this, so
 * the first paint needs no redirect; this then moves the URL to that page
 * (without a navigation, so nothing re-renders), or goes to the type you last
 * viewed if LAST_WEAPON_SCRIPT hasn't already.
 */
export default function LastWeaponRedirect() {
  const router = useRouter();
  // A layout effect, to read the stored type before WeaponNav's effect
  // stores the default type it is showing.
  useLayoutEffect(() => {
    const type = readLastWeapon();
    const href = `/blacksmith/${type}/`;
    if (type === DEFAULT_WEAPON) window.history.replaceState(window.history.state, "", href);
    else router.replace(href);
  }, [router]);
  return null;
}
