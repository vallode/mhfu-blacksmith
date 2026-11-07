import Link from "next/link";
import type { Metadata } from "next";
import SaveUpload from "@/components/SaveUpload";
import BorderRule from "@/components/BorderRule";

export const metadata: Metadata = {
  title: "Hunter Profile — MHFU Blacksmith",
};

export default function HunterPage() {
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <SaveUpload />
    </div>
  );
}
