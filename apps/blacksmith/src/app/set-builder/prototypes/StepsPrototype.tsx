"use client";

/**
 * Prototype C, "Steps": one job per screen, like the game's own menus.
 * 1 Skills (browse every skill by tree), 2 Hunter (big tiles you can hit
 * with a thumb), 3 Sets (the result screen). A step bar at the top shows
 * where you are and what you chose; the bar at the bottom moves you on.
 */
import { useState } from "react";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import { ToggleRow } from "@/components/SettingRows";
import { cn } from "@/lib/cn";
import type { ArmorRank } from "@/lib/constants";
import { tierLabel } from "@/lib/min-rank";
import { MAX_WEAPON_SLOTS } from "@/lib/set-build";
import type { Piece } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import { PanelTitle, SetHeader } from "../ArmorSetView";
import {
  ActionBar,
  PieceRows,
  PieceSheet,
  PinnedPieces,
  SkillBrowser,
  SkillChips,
  SkillLine,
  SortChips,
  StatusStrip,
  primaryButton,
  searchMessage,
  secondaryButton,
  slotsText,
} from "./parts";
import { useSwipe } from "./LoadoutPrototype";
import type { ProtoSearch } from "./useProtoSearch";

type Step = "skills" | "hunter" | "sets";

const tile =
  "flex min-h-[6.4rem] flex-1 cursor-pointer flex-col items-center justify-center gap-[0.4rem] border-2 px-[0.4rem] font-[inherit] text-small leading-none shadow-[0.2rem_0.2rem_0_black] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const tileOn = "border-stat bg-stat/20 text-stat";
const tileOff = "border-white/25 bg-black/40 text-white/70 hover:border-stat/60";

function Tiles<T>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: { value: T; label: string; big: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-[0.8rem] border-none p-0">
      <legend className="mb-[0.8rem] p-0 text-small text-parchment">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex gap-[0.8rem]">
        {choices.map((c) => (
          <button
            key={String(c.value)}
            type="button"
            role="radio"
            aria-checked={c.value === value}
            className={cn(tile, c.value === value ? tileOn : tileOff)}
            onClick={() => onChange(c.value)}
          >
            <span className="flex items-center text-main">{c.big}</span>
            <span className="text-fine">{c.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function StepBar({ step, onStep, s }: { step: Step; onStep: (s: Step) => void; s: ProtoSearch }) {
  const { form, sets } = s;
  const steps: { id: Step; label: string; sub: string; disabled?: boolean }[] = [
    {
      id: "skills",
      label: "Skills",
      sub: form.skills.length ? `${form.skills.length} chosen` : "None yet",
    },
    {
      id: "hunter",
      label: "Hunter",
      sub: `${form.hunterType === "Gunner" ? "Gun" : "Blade"} ${form.sex === "Male" ? "♂" : "♀"} ${
        { "low-rank": "LR", "high-rank": "HR", "g-rank": "G" }[form.rank]
      }`,
    },
    {
      id: "sets",
      label: "Sets",
      sub: s.searching ? "Searching…" : s.result ? `${sets.length} found` : "-",
      disabled: !s.result && !s.searching,
    },
  ];
  return (
    <nav aria-label="Steps" className="flex bg-selector">
      {steps.map((st, i) => (
        <button
          key={st.id}
          type="button"
          aria-current={st.id === step ? "step" : undefined}
          disabled={st.disabled}
          className={cn(
            "flex min-h-[5.6rem] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[0.4rem] border-0 border-b-[3px] bg-transparent px-[0.4rem] font-[inherit] leading-none disabled:cursor-default disabled:opacity-40",
            st.id === step ? "border-stat bg-black/25" : "border-transparent hover:bg-black/15",
          )}
          onClick={() => onStep(st.id)}
        >
          <span
            className={cn(
              "text-small text-shadow-[0.15rem_0.15rem_black]",
              st.id === step ? "text-stat" : "text-white",
            )}
          >
            {i + 1} {st.label}
          </span>
          <span className="max-w-full truncate text-fine text-white/55">{st.sub}</span>
        </button>
      ))}
    </nav>
  );
}

export default function StepsPrototype({ s }: { s: ProtoSearch }) {
  const { form, update, sets, index, setIndex, query, skills, questProgress } = s;
  const [step, setStep] = useState<Step>(s.result ? "sets" : "skills");
  const [picked, setPicked] = useState<{ piece: Piece; index: number } | null>(null);
  const set = sets[Math.min(index, sets.length - 1)] ?? null;
  const stepSet = (by: 1 | -1) => sets.length && setIndex((index + by + sets.length) % sets.length);
  const swipe = useSwipe(stepSet);
  const go = (to: Step) => {
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const search = () => {
    s.run();
    go("sets");
  };
  const n = form.skills.length;

  return (
    <div className="flex flex-col gap-[1.3rem]">
      <Card className="flex-none text-small" bodyClassName="card-py-7 gap-[1.4rem]">
        <StepBar step={step} onStep={go} s={s} />

        {step === "skills" && (
          <>
            <SkillChips
              value={form.skills}
              onRemove={(name) =>
                update(
                  "skills",
                  form.skills.filter((v) => v !== name),
                )
              }
            />
            <SkillBrowser
              skills={skills}
              value={form.skills}
              onChange={(v) => update("skills", v)}
            />
          </>
        )}

        {step === "hunter" && (
          <div className="flex flex-col gap-[2rem]">
            <Tiles
              label="Weapon class"
              value={form.hunterType}
              onChange={(v) => update("hunterType", v)}
              choices={[
                {
                  value: "Blademaster" as const,
                  label: "Blademaster",
                  big: <Icon type="great-sword" size="mini" className="mr-0" />,
                },
                {
                  value: "Gunner" as const,
                  label: "Gunner",
                  big: <Icon type="heavy-bowgun" size="mini" className="mr-0" />,
                },
              ]}
            />
            <Tiles
              label="Hunter"
              value={form.sex}
              onChange={(v) => update("sex", v)}
              choices={[
                { value: "Male" as const, label: "Male", big: "♂" },
                { value: "Female" as const, label: "Female", big: "♀" },
              ]}
            />
            <Tiles<ArmorRank>
              label="Armor up to"
              value={form.rank}
              onChange={(v) => update("rank", v)}
              choices={[
                { value: "low-rank", label: "Low", big: "LR" },
                { value: "high-rank", label: "High", big: "HR" },
                { value: "g-rank", label: "G Rank", big: "G" },
              ]}
            />
            <Tiles<number>
              label="Weapon slots"
              value={form.weaponSlots}
              onChange={(v) => update("weaponSlots", v)}
              choices={Array.from({ length: MAX_WEAPON_SLOTS + 1 }, (_, k) => ({
                value: k,
                label: k === 0 ? "None" : `${k}`,
                big: <span className="text-sub">{slotsText(k)}</span>,
              }))}
            />
            <fieldset className="m-0 flex flex-col gap-[0.8rem] border-none p-0">
              <legend className="mb-[0.8rem] p-0 text-small text-parchment">Best first by</legend>
              <SortChips value={form.sort} onChange={(v) => update("sort", v)} wrap />
            </fieldset>
            <ToggleRow
              label="Allow bad skills"
              note="Keep sets that also activate a negative skill."
              value={form.allowBadSkills}
              onChange={(v) => update("allowBadSkills", v)}
            />
            {questProgress && (
              <ToggleRow
                label="Ignore quest progress"
                note={`Search armor past ${tierLabel(questProgress)} too.`}
                value={form.ignoreQuestProgress}
                onChange={(v) => update("ignoreQuestProgress", v)}
              />
            )}
            <PinnedPieces s={s} />
          </div>
        )}

        {step === "sets" &&
          (set ? (
            <>
              <SetHeader index={index} count={sets.length} onStep={stepSet} />
              <div className="flex flex-col gap-[1.2rem]" {...swipe}>
                <StatusStrip set={set} sort={query?.sort} />
                <PieceRows
                  set={set}
                  weaponSlots={query?.weaponSlots ?? 0}
                  hunterType={query?.hunterType ?? form.hunterType}
                  isLocked={s.isLocked}
                  onPiece={(piece, i) => setPicked({ piece, index: i })}
                />
                <div className="flex flex-col gap-[0.6rem]">
                  <h3 className="m-0 text-sub font-normal text-stat">[Activate Skill]</h3>
                  <SkillLine set={set} wanted={query?.skills ?? []} />
                </div>
              </div>
              {s.searching && searchMessage(s)}
            </>
          ) : (
            <>
              <PanelTitle>Sets</PanelTitle>
              {searchMessage(s)}
            </>
          ))}
      </Card>

      <ActionBar>
        {step === "skills" && (
          <button
            type="button"
            className={primaryButton}
            disabled={n === 0}
            onClick={() => go("hunter")}
          >
            {n === 0 ? "Pick a skill to go on" : `Next: Hunter ›`}
          </button>
        )}
        {step === "hunter" && (
          <>
            <button type="button" className={secondaryButton} onClick={() => go("skills")}>
              ‹ Skills
            </button>
            <button type="button" className={primaryButton} disabled={n === 0} onClick={search}>
              {s.stale || !s.result ? `Search ${n} skill${n === 1 ? "" : "s"}` : "Show sets ›"}
            </button>
          </>
        )}
        {step === "sets" && (
          <>
            <button type="button" className={secondaryButton} onClick={() => go("skills")}>
              ‹ Edit
            </button>
            {s.searching ? (
              <button
                type="button"
                className={cn(primaryButton, "border-white/40 bg-line")}
                onClick={s.cancel}
              >
                Searching… {s.found > 0 && <span className="text-stat">{s.found}</span>} · Cancel
              </button>
            ) : (
              s.stale && (
                <button type="button" className={primaryButton} onClick={search}>
                  Update results
                </button>
              )
            )}
          </>
        )}
      </ActionBar>

      <PieceSheet
        s={s}
        piece={picked?.piece ?? null}
        index={picked?.index ?? 0}
        set={set}
        onClose={() => setPicked(null)}
      />
      {step === "sets" && s.result?.timedOut && (
        <p className={ui.note}>The search stopped early: better sets may exist.</p>
      )}
    </div>
  );
}
