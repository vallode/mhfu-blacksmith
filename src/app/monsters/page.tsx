import type { Metadata } from "next";
import BestiaryListContent from "./BestiaryListContent";

export const metadata: Metadata = {
  title: "Bestiary — MHFU Blacksmith",
};

export default function BestiaryPage() {
  return <BestiaryListContent />;
}
