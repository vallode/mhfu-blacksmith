"use client";

import { useEffect } from "react";
import { ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { writeLastArmor } from "@/lib/armor-last-store";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface ArmorNavProps {
  activeSlot?: ArmorSlot;
  /** Rank the slot links open at; defaults to low rank. */
  rank?: ArmorRank;
  /** On a piece's page: phones show only the detail, so lead back to the list. */
  detail?: boolean;
}

function formatSlotName(slot: string): string {
  return slot.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The armor pages' PageBar: one tab per armor slot. */
export default function ArmorNav({ activeSlot, rank = "low-rank", detail }: ArmorNavProps) {
  // Remember this page for the main menu's Armor entry.
  useEffect(() => {
    if (activeSlot) writeLastArmor({ slot: activeSlot, rank });
  }, [activeSlot, rank]);

  const slotName = activeSlot && formatSlotName(activeSlot);

  return (
    <PageBar
      title={slotName ? `${slotName} armor` : "Armor"}
      back={
        detail && activeSlot
          ? { href: `/armorsmith/${activeSlot}/${rank}/`, label: `${slotName} list` }
          : undefined
      }
      tabs={
        <PageTabs label="Armor slots">
          {ARMOR_SLOTS.map((slot) => (
            <PageTab
              key={slot}
              href={`/armorsmith/${slot}/${rank}/`}
              label={formatSlotName(slot)}
              icon={slot}
              active={activeSlot === slot}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
