"use client";

/**
 * Prototype A, "Loadout": the result is the page. The query shrinks to a
 * card of skill chips and a one-line options summary; skills and options
 * open in bottom sheets. One set at a time, the game's set screen with
 * big rows: swipe or use the arrows to step, tap a piece for lock, exclude
 * and swaps. Search sits in a bar over the tab bar, only when there's
 * something new to search.
 */
import { useRef, useState } from "react";
import Card from "@/components/Card";
import type { Piece } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import { PanelTitle, SetHeader } from "../ArmorSetView";
import {
  OptionsForm,
  OptionsSummary,
  PieceRows,
  PieceSheet,
  SearchBar,
  Sheet,
  SkillBrowser,
  SkillChips,
  SkillLine,
  StatusStrip,
  pressable,
  primaryButton,
  searchMessage,
} from "./parts";
import type { ProtoSearch } from "./useProtoSearch";

/** Horizontal swipes on `onStep`'s element step the set. */
export function useSwipe(onStep: (by: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(t.clientY - s.y)) {
        onStep(dx < 0 ? 1 : -1);
      }
    },
  };
}

export default function LoadoutPrototype({ s }: { s: ProtoSearch }) {
  const { form, update, sets, index, setIndex, query, skills } = s;
  const [sheet, setSheet] = useState<"skills" | "options" | null>(null);
  const [picked, setPicked] = useState<{ piece: Piece; index: number } | null>(null);
  const set = sets[Math.min(index, sets.length - 1)] ?? null;
  const step = (by: 1 | -1) => sets.length && setIndex((index + by + sets.length) % sets.length);
  const swipe = useSwipe(step);
  const message = searchMessage(s);

  return (
    <div className="flex flex-col gap-[1.3rem]">
      <Card className="flex-none text-small" bodyClassName="card-py-7 gap-[1.2rem]">
        <div className="flex items-baseline justify-between">
          <PanelTitle>Skills</PanelTitle>
          {form.skills.length > 0 && (
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-fine text-white/50 hover:text-white"
              onClick={() => update("skills", [])}
            >
              Clear
            </button>
          )}
        </div>
        <SkillChips
          value={form.skills}
          onRemove={(n) =>
            update(
              "skills",
              form.skills.filter((v) => v !== n),
            )
          }
          onAdd={() => setSheet("skills")}
          addLabel={form.skills.length ? "+ Skill" : "+ Add the skills you want"}
        />
        <button
          type="button"
          className={`${pressable} flex min-h-[4.8rem] w-full items-center justify-between gap-[1rem] border-t border-white/15 pt-[0.8rem] text-small`}
          onClick={() => setSheet("options")}
        >
          <OptionsSummary form={form} />
          <span className="flex-none text-white/50">Options ›</span>
        </button>
      </Card>

      <Card className="flex-none text-small" bodyClassName="card-py-7 gap-[1.2rem]">
        {set ? (
          <>
            <SetHeader index={index} count={sets.length} onStep={step} />
            {timedOutNote(s)}
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
            {s.searching && message}
          </>
        ) : (
          <>
            <PanelTitle>Sets</PanelTitle>
            {message ?? (
              <>
                <p className={ui.note}>
                  Add the skills you want and search: every armor set with jewels that activates
                  them, best defence first.
                </p>
                {form.skills.length === 0 && (
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => setSheet("skills")}
                  >
                    Add skills
                  </button>
                )}
              </>
            )}
          </>
        )}
      </Card>

      <SearchBar s={s} />

      <Sheet
        open={sheet === "skills"}
        onClose={() => setSheet(null)}
        title={`Skills${form.skills.length ? ` (${form.skills.length})` : ""}`}
        tall
        footer={
          <button
            type="button"
            className={primaryButton}
            disabled={form.skills.length === 0}
            onClick={() => {
              setSheet(null);
              s.run();
            }}
          >
            Search
          </button>
        }
      >
        <SkillBrowser skills={skills} value={form.skills} onChange={(v) => update("skills", v)} />
      </Sheet>

      <Sheet
        open={sheet === "options"}
        onClose={() => setSheet(null)}
        title="Options"
        footer={
          <button
            type="button"
            className={primaryButton}
            disabled={form.skills.length === 0}
            onClick={() => {
              setSheet(null);
              s.run();
            }}
          >
            Search
          </button>
        }
      >
        <OptionsForm s={s} withSort />
      </Sheet>

      <PieceSheet
        s={s}
        piece={picked?.piece ?? null}
        index={picked?.index ?? 0}
        set={set}
        onClose={() => setPicked(null)}
      />
    </div>
  );
}

function timedOutNote(s: ProtoSearch) {
  return s.result?.timedOut ? (
    <p className={ui.note}>The search stopped early: better sets may exist.</p>
  ) : null;
}
