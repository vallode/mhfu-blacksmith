import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import ArmorRedirect from "./ArmorRedirect";

export const metadata: Metadata = pageMetadata({
  title: "Armor",
  description:
    "Monster Hunter Freedom Unite armor: helmets, plates, gauntlets, waists and leggings across Low, High and G-Rank, with skills and recipes.",
  path: "/armorsmith/",
});

export default function ArmorsmithPage() {
  return <ArmorRedirect />;
}
