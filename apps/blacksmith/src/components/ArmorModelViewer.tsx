"use client";

import { useEffect, useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import { cn } from "@/lib/cn";
import { HUNTER_FEMALE_MODEL, HUNTER_MODEL } from "@/lib/hunter";
import type { HunterSlot } from "@/lib/hunter-armor";
import type { ArmorModelUrls } from "@/lib/models";
import { modelPanel, modelPanelButton } from "@/styles/model";

interface Props {
  models: ArmorModelUrls;
  /** The piece's slot, for wearing it on the hunter. */
  slot: HunterSlot;
  label: string;
}

/** Whether the last piece was shown on the hunter: the next one opens the same way. */
let lastOnHunter = false;

const hunterChecks = new Map<string, Promise<boolean>>();
/** Answers so far, so a piece opened after the first reads them at once. */
const hunterFiles = new Map<string, boolean>();

/**
 * Whether the hunter of `sex` was exported (older exports have no female
 * hunter); undefined until known.
 */
function useHunterExists(sex: "male" | "female"): boolean | undefined {
  const url = sex === "male" ? HUNTER_MODEL : HUNTER_FEMALE_MODEL;
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

/**
 * ModelViewer for an armor piece: on its own or worn by the hunter, with a
 * male/female switch when the piece has both models.
 */
export default function ArmorModelViewer({ models, slot, label }: Props) {
  const both = Boolean(models.male && models.female);
  const [sex, setSex] = useState<"male" | "female">(models.male ? "male" : "female");
  const [onHunter, setOnHunter] = useState(lastOnHunter);
  const src = models[sex] ?? models.male ?? models.female!;
  const shown = models[sex] ? sex : models.male ? "male" : "female";
  const canWear = useHunterExists(shown);
  const worn = onHunter && canWear === true;

  return (
    <div className="relative h-full w-full">
      {/* Shown once it's known whether it can be worn, so it loads once. */}
      {!(onHunter && canWear === undefined) && (
        <ModelViewer
          key={`${src}|${worn}`}
          src={src}
          label={`${label} (${shown})${worn ? " on a hunter" : ""}`}
          wear={worn ? { slot, sex: shown } : undefined}
        />
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
          On hunter
        </button>
      )}
      {both && (
        <div
          className={cn(modelPanel, "absolute top-2 left-2 z-10 flex gap-[1.6rem]")}
          role="group"
          aria-label="Model"
        >
          {(["male", "female"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSex(option)}
              aria-pressed={sex === option}
              className={cn(modelPanelButton, sex === option ? "text-stat" : "text-parchment")}
            >
              {option === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
