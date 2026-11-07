"use client";

import { useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import type { ArmorModelUrls } from "@/lib/models";

interface Props {
  models: ArmorModelUrls;
  label: string;
}

/** ModelViewer for an armor piece, with a male/female switch when the piece has both models. */
export default function ArmorModelViewer({ models, label }: Props) {
  const both = Boolean(models.male && models.female);
  const [sex, setSex] = useState<"male" | "female">(models.male ? "male" : "female");
  const src = models[sex] ?? models.male ?? models.female!;

  return (
    <div className="flex h-full w-full flex-col items-center gap-2">
      <div className="min-h-0 w-full flex-1">
        <ModelViewer key={src} src={src} label={`${label} (${sex})`} />
      </div>
      {both && (
        <div className="flex gap-4" role="group" aria-label="Model">
          {(["male", "female"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSex(option)}
              aria-pressed={sex === option}
              className={sex === option ? "underline" : "opacity-60"}
            >
              {option === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
