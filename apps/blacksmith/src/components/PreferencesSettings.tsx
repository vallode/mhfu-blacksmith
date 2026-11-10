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
import { STAGES, type Tier } from "@/lib/min-rank";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { TREE_FILTERS } from "@/lib/tree-filter";
import { writeTreeFilter } from "@/lib/tree-filter-store";
import * as ui from "@/styles/settings";

/** The preferences that are On/Off. */
type ToggleKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

export default function PreferencesSettings() {
  const { prefs, set, reset } = usePreferences();
  const t = useT();
  const text = t.site.preferences;

  const languageChoices: Choice<Locale | "auto">[] = [
    { value: "auto", label: t.site.language.auto },
    ...LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] })),
  ];
  const progressChoices: Choice<Tier | null>[] = [
    { value: null, label: text.questProgress.all },
    ...STAGES.map((stage) => ({ value: stage, label: t.equipment.tierLabel(stage) })),
  ];
  const treeFilterChoices = TREE_FILTERS.map((f) => ({
    value: f.id,
    label: t.equipment.treeFilters[f.id],
  }));

  /** An On/Off row for a boolean preference. */
  const toggle = (key: ToggleKey) => (
    <ToggleRow
      label={text[key].label}
      note={text[key].note}
      value={prefs[key]}
      onChange={(value) => set(key, value)}
    />
  );

  const isDefault = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).every(
    (key) => prefs[key] === DEFAULT_PREFERENCES[key],
  );

  return (
    <SettingsCard title={text.title}>
      <h3 className={ui.subheading}>{t.site.language.heading}</h3>
      <SelectorRow
        label={t.site.language.label}
        note={t.site.language.note}
        choices={languageChoices}
        value={prefs.language}
        onChange={(value) => set("language", value)}
      />

      <hr className="my-[0.4rem] h-[3px]" />

      <h3 className={ui.subheading}>{text.display}</h3>
      {toggle("showRawValues")}
      {toggle("animateHighlights")}

      <hr className="my-[0.4rem] h-[3px]" />

      <h3 className={ui.subheading}>{text.progress}</h3>
      <SelectorRow
        label={text.questProgress.label}
        note={text.questProgress.note}
        choices={progressChoices}
        value={prefs.questProgress}
        onChange={(value) => set("questProgress", value)}
      />

      <hr className="my-[0.4rem] h-[3px]" />

      <h3 className={ui.subheading}>{text.hunter}</h3>
      <p className={ui.note}>
        {text.hunterNote(
          <Link key="link" className="underline hover:text-white" href="/hunter/">
            {t.common.sections.hunter}
          </Link>,
        )}
      </p>
      {toggle("markOwned")}
      {toggle("showCraftProgress")}
      {toggle("showMaterialCounts")}
      {toggle("checkZenny")}
      {toggle("markCleared")}
      {toggle("showHuntRecords")}
      <SelectorRow
        label={text.defaultTreeFilter.label}
        note={text.defaultTreeFilter.note}
        choices={treeFilterChoices}
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
          {text.reset}
        </button>
      </div>
    </SettingsCard>
  );
}
