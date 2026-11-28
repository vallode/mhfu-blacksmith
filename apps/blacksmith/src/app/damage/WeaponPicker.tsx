"use client";

/**
 * The damage calculator's weapon picker, in a sheet: a weapon type, a
 * search by name, and that type's weapons, strongest first.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import { SelectorRow } from "@/components/SettingRows";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { useWeaponList } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import type { WeaponRef } from "@/lib/damage-store";
import * as ui from "@/styles/settings";

/** Rows shown at once; the search narrows the rest. */
const MAX_ROWS = 150;

const row =
  "grid w-full cursor-pointer grid-cols-[3.8rem_minmax(0,1fr)_auto] items-center gap-x-[0.8rem] border-0 border-b border-white/15 bg-transparent px-[0.4rem] py-[0.6rem] text-left font-[inherit] text-small text-white hover:hover-glow focus-visible:hover-glow focus-visible:outline-none";

export default function WeaponPicker({
  current,
  onPick,
}: {
  current: WeaponRef | null;
  onPick: (weapon: WeaponRef) => void;
}) {
  const t = useT();
  const text = t.motionValues.page;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const [type, setType] = useState<WeaponType>(current?.type ?? "great-sword");
  const [query, setQuery] = useState("");
  const { item: weapons, loading } = useWeaponList(type);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (weapons ?? [])
      .filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          game.name("weapon", w.name).toLowerCase().includes(q),
      )
      .sort((a, b) => (b.attack ?? 0) - (a.attack ?? 0));
  }, [weapons, query, game]);

  return (
    <>
      <SelectorRow
        label={t.equipment.nav.weaponType}
        choices={WEAPON_TYPES.map((w) => ({ value: w, label: t.common.weaponTypes[w] }))}
        value={type}
        onChange={setType}
      />
      <input
        className={ui.searchInput}
        type="search"
        aria-label={text.searchWeapons}
        placeholder={text.searchPlaceholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? (
        <Loading>{t.common.loading}</Loading>
      ) : list.length === 0 ? (
        <p className={ui.note}>{text.noWeapons}</p>
      ) : (
        <div className="flex flex-col">
          {list.slice(0, MAX_ROWS).map((w) => {
            const picked = current?.type === type && current.slug === w.slug;
            return (
              <button
                key={w.slug}
                type="button"
                aria-pressed={picked}
                className={cn(row, picked && "bg-accent")}
                onClick={() => onPick({ type, slug: w.slug })}
              >
                <Icon type={w.type} rarity={w.rarity} color={w.color} alt="" />
                <span className="min-w-0 truncate">{game.name("weapon", w.name)}</span>
                <span className="flex items-center gap-[0.8rem] text-fine whitespace-nowrap">
                  {w.elements?.map((e) => (
                    <span key={e.name} className="text-element">
                      {t.common.elements[e.name] ?? e.name} {formatNumber(e.attack)}
                    </span>
                  ))}
                  <span className="text-stat">{formatNumber(w.attack ?? 0)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
