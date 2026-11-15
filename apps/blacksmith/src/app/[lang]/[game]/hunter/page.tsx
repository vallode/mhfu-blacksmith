import Link from "next/link";
import type { Metadata } from "next";
import SaveUpload from "@/components/SaveUpload";
import BorderRule from "@/components/BorderRule";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Hunter Profile",
    description:
      "Load a Monster Hunter Freedom Unite save file and pick a hunter to see their items and equipment next to the recipes.",
    path: paths.section("hunter"),
  });
}

export default async function HunterPage({ params }: PageProps) {
  const paths = pathsOf(await params);
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <Link className="blacksmith__title" href={paths.home()}>
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <SaveUpload />
    </div>
  );
}
