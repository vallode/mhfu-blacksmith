import { getDecorations } from "@/lib/decorations";
import { siteCard } from "@/lib/og-cards";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return siteCard(
    "Decorations",
    "Decorations",
    `${getDecorations().length} jewels with their skills and recipes.`,
    "/images/decoration.png",
  );
}
