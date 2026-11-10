"use client";

import { useEffect } from "react";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import { writeLastWeapon } from "@/lib/last-weapon";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface WeaponNavProps {
  activeType: WeaponType;
}

function formatWeaponName(type: string): string {
  return type
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(" And ", " and ");
}

/** The weapon pages' PageBar: the type as title and one tab per weapon type. */
export default function WeaponNav({ activeType }: WeaponNavProps) {
  // Remember the weapon type so the sidebar's "Weapons" entry reopens it.
  useEffect(() => {
    writeLastWeapon(activeType);
  }, [activeType]);

  const typeName = formatWeaponName(activeType);

  return (
    <PageBar
      title={`${typeName} weapons`}
      tabs={
        <PageTabs label="Weapon types">
          {WEAPON_TYPES.map((type) => (
            <PageTab
              key={type}
              href={`/blacksmith/${type}/`}
              label={formatWeaponName(type)}
              icon={type}
              active={activeType === type}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
