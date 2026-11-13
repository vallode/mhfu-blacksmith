import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import VeggieElderClient from "./VeggieElderClient";

export const metadata: Metadata = pageMetadata({
  title: "Veggie Elder",
  description:
    "Every trade the Monster Hunter Freedom Unite Veggie Elder makes, by hunting ground.",
  path: "/veggie-elder/",
});

export default function VeggieElderPage() {
  return <VeggieElderClient />;
}
