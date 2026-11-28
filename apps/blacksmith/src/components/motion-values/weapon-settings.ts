"use client";

/**
 * How the damage calculator's weapon is used, kept by the damage page beside
 * the weapon: the sharpness picked, Demon Mode, the spirit gauge and the
 * Lance's charge. Each applies only where the weapon has it, so they stay
 * when the weapon changes.
 */
import { useState } from "react";

export function useWeaponSettings() {
  /** The sharpness colour picked (unset: the weapon's own). */
  const [sharpness, setSharpness] = useState<number>();
  const [demon, setDemon] = useState(false);
  const [glow, setGlow] = useState(false);
  const [fullSpeed, setFullSpeed] = useState(false);
  return {
    sharpness,
    setSharpness,
    demon,
    setDemon,
    glow,
    setGlow,
    fullSpeed,
    setFullSpeed,
  };
}

export type WeaponSettings = ReturnType<typeof useWeaponSettings>;
