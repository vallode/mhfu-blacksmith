"use client";

import { useEffect } from "react";
import Link from "next/link";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import { writeLastWeapon } from "@/lib/last-weapon";
import Icon from "./Icon";

interface WeaponNavProps {
  activeType?: WeaponType;
}

function formatWeaponName(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WeaponNav({ activeType }: WeaponNavProps) {
  // Remember the weapon type so the main menu's "Weapons" entry reopens it.
  useEffect(() => {
    if (activeType) writeLastWeapon(activeType);
  }, [activeType]);

  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/" aria-label="Back">
          <Icon type="arrow" nav alt="Back" />
        </Link>
      </div>

      {WEAPON_TYPES.map((type) => {
        const name = formatWeaponName(type);
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
          aria-label="Search"
        >
          <img src="/images/binoculars.png" alt="Search" decoding="sync" />
        </button>
      </div>
    </nav>
  );
}
