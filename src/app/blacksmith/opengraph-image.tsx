import { siteCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return siteCard(
    "Weapon trees",
    "Weapons",
    "11 weapon types, every upgrade path and recipe.",
    "/images/great-sword.png",
  );
}
