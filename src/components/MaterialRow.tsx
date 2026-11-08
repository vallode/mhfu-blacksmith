"use client";

import Icon from "./Icon";
import { useOwnedMaterials } from "@/hooks/useOwnedMaterials";
import type { Material } from "@/lib/types";

interface MaterialRowProps {
  material: Material;
}

/**
 * One recipe material. With a save loaded, the amount reads "owned/required"
 * (owned = item box + pouch) and the owned count turns red when it's short.
 */
export default function MaterialRow({ material }: MaterialRowProps) {
  const ownedOf = useOwnedMaterials();
  const owned = ownedOf(material.name);
  const required = Number(material.amount);

  if (owned === null || !Number.isFinite(required)) {
    return (
      <div className="flex items-center">
        <Icon type={material.type} color={material.color} />
        <p className="flex-auto">{material.name}:</p>
        <p className="min-w-[2.5ch] flex-none text-right tabular-nums">{material.amount}</p>
      </div>
    );
  }

  const short = owned < required;
  const shown = owned === Infinity ? "∞" : owned;

  return (
    <div className="flex items-center" title={`You have ${shown} in your item box and pouch`}>
      <Icon type={material.type} color={material.color} />
      <p className="flex-auto">{material.name}:</p>
      <p className="min-w-[2.5ch] flex-none text-right tabular-nums">
        {short ? <span className="text-negative">{shown}</span> : shown}/{required}
      </p>
    </div>
  );
}
