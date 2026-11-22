import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { DEFAULT_WEAPON } from "@/lib/last-weapon";
import LastWeaponRedirect from "./LastWeaponRedirect";
import WeaponTreeListClient from "./[type]/WeaponTreeListClient";

export const metadata: Metadata = pageMetadata({
  title: "Weapon Trees",
  description:
    "Monster Hunter Freedom Unite weapon trees. 11 types of weapons in the Blademaster and Gunner categories.",
  path: "/blacksmith/",
});

/** The default type's tree page (the layout's WeaponShell shows its tree), like `/`. */
export default function BlacksmithPage() {
  return (
    <>
      <WeaponTreeListClient type={DEFAULT_WEAPON} />
      <LastWeaponRedirect />
    </>
  );
}
