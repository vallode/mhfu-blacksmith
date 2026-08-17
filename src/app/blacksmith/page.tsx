import type { Metadata } from "next";
import BlacksmithListContent from "./BlacksmithListContent";

export const metadata: Metadata = {
  title: "Weapon Trees — MHFU Blacksmith",
  description:
    "Monster Hunter Freedom Unite weapon trees. 11 types of weapons in the Blademaster and Gunner categories.",
};

export default function BlacksmithPage() {
  return <BlacksmithListContent />;
}
