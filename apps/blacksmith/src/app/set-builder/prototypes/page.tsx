import type { Metadata } from "next";
import PrototypesClient from "./PrototypesClient";

export const metadata: Metadata = {
  title: "Set Builder prototypes",
  robots: { index: false, follow: false },
};

export default function SetBuilderPrototypesPage() {
  return <PrototypesClient />;
}
