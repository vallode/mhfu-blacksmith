"use client";

import { useEffect, useState } from "react";
import ModelViewer from "@/components/ModelViewer";
import { cn } from "@/lib/cn";
import { HUNTER_BARE_FEMALE_MODEL, HUNTER_BARE_MODEL } from "@/lib/hunter";
import type { HunterSlot } from "@/lib/hunter-armor";
import {
  CLOTHING_COUNT,
  DEFAULT_LOOK,
  fetchLookData,
  hexColor,
  lookFromSave,
  readPickedLooks,
  writePickedLooks,
  type HunterLook,
  type LookData,
  type PickedLooks,
} from "@/lib/hunter-look";
import { armorModelSlot, type ArmorModelUrls, type ArmorSetModelUrls } from "@/lib/models";
import { modelPanel, modelPanelButton } from "@/styles/model";
import { useT } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";

interface Props {
  /** The piece's models. Without them, the viewer shows a whole set (`setModels`). */
  models?: ArmorModelUrls | null;
  /** The models of the piece's whole set, or of a custom set. */
  setModels?: ArmorSetModelUrls | null;
  /** The piece's slot, for wearing it on the hunter (a set's pieces go by their files). */
  slot?: HunterSlot;
  label: string;
  /** The sex to show first; a custom set is built for one. */
  sex?: Sex;
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

/** Whether the look pickers were open: the next piece opens the same way. */
let lastLookOpen = false;

/** `look.json`, once fetched (null if this export has none). */
function useLookData(): LookData | null | undefined {
  const [data, setData] = useState<LookData | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchLookData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

const sameLook = (a: HunterLook, b: HunterLook) =>
  a.face === b.face &&
  a.hair === b.hair &&
  a.hairColor === b.hairColor &&
  a.clothing === b.clothing;

/** Steps through `count` options (shown from 1), wrapping around. */
function Stepper({
  label,
  value,
  count,
  onChange,
}: {
  label: string;
  value: number;
  count: number;
  onChange: (value: number) => void;
}) {
  const tm = useT().equipment.model;
  const step = (by: number) => onChange((value + by + count) % count);
  return (
    <div className="flex items-center gap-[0.8rem]" role="group" aria-label={label}>
      <span className="w-cells-12">{label}</span>
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={tm.previousOption(label)}
        className={cn(modelPanelButton, "px-[0.4rem]")}
      >
        ‹
      </button>
      <span className="w-cells-5 text-center" aria-live="polite">
        {tm.lookValue(value + 1, count)}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={tm.nextOption(label)}
        className={cn(modelPanelButton, "px-[0.4rem]")}
      >
        ›
      </button>
    </div>
  );
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
 * ModelViewer for armor: a piece, the full set it belongs to, or a custom
 * set, on its own or worn by the hunter, with a male/female switch when there
 * are both models. A custom set has no piece to show, so it shows as a set
 * from the start.
 */
export default function ArmorModelViewer({
  models,
  setModels,
  slot,
  label,
  sex: initialSex,
}: Props) {
  const tm = useT().equipment.model;
  const hasPiece = Boolean(models?.male || models?.female);
  const [wholeSet, setWholeSet] = useState(false);
  const [sex, setSex] = useState<Sex>(initialSex ?? (models?.male ? "male" : "female"));
  const [onHunter, setOnHunter] = useState(lastOnHunter);
  const [lookOpen, setLookOpen] = useState(lastLookOpen);
  /** Looks picked here, by sex; read after mount, as storage isn't there to render with. */
  const [picked, setPicked] = useState<PickedLooks>({});
  useEffect(() => setPicked(readPickedLooks()), []);
  const lookData = useLookData();
  const { save } = useSave();

  // A sex's set shows only where the piece itself has that sex's model, so
  // the set on show always wears it. A custom set has no piece, so one model
  // is enough to show it.
  const hasSet = (s: Sex) =>
    Boolean(!hasPiece || models?.[s]) && (setModels?.[s].length ?? 0) > (hasPiece ? 1 : 0);
  const canShowSet = hasSet("male") || hasSet("female");
  const showSet = !hasPiece || (wholeSet && canShowSet);
  const has = (s: Sex) => (showSet ? hasSet(s) : Boolean(models?.[s]));
  // Keep the chosen sex while it has a model here, else the other.
  const shownSex: Sex = has(sex) ? sex : sex === "male" ? "female" : "male";
  const canWear = useHunterExists(shownSex);

  // The look: what was picked for this sex, else the save's hunter's if it's
  // of this sex, else the bare hunter's.
  const saveSex: Sex | undefined =
    save?.sex === "Male" ? "male" : save?.sex === "Female" ? "female" : undefined;
  const saveLook = save?.look && saveSex ? lookFromSave(save.look) : undefined;
  const lookOptions = lookData?.[shownSex === "male" ? "m" : "f"];
  const look = picked[shownSex] ?? (saveSex === shownSex ? saveLook : undefined) ?? DEFAULT_LOOK;
  const pick = (sex: Sex, next: HunterLook | undefined) => {
    const all = { ...picked, [sex]: next };
    if (!next) delete all[sex];
    setPicked(all);
    writePickedLooks(all);
  };
  const change = (field: keyof HunterLook, value: number) =>
    pick(shownSex, { ...look, [field]: value });
  // The save's hunter, on its own sex's model where the piece has one.
  const canShowSaveLook = saveLook && saveSex && has(saveSex);

  const urls = showSet
    ? (setModels?.[shownSex] ?? [])
    : [models?.[shownSex] ?? models?.male ?? models?.female].filter((url): url is string =>
        Boolean(url),
      );
  const src = urls[0];
  // A set's pieces say their slot in their file name; a piece's own does too.
  const wearSlot = slot ?? (src ? (armorModelSlot(src) as HunterSlot | undefined) : undefined);
  const worn = onHunter && canWear === true && Boolean(wearSlot);
  const name = showSet && hasPiece ? tm.setModel(label) : label;
  const model = shownSex === "male" ? tm.maleModel(name) : tm.femaleModel(name);
  const showSwitches = (canShowSet && hasPiece) || (has("male") && has("female"));

  if (!src)
    return (
      <p className="flex h-full items-center justify-center text-center opacity-70">
        {tm.unavailable}
      </p>
    );

  return (
    <div className="relative h-full w-full">
      {/* Shown once it's known whether it can be worn, so it loads once. */}
      {!(onHunter && canWear === undefined) && (
        <ModelViewer
          key={`${src}|${worn}`}
          src={src}
          parts={urls.length > 1 ? urls.slice(1) : undefined}
          label={worn ? tm.wornModel(model) : model}
          wear={worn && wearSlot ? { slot: wearSlot, sex: shownSex, look } : undefined}
        />
      )}
      {showSwitches && (
        <div
          className={cn(
            modelPanel,
            "absolute top-2 left-2 z-10 flex flex-wrap gap-x-[3.2rem] gap-y-[0.4rem]",
          )}
        >
          {canShowSet && hasPiece && (
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
      {canWear === true && wearSlot && (
        <div className="absolute bottom-2 left-2 z-10 flex flex-col items-start gap-2">
          {worn && lookOpen && lookOptions && (
            <div
              className={cn(modelPanel, "flex flex-col gap-[0.4rem]")}
              role="group"
              aria-label={tm.look}
            >
              <Stepper
                label={tm.face}
                value={Math.min(look.face, lookOptions.faces - 1)}
                count={lookOptions.faces}
                onChange={(value) => change("face", value)}
              />
              <Stepper
                label={tm.hairstyle}
                value={Math.min(look.hair, lookOptions.hairstyles - 1)}
                count={lookOptions.hairstyles}
                onChange={(value) => change("hair", value)}
              />
              <label className="flex items-center gap-[0.8rem]">
                <span className="w-cells-12">{tm.hairColor}</span>
                <input
                  type="color"
                  value={hexColor(look.hairColor)}
                  onChange={(event) =>
                    change("hairColor", parseInt(event.target.value.slice(1), 16))
                  }
                  className="h-[2rem] w-[4.8rem] cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
              <Stepper
                label={tm.clothing}
                value={Math.min(look.clothing, CLOTHING_COUNT - 1)}
                count={CLOTHING_COUNT}
                onChange={(value) => change("clothing", value)}
              />
              <div className="flex flex-wrap gap-x-[1.6rem]">
                {canShowSaveLook && (
                  <button
                    type="button"
                    onClick={() => {
                      setSex(saveSex);
                      pick(saveSex, undefined);
                    }}
                    aria-pressed={shownSex === saveSex && sameLook(look, saveLook)}
                    className={cn(
                      modelPanelButton,
                      shownSex === saveSex && sameLook(look, saveLook)
                        ? "text-stat"
                        : "text-parchment",
                    )}
                  >
                    {tm.myHunter(save!.name)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => pick(shownSex, DEFAULT_LOOK)}
                  aria-pressed={sameLook(look, DEFAULT_LOOK)}
                  className={cn(
                    modelPanelButton,
                    sameLook(look, DEFAULT_LOOK) ? "text-stat" : "text-parchment",
                  )}
                >
                  {tm.defaultLook}
                </button>
              </div>
            </div>
          )}
          {/* On phones the motion controls share the bottom row: Look goes above. */}
          <div className="flex gap-2 mobile:flex-col-reverse mobile:items-start">
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
                onHunter ? "text-stat" : "text-parchment",
              )}
            >
              {tm.onHunter}
            </button>
            {worn && lookOptions && (
              <button
                type="button"
                onClick={() => {
                  lastLookOpen = !lookOpen;
                  setLookOpen(!lookOpen);
                }}
                aria-expanded={lookOpen}
                className={cn(
                  modelPanel,
                  modelPanelButton,
                  lookOpen ? "text-stat" : "text-parchment",
                )}
              >
                {tm.look}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
