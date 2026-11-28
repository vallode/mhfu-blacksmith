"use client";

/**
 * The hitzone a damage calculator strikes, kept by the damage page so it
 * stays when the weapon changes: the hand-set values, the monster part
 * picked, and the bestiary's monster type.
 */
import { useState } from "react";
import { DEFAULT_ELEMENT_HITZONE, DEFAULT_HITZONE, type HitzoneSpot } from "@/lib/hitzone-pick";
import { SHOT_ELEMENTS, type ShotElement } from "@/lib/shots";

export type ElementZones = Record<ShotElement, number>;

export function useHitzoneState() {
  const [zone, setZone] = useState(DEFAULT_HITZONE);
  const [elementZones, setElementZones] = useState<ElementZones>(
    () =>
      Object.fromEntries(SHOT_ELEMENTS.map((e) => [e, DEFAULT_ELEMENT_HITZONE])) as ElementZones,
  );
  const [spot, setSpot] = useState<HitzoneSpot | null>(null);
  /** The bestiary's monster type: 0 for all, else MONSTER_CATEGORIES' index + 1. */
  const [category, setCategory] = useState(0);
  return {
    zone,
    setZone,
    elementZones,
    setElementZones,
    spot,
    setSpot,
    category,
    setCategory,
  };
}

export type HitzoneState = ReturnType<typeof useHitzoneState>;
