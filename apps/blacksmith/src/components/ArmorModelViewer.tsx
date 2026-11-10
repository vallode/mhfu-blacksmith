"use client";

import { useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import type { ArmorModelUrls } from "@/lib/models";
import { useT } from "@/context/LanguageContext";

interface Props {
  models: ArmorModelUrls;
  label: string;
}

/** ModelViewer for an armor piece, with a male/female switch when the piece has both models. */
export default function ArmorModelViewer({ models, label }: Props) {
  const tm = useT().equipment.model;
  const both = Boolean(models.male && models.female);
  const [sex, setSex] = useState<"male" | "female">(models.male ? "male" : "female");
  const src = models[sex] ?? models.male ?? models.female!;

  return (
    <div className="relative h-full w-full">
      <ModelViewer
        key={src}
        src={src}
        label={sex === "male" ? tm.maleModel(label) : tm.femaleModel(label)}
      />
      {both && (
        <div
          className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-4"
          role="group"
          aria-label={tm.switchLabel}
        >
          {(["male", "female"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSex(option)}
              aria-pressed={sex === option}
              className={sex === option ? "underline" : "opacity-60"}
            >
              {option === "male" ? tm.male : tm.female}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
