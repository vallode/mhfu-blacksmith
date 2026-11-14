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
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS, type ArmorRank, type WeaponType } from "@/lib/constants";
import { readLastWeapon } from "@/lib/last-weapon";
import { usedSlots } from "@/lib/set-build";
import type { Tier } from "@/lib/min-rank";
import type { ArmorSet, DecoBin, Piece, SortKey } from "@/lib/set-search";
import { pressable, primaryButton, resultRow, secondaryButton } from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import { binLabel, SetHeader } from "./ArmorSetView";
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

/** Each element's resistance name, in the status messages. */
const RES_KEYS = {
  fire: "fireRes",
  water: "waterRes",
  thunder: "thunderRes",
  ice: "iceRes",
  dragon: "dragonRes",
} as const;

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
  weaponClass,
  onWeaponClass,
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
  /** The weapon class chosen for the suggestions (kept with the form), if any. */
  weaponClass: WeaponType | null;
  onWeaponClass: (type: WeaponType) => void;
  /** What the sets are sorted by, highlighted in the status strip. */
  sort?: SortKey;
  /** The wanted skills, highlighted under [Activate Skill]. */
  wanted: string[];
  actions: PieceActions;
  /** Notes under the selector bar (the search stopped early). */
  children?: React.ReactNode;
}) {
  const text = useT().setBuilder;
  const [picked, setPicked] = useState<{ piece: Piece; index: number } | null>(null);
  const [weaponsOpen, setWeaponsOpen] = useState(false);
  // The weapon class suggested: the last one chosen in the sheet, else the
  // last browsed on the site, if the hunter type uses it.
  // (Results only render in the browser, after a search, so storage is there.)
  const chosenType = weaponClass ?? readLastWeapon();
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
          <h3 className="m-0 text-sub font-normal text-stat">{text.setView.activeSkills}</h3>
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
        onType={onWeaponClass}
        hunterType={hunterType}
        slots={usedSlots(set, "weapon")}
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
  const text = useT().setBuilder;
  const { formatNumber } = useLocale();
  return (
    <div className="flex items-center gap-[1.4rem]">
      <div className="flex flex-none flex-col items-start leading-none">
        <span className="text-fine text-parchment">{text.result.def}</span>
        <span
          className={cn(
            "text-[2.8rem] text-shadow-[0.15rem_0.15rem_black]",
            sort === "defence" ? "text-stat" : "text-white",
          )}
        >
          {formatNumber(set.defence)}
        </span>
      </div>
      <ul
        className="m-0 grid min-w-0 flex-1 list-none grid-cols-5 gap-[0.4rem] p-0"
        aria-label={text.result.resistances}
      >
        {ELEMENTS.map((el, i) => (
          <li
            key={el}
            className={cn(
              "flex flex-col items-center gap-[0.2rem] py-[0.2rem]",
              sort === el && "bg-stat/15 outline outline-stat/60",
            )}
          >
            <img
              src={`/images/${el}.png`}
              alt={text.status[RES_KEYS[el]]}
              className="size-[1.6rem] pixelated"
            />
            <span className={cn("text-fine leading-none", resColor(set.res[i]))}>
              {signed(set.res[i])}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-none flex-col items-end leading-none">
        <span className="text-fine text-parchment">{text.result.free}</span>
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
  const game = useGameText();
  const decos = decoSummary(set, bin);
  if (decos.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-[1rem] text-fine text-white/65">
      {decos.map((d) => (
        <span key={d.name} className="flex items-center">
          <Icon type="decoration" size="mini" color={d.color} className="mr-[0.2rem] scale-75" />
          {game.name("decoration", d.name)}
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
  const t = useT();
  const text = t.setBuilder;
  const game = useGameText();
  const row = resultRow;
  return (
    <ul className="m-0 list-none p-0">
      <li>
        <button
          type="button"
          className={cn(pressable, row, decoSummary(set, "weapon").length === 0 && "min-h-[4rem]")}
          aria-haspopup="dialog"
          onClick={onWeapon}
        >
          <Icon type={weaponType} size="mini" alt="" className="mr-0" />
          <span className="flex min-w-0 flex-col gap-[0.2rem]">
            <span className="text-small text-white/55">
              <span aria-hidden="true">{text.setView.weapon}</span>
              <span className="sr-only">{text.result.weaponRow}</span>
            </span>
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
        const name = game.name("armor", p.name);
        return (
          <li key={slot}>
            <button
              type="button"
              className={cn(pressable, row)}
              aria-label={text.result.pieceLabel(binLabel(t, slot), name, locked)}
              onClick={() => onPiece(p, i)}
            >
              <Icon type={slot} size="mini" rarity={p.rarity} alt="" className="mr-0" />
              <span className="flex min-w-0 flex-col gap-[0.2rem]">
                <span className="flex min-w-0 items-center gap-[0.8rem]">
                  <span className="truncate text-sub text-white">{name}</span>
                  {alts > 0 && (
                    <span className="flex-none text-fine text-white/40" title={text.result.swaps}>
                      +{alts}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-[1rem] gap-y-[0.2rem] empty:hidden">
                  <DecoLine set={set} bin={slot} />
                  {locked && (
                    <span className="border border-stat px-[0.4rem] text-fine leading-[1.3] text-stat">
                      {text.result.alwaysUsed}
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
  const text = useT().setBuilder.setView;
  const game = useGameText();
  if (set.skills.length === 0) {
    return <p className="m-0 text-small text-white/40">{text.noSkills}</p>;
  }
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
          {game.name("skill", sk.name)}
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
  const t = useT();
  const text = t.setBuilder.result;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const name = p ? game.name("armor", p.name) : "";
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
              {name}
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
              aria-label={locked ? text.unlockLabel(name) : text.alwaysUseLabel(name)}
              onClick={() => {
                actions.onLock(p);
                onClose();
              }}
            >
              {locked ? text.unlock : text.alwaysUse}
            </button>
            <button
              type="button"
              className={cn(secondaryButton, "hover:border-negative hover:text-negative")}
              aria-label={text.neverUseLabel(name)}
              onClick={() => {
                actions.onExclude(p);
                onClose();
              }}
            >
              {text.neverUse}
            </button>
          </>
        )
      }
    >
      {p && (
        <>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-[1.6rem] gap-y-[0.6rem] text-small">
            <dt className="text-stat">{text.defense}</dt>
            <dd className="m-0 text-white">{formatNumber(p.defence)}</dd>
            <dt className="text-stat">{text.slots}</dt>
            <dd className="m-0">
              <Slots count={p.slots} />
            </dd>
            <dt className="text-stat">{text.skills}</dt>
            <dd className="m-0 flex flex-wrap gap-x-[1.2rem]">
              {points.length === 0 && "-"}
              {points.map(([tree, v]) => (
                <span key={tree} className={v < 0 ? "text-negative" : "text-white"}>
                  {game.name("skill", tree)} {signed(v)}
                </span>
              ))}
            </dd>
            <dt className="text-stat">{text.jewels}</dt>
            <dd className="m-0">
              {decoSummary(set, p.slot).length ? <DecoLine set={set} bin={p.slot} /> : "-"}
            </dd>
          </dl>
          {alternatives.length > 0 && (
            <div className="flex flex-col gap-[0.6rem]">
              <span className={ui.statusLabel}>{text.swapsTitle}</span>
              <p className={ui.note}>{t.setBuilder.setView.alternativesNote}</p>
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
                      <span className="flex-1 truncate">{game.name("armor", a.name)}</span>
                      <span className="text-fine text-white/50">
                        {text.defValue(formatNumber(a.defence))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={p.href} className="text-small text-white/70 underline hover:text-white">
            {text.openPage(name)}
          </Link>
        </>
      )}
    </Sheet>
  );
}
