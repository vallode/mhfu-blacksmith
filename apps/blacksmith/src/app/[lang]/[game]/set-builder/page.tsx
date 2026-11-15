import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import SetBuilderClient from "./SetBuilderClient";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Set Builder",
    description:
      "Pick the skills you want and find every Monster Hunter Freedom Unite armor set, with decorations, that activates them, highest defense first.",
    path: paths.section("setBuilder"),
  });
}

export default function SetBuilderPage() {
  return <SetBuilderClient />;
}
