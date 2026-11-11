"use client";

import { useEffect } from "react";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import { writeLastWeapon } from "@/lib/last-weapon";
import { titleCase } from "@/lib/title-case";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface WeaponNavProps {
  activeType: WeaponType;
}

/** The weapon pages' PageBar: the type as title and one tab per weapon type. */
export default function WeaponNav({ activeType }: WeaponNavProps) {
  // Remember the weapon type so the sidebar's "Weapons" entry reopens it.
  useEffect(() => {
    writeLastWeapon(activeType);
  }, [activeType]);

  const typeName = titleCase(activeType);

  return (
    <PageBar
      title={`${typeName} weapons`}
      tabs={
        <PageTabs label="Weapon types">
          {WEAPON_TYPES.map((type) => (
            <PageTab
              key={type}
              href={`/blacksmith/${type}/`}
              label={titleCase(type)}
              icon={type}
              active={activeType === type}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
