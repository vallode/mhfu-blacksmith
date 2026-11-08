import { siteCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return siteCard(
    "Armor",
    "Armorsmith",
    "Five slots across Low, High and G-Rank, with defense, skills and recipes.",
    "/images/helmet.png",
  );
}
