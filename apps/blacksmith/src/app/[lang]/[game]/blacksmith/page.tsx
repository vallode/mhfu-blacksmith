import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import LastWeaponRedirect from "./LastWeaponRedirect";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Weapon Trees",
    description:
      "Monster Hunter Freedom Unite weapon trees. 11 types of weapons in the Blademaster and Gunner categories.",
    path: paths.section("weapons"),
  });
}

export default function BlacksmithPage() {
  return <LastWeaponRedirect />;
}
