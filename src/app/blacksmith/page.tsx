import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import BlacksmithListContent from "./BlacksmithListContent";

export const metadata: Metadata = pageMetadata({
  title: "Weapon Trees",
  description:
    "Monster Hunter Freedom Unite weapon trees. 11 types of weapons in the Blademaster and Gunner categories.",
  path: "/blacksmith/",
});

export default function BlacksmithPage() {
  return <BlacksmithListContent />;
}
