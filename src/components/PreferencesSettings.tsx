"use client";

/**
 * The preferences card on the Options page: how values are shown, and which
 * markers a loaded hunter adds to the trees and recipes. Styled after the
 * game's Options menu: a yellow title on a grey bar, and a yellow box for each
 * On/Off preference (filled when on).
 */
import { useId, useRef } from "react";
import Link from "next/link";
import Card from "@/components/Card";
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
 * A preference with several choices, as a labelled radio group. Arrow keys move the choice, as in a native radio
 * group; only the chosen option is in the tab order.
 */
function ChoiceRow<T>({
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
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    choices.findIndex((c) => c.value === value),
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (selected + step + choices.length) % choices.length;
    onChange(choices[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div className={ui.preferenceRow}>
      <RowText id={id} label={label} note={note} />
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-note`}
        className="flex flex-wrap gap-[0.8rem]"
        onKeyDown={onKeyDown}
      >
        {choices.map((choice, i) => (
          <button
            key={String(choice.value)}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={i === selected}
            tabIndex={i === selected ? 0 : -1}
            className={cn(ui.choice, i === selected ? ui.choiceSelected : ui.choiceIdle)}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
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
    <Card className={ui.section}>
      <div className={ui.menuHeader}>
        <h2 className={ui.menuTitle}>Preferences</h2>
      </div>

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
      <ChoiceRow
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
    </Card>
  );
}
