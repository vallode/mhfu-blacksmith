"use client";

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
 * The damage calculator's bestiary: a wall of monster portraits, narrowed by
 * type (`category`: 0 for all, else MONSTER_CATEGORIES' index + 1), or
 * only the monsters given when a quest picks them, with no type to narrow.
 */
export function MonsterGrid({
  monsters,
  current,
  onPick,
  category,
  setCategory,
  narrowed,
}: {
  monsters: HitzoneMonster[];
  /** The monster struck, outlined. */
  current: string | null;
  onPick: (monster: HitzoneMonster) => void;
  category: number;
  setCategory: (category: number) => void;
  /** The monsters are a quest's few: no type selector. */
  narrowed?: boolean;
}) {
  const t = useT();
  const tb = t.motionValues.bestiary;
  const monsterName = useMonsterName();
  const shown =
    narrowed || !category
      ? monsters
      : monsters.filter((m) => m.category === MONSTER_CATEGORIES[category - 1]);

  return (
    <div className="flex flex-col gap-[0.8rem]">
      {!narrowed && (
        <Choice
          label={tb.type}
          options={[tb.allTypes, ...MONSTER_CATEGORIES.map((c) => t.common.monsterCategories[c])]}
          index={category}
          onChange={setCategory}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.8rem,1fr))] gap-[0.4rem]">
        {shown.map((m) => (
          <button
            key={m.slug}
            type="button"
            title={monsterName(m)}
            aria-label={monsterName(m)}
            aria-pressed={m.slug === current}
            onClick={() => onPick(m)}
            className={cn(
              "flex aspect-square items-center justify-center bg-line outline-offset-[-0.2rem] hover:bg-selector",
              m.slug === current && "bg-selector outline-[0.2rem] outline-gold outline-solid",
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
    </div>
  );
}

/** The part a monster is struck on first: its weakest for the weapon. */
export const weakestPart = (m: HitzoneMonster, valueOf: (p: PartValues) => number): HitzoneSpot => {
  const { part, ...values } = m.parts.reduce((best, p) => (valueOf(p) > valueOf(best) ? p : best));
  return { slug: m.slug, part, ...values };
};

/**
 * A monster's parts as buttons, each edged in its value's heat colour, blue
 * for hard to red for weak: the damage table's quick switch between them.
 */
export function PartChips({
  monster,
  valueOf,
  spot,
  onPick,
}: {
  monster: HitzoneMonster;
  /** The value each part shows: the column, or weighted columns, the weapon's hits use. */
  valueOf: (part: PartValues) => number;
  spot: HitzoneSpot | null;
  onPick: (spot: HitzoneSpot) => void;
}) {
  const t = useT();
  const { formatNumber } = useLocale();
  return (
    <div className="flex flex-wrap gap-[0.6rem]" role="group" aria-label={t.motionValues.hitzone}>
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
  );
}
