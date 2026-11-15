import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import DecorationsListClient from "./DecorationsListClient";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Decorations",
    description:
      "Every Monster Hunter Freedom Unite decoration (jewel) with its skill points, slots and the materials to make it.",
    path: paths.section("decorations"),
  });
}

export default function DecorationsPage() {
  return <DecorationsListClient />;
}
