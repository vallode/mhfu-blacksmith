"use client";

import { useMemo, useState } from "react";
import OfflineSettings from "@/components/OfflineSettings";
import { OptionsTabsContext } from "@/components/OptionsTabContext";
import PreferencesSettings from "@/components/PreferencesSettings";
import SaveSyncSettings from "@/components/SaveSyncSettings";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";

/** Each tab's card; its label is the card's own title (`site.<id>.title`). */
const SECTIONS: { id: string; label: (t: Messages["site"]) => string; card: React.ReactNode }[] = [
  { id: "preferences", label: (t) => t.preferences.title, card: <PreferencesSettings /> },
  { id: "save-sync", label: (t) => t.saveSync.title, card: <SaveSyncSettings /> },
  { id: "offline", label: (t) => t.offline.title, card: <OfflineSettings /> },
];

/**
 * The Options cards. On desktop one card fills the pane at a time, its tabs in
 * the grey bar across its top and its body scrolling in place. On phones and
 * portrait tablets there are no tabs: the cards stack at the page's full width
 * and the document scrolls, as on the other pages. Every card stays mounted,
 * so a tab switch keeps its state.
 */
export default function OptionsTabs() {
  const [selected, setSelected] = useState(SECTIONS[0].id);
  const t = useT();
  const tabs = useMemo(
    () => ({
      tabs: SECTIONS.map(({ id, label }) => ({ id, label: label(t.site) })),
      selected,
      select: setSelected,
      label: t.common.sections.options,
    }),
    [t, selected],
  );

  return (
    <OptionsTabsContext.Provider value={tabs}>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-[1.3rem] mobile:flex-none">
        {SECTIONS.map(({ id, label, card }) => (
          <div
            key={id}
            role="tabpanel"
            id={`options-panel-${id}`}
            aria-label={label(t.site)}
            className={cn(
              "flex min-h-0 flex-1 flex-col mobile:flex-none",
              selected !== id && "hidden mobile:flex",
            )}
          >
            {card}
          </div>
        ))}
      </div>
    </OptionsTabsContext.Provider>
  );
}
