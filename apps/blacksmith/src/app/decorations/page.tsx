import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import DecorationsListClient from "./DecorationsListClient";

export const metadata: Metadata = pageMetadata({
  title: "Decorations",
  description:
    "Every Monster Hunter Freedom Unite decoration (jewel) with its skill points, slots and the materials to make it.",
  path: "/decorations/",
});

export default function DecorationsPage() {
  return <DecorationsListClient />;
}
