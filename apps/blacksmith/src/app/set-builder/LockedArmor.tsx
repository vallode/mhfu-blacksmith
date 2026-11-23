"use client";

/**
 * Locking armor pieces by hand, on the search card: every set the search
 * finds uses the locked pieces. They show as chips under the skills
 * (LockChips); "+ Always use a piece" opens a sheet with a row per slot
 * (LockRows), and a row or a chip opens that slot's piece picker.
 */
import { useEffect, useRef } from "react";
import Icon from "@/components/Icon";
import { useGameText, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS, type ArmorSlot } from "@/lib/constants";
import type { Piece } from "@/lib/set-search";
import { chip, chipOff, chipOn, pressable, resultRow } from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import type { Form } from "./SearchOptions";

/**
 * The form with `piece` locked into its slot (one per slot, and no longer
 * excluded), or with nothing locked in `slot` when `piece` is null.
 */
export function withLock(
  form: Form,
  slot: ArmorSlot,
  piece: Piece | null,
  slotOf: (href: string) => ArmorSlot | undefined,
): Form {
  const locked = form.locked.filter((h) => slotOf(h) !== slot);
  if (!piece) return { ...form, locked };
  return {
    ...form,
    locked: [...locked, piece.href],
    excluded: form.excluded.filter((h) => h !== piece.href),
  };
}

interface LockProps {
  /** The locked pieces, at most one per slot. */
  pieces: Piece[];
  /** Open the picker for a slot. */
  onPick: (slot: ArmorSlot) => void;
  onRemove: (slot: ArmorSlot) => void;
}

/**
 * A row per slot with its locked piece ("Any" without one), for the lock
 * sheet: a tap picks it, × takes it off.
 */
export function LockRows({
  pieces,
  onPick,
  onRemove,
  focusSlot,
}: LockProps & {
  /** The slot whose row takes the focus on mount (back from its picker). */
  focusSlot?: ArmorSlot | null;
}) {
  const t = useT();
  const text = t.setBuilder.form.locked;
  const game = useGameText();
  const focusRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    focusRef.current?.focus();
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <ul className="m-0 list-none p-0">
      {ARMOR_SLOTS.map((slot) => {
        const p = pieces.find((x) => x.slot === slot);
        const name = p ? game.name("armor", p.name) : null;
        const slotName = t.common.armorSlots[slot];
        return (
          <li key={slot} className="flex items-stretch">
            <button
              ref={slot === focusSlot ? focusRef : undefined}
              type="button"
              className={cn(pressable, resultRow, "min-h-[4.4rem] flex-1 py-[0.2rem]")}
              aria-label={text.pick(slotName, name)}
              onClick={() => onPick(slot)}
            >
              <Icon
                type={slot}
                size="mini"
                rarity={p?.rarity}
                alt=""
                className={cn("mr-0", !p && "opacity-40")}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-fine leading-tight text-parchment">{slotName}</span>
                <span
                  className={cn(
                    "truncate text-sub leading-tight",
                    p ? "text-stat" : "text-white/40",
                  )}
                >
                  {name ?? text.any}
                </span>
              </span>
              <span className="text-white/35" aria-hidden="true">
                ›
              </span>
            </button>
            {p && name && (
              <button
                type="button"
                className="flex w-[4rem] flex-none cursor-pointer items-center justify-center border-0 border-b border-white/10 bg-transparent p-0 text-sub leading-none text-white/50 hover:text-negative focus-visible:text-negative focus-visible:outline-none"
                aria-label={text.remove(name)}
                onClick={() => onRemove(slot)}
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Locked pieces as chips like the skills', and a chip to lock one. */
export function LockChips({ pieces, onPick, onRemove, onAdd }: LockProps & { onAdd: () => void }) {
  const t = useT();
  const text = t.setBuilder.form.locked;
  const game = useGameText();
  const locked = ARMOR_SLOTS.flatMap((slot) => {
    const p = pieces.find((x) => x.slot === slot);
    return p ? [p] : [];
  });
  return (
    <div className="flex flex-col gap-[0.8rem] border-t border-white/15 pt-[0.8rem]">
      <span className="text-small text-white">{text.title}</span>
      <ul className="m-0 flex list-none flex-wrap gap-[0.8rem] p-0">
        {locked.map((p) => {
          const name = game.name("armor", p.name);
          return (
            <li key={p.slot} className={cn(chip, chipOn, "cursor-default gap-0 pr-0 pl-0")}>
              <button
                type="button"
                className="flex min-h-[3.2rem] cursor-pointer items-center gap-[0.6rem] border-none bg-transparent pl-[0.8rem] font-[inherit] text-small text-stat"
                aria-label={text.pick(t.common.armorSlots[p.slot], name)}
                onClick={() => onPick(p.slot)}
              >
                <Icon
                  type={p.slot}
                  size="mini"
                  rarity={p.rarity}
                  alt=""
                  className="mr-0 scale-75"
                />
                {name}
              </button>
              <button
                type="button"
                aria-label={text.remove(name)}
                className="flex size-[3.2rem] cursor-pointer items-center justify-center border-none bg-transparent p-0 text-sub leading-none text-stat/70 hover:text-negative focus-visible:text-negative"
                onClick={() => onRemove(p.slot)}
              >
                ×
              </button>
            </li>
          );
        })}
        {locked.length < ARMOR_SLOTS.length && (
          <li>
            <button type="button" className={cn(chip, chipOff, "border-dashed")} onClick={onAdd}>
              {text.add}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The note over the slot rows in the lock sheet. */
export function LockNote() {
  return <p className={ui.note}>{useT().setBuilder.form.locked.note}</p>;
}
