import { getWeapons, getWeaponTypes } from "@/lib/weapons";
import type { WeaponType } from "@/lib/constants";
import { weaponTypeCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export function generateStaticParams() {
  return getWeaponTypes().map((type) => ({ type }));
}

// Weapon pages below this segment share the type's card.
export default async function Image({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return weaponTypeCard(type, getWeapons(type as WeaponType).length);
}
