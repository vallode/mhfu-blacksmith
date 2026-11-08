import { siteCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return siteCard(
    "Monster Hunter Freedom Unite",
    "MHFU Blacksmith",
    "Weapons, armor, decorations and monsters, with every recipe, skill and drop.",
  );
}
