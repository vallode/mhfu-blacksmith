import { notFound } from "next/navigation";
import { getWeapons, getWeapon } from "@/lib/weapons";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import type { Metadata, Viewport } from "next";
import { faviconMetadata } from "@/lib/favicon";
import { accentViewport, embedIcon, pageMetadata, tintFor, weaponDescription } from "@/lib/seo";
import WeaponDetailClient from "./WeaponDetailClient";

interface Props {
  params: Promise<{ type: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { type: string; slug: string }[] = [];
  for (const type of WEAPON_TYPES) {
    const weapons = getWeapons(type);
    for (const w of weapons) {
      params.push({ type, slug: w.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, slug } = await params;
  const weapon = getWeapon(type as WeaponType, slug);
  if (!weapon) return {};

  return {
    ...faviconMetadata(type),
    ...pageMetadata({
      title: weapon.name,
      description: weaponDescription(weapon),
      path: `/blacksmith/${type}/${slug}/`,
      image: embedIcon(type, weapon.rarity, weapon.color),
      oembed: true,
    }),
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { type, slug } = await params;
  return accentViewport(tintFor(getWeapon(type as WeaponType, slug)?.rarity));
}

export default async function WeaponDetailPage({ params }: Props) {
  const { type, slug } = await params;

  if (!WEAPON_TYPES.includes(type as WeaponType)) notFound();

  return <WeaponDetailClient type={type as WeaponType} slug={slug} />;
}
