"use client";

/**
 * The preferences card on the Options page: how values are shown, and which
 * markers a loaded hunter adds to the trees and recipes. Styled after the
 * game's Options menu (SettingsCard): a yellow box for each On/Off preference
 * (filled when on), and "◀ VALUE ▶" for one with several values.
 */
import { useId } from "react";
import Link from "next/link";
import SelectorArrow from "@/components/SelectorArrow";
import SettingsCard from "@/components/SettingsCard";
import { usePreferences, type Preferences } from "@/context/PreferencesContext";
import { cn } from "@/lib/cn";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { TREE_FILTERS } from "@/lib/tree-filter";
import { writeTreeFilter } from "@/lib/tree-filter-store";
import * as ui from "@/styles/settings";

interface Choice<T> {
  value: T;
  label: string;
}

/** Label and note for a preference row. `labelFor` makes the label click the control. */
function RowText({
  id,
  label,
  note,
  labelFor,
}: {
  id: string;
  label: string;
  note: React.ReactNode;
  labelFor?: string;
}) {
  return (
    <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-[0.4rem]">
      {labelFor ? (
        <label
          id={`${id}-label`}
          htmlFor={labelFor}
          className={cn(ui.statusLabel, "cursor-pointer")}
        >
          {label}
        </label>
      ) : (
        <span id={`${id}-label`} className={ui.statusLabel}>
          {label}
        </span>
      )}
      <p id={`${id}-note`} className={ui.note}>
        {note}
      </p>
    </div>
  );
}

/** An On/Off preference: a switch drawn as a yellow box, filled when on. */
function ToggleRow({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: React.ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-[2.4rem]">
      <RowText id={id} label={label} note={note} labelFor={`${id}-switch`} />
      <button
        id={`${id}-switch`}
        type="button"
        role="switch"
        aria-checked={value}
        aria-describedby={`${id}-note`}
        className={cn(ui.toggle, value ? ui.toggleOn : ui.toggleOff)}
        onClick={() => onChange(!value)}
      />
    </div>
  );
}

/**
 * A preference with several values, as the game's selector: "◀ VALUE ▶". The
 * arrows, or the left/right arrow keys while either has focus, step through
 * the values and wrap around.
 */
function SelectorRow<T>({
  label,
  note,
  choices,
  value,
  onChange,
}: {
  label: string;
  note: React.ReactNode;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const index = Math.max(
    0,
    choices.findIndex((c) => c.value === value),
  );
  const step = (by: 1 | -1) =>
    onChange(choices[(index + by + choices.length) % choices.length].value);
  const name = label.toLowerCase();

  return (
    <div className={ui.preferenceRow}>
      <RowText id={id} label={label} note={note} />
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-note`}
        className={ui.selector}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
        }}
      >
        <SelectorArrow
          className={ui.selectorArrow}
          label={`Previous ${name}`}
          onClick={() => step(-1)}
        />
        <span className={ui.selectorValue} aria-live="polite">
          {choices[index].label}
        </span>
        <SelectorArrow
          next
          className={ui.selectorArrow}
          label={`Next ${name}`}
          onClick={() => step(1)}
        />
      </div>
    </div>
  );
}

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
