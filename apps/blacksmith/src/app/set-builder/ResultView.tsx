"use client";

/**
 * A search result, laid out for a phone first: the "◀ Set 1  1/60 ▶"
 * selector, defence and resistances in a strip, the weapon and pieces as
 * big rows with their jewels under them, then [Activate Skill]. Swipe or use
 * the arrows to step through the sets. Tapping a piece opens its sheet: its
 * stats, swaps that keep the skills, and Always use / Never use (lock and
 * exclude for the next search). Tapping the weapon suggests weapons with its
 * slots (WeaponSuggestions).
 */
import { useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Slots } from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS, type ArmorRank, type WeaponType } from "@/lib/constants";
import { readLastWeapon } from "@/lib/last-weapon";
import type { Tier } from "@/lib/min-rank";
import type { ArmorSet, DecoBin, Piece, SortKey } from "@/lib/set-search";
import { pressable, primaryButton, secondaryButton } from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import { SetHeader } from "./ArmorSetView";
import { weaponTypesFor } from "@/lib/weapon-suggest";
import Sheet from "./Sheet";
import WeaponSuggestions from "./WeaponSuggestions";

/** Search actions on a result's pieces: use one in every set, or leave it out. */
export interface PieceActions {
  isLocked: (piece: Piece) => boolean;
  /** Lock the piece, or unlock it if it's locked. */
  onLock: (piece: Piece) => void;
  onExclude: (piece: Piece) => void;
}

const ELEMENTS = ["fire", "water", "thunder", "ice", "dragon"] as const;

const SLOT_LABELS: Record<DecoBin, string> = {
  weapon: "Weapon",
  helmet: "Head",
  plate: "Chest",
  gauntlets: "Arms",
  waist: "Waist",
  leggings: "Legs",
};

const rarityColor = (rarity?: number) =>
  rarity ? `var(--color-rarity-${Math.min(10, Math.max(4, rarity))})` : undefined;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const resColor = (n: number) => (n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-white");

/** Horizontal swipes on the element step the set. */
function useSwipe(onStep: (by: 1 | -1) => void) {
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
      // Mostly sideways and far enough: a swipe, not a scroll or a tap.
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(t.clientY - s.y)) {
        onStep(dx < 0 ? 1 : -1);
      }
    },
  };
}

export default function ResultView({
  set,
  index,
  count,
  onStep,
  action,
  weaponSlots,
  hunterType,
  rank,
  progress,
  sort,
  wanted,
  actions,
  children,
}: {
  set: ArmorSet;
  index: number;
  count: number;
  onStep: (by: 1 | -1) => void;
  /** A button on the selector bar (edit this set). */
  action?: React.ReactNode;
  weaponSlots: number;
  hunterType: string;
  /** The search's rank and quest progress, for the weapon suggestions. */
  rank: ArmorRank;
  progress: Tier | null;
  /** What the sets are sorted by, highlighted in the status strip. */
  sort?: SortKey;
  /** The wanted skills, highlighted under [Activate Skill]. */
  wanted: string[];
  actions: PieceActions;
  /** Notes under the selector bar (the search stopped early). */
  children?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<{ piece: Piece; index: number } | null>(null);
  const [weaponsOpen, setWeaponsOpen] = useState(false);
  // The weapon class suggested: the last one chosen here or browsed on the
  // site, if the hunter type uses it.
  // (Results only render in the browser, after a search, so storage is there.)
  const [chosenType, setChosenType] = useState<WeaponType>(readLastWeapon);
  const classes = weaponTypesFor(hunterType);
  const weaponType = classes.includes(chosenType) ? chosenType : classes[0];
  const swipe = useSwipe(onStep);
  return (
    <div className="flex flex-col gap-[1.2rem]">
      <SetHeader index={index} count={count} onStep={onStep} action={action} />
      {children}
      <div className="flex flex-col gap-[1.2rem]" {...swipe}>
        <StatusStrip set={set} sort={sort} />
        <PieceRows
          set={set}
          weaponSlots={weaponSlots}
          weaponType={weaponType}
          isLocked={actions.isLocked}
          onPiece={(piece, i) => setPicked({ piece, index: i })}
          onWeapon={() => setWeaponsOpen(true)}
        />
        <div className="flex flex-col gap-[0.6rem]">
          <h3 className="m-0 text-sub font-normal text-stat">[Activate Skill]</h3>
          <SkillLine set={set} wanted={wanted} />
        </div>
      </div>
      <PieceSheet
        piece={picked?.piece ?? null}
        alternatives={picked ? (set.alternatives[picked.index] ?? []) : []}
        set={set}
        actions={actions}
        onClose={() => setPicked(null)}
      />
      <WeaponSuggestions
        open={weaponsOpen}
        onClose={() => setWeaponsOpen(false)}
        type={weaponType}
        onType={setChosenType}
        hunterType={hunterType}
        slots={weaponSlots}
        rank={rank}
        progress={progress}
      />
    </div>
  );
}

/** Defence, big, then the five resistances as element icons, then free slots. */
function StatusStrip({
  set,
  sort,
}: {
  set: Pick<ArmorSet, "defence" | "res" | "freeSlots">;
  sort?: SortKey;
}) {
  return (
    <div className="flex items-center gap-[1.4rem]">
      <div className="flex flex-none flex-col items-start leading-none">
        <span className="text-fine text-parchment">DEF</span>
        <span
          className={cn(
            "text-[2.8rem] text-shadow-[0.15rem_0.15rem_black]",
            sort === "defence" ? "text-stat" : "text-white",
          )}
        >
          {set.defence}
        </span>
      </div>
      <ul
        className="m-0 grid min-w-0 flex-1 list-none grid-cols-5 gap-[0.4rem] p-0"
        aria-label="Resistances"
      >
        {ELEMENTS.map((el, i) => (
          <li
            key={el}
            className={cn(
              "flex flex-col items-center gap-[0.2rem] py-[0.2rem]",
              sort === el && "bg-stat/15 outline outline-stat/60",
            )}
          >
            <img src={`/images/${el}.png`} alt={el} className="size-[1.6rem] pixelated" />
            <span className={cn("text-fine leading-none", resColor(set.res[i]))}>
              {signed(set.res[i])}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-none flex-col items-end leading-none">
        <span className="text-fine text-parchment">Free</span>
        <span className={cn("text-sub", sort === "slots" ? "text-stat" : "text-white")}>
          {set.freeSlots}
        </span>
      </div>
    </div>
  );
}

/** Decorations in a bin, with repeats counted: "Fierce Jewel ×2". */
function decoSummary(set: Pick<ArmorSet, "decorations">, bin: DecoBin) {
  const counts = new Map<string, { name: string; color?: string; n: number }>();
  for (const { deco, bin: b } of set.decorations) {
    if (b !== bin) continue;
    const c = counts.get(deco.name) ?? { name: deco.name, color: deco.color, n: 0 };
    c.n++;
    counts.set(deco.name, c);
  }
  return [...counts.values()];
}

function DecoLine({ set, bin }: { set: Pick<ArmorSet, "decorations">; bin: DecoBin }) {
  const decos = decoSummary(set, bin);
  if (decos.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-[1rem] text-fine text-white/65">
      {decos.map((d) => (
        <span key={d.name} className="flex items-center">
          <Icon type="decoration" size="mini" color={d.color} className="mr-[0.2rem] scale-75" />
          {d.name}
          {d.n > 1 && <span className="ml-[0.4rem] text-white/45">×{d.n}</span>}
        </span>
      ))}
    </span>
  );
}

/**
 * The weapon and pieces as full-width rows (5.2rem+ tall, easy to tap):
 * icon, name and its jewels under it, slots at the right.
 */
function PieceRows({
  set,
  weaponSlots,
  weaponType,
  isLocked,
  onPiece,
  onWeapon,
}: {
  set: ArmorSet;
  weaponSlots: number;
  weaponType: WeaponType;
  isLocked: (p: Piece) => boolean;
  onPiece: (p: Piece, index: number) => void;
  onWeapon: () => void;
}) {
  const row =
    "grid min-h-[5.2rem] w-full grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-x-[1rem] border-b border-white/10 px-[0.6rem] py-[0.6rem]";
  return (
    <ul className="m-0 list-none p-0">
      <li>
        <button
          type="button"
          className={cn(pressable, row, decoSummary(set, "weapon").length === 0 && "min-h-[4rem]")}
          aria-label="Weapon: suggest weapons for this set"
          onClick={onWeapon}
        >
          <Icon type={weaponType} size="mini" alt="" className="mr-0" />
          <span className="flex min-w-0 flex-col gap-[0.2rem]">
            <span className="text-small text-white/55">Weapon</span>
            <DecoLine set={set} bin="weapon" />
          </span>
          <span className="flex items-center gap-[0.8rem] text-fine">
            <Slots count={weaponSlots} />
            <span className="text-sub leading-none text-white/35" aria-hidden="true">
              ›
            </span>
          </span>
        </button>
      </li>
      {ARMOR_SLOTS.map((slot) => {
        const i = set.pieces.findIndex((p) => p.slot === slot);
        const p = set.pieces[i];
        if (!p) return null;
        const locked = isLocked(p);
        const alts = set.alternatives[i]?.length ?? 0;
        return (
          <li key={slot}>
            <button
              type="button"
              className={cn(pressable, row)}
              aria-label={`${SLOT_LABELS[slot]}: ${p.name}${locked ? ", always used" : ""}. Options`}
              onClick={() => onPiece(p, i)}
            >
              <Icon type={slot} size="mini" rarity={p.rarity} alt="" className="mr-0" />
              <span className="flex min-w-0 flex-col gap-[0.2rem]">
                <span className="flex min-w-0 items-center gap-[0.8rem]">
                  <span className="truncate text-sub text-white">{p.name}</span>
                  {alts > 0 && (
                    <span className="flex-none text-fine text-white/40" title="Swaps">
                      +{alts}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-[1rem] gap-y-[0.2rem] empty:hidden">
                  <DecoLine set={set} bin={slot} />
                  {locked && (
                    <span className="border border-stat px-[0.4rem] text-fine leading-[1.3] text-stat">
                      Always used
                    </span>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-[0.8rem] text-fine">
                <Slots count={p.slots} />
                <span className="text-sub leading-none text-white/35" aria-hidden="true">
                  ›
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The activated skills as one wrapped line: wanted in yellow, others in white, bad in red. */
function SkillLine({ set, wanted }: { set: Pick<ArmorSet, "skills">; wanted: string[] }) {
  if (set.skills.length === 0) return <p className="m-0 text-small text-white/40">None</p>;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-[1.2rem] gap-y-[0.4rem] p-0 text-small">
      {set.skills.map((sk) => (
        <li
          key={sk.tree}
          className={
            sk.threshold < 0
              ? "text-negative"
              : wanted.includes(sk.name)
                ? "text-stat"
                : "text-white/80"
          }
        >
          {sk.name}
        </li>
      ))}
    </ul>
  );
}

/** A piece's sheet: what it gives, swaps that keep the skills, its page, lock and exclude. */
function PieceSheet({
  piece: p,
  alternatives,
  set,
  actions,
  onClose,
}: {
  piece: Piece | null;
  alternatives: Piece[];
  set: ArmorSet;
  actions: PieceActions;
  onClose: () => void;
}) {
  const locked = p ? actions.isLocked(p) : false;
  const points = p ? Object.entries(p.points).filter(([, v]) => v !== 0) : [];
  return (
    <Sheet
      open={!!p}
      onClose={onClose}
      title={
        p && (
          <span className="flex items-center gap-[0.8rem]">
            <Icon type={p.slot} size="mini" rarity={p.rarity} className="mr-0" />
            <span className="truncate" style={{ color: rarityColor(p.rarity) }}>
              {p.name}
            </span>
          </span>
        )
      }
      footer={
        p && (
          <>
            <button
              type="button"
              className={cn(primaryButton, locked && "border-white/40 bg-line")}
              aria-label={
                locked ? `Unlock ${p.name}` : `Always use ${p.name}: lock it in every set`
              }
              onClick={() => {
                actions.onLock(p);
                onClose();
              }}
            >
              {locked ? "Unlock" : "Always use"}
            </button>
            <button
              type="button"
              className={cn(secondaryButton, "hover:border-negative hover:text-negative")}
              aria-label={`Never use ${p.name}: exclude it from the search`}
              onClick={() => {
                actions.onExclude(p);
                onClose();
              }}
            >
              Never use
            </button>
          </>
        )
      }
    >
      {p && (
        <>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-[1.6rem] gap-y-[0.6rem] text-small">
            <dt className="text-stat">Defense</dt>
            <dd className="m-0 text-white">{p.defence}</dd>
            <dt className="text-stat">Slots</dt>
            <dd className="m-0">
              <Slots count={p.slots} />
            </dd>
            <dt className="text-stat">Skills</dt>
            <dd className="m-0 flex flex-wrap gap-x-[1.2rem]">
              {points.length === 0 && "-"}
              {points.map(([tree, v]) => (
                <span key={tree} className={v < 0 ? "text-negative" : "text-white"}>
                  {tree} {signed(v)}
                </span>
              ))}
            </dd>
            <dt className="text-stat">Jewels</dt>
            <dd className="m-0">
              {decoSummary(set, p.slot).length ? <DecoLine set={set} bin={p.slot} /> : "-"}
            </dd>
          </dl>
          {alternatives.length > 0 && (
            <div className="flex flex-col gap-[0.6rem]">
              <span className={ui.statusLabel}>Swaps that keep your skills</span>
              <p className={ui.note}>
                Their other skills differ, so a swap can add or remove a skill.
              </p>
              <ul className="m-0 flex list-none flex-col p-0">
                {alternatives.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      className={cn(
                        pressable,
                        "flex min-h-[4.4rem] items-center gap-[0.8rem] border-b border-white/10 px-[0.4rem] text-small",
                      )}
                    >
                      <Icon type={a.slot} size="mini" rarity={a.rarity} className="mr-0 scale-75" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-fine text-white/50">DEF {a.defence}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={p.href} className="text-small text-white/70 underline hover:text-white">
            Open {p.name}&apos;s page
          </Link>
        </>
      )}
    </Sheet>
  );
}
