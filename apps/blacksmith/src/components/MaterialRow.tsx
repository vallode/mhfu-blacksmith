"use client";

import Link from "next/link";
import Icon from "./Icon";
import { itemLink } from "./MonsterDrops";
import { cn } from "@/lib/cn";
import { itemHref } from "@/lib/item-sources";
import { useOwnedMaterials } from "@/hooks/useOwnedMaterials";
import type { Material } from "@/lib/types";

interface MaterialRowProps {
  material: Material;
}

/** Amounts are padded to two characters so the columns stay monospaced. */
const pad = (n: string | number) => String(n).padStart(2, " ");
/**
 * Names are the game's own, padded to its 16-character cap
 * (`ITEM_NAME_LENGTH`), so every material's colon and amount line up in one
 * column. On a narrow phone with a 3-digit owned count the column shrinks and
 * the name wraps rather than pushing the amount out of the card.
 */
const nameClass = "w-cells-16 min-w-0 wrap-anywhere whitespace-normal mobile:leading-[1.25]";
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
        <Link href={itemHref(material.name)} className={cn(nameClass, itemLink)}>
          {material.name}
        </Link>
        <p className={amountClass}>:{pad(material.amount)}</p>
      </div>
    );
  }

  const short = owned < required;
  const shown = owned === Infinity ? "∞" : owned;

  return (
    <div className="flex items-center" title={`You have ${shown} in your item box and pouch`}>
      <Icon type={material.type} color={material.color} />
      <Link href={itemHref(material.name)} className={cn(nameClass, itemLink)}>
        {material.name}
      </Link>
      <p className={amountClass}>
        :{short ? <span className="text-negative">{pad(shown)}</span> : pad(shown)}/{pad(required)}
      </p>
    </div>
  );
}
