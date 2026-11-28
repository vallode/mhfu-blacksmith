import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import DamageClient from "./DamageClient";

export const metadata: Metadata = pageMetadata({
  title: "Damage Calculator",
  description:
    "Work out the damage of every Monster Hunter Freedom Unite weapon move and bowgun shot on any monster part, raw and element, with your skills, items and Hunting Horn songs.",
  path: "/damage/",
});

export default function DamagePage() {
  return <DamageClient />;
}
