import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getWeapons, getWeapon } from "@/lib/weapons";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import WeaponPreviewCard from "@/components/WeaponPreviewCard";

// Source page for a weapon's link-preview image: a screenshot of this page at
// 1200×600 becomes the og:image. Not meant to be visited.

interface Props {
  params: Promise<{ type: string; slug: string }>;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

export async function generateStaticParams() {
  return WEAPON_TYPES.flatMap((type) => getWeapons(type).map((w) => ({ type, slug: w.slug })));
}

export default async function WeaponPreviewPage({ params }: Props) {
  const { type, slug } = await params;
  const weapon = WEAPON_TYPES.includes(type as WeaponType)
    ? getWeapon(type as WeaponType, slug)
    : undefined;
  if (!weapon) notFound();

  // Laid out at 600×300 and zoomed 2× so the pixel art scales by whole pixels.
  return (
    <div className="fixed top-0 left-0 z-100 flex h-[300px] w-[600px] [zoom:2]">
      <WeaponPreviewCard weapon={weapon} />
    </div>
  );
}
