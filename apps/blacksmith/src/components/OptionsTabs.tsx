"use client";

import { useState } from "react";
import OfflineSettings from "@/components/OfflineSettings";
import PreferencesSettings from "@/components/PreferencesSettings";
import SaveSyncSettings from "@/components/SaveSyncSettings";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";
import * as ui from "@/styles/settings";

/** Each tab's card; its label is the card's own title (`site.<id>.title`). */
const SECTIONS: { id: string; label: (t: Messages["site"]) => string; card: React.ReactNode }[] = [
  { id: "preferences", label: (t) => t.preferences.title, card: <PreferencesSettings /> },
  { id: "save-sync", label: (t) => t.saveSync.title, card: <SaveSyncSettings /> },
  { id: "offline", label: (t) => t.offline.title, card: <OfflineSettings /> },
];

/**
 * The Options cards. On desktop a row of tabs shows one card at a time, in
 * the pane that scrolls under the page header. On phones and portrait tablets
 * there are no tabs: the cards stack at the page's full width and the
 * document scrolls, as on the other pages. Every card stays mounted, so a
 * tab switch keeps its state.
 */
export default function OptionsTabs() {
  const [selected, setSelected] = useState(SECTIONS[0].id);
  const t = useT();

  return (
    <>
      <div
        role="tablist"
        aria-label={t.common.sections.options}
        className="mt-[1.3rem] flex flex-none justify-center gap-[0.6rem] mobile:hidden"
      >
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`options-tab-${id}`}
            aria-selected={selected === id}
            aria-controls={`options-panel-${id}`}
            className={cn(ui.tab, selected === id && ui.tabOn)}
            onClick={() => setSelected(id)}
          >
            {label(t.site)}
          </button>
        ))}
      </div>

      {/* The scroll box spans the pane, so its scrollbar sits at the window's
          edge rather than against the card. On phones it has no padding, so
          the cards take the page's full width. */}
      <div className="-mx-[1.3rem] min-h-0 w-[calc(100%+2.6rem)] flex-1 overflow-y-auto px-[1.3rem] pt-[1.3rem] pb-[4rem] mobile:flex-none mobile:overflow-visible mobile:px-0 mobile:pt-0">
        <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-[1.3rem]">
          {SECTIONS.map(({ id, card }) => (
            <div
              key={id}
              role="tabpanel"
              id={`options-panel-${id}`}
              aria-labelledby={`options-tab-${id}`}
              className={cn("flex flex-col", selected !== id && "hidden mobile:flex")}
            >
              {card}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
