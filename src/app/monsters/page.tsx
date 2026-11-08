import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import BestiaryListContent from "./BestiaryListContent";

export const metadata: Metadata = pageMetadata({
  title: "Bestiary",
  description: "Every monster in Monster Hunter Freedom Unite, with hitzones, drops and habitats.",
  path: "/monsters/",
});

export default function BestiaryPage() {
  return <BestiaryListContent />;
}
