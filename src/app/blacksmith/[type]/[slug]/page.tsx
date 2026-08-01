import { notFound } from "next/navigation";
import { getWeapons, getWeapon } from "@/lib/weapons";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import type { Metadata } from "next";
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

  const matList = (weapon.create_mats ?? weapon.improve_mats ?? [])
    .map((m) => `${m.name}: ${m.amount}`)
    .join(" | ");

  return {
    title: `${weapon.name} — MHFU Blacksmith`,
    description: matList || undefined,
    openGraph: {
      images: [`/images/${type}.png`],
    },
  };
}

export default async function WeaponDetailPage({ params }: Props) {
  const { type, slug } = await params;

  if (!WEAPON_TYPES.includes(type as WeaponType)) notFound();

  return <WeaponDetailClient type={type as WeaponType} slug={slug} />;
}
