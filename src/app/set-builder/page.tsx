import type { Metadata } from "next";
import SetBuilderClient from "./SetBuilderClient";

export const metadata: Metadata = {
  title: "Set Builder — MHFU Blacksmith",
};

export default function SetBuilderPage() {
  return <SetBuilderClient />;
}
