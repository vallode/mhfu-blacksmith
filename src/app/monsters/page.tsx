import type { Metadata } from "next";
import MonsterRedirect from "./MonsterRedirect";

export const metadata: Metadata = {
  title: "Bestiary — MHFU Blacksmith",
};

export default function BestiaryPage() {
  return <MonsterRedirect />;
}
