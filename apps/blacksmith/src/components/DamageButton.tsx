"use client";

/**
 * The weapon page header's link to the damage calculator with that weapon,
 * beside the 3D model and wishlist buttons.
 */
import Link from "next/link";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { damageHref, type WeaponRef } from "@/lib/damage-store";

export default function DamageButton({
  weapon,
  className,
}: {
  weapon: WeaponRef;
  className?: string;
}) {
  const label = useT().motionValues.page.open;
  return (
    <Link
      href={damageHref(weapon)}
      aria-label={label}
      title={label}
      className={cn(
        "flex flex-none cursor-pointer items-center px-[0.8rem] py-[0.4rem] hover:hover-glow focus-visible:hover-glow",
        className,
      )}
    >
      <img src="/images/ko.png" alt="" className="h-[2.8rem] w-[2.4rem] pixelated" />
    </Link>
  );
}
