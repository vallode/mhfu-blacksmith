"use client";

/**
 * The preferences card on the Options page: how values are shown, and which
 * markers a loaded hunter adds to the trees and recipes. Styled after the
 * game's Options menu (SettingsCard): a yellow box for each On/Off preference
 * (filled when on), and "◀ VALUE ▶" for one with several values.
 */
import Link from "next/link";
import SettingsCard from "@/components/SettingsCard";
import { SelectorRow, ToggleRow } from "@/components/SettingRows";
import { usePreferences, type Preferences } from "@/context/PreferencesContext";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { TREE_FILTERS } from "@/lib/tree-filter";
import { writeTreeFilter } from "@/lib/tree-filter-store";
import * as ui from "@/styles/settings";

/** The preferences that are On/Off. */
type ToggleKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

const TREE_FILTER_CHOICES = TREE_FILTERS.map((f) => ({ value: f.id, label: f.label }));

export default function PreferencesSettings() {
  const { prefs, set, reset } = usePreferences();

  /** An On/Off row for a boolean preference. */
  const toggle = (key: ToggleKey, label: string, note: React.ReactNode) => (
    <ToggleRow label={label} note={note} value={prefs[key]} onChange={(value) => set(key, value)} />
  );

  const isDefault = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).every(
    (key) => prefs[key] === DEFAULT_PREFERENCES[key],
  );

  return (
    <SettingsCard title="Preferences">
      <h3 className={ui.subheading}>Display</h3>
      {toggle(
        "showRawValues",
        "True values",
        "Show the raw attack and element values in brackets next to the in-game numbers.",
      )}
      {toggle(
        "animateHighlights",
        "Pulsing highlights",
        "Pulse the green highlight on hovered and selected rows. Off keeps it steady.",
      )}

      <hr className="my-[0.4rem] h-[3px]" />

      <h3 className={ui.subheading}>Hunter</h3>
      <p className={ui.note}>
        These apply once you load a hunter on the{" "}
        <Link className="underline hover:text-white" href="/hunter/">
          Hunter Profile
        </Link>{" "}
        page.
      </p>
      {toggle(
        "markOwned",
        "Mark owned equipment",
        "Give equipment in your equipment box gold names in the weapon, armor and decoration trees.",
      )}
      {toggle(
        "showCraftProgress",
        "Craft progress",
        "Show material squares on weapon tree rows and highlight the weapons you can make now.",
      )}
      {toggle(
        "showMaterialCounts",
        "Material counts",
        "Show how many of each recipe material you have, as owned/required.",
      )}
      {toggle(
        "checkZenny",
        "Count zenny",
        "Only count a weapon as craftable when you can also afford it.",
      )}
      <SelectorRow
        label="Starting tree filter"
        note="The weapon tree filter each visit starts on."
        choices={TREE_FILTER_CHOICES}
        value={prefs.defaultTreeFilter}
        onChange={(value) => {
          set("defaultTreeFilter", value);
          // Apply it to this visit too, not just the next one.
          writeTreeFilter(value);
        }}
      />

      <div className={ui.actions}>
        <button
          type="button"
          className={ui.buttonSecondary}
          disabled={isDefault}
          onClick={() => {
            reset();
            writeTreeFilter(DEFAULT_PREFERENCES.defaultTreeFilter);
          }}
        >
          Reset to defaults
        </button>
      </div>
    </SettingsCard>
  );
}
