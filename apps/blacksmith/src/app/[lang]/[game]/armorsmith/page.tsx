import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import ArmorRedirect from "./ArmorRedirect";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Armor",
    description:
      "Monster Hunter Freedom Unite armor: helmets, plates, gauntlets, waists and leggings across Low, High and G-Rank, with skills and recipes.",
    path: paths.section("armor"),
  });
}

export default function ArmorsmithPage() {
  return <ArmorRedirect />;
}
