"use client";

import { useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import { cn } from "@/lib/cn";
import type { WeaponType } from "@/lib/constants";
import { modelPanel, modelPanelButton } from "@/styles/model";
import { useT } from "@/context/LanguageContext";

interface Props {
  src: string;
  label: string;
  /** The weapon's type, whose motions the hunter plays when holding it. */
  type: WeaponType;
  /** A pair of dual blades: the model is one blade, shown twice. */
  pair?: boolean;
}

/** Whether the last weapon was shown on the hunter: the next one opens the same way. */
let lastOnHunter = false;

/**
 * ModelViewer for a weapon: alone by default, or held by the hunter playing
 * its type's motions, as armor goes on the hunter.
 */
export default function WeaponModelViewer({ src, label, type, pair }: Props) {
  const tm = useT().equipment.model;
  const [onHunter, setOnHunter] = useState(lastOnHunter);
  const name = onHunter ? tm.wornModel(label) : label;
  return (
    <div className="relative h-full w-full">
      <ModelViewer
        key={`${src}|${onHunter}`}
        src={src}
        label={name}
        hunter={onHunter ? type : undefined}
        pair={!onHunter && pair}
      />
      <div className="absolute bottom-2 left-2 z-10">
        <button
          type="button"
          onClick={() => {
            lastOnHunter = !onHunter;
            setOnHunter(!onHunter);
          }}
          aria-pressed={onHunter}
          className={cn(modelPanel, modelPanelButton, onHunter ? "text-stat" : "text-parchment")}
        >
          {tm.onHunter}
        </button>
      </div>
    </div>
  );
}
