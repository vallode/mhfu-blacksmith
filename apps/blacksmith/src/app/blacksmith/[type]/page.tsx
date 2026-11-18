import { notFound } from "next/navigation";
import { getWeaponTypes, getWeapons } from "@/lib/weapons";
import { embedIcon, pageMetadata, titleCase } from "@/lib/seo";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import type { Metadata } from "next";
import { faviconMetadata } from "@/lib/favicon";
import WeaponTreeListClient from "./WeaponTreeListClient";

interface Props {
  params: Promise<{ type: string }>;
}

export async function generateStaticParams() {
  return getWeaponTypes().map((type) => ({ type }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const name = titleCase(type);
  const weapons = getWeapons(type as WeaponType);
  const first = weapons[0]?.name;
  return {
    ...faviconMetadata(type),
    ...pageMetadata({
      title: `${name} tree`,
      description:
        `All ${weapons.length} ${name} weapons in Monster Hunter Freedom Unite` +
        (first ? `, from the ${first} up through every upgrade path` : "") +
        ". Attack, sharpness, elements and recipes.",
      path: `/blacksmith/${type}/`,
      image: embedIcon(type),
    }),
  };
}

export default async function WeaponTreePage({ params }: Props) {
  const { type } = await params;

  if (!WEAPON_TYPES.includes(type as WeaponType)) {
    notFound();
  }

  return <WeaponTreeListClient type={type as WeaponType} />;
}
