import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import MonsterRedirect from "./MonsterRedirect";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Bestiary",
    description:
      "Every monster in Monster Hunter Freedom Unite, with hitzones, drops and habitats.",
    path: paths.section("monsters"),
  });
}

export default function BestiaryPage() {
  return <MonsterRedirect />;
}
