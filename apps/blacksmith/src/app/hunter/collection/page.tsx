import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import CollectionPage from "../CollectionPage";

export const metadata: Metadata = pageMetadata({
  title: "Collection",
  description:
    "Track the Monster Hunter Freedom Unite equipment collection awards from your save: what each weapon class and armor slot still needs for the Artisan's Hammer and Mitten.",
  path: "/hunter/collection/",
});

export default function HunterCollectionPage() {
  return <CollectionPage />;
}
