import type { Metadata } from "next";
import BorderRule from "@/components/BorderRule";
import SiteTitle from "@/components/SiteTitle";
import { pageMetadata } from "@/lib/seo";
import WishlistClient from "./WishlistClient";

export const metadata: Metadata = pageMetadata({
  title: "Wishlist",
  description:
    "The Monster Hunter Freedom Unite weapons and armor you want to make, the materials they add up to, and the best places to get them.",
  path: "/wishlist/",
});

export default function WishlistPage() {
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <SiteTitle />

      <BorderRule />

      <WishlistClient />
    </div>
  );
}
