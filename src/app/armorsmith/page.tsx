import type { Metadata } from "next";
import ArmorRedirect from "./ArmorRedirect";

export const metadata: Metadata = {
  title: "Armor — MHFU Blacksmith",
};

export default function ArmorsmithPage() {
  return <ArmorRedirect />;
}
