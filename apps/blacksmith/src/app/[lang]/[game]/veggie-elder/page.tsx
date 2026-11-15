import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import VeggieElderClient from "./VeggieElderClient";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paths = pathsOf(await params);
  return pageMetadata({
    title: "Veggie Elder",
    description:
      "Every trade the Monster Hunter Freedom Unite Veggie Elder makes, by hunting ground.",
    path: paths.section("veggieElder"),
  });
}

export default function VeggieElderPage() {
  return <VeggieElderClient />;
}
