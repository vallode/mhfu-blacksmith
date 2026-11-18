import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SaveFilePage } from "../HunterPages";

export const metadata: Metadata = pageMetadata({
  title: "Save File",
  description: "Load a Monster Hunter Freedom Unite save file and pick which hunter to use.",
  path: "/hunter/save/",
});

export default function HunterSavePage() {
  return <SaveFilePage />;
}
