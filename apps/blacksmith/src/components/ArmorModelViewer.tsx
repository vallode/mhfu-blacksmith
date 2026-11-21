"use client";

import { useEffect, useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import { cn } from "@/lib/cn";
import { HUNTER_BARE_FEMALE_MODEL, HUNTER_BARE_MODEL } from "@/lib/hunter";
import type { HunterSlot } from "@/lib/hunter-armor";
import type { ArmorModelUrls, ArmorSetModelUrls } from "@/lib/models";
import { modelPanel, modelPanelButton } from "@/styles/model";
import { useT } from "@/context/LanguageContext";

interface Props {
  models: ArmorModelUrls;
  /** The models of the piece's whole set, once known; with two or more, the viewer offers it. */
  setModels?: ArmorSetModelUrls | null;
  /** The piece's slot, for wearing it on the hunter (a set's pieces go by their files). */
  slot: HunterSlot;
  label: string;
}

type Sex = "male" | "female";

/** Whether the last piece was shown on the hunter: the next one opens the same way. */
let lastOnHunter = false;

const hunterChecks = new Map<string, Promise<boolean>>();
/** Answers so far, so a piece opened after the first reads them at once. */
const hunterFiles = new Map<string, boolean>();

/**
 * Whether the bare hunter of `sex`, which armor goes on, was exported
 * (older exports have none); undefined until known.
 */
function useHunterExists(sex: Sex): boolean | undefined {
  const url = sex === "male" ? HUNTER_BARE_MODEL : HUNTER_BARE_FEMALE_MODEL;
  const [, setChecked] = useState(0);
  useEffect(() => {
    if (hunterFiles.has(url)) return;
    let cancelled = false;
    let check = hunterChecks.get(url);
    if (!check) {
      check = fetch(url, { method: "HEAD" })
        .then((res) => res.ok)
        .catch(() => false)
        .then((ok) => {
          hunterFiles.set(url, ok);
          return ok;
        });
      hunterChecks.set(url, check);
    }
    check.then(() => {
      if (!cancelled) setChecked((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return hunterFiles.get(url);
}

/** A row of buttons of which one is pressed, as the game's tab-like switches. */
function Switch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-4" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={value === option.value ? "underline" : "opacity-60"}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * ModelViewer for an armor piece: the piece or the full set it belongs to,
 * on its own or worn by the hunter, with a male/female switch when there are
 * both models.
 */
export default function ArmorModelViewer({ models, setModels, slot, label }: Props) {
  const tm = useT().equipment.model;
  const [wholeSet, setWholeSet] = useState(false);
  const [sex, setSex] = useState<Sex>(models.male ? "male" : "female");
  const [onHunter, setOnHunter] = useState(lastOnHunter);

  // A sex's set shows only where the piece itself has that sex's model, so
  // the set on show always wears it.
  const hasSet = (s: Sex) => Boolean(models[s]) && (setModels?.[s].length ?? 0) > 1;
  const canShowSet = hasSet("male") || hasSet("female");
  const showSet = wholeSet && canShowSet;
  const has = (s: Sex) => (showSet ? hasSet(s) : Boolean(models[s]));
  // Keep the chosen sex while it has a model here, else the other.
  const shownSex: Sex = has(sex) ? sex : sex === "male" ? "female" : "male";
  const canWear = useHunterExists(shownSex);
  const worn = onHunter && canWear === true;

  const urls = showSet ? setModels![shownSex] : [models[shownSex] ?? models.male ?? models.female!];
  const [src, ...parts] = urls as [string, ...string[]];
  const name = showSet ? tm.setModel(label) : label;
  const model = shownSex === "male" ? tm.maleModel(name) : tm.femaleModel(name);

  return (
    <div className="relative h-full w-full">
      {/* Shown once it's known whether it can be worn, so it loads once. */}
      {!(onHunter && canWear === undefined) && (
        <ModelViewer
          key={`${src}|${worn}`}
          src={src}
          parts={parts.length > 0 ? parts : undefined}
          label={worn ? tm.wornModel(model) : model}
          wear={worn ? { slot, sex: shownSex } : undefined}
        />
      )}
      {(canShowSet || (has("male") && has("female"))) && (
        <div
          className={cn(
            modelPanel,
            "absolute top-2 left-2 z-10 flex flex-wrap gap-x-[3.2rem] gap-y-[0.4rem]",
          )}
        >
          {canShowSet && (
            <Switch
              label={tm.setSwitchLabel}
              options={[
                { value: "piece", label: tm.piece },
                { value: "set", label: tm.fullSet },
              ]}
              value={showSet ? "set" : "piece"}
              onChange={(value) => setWholeSet(value === "set")}
            />
          )}
          {has("male") && has("female") && (
            <Switch
              label={tm.switchLabel}
              options={[
                { value: "male", label: tm.male },
                { value: "female", label: tm.female },
              ]}
              value={shownSex}
              onChange={setSex}
            />
          )}
        </div>
      )}
      {canWear && (
        <button
          type="button"
          onClick={() => {
            lastOnHunter = !onHunter;
            setOnHunter(!onHunter);
          }}
          aria-pressed={onHunter}
          className={cn(
            modelPanel,
            modelPanelButton,
            "absolute bottom-2 left-2 z-10",
            onHunter ? "text-stat" : "text-parchment",
          )}
        >
          {tm.onHunter}
        </button>
      )}
    </div>
  );
}
