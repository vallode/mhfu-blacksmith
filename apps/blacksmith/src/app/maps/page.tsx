import type { Metadata } from "next";
import { getMapEntries } from "@/lib/maps-data";
import { pageMetadata } from "@/lib/seo";
import MapsClient from "./MapsClient";

export const metadata: Metadata = pageMetadata({
  title: "Maps",
  description:
    "Every Monster Hunter Freedom Unite hunting ground's map, with its gathering, mining and bug-catching points.",
  path: "/maps/",
});

export default function MapsPage() {
  return <MapsClient maps={getMapEntries()} />;
}
