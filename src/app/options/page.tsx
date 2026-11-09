import SiteTitle from "@/components/SiteTitle";
import BorderRule from "@/components/BorderRule";
import type { Metadata } from "next";
import OfflineSettings from "@/components/OfflineSettings";
import PreferencesSettings from "@/components/PreferencesSettings";
import SaveSyncSettings from "@/components/SaveSyncSettings";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Options",
  description: "Display, offline and save-sync settings for MHFU Blacksmith.",
  path: "/options/",
});

export default function OptionsPage() {
  return (
    <div className="flex flex-col items-center px-[1.3rem] pb-[4rem]">
      <SiteTitle />

      <BorderRule />

      <div className="flex w-full max-w-[72rem] flex-col gap-[1.3rem]">
        <PreferencesSettings />
        <SaveSyncSettings />
        <OfflineSettings />
      </div>
    </div>
  );
}
