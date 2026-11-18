import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import SetBuilderClient from "./SetBuilderClient";

export const metadata: Metadata = pageMetadata({
  title: "Set Builder",
  description:
    "Pick the skills you want and find every Monster Hunter Freedom Unite armor set, with decorations, that activates them, highest defense first.",
  path: "/set-builder/",
});

export default function SetBuilderPage() {
  return <SetBuilderClient />;
}
