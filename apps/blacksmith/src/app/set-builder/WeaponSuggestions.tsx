"use client";

/**
 * The weapon row's sheet on a search result: weapons with room for the
 * jewels the search put in the weapon (at least its weapon slots), that the
 * hunter can make at the search's rank and quest progress, strongest first,
 * one weapon class at a time. Owned weapons have gold names, as in the
 * weapon trees.
 */
import Link from "next/link";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import { Slots } from "@/components/DetailPanel";
import { IconChoices, type IconChoice } from "@/components/SettingRows";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { useWeaponList } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import type { ArmorRank, WeaponType } from "@/lib/constants";
import { rankName, tierLabel, type Tier } from "@/lib/min-rank";
import { titleCase } from "@/lib/title-case";
import type { Weapon } from "@/lib/types";
import { suggestWeapons, weaponTypesFor } from "@/lib/weapon-suggest";
import { pressable } from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import Sheet from "./Sheet";

const typeLabel = titleCase;

export default function WeaponSuggestions({
  open,
  onClose,
  type,
  onType,
  hunterType,
  slots,
  rank,
  progress,
}: {
  open: boolean;
  onClose: () => void;
  /** The weapon class shown. */
  type: WeaponType;
  onType: (type: WeaponType) => void;
  hunterType: string;
  /** The search's weapon slots, rank and quest progress. */
  slots: number;
  rank: ArmorRank;
  progress: Tier | null;
}) {
  const choices: IconChoice<WeaponType>[] = weaponTypesFor(hunterType).map((t) => ({
    value: t,
    label: typeLabel(t),
    icon: (checked) => <Icon type={t} size="mini" nav active={checked} className="mr-0" />,
  }));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={
        <span className="flex items-center gap-[0.8rem]">
          <Icon type={type} size="mini" className="mr-0" />
          <span className="truncate">{typeLabel(type)}</span>
        </span>
      }
    >
      <div className="-mx-[0.4rem] flex-none overflow-x-auto px-[0.4rem] pb-[0.4rem]">
        <IconChoices label="Weapon class" choices={choices} value={type} onChange={onType} />
      </div>
      <p className={ui.note}>
        Strongest first
        {slots > 0 && `, with ${slots === 1 ? "a slot" : `${slots} slots`} or more for the jewels`},
        up to {rankName(rank)}
        {progress && ` and your quest progress (${tierLabel(progress)})`}.
      </p>
      {open && <WeaponList type={type} slots={slots} rank={rank} progress={progress} />}
    </Sheet>
  );
}

function WeaponList({
  type,
  slots,
  rank,
  progress,
}: {
  type: WeaponType;
  slots: number;
  rank: ArmorRank;
  progress: Tier | null;
}) {
  const { item: weapons, loading } = useWeaponList(type);
  const hunter = useHunterProgress();
  if (loading || !weapons) return <Loading>Loading weapons…</Loading>;
  const found = suggestWeapons(weapons, { slots, rank, progress });
  if (found.length === 0) {
    return <p className={ui.note}>None of these fit. Try another class, or fewer weapon slots.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {found.map((w) => {
        const href = `/blacksmith/${type}/${w.slug}/`;
        const owned = hunter.active && hunter.isOwned(href);
        return (
          <li key={w.slug}>
            <Link
              href={href}
              className={cn(
                pressable,
                "grid min-h-[5.2rem] grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-x-[1rem] border-b border-white/10 px-[0.6rem] py-[0.6rem]",
              )}
            >
              <Icon type={type} size="mini" rarity={w.rarity} color={w.color} className="mr-0" />
              <span className="flex min-w-0 flex-col gap-[0.2rem]">
                <span className={cn("truncate text-sub", owned ? "text-gold" : "text-white")}>
                  {w.name}
                  {owned && <span className="sr-only"> (owned)</span>}
                </span>
                <WeaponStats weapon={w} />
              </span>
              <span className="text-fine">
                <Slots count={w.slots ?? 0} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "ATK 1296  [Dragon] 520  10%": attack, elements and affinity on one line. */
function WeaponStats({ weapon: w }: { weapon: Weapon }) {
  const affinity = w.affinity && w.affinity !== "0%" ? w.affinity : null;
  return (
    <span className="flex flex-wrap items-center gap-x-[1rem] text-fine text-white/65">
      <span>ATK {w.attack ?? "-"}</span>
      {w.elements?.map((e) => (
        <span key={e.name} className="flex items-center gap-[0.2rem]">
          <img
            src={`/images/${e.name.toLowerCase()}.png`}
            alt={e.name}
            className="size-[1.4rem] pixelated"
          />
          {e.attack}
        </span>
      ))}
      {affinity && (
        <span className={affinity.startsWith("-") ? "text-negative" : "text-positive"}>
          {affinity}
        </span>
      )}
    </span>
  );
}
