"use client";

/**
 * The preferences card on the Options page: how values are shown, and which
 * markers a loaded hunter adds to the trees, recipes, quests and monsters. Styled after the
 * game's Options menu (SettingsCard): a yellow box for each On/Off preference
 * (filled when on), and "◀ VALUE ▶" for one with several values.
 */
import Link from "next/link";
import SettingsCard from "@/components/SettingsCard";
import { SelectorRow, ToggleRow, type Choice } from "@/components/SettingRows";
import { usePreferences, type Preferences } from "@/context/PreferencesContext";
import { useT } from "@/context/LanguageContext";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/locales";
import { STAGES, tierLabel, type Tier } from "@/lib/min-rank";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { TREE_FILTERS } from "@/lib/tree-filter";
import { writeTreeFilter } from "@/lib/tree-filter-store";
import * as ui from "@/styles/settings";

/** The preferences that are On/Off. */
type ToggleKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

const PROGRESS_CHOICES: Choice<Tier | null>[] = [
  { value: null, label: "Show all" },
  ...STAGES.map((stage) => ({ value: stage, label: tierLabel(stage) })),
];

const TREE_FILTER_CHOICES = TREE_FILTERS.map((f) => ({ value: f.id, label: f.label }));

export default function PreferencesSettings() {
  const { prefs, set, reset } = usePreferences();
  const t = useT();

  const languageChoices: Choice<Locale | "auto">[] = [
    { value: "auto", label: t.site.language.auto },
    ...LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] })),
  ];

  /** An On/Off row for a boolean preference. */
  const toggle = (key: ToggleKey, label: string, note: React.ReactNode) => (
    <ToggleRow label={label} note={note} value={prefs[key]} onChange={(value) => set(key, value)} />
  );

  const isDefault = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).every(
    (key) => prefs[key] === DEFAULT_PREFERENCES[key],
  );

  return (
    <SettingsCard title="Preferences">
      <h3 className={ui.subheading}>{t.site.language.heading}</h3>
      <SelectorRow
        label={t.site.language.label}
        note={t.site.language.note}
        choices={languageChoices}
        value={prefs.language}
        onChange={(value) => set("language", value)}
      />

      <hr className="my-[0.4rem] h-[3px]" />

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

      <h3 className={ui.subheading}>Progress</h3>
      <SelectorRow
        label="Quest progress"
        note="The highest guild quest you can take. Weapons and armor that need materials from later quests are hidden. Village quests count as Low Rank."
        choices={PROGRESS_CHOICES}
        value={prefs.questProgress}
        onChange={(value) => set("questProgress", value)}
      />

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
      {toggle(
        "markCleared",
        "Mark cleared quests",
        "Mark the quests you have cleared with CLEAR!! on the quest boards and quest pages.",
      )}
      {toggle(
        "showHuntRecords",
        "Hunt records",
        "Show how many of each monster you have hunted and captured on its page.",
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
