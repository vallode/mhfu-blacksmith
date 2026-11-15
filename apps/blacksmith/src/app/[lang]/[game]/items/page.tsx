import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import ItemsListClient from "./ItemsListClient";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Items",
    description:
      "Every Monster Hunter Freedom Unite item and material, with the monster carves, breaks, captures and quest rewards that give it.",
    path: paths.section("items"),
  });
}

export default function ItemsPage() {
  return <ItemsListClient />;
}
