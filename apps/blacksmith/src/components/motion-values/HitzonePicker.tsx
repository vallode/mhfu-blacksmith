"use client";

import { useState } from "react";
import Choice from "./Choice";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { MONSTER_CATEGORIES } from "@/lib/constants";
import {
  hitzoneHeat,
  type HitzoneMonster,
  type HitzoneSpot,
  type PartValues,
} from "@/lib/hitzone-pick";
import { partLabel } from "@/lib/i18n/monster-labels";

// Some monsters have no art; keep the layout and hide the broken-image glyph.
const hideBroken: React.ReactEventHandler<HTMLImageElement> = (e) => {
  e.currentTarget.style.visibility = "hidden";
};

/** A monster's name in the site's language. */
export function useMonsterName() {
  const game = useGameText();
  return (m: HitzoneMonster) => game.name("monster", m.name);
}

/**
 * The damage calculator's hitzone picker, a bestiary: a wall of monster
 * portraits (narrowed by type), then the picked monster's parts, each edged
 * in its value's heat colour, blue for hard to red for weak.
 */
export default function HitzonePicker({
  monsters,
  valueOf,
  spot,
  onPick,
}: {
  monsters: HitzoneMonster[];
  /** The value each part shows: the column, or weighted columns, the weapon's hits use. */
  valueOf: (part: PartValues) => number;
  spot: HitzoneSpot | null;
  onPick: (spot: HitzoneSpot) => void;
}) {
  const t = useT();
  const tb = t.motionValues.bestiary;
  const { formatNumber } = useLocale();
  const monsterName = useMonsterName();
  const [category, setCategory] = useState(0);
  const [slug, setSlug] = useState(spot?.slug ?? null);
  const shown = category
    ? monsters.filter((m) => m.category === MONSTER_CATEGORIES[category - 1])
    : monsters;
  const monster = monsters.find((m) => m.slug === slug);

  return (
    <div className="flex flex-col gap-[0.8rem]">
      <Choice
        label={tb.type}
        options={[tb.allTypes, ...MONSTER_CATEGORIES.map((c) => t.common.monsterCategories[c])]}
        index={category}
        onChange={setCategory}
      />
      <div className="grid max-h-[19.2rem] grid-cols-[repeat(auto-fill,minmax(4.8rem,1fr))] gap-[0.4rem] overflow-y-auto">
        {shown.map((m) => (
          <button
            key={m.slug}
            type="button"
            title={monsterName(m)}
            aria-label={monsterName(m)}
            aria-pressed={m.slug === slug}
            onClick={() => setSlug(m.slug)}
            className={cn(
              "flex aspect-square items-center justify-center bg-line outline-offset-[-0.2rem] hover:bg-selector",
              m.slug === slug && "bg-selector outline-[0.2rem] outline-gold outline-solid",
            )}
          >
            <img
              className="size-[4rem] object-contain pixelated"
              src={`/images/monsters/${m.slug}.png`}
              alt=""
              loading="lazy"
              onError={hideBroken}
            />
          </button>
        ))}
      </div>
      {monster ? (
        <div className="flex flex-col gap-[0.6rem]">
          <p className="text-main text-gold">{monsterName(monster)}</p>
          <div className="flex flex-wrap gap-[0.6rem]">
            {monster.parts.map(({ part, ...values }) => {
              const value = valueOf(values);
              const picked = spot?.slug === monster.slug && spot.part === part;
              return (
                <button
                  key={part}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onPick({ slug: monster.slug, part, ...values })}
                  className={cn(
                    "flex items-center gap-[0.8rem] border-l-[0.4rem] px-[1rem] py-[0.4rem] text-sub",
                    picked ? "bg-accent text-white" : "bg-selector hover:bg-selector-lit",
                  )}
                  style={{ borderLeftColor: hitzoneHeat(value) }}
                >
                  <span>{partLabel(t, part)}</span>
                  <span className="tabular-nums" style={{ color: hitzoneHeat(value) }}>
                    {formatNumber(value)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-small text-muted">{tb.pickMonster}</p>
      )}
    </div>
  );
}
