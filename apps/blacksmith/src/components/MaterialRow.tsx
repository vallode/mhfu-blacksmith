"use client";

import Icon from "./Icon";
import { useOwnedMaterials } from "@/hooks/useOwnedMaterials";
import type { Material } from "@/lib/types";
import { useLocale } from "@/context/LanguageContext";

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
  const { t, game } = useLocale();
  const name = game.name("item", material.name);
  const owned = ownedOf(material.name);
  const required = Number(material.amount);

  if (owned === null || !Number.isFinite(required)) {
    return (
      <div className="flex items-center">
        <Icon type={material.type} color={material.color} />
        <p className={nameClass}>{name}</p>
        <p className={amountClass}>:{pad(material.amount)}</p>
      </div>
    );
  }

  const short = owned < required;
  const shown = owned === Infinity ? "∞" : owned;

  return (
    <div className="flex items-center" title={t.equipment.detail.haveTitle(String(shown))}>
      <Icon type={material.type} color={material.color} />
      <p className={nameClass}>{name}</p>
      <p className={amountClass}>
        :{short ? <span className="text-negative">{pad(shown)}</span> : pad(shown)}/{pad(required)}
      </p>
    </div>
  );
}
