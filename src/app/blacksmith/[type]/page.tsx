import { notFound } from "next/navigation";
import { getWeaponTypes } from "@/lib/weapons";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import type { Metadata } from "next";
import WeaponTreeListClient from "./WeaponTreeListClient";

interface Props {
  params: Promise<{ type: string }>;
}

export async function generateStaticParams() {
  return getWeaponTypes().map((type) => ({ type }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const name = type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${name} tree — MHFU Blacksmith`,
  };
}

export default async function WeaponTreePage({ params }: Props) {
  const { type } = await params;

  if (!WEAPON_TYPES.includes(type as WeaponType)) {
    notFound();
  }

  return <WeaponTreeListClient type={type as WeaponType} />;
}
