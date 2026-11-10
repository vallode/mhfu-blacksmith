"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import Icon from "./Icon";
import { useT } from "@/context/LanguageContext";
import { writeLastArmor } from "@/lib/armor-last-store";

interface ArmorNavProps {
  activeSlot?: ArmorSlot;
  /** Rank the slot links open at; defaults to low rank. */
  rank?: ArmorRank;
}

export default function ArmorNav({ activeSlot, rank = "low-rank" }: ArmorNavProps) {
  const t = useT();
  // Remember this page for the main menu's Armor entry.
  useEffect(() => {
    if (activeSlot) writeLastArmor({ slot: activeSlot, rank });
  }, [activeSlot, rank]);

  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/" aria-label={t.common.back}>
          <Icon type="arrow" nav alt={t.common.back} />
        </Link>
      </div>

      {ARMOR_SLOTS.map((slot) => {
        const name = t.common.armorSlots[slot];
        return (
          <div key={slot}>
            <Link href={`/armorsmith/${slot}/${rank}/`} title={name}>
              <Icon type={slot} size="large" nav active={activeSlot === slot} alt={name} />
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
