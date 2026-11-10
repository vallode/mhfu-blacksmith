import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import MonsterRedirect from "./MonsterRedirect";

export const metadata: Metadata = pageMetadata({
  title: "Bestiary",
  description: "Every monster in Monster Hunter Freedom Unite, with hitzones, drops and habitats.",
  path: "/monsters/",
});

export default function BestiaryPage() {
  return <MonsterRedirect />;
}
