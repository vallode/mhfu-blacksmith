import Link from "next/link";
import type { Metadata } from "next";
import BorderRule from "@/components/BorderRule";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import WishlistClient from "./WishlistClient";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Wishlist",
    description:
      "The Monster Hunter Freedom Unite weapons and armor you want to make, the materials they add up to, and the best places to get them.",
    path: paths.section("wishlist"),
  });
}

export default async function WishlistPage({ params }: PageProps) {
  const paths = pathsOf(await params);
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <Link className="blacksmith__title" href={paths.home()}>
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <WishlistClient />
    </div>
  );
}
