import Link from "next/link";
import type { Metadata } from "next";
import BorderRule from "@/components/BorderRule";
import { pageMetadata } from "@/lib/seo";
import VeggieElderClient from "./VeggieElderClient";

export const metadata: Metadata = pageMetadata({
  title: "Veggie Elder",
  description:
    "Pick what you're carrying and see what the Monster Hunter Freedom Unite Veggie Elder will trade you on each hunting ground.",
  path: "/veggie-elder/",
});

export default function VeggieElderPage() {
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <VeggieElderClient />
    </div>
  );
}
