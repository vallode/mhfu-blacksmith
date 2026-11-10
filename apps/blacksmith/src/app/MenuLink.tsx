"use client";

import { useEffect, useState } from "react";
import { DEFAULT_WEAPON, readLastWeapon } from "@/lib/last-weapon";
import { DEFAULT_ARMOR, readLastArmor } from "@/lib/armor-last-store";
import { DEFAULT_MONSTER, readLastMonster } from "@/lib/last-monster";

const SECTIONS = {
  weapons: {
    label: "Weapons",
    initial: `/blacksmith/${DEFAULT_WEAPON}/`,
    last: () => `/blacksmith/${readLastWeapon()}/`,
  },
  armor: {
    label: "Armor",
    initial: `/armorsmith/${DEFAULT_ARMOR.slot}/${DEFAULT_ARMOR.rank}/`,
    last: () => {
      const { slot, rank } = readLastArmor();
      return `/armorsmith/${slot}/${rank}/`;
    },
  },
  monsters: {
    label: "Monsters",
    initial: `/monsters/${DEFAULT_MONSTER}/`,
    last: () => `/monsters/${readLastMonster()}/`,
  },
};

export type MenuSection = keyof typeof SECTIONS;

/**
 * The page the user last viewed in a section (its first page at first).
 * `pathname` re-reads the stored choice after each navigation, so a nav that
 * stays mounted (the app sidebar) follows the latest page.
 */
export function useSectionHref(section: MenuSection, pathname?: string): string {
  const { initial, last } = SECTIONS[section];
  // The server-rendered page has no stored choice, so start on the default and switch after mount.
  const [href, setHref] = useState(initial);
  // Read on the next frame: the page's nav stores its choice in its own effect,
  // which can run after this one in the same commit.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHref(last()));
    return () => cancelAnimationFrame(frame);
  }, [last, pathname]);
  return href;
}
