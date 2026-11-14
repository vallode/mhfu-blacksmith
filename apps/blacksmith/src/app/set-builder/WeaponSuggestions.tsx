"use client";

/**
 * The weapon row's sheet on a search result: weapons with room for the
 * jewels the search put in the weapon (at least its weapon slots), that the
 * hunter can make at the search's rank and quest progress, strongest first,
 * one weapon class at a time. Owned weapons have gold names, as in the
 * weapon trees.
 */
import { useMemo } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import { Slots } from "@/components/DetailPanel";
import { IconChoices, type IconChoice } from "@/components/SettingRows";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { useWeaponList } from "@/lib/client-data";
import type { ArmorRank, WeaponType } from "@/lib/constants";
import { weaponHref } from "@/lib/equipment-ref";
import type { Tier } from "@/lib/min-rank";
import type { Weapon } from "@/lib/types";
import { suggestWeapons, weaponTypesFor } from "@/lib/weapon-suggest";
import { cn } from "@/lib/cn";
import { pressable, resultRow } from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import Sheet from "./Sheet";

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
  /** The slots the result's weapon jewels take, and the search's rank and quest progress. */
  slots: number;
  rank: ArmorRank;
  progress: Tier | null;
}) {
  const t = useT();
  const choices: IconChoice<WeaponType>[] = weaponTypesFor(hunterType).map((w) => ({
    value: w,
    label: t.common.weaponTypes[w],
    icon: (checked) => <Icon type={w} size="mini" nav active={checked} className="mr-0" />,
  }));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={
        <span className="flex items-center gap-[0.8rem]">
          <Icon type={type} size="mini" className="mr-0" />
          <span className="truncate">{t.common.weaponTypes[type]}</span>
        </span>
      }
    >
      <div className="-mx-[0.4rem] flex-none overflow-x-auto px-[0.4rem] pb-[0.4rem]">
        <IconChoices
          label={t.setBuilder.form.weaponClass}
          choices={choices}
          value={type}
          onChange={onType}
        />
      </div>
      <p className={ui.note}>
        {t.setBuilder.weapons.note(
          slots,
          t.common.ranks[rank],
          progress && t.equipment.tierLabel(progress),
        )}
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
  const t = useT();
  const text = t.setBuilder.weapons;
  const game = useGameText();
  const { item: weapons, loading } = useWeaponList(type);
  const hunter = useHunterProgress();
  const found = useMemo(
    () => (weapons ? suggestWeapons(weapons, { slots, rank, progress }) : []),
    [weapons, slots, rank, progress],
  );
  if (loading || !weapons) return <Loading>{text.loading}</Loading>;
  if (found.length === 0) return <p className={ui.note}>{text.none}</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {found.map((w) => {
        const href = weaponHref(type, w.slug);
        const owned = hunter.active && hunter.isOwned(href);
        return (
          <li key={w.slug}>
            <Link href={href} className={cn(pressable, resultRow)}>
              <Icon type={type} size="mini" rarity={w.rarity} color={w.color} className="mr-0" />
              <span className="flex min-w-0 flex-col gap-[0.2rem]">
                <span className={cn("truncate text-sub", owned ? "text-gold" : "text-white")}>
                  {game.name("weapon", w.name)}
                  {owned && <span className="sr-only">{t.equipment.tree.ownedNote}</span>}
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
  const t = useT();
  const { formatNumber } = useLocale();
  const affinity = w.affinity && w.affinity !== "0%" ? w.affinity : null;
  return (
    <span className="flex flex-wrap items-center gap-x-[1rem] text-fine text-white/65">
      <span>{t.setBuilder.weapons.attack(w.attack == null ? "-" : formatNumber(w.attack))}</span>
      {w.elements?.map((e) => (
        <span key={e.name} className="flex items-center gap-[0.2rem]">
          <img
            src={`/images/${e.name.toLowerCase()}.png`}
            alt={t.common.elements[e.name] ?? e.name}
            className="size-[1.4rem] pixelated"
          />
          {formatNumber(e.attack)}
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
