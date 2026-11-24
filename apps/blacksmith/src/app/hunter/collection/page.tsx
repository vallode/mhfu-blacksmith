import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import CollectionPage from "../CollectionPage";

export const metadata: Metadata = pageMetadata({
  title: "Collection",
  description:
    "The weapons and armor in your Monster Hunter Freedom Unite equipment box, by type, with how many kinds of each you own.",
  path: "/hunter/collection/",
});

export default function HunterCollectionPage() {
  return <CollectionPage />;
}
