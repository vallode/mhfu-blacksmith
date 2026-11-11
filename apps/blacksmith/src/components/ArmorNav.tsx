"use client";

import { useEffect } from "react";
import { ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { writeLastArmor } from "@/lib/armor-last-store";
import { titleCase } from "@/lib/title-case";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface ArmorNavProps {
  activeSlot?: ArmorSlot;
  /** Rank the slot links open at; defaults to low rank. */
  rank?: ArmorRank;
}

/** The armor pages' PageBar: one tab per armor slot. */
export default function ArmorNav({ activeSlot, rank = "low-rank" }: ArmorNavProps) {
  // Remember this page for the main menu's Armor entry.
  useEffect(() => {
    if (activeSlot) writeLastArmor({ slot: activeSlot, rank });
  }, [activeSlot, rank]);

  return (
    <PageBar
      title={activeSlot ? `${titleCase(activeSlot)} armor` : "Armor"}
      tabs={
        <PageTabs label="Armor slots">
          {ARMOR_SLOTS.map((slot) => (
            <PageTab
              key={slot}
              href={`/armorsmith/${slot}/${rank}/`}
              label={titleCase(slot)}
              icon={slot}
              active={activeSlot === slot}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
