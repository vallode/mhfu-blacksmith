"use client";

import { useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import type { ArmorModelUrls, ArmorSetModelUrls } from "@/lib/models";
import { useT } from "@/context/LanguageContext";

interface Props {
  models: ArmorModelUrls;
  /** The models of the piece's whole set, once known; with two or more, the viewer offers it. */
  setModels?: ArmorSetModelUrls | null;
  label: string;
}

type Sex = "male" | "female";

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
 * ModelViewer for an armor piece, with a male/female switch when the piece
 * has both models, and a switch to the full set it belongs to.
 */
export default function ArmorModelViewer({ models, setModels, label }: Props) {
  const tm = useT().equipment.model;
  const [wholeSet, setWholeSet] = useState(false);
  const [sex, setSex] = useState<Sex>(models.male ? "male" : "female");

  // A sex's set shows only where the piece itself has that sex's model, so
  // the set on show always wears it.
  const hasSet = (s: Sex) => Boolean(models[s]) && (setModels?.[s].length ?? 0) > 1;
  const canShowSet = hasSet("male") || hasSet("female");
  const showSet = wholeSet && canShowSet;
  const has = (s: Sex) => (showSet ? hasSet(s) : Boolean(models[s]));
  // Keep the chosen sex while it has a model here, else the other.
  const shownSex: Sex = has(sex) ? sex : sex === "male" ? "female" : "male";

  const urls = showSet ? setModels![shownSex] : [models[shownSex] ?? models.male ?? models.female!];
  const [src, ...parts] = urls as [string, ...string[]];
  const name = showSet ? tm.setModel(label) : label;

  return (
    <div className="relative h-full w-full">
      <ModelViewer
        key={src}
        src={src}
        parts={parts.length > 0 ? parts : undefined}
        label={shownSex === "male" ? tm.maleModel(name) : tm.femaleModel(name)}
      />
      <div className="absolute inset-x-2 bottom-2 z-10 flex flex-wrap justify-center gap-x-[3.2rem] gap-y-[0.4rem]">
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
    </div>
  );
}
