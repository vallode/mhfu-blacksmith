"use client";

import Icon from "./Icon";
import { useOwnedMaterials } from "@/hooks/useOwnedMaterials";
import type { Material } from "@/lib/types";

interface MaterialRowProps {
  material: Material;
}

/** Amounts are padded to two characters so the columns stay monospaced. */
const pad = (n: string | number) => String(n).padStart(2, " ");
const amountClass = "flex-none text-right whitespace-pre";

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
        <p className={amountClass}>{pad(material.amount)}</p>
      </div>
    );
  }

  const short = owned < required;
  const shown = owned === Infinity ? "∞" : owned;

  return (
    <div className="flex items-center" title={`You have ${shown} in your item box and pouch`}>
      <Icon type={material.type} color={material.color} />
      <p className="flex-auto">{material.name}:</p>
      <p className={amountClass}>
        {short ? <span className="text-negative">{pad(shown)}</span> : pad(shown)}/{pad(required)}
      </p>
    </div>
  );
}
