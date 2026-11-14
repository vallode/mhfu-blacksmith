import SiteTitle from "@/components/SiteTitle";
import type { Metadata } from "next";
import SaveUpload from "@/components/SaveUpload";
import BorderRule from "@/components/BorderRule";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Hunter Profile",
  description:
    "Load a Monster Hunter Freedom Unite save file and pick a hunter to see their items and equipment next to the recipes.",
  path: "/hunter/",
});

export default function HunterPage() {
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <SiteTitle />

      <BorderRule />

      <SaveUpload />
    </div>
  );
}
