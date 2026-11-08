import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import type { Metadata } from "next";
import OfflineSettings from "@/components/OfflineSettings";
import PreferencesSettings from "@/components/PreferencesSettings";
import SaveSyncSettings from "@/components/SaveSyncSettings";

export const metadata: Metadata = {
  title: "Options — MHFU Blacksmith",
};

export default function OptionsPage() {
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <div className="flex w-full max-w-[72rem] flex-col gap-[1.3rem]">
        <PreferencesSettings />
        <SaveSyncSettings />
        <OfflineSettings />
      </div>
    </div>
  );
}
