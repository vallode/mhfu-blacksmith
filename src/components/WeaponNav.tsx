"use client";

import { useEffect } from "react";
import Link from "next/link";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import { writeLastWeapon } from "@/lib/last-weapon";
import Icon from "./Icon";
import { useT } from "@/context/LanguageContext";

interface WeaponNavProps {
  activeType?: WeaponType;
}

export default function WeaponNav({ activeType }: WeaponNavProps) {
  const t = useT();
  // Remember the weapon type so the main menu's "Weapons" entry reopens it.
  useEffect(() => {
    if (activeType) writeLastWeapon(activeType);
  }, [activeType]);

  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/" aria-label={t.common.back}>
          <Icon type="arrow" nav alt={t.common.back} />
        </Link>
      </div>

      {WEAPON_TYPES.map((type) => {
        const name = t.common.weaponTypes[type];
        return (
          <div key={type}>
            <Link href={`/blacksmith/${type}/`} title={name}>
              <Icon type={type} size="large" nav active={activeType === type} alt={name} />
            </Link>
          </div>
        );
      })}

      <div className="ml-auto">
        <button
          className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
          aria-label={t.equipment.nav.search}
        >
          <img src="/images/binoculars.png" alt={t.equipment.nav.search} decoding="sync" />
        </button>
      </div>
    </nav>
  );
}
