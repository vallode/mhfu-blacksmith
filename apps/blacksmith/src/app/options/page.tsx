import Link from "next/link";
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

/**
 * On desktop the page header stays put and the cards scroll beneath it, in
 * the pane beside the sidebar. On phones and portrait tablets the document
 * scrolls, as on the other pages. A wide pane (AppShell's size container)
 * sets the preferences beside the other two cards.
 */
export default function OptionsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center px-[1.3rem] mobile:flex-none">
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      {/* The scroll box spans the pane, so its scrollbar sits at the window's
          edge rather than against the cards. */}
      <div className="-mx-[1.3rem] min-h-0 w-[calc(100%+2.6rem)] flex-1 overflow-y-auto px-[1.3rem] pt-[1.3rem] pb-[4rem] mobile:flex-none mobile:overflow-visible mobile:pt-0">
        <div className="mx-auto grid w-full max-w-[72rem] grid-cols-1 items-start gap-[1.3rem] @min-[120rem]:max-w-[112rem] @min-[120rem]:grid-cols-2">
          <PreferencesSettings />
          <div className="flex flex-col gap-[1.3rem]">
            <SaveSyncSettings />
            <OfflineSettings />
          </div>
        </div>
      </div>
    </div>
  );
}
