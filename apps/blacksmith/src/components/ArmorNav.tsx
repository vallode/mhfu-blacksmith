"use client";

import { useEffect } from "react";
import { ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { writeLastArmor } from "@/lib/armor-last-store";
import { useT } from "@/context/LanguageContext";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface ArmorNavProps {
  activeSlot?: ArmorSlot;
  /** Rank the slot links open at; defaults to low rank. */
  rank?: ArmorRank;
}

/** The armor pages' PageBar: one tab per armor slot. */
export default function ArmorNav({ activeSlot, rank = "low-rank" }: ArmorNavProps) {
  const t = useT();
  // Remember this page for the main menu's Armor entry.
  useEffect(() => {
    if (activeSlot) writeLastArmor({ slot: activeSlot, rank });
  }, [activeSlot, rank]);

  return (
    <PageBar
      title={
        activeSlot
          ? t.equipment.nav.armorTitle(t.common.armorSlots[activeSlot])
          : t.common.sections.armor
      }
      tabs={
        <PageTabs label={t.equipment.nav.armorSlots}>
          {ARMOR_SLOTS.map((slot) => (
            <PageTab
              key={slot}
              href={`/armorsmith/${slot}/${rank}/`}
              label={t.common.armorSlots[slot]}
              icon={slot}
              active={activeSlot === slot}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
