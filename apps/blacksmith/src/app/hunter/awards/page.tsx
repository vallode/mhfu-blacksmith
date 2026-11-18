import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { AwardsPage } from "../HunterPages";

export const metadata: Metadata = pageMetadata({
  title: "Awards",
  description:
    "Track your Monster Hunter Freedom Unite Guild Card awards from your save file: what you've earned and what's left.",
  path: "/hunter/awards/",
});

export default function HunterAwardsPage() {
  return <AwardsPage />;
}
