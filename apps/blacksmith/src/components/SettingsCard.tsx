"use client";

import { useContext } from "react";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import { OptionsTabBar, OptionsTabsContext } from "@/components/OptionsTabContext";
import { SELECTOR_BAR_HEIGHT, barText } from "@/components/SelectorBar";
import { cn } from "@/lib/cn";
import * as ui from "@/styles/settings";

/**
 * A card on the Options page, styled after the game's Options menu: the
 * normal frame, and a flat grey bar across its top, as on the Hunter list. On
 * desktop the card fills the pane, its body scrolls under the bar, and the bar
 * holds the Options tabs; on phones the cards stack and the bar is the title.
 */
export default function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const tabbed = useContext(OptionsTabsContext) !== null;
  return (
    <CardBox className="mobile:flex-none">
      <Card scroll className="text-small" bodyClassName={ui.sectionBody}>
        {/* Room for the bar over the top of the card. */}
        <div
          className="-mt-[0.4rem] flex-none"
          style={{ height: SELECTOR_BAR_HEIGHT - 4 }}
          aria-hidden="true"
        />
        {children}
      </Card>
      <div
        className="absolute top-[4px] right-[4px] left-[4px] z-2 overflow-hidden bg-selector px-[1.6rem]"
        style={{ height: SELECTOR_BAR_HEIGHT }}
      >
        {tabbed && (
          <div className="h-full mobile:hidden">
            <OptionsTabBar />
          </div>
        )}
        <h2
          className={cn(
            ui.menuTitle,
            barText,
            "flex h-full items-center",
            tabbed && "hidden mobile:flex",
          )}
        >
          {title}
        </h2>
      </div>
    </CardBox>
  );
}
