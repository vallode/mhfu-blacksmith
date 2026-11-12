"use client";

/**
 * Prototype B, "Compare": every result at once, as a list you scroll like
 * the site's other lists. Each set is a short card (defence, resistances,
 * its five pieces, extra skills); tapping one opens it in place, with the
 * same piece rows as A. Sorting is a row of chips over the list that
 * reorders at once. The query folds into a one-line header.
 */
import { useState } from "react";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS } from "@/lib/constants";
import type { ArmorSet, Piece } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import { PanelTitle } from "../ArmorSetView";
import {
  OptionsForm,
  OptionsSummary,
  PieceRows,
  PieceSheet,
  SearchBar,
  SkillBrowser,
  SkillChips,
  SkillLine,
  SortChips,
  StatusStrip,
  pressable,
  rarityColor,
  searchMessage,
  Sheet,
  primaryButton,
} from "./parts";
import type { ProtoSearch } from "./useProtoSearch";

const PAGE = 15;

function SetSummary({
  set,
  best,
  n,
  open,
  onToggle,
  s,
  onPiece,
}: {
  set: ArmorSet;
  /** The first set: pieces this one shares with it are dimmed. */
  best: ArmorSet;
  n: number;
  open: boolean;
  onToggle: () => void;
  s: ProtoSearch;
  onPiece: (p: Piece, i: number) => void;
}) {
  const wanted = s.query?.skills ?? [];
  const extras = set.skills.filter((sk) => !wanted.includes(sk.name));
  return (
    <li className={cn("border-b border-white/15", open && "bg-black/25")}>
      <button
        type="button"
        aria-expanded={open}
        className={cn(pressable, "flex w-full flex-col gap-[0.8rem] px-[0.6rem] py-[1rem]")}
        onClick={onToggle}
      >
        <span className="flex w-full items-center gap-[1rem]">
          <span className="w-[3.2rem] flex-none text-sub text-stat text-shadow-[0.15rem_0.15rem_black]">
            {n}
          </span>
          <span className="min-w-0 flex-1">
            <StatusStrip set={set} sort={s.query?.sort} compact />
          </span>
          <span
            className={cn(
              "flex-none text-sub text-white/40 transition-transform",
              open && "rotate-90",
            )}
            aria-hidden="true"
          >
            ›
          </span>
        </span>
        {!open && (
          <span className="flex w-full flex-col gap-y-[0.2rem] pl-[4.2rem] text-fine">
            {ARMOR_SLOTS.map((slot) => {
              const p = set.pieces.find((x) => x.slot === slot);
              // Pieces the best set also wears fade, so the differences stand out.
              const same = best !== set && best.pieces.some((b) => b.id === p?.id);
              return (
                <span
                  key={slot}
                  className={cn("flex min-w-0 items-center gap-[0.4rem]", same && "opacity-40")}
                >
                  <Icon
                    type={slot}
                    size="mini"
                    rarity={p?.rarity}
                    className="mr-0 flex-none scale-75"
                  />
                  <span className="truncate" style={{ color: rarityColor(p?.rarity) }}>
                    {p?.name ?? "-"}
                  </span>
                </span>
              );
            })}
            <span className="truncate text-white/50">
              {set.decorations.length} jewel{set.decorations.length === 1 ? "" : "s"}
              {set.freeSlots > 0 && `, ${set.freeSlots} slot${set.freeSlots === 1 ? "" : "s"} free`}
            </span>
          </span>
        )}
        {!open && extras.length > 0 && (
          <span className="flex w-full flex-wrap gap-x-[1rem] pl-[4.2rem] text-fine">
            {extras.map((sk) => (
              <span key={sk.tree} className={sk.threshold < 0 ? "text-negative" : "text-positive"}>
                {sk.threshold < 0 ? "" : "+ "}
                {sk.name}
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-[1rem] px-[0.4rem] pb-[1.2rem]">
          <PieceRows
            set={set}
            weaponSlots={s.query?.weaponSlots ?? 0}
            hunterType={s.query?.hunterType ?? s.form.hunterType}
            isLocked={s.isLocked}
            onPiece={onPiece}
          />
          <SkillLine set={set} wanted={wanted} />
        </div>
      )}
    </li>
  );
}

export default function ComparePrototype({ s }: { s: ProtoSearch }) {
  const { form, update, sets, skills } = s;
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<{ piece: Piece; index: number; set: ArmorSet } | null>(null);
  const message = searchMessage(s);

  return (
    <div className="flex flex-col gap-[1.3rem]">
      <Card className="flex-none text-small" bodyClassName="card-py-7 gap-[1rem]">
        <button
          type="button"
          aria-expanded={editing}
          className={cn(pressable, "flex w-full flex-col gap-[0.6rem]")}
          onClick={() => setEditing(true)}
        >
          <span className="flex w-full items-baseline justify-between">
            <PanelTitle>Sets for</PanelTitle>
            <span className="text-fine text-white/50">Edit ›</span>
          </span>
          <span className="text-sub text-stat">
            {form.skills.length ? form.skills.join(", ") : "No skills yet"}
          </span>
          <OptionsSummary form={form} />
        </button>
      </Card>

      <Card className="flex-none text-small" bodyClassName="card-py-7 gap-[1rem]">
        <SortChips value={form.sort} onChange={(v) => s.updateAndRun({ ...form, sort: v })} />
        {s.result?.timedOut && (
          <p className={ui.note}>The search stopped early: better sets may exist.</p>
        )}
        {message}
        {sets.length > 0 && (
          <>
            <p className="m-0 text-fine text-white/50">
              {sets.length} sets. Faded pieces are the same as set 1&apos;s; green skills are
              extras.
            </p>
            <ul className="m-0 list-none p-0">
              {sets.slice(0, shown).map((set, i) => (
                <SetSummary
                  key={i}
                  set={set}
                  best={sets[0]}
                  n={i + 1}
                  open={open === i}
                  onToggle={() => setOpen(open === i ? null : i)}
                  s={s}
                  onPiece={(piece, index) => setPicked({ piece, index, set })}
                />
              ))}
            </ul>
            {shown < sets.length && (
              <button type="button" className={ui.button} onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, sets.length - shown)} more
              </button>
            )}
          </>
        )}
        {!message && sets.length === 0 && (
          <>
            <p className={ui.note}>Pick skills, then every set that activates them lists here.</p>
            <button type="button" className={primaryButton} onClick={() => setEditing(true)}>
              Pick skills
            </button>
          </>
        )}
      </Card>

      <SearchBar s={s} />

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Search"
        tall
        footer={
          <button
            type="button"
            className={primaryButton}
            disabled={form.skills.length === 0}
            onClick={() => {
              setEditing(false);
              setOpen(0);
              setShown(PAGE);
              s.run();
            }}
          >
            Search
          </button>
        }
      >
        <SkillChips
          value={form.skills}
          onRemove={(n) =>
            update(
              "skills",
              form.skills.filter((v) => v !== n),
            )
          }
        />
        <details className="group">
          <summary className="flex min-h-[4.4rem] cursor-pointer list-none items-center justify-between border-y border-white/15 text-small text-white">
            Hunter and options
            <span className="text-white/50 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="pt-[1.2rem]">
            <OptionsForm s={s} />
          </div>
        </details>
        <SkillBrowser skills={skills} value={form.skills} onChange={(v) => update("skills", v)} />
      </Sheet>

      <PieceSheet
        s={s}
        piece={picked?.piece ?? null}
        index={picked?.index ?? 0}
        set={picked?.set ?? null}
        onClose={() => setPicked(null)}
      />
    </div>
  );
}
