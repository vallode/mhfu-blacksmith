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
