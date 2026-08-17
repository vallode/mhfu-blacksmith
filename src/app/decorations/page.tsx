import type { Metadata } from "next";
import DecorationsListClient from "./DecorationsListClient";

export const metadata: Metadata = {
  title: "Decorations — MHFU Blacksmith",
};

export default function DecorationsPage() {
  return <DecorationsListClient />;
}
