"use client";

/**
 * Rows for a settings-style card, after the game's Options menu (Options
 * page preferences, set builder): a yellow box for an On/Off setting (filled
 * when on), and "◀ VALUE ▶" for one with several values.
 */
import { useId } from "react";
import SelectorArrow from "@/components/SelectorArrow";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import * as ui from "@/styles/settings";

export interface Choice<T> {
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
  note?: React.ReactNode;
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
      {note && (
        <p id={`${id}-note`} className={ui.note}>
          {note}
        </p>
      )}
    </div>
  );
}

/** An On/Off preference: a switch drawn as a yellow box, filled when on. */
export function ToggleRow({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note?: React.ReactNode;
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
        aria-describedby={note ? `${id}-note` : undefined}
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
export function SelectorRow<T>({
  label,
  note,
  choices,
  value,
  onChange,
}: {
  label: string;
  note?: React.ReactNode;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const t = useT();
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
        aria-describedby={note ? `${id}-note` : undefined}
        className={ui.selector}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
        }}
      >
        <SelectorArrow
          className={ui.selectorArrow}
          label={t.site.selector.previous(name)}
          onClick={() => step(-1)}
        />
        <span className={ui.selectorValue} aria-live="polite">
          {choices[index].label}
        </span>
        <SelectorArrow
          next
          className={ui.selectorArrow}
          label={t.site.selector.next(name)}
          onClick={() => step(1)}
        />
      </div>
    </div>
  );
}

export interface IconChoice<T> extends Choice<T> {
  /** What the button shows, given whether it's the chosen value; `label` names it for screen readers and the tooltip. */
  icon: (checked: boolean) => React.ReactNode;
}

/**
 * A few values as a row of small square buttons, one per value, the chosen
 * one outlined in yellow: a radio group, for settings whose values read at a
 * glance as an icon or a few characters (the set builder's weapon class,
 * sex, rank and weapon slots). The arrow keys move the choice along the row.
 */
export function IconChoices<T>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: IconChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const index = Math.max(
    0,
    choices.findIndex((c) => c.value === value),
  );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-none gap-[0.4rem]"
      onKeyDown={(event) => {
        const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!by) return;
        event.preventDefault();
        const next = (index + by + choices.length) % choices.length;
        onChange(choices[next].value);
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
        buttons[next]?.focus();
      }}
    >
      {choices.map((choice, i) => {
        const checked = i === index;
        return (
          <button
            key={String(choice.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={choice.label}
            title={choice.label}
            tabIndex={checked ? 0 : -1}
            className={cn(ui.iconChoice, checked ? ui.iconChoiceOn : ui.iconChoiceOff)}
            onClick={() => onChange(choice.value)}
          >
            {choice.icon(checked)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row of icon choices on one line: the label, with the chosen value spelled
 * out under it, and one or more IconChoices groups (`children`) at the right.
 * Shorter than a SelectorRow, whose selector takes its own line in a narrow
 * card.
 */
export function ChoiceRow({
  label,
  value,
  children,
}: {
  label: string;
  /** The current choice in words, shown under the label (the groups already announce it). */
  value: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-[1.6rem] gap-y-[0.8rem]">
      <div className="flex min-w-0 flex-1 flex-col gap-[0.4rem]">
        <span className={ui.statusLabel}>{label}</span>
        <p className={ui.note} aria-hidden="true">
          {value}
        </p>
      </div>
      <div className="flex flex-none items-center gap-[1.2rem]">{children}</div>
    </div>
  );
}

/** A ChoiceRow with one group of icon choices. */
export function IconChoiceRow<T>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: IconChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const chosen = choices.find((c) => c.value === value) ?? choices[0];
  return (
    <ChoiceRow label={label} value={chosen.label}>
      <IconChoices label={label} choices={choices} value={value} onChange={onChange} />
    </ChoiceRow>
  );
}
