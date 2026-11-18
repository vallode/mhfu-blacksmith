"use client";

import { useEffect } from "react";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import { writeLastWeapon } from "@/lib/last-weapon";
import { useT } from "@/context/LanguageContext";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface WeaponNavProps {
  activeType: WeaponType;
}

/** The weapon pages' PageBar: the type as title and one tab per weapon type. */
export default function WeaponNav({ activeType }: WeaponNavProps) {
  const t = useT();
  // Remember the weapon type so the sidebar's "Weapons" entry reopens it.
  useEffect(() => {
    writeLastWeapon(activeType);
  }, [activeType]);

  return (
    <PageBar
      title={t.equipment.nav.weaponsTitle(t.common.weaponTypes[activeType])}
      tabs={
        <PageTabs label={t.equipment.nav.weaponTypes}>
          {WEAPON_TYPES.map((type) => (
            <PageTab
              key={type}
              href={`/blacksmith/${type}/`}
              label={t.common.weaponTypes[type]}
              icon={type}
              active={activeType === type}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
