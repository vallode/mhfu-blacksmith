import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import type { Metadata } from "next";
import OptionsTabs from "@/components/OptionsTabs";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Options",
  description: "Display, offline and save-sync settings for MHFU Blacksmith.",
  path: "/options/",
});

/**
 * On desktop the page header and the tabs stay put and the selected card
 * scrolls beneath them, in the pane beside the sidebar. On phones and
 * portrait tablets the document scrolls, as on the other pages.
 */
export default function OptionsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center px-[1.3rem] mobile:flex-none">
      <Link className="blacksmith__title" href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <OptionsTabs />
    </div>
  );
}
