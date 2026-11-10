import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import ItemsListClient from "./ItemsListClient";

export const metadata: Metadata = pageMetadata({
  title: "Items",
  description:
    "Every Monster Hunter Freedom Unite item and material, with the monster carves, breaks, captures and quest rewards that give it.",
  path: "/items/",
});

export default function ItemsPage() {
  return <ItemsListClient />;
}
