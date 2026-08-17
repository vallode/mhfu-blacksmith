import type { Metadata } from "next";
import ArmorsmithListContent from "./ArmorsmithListContent";

export const metadata: Metadata = {
  title: "Armor — MHFU Blacksmith",
};

export default function ArmorsmithPage() {
  return <ArmorsmithListContent />;
}
