"use client";

/**
 * What the damage calculator strikes: a hitzone set by hand (and the
 * element hitzones the weapon's attributes use), or a monster's part from
 * the bestiary. The damage page shows it as a row (`TargetSummary`) that
 * opens the picker (`TargetPicker`) in a sheet, and over the damage table
 * (`HitzoneBar`), to switch parts or values quickly.
 */
import Choice from "./Choice";
import Loading from "@/components/Loading";
import { MonsterGrid, PartChips, useMonsterName, weakestPart } from "./HitzonePicker";
import type { ElementZones, HitzoneState } from "./hitzone-state";
import { cap } from "./MotionDamage";
import { useLocale, useT } from "@/context/LanguageContext";
import { useHitzoneMonsters, useMotionValues, useShots } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import type { WeaponType } from "@/lib/constants";
import { weaponAttributes } from "@/lib/damage-buffs";
import {
  ELEMENT_HITZONES,
  HITZONES,
  spotValue,
  stepsWith,
  type PartValues,
} from "@/lib/hitzone-pick";
import { partLabel } from "@/lib/i18n/monster-labels";
import { loadsShot, SHOT_ELEMENTS, type ShotElement } from "@/lib/shots";
import type { Weapon } from "@/lib/types";

/** How a weapon reads a target. */
export interface Target {
  /** A part's value for the weapon: its shot column, or the columns its moves weigh. */
  valueOf: (part: PartValues) => number;
  /** The elements the weapon deals, each with its own hitzone. */
  elements: ShotElement[];
  /** A bowgun's: one element hitzone set by hand for every shot's element. */
  shared: boolean;
}

/** How `weapon` reads a target, once its moves (or shots) are loaded. */
export function useTarget(type: WeaponType | null, weapon: Weapon | null): Target | null {
  const { moves } = useMotionValues(type);
  const { shots } = useShots();
  if (!type || !weapon) return null;
  if (type === "light-bowgun" || type === "heavy-bowgun") {
    if (!shots) return null;
    const loaded = shots.shots.filter((s) => loadsShot(weapon, s));
    const elemental = loaded.some((s) => s.element || s.explosion?.element);
    return { valueOf: (p) => p.shot, elements: elemental ? [...SHOT_ELEMENTS] : [], shared: true };
  }
  // The weights most of the type's moves use, to show a part's value. A move
  // with its own (Great Sword charges, the Lance's charge at full speed)
  // takes the part's columns with those, so no one value matches every move.
  const weights = moves?.[0]?.hitzone_weights;
  if (!weights) return null;
  const elements = [
    ...new Set(weaponAttributes(weapon.elements).flatMap((a) => (a.type ? [a.type] : []))),
  ];
  return { valueOf: (p) => spotValue(p, weights), elements, shared: false };
}

/** The target's row on the damage page: the part picked, then its values. */
export function TargetSummary({ target, hitzone }: { target: Target; hitzone: HitzoneState }) {
  const t = useT();
  const tm = t.motionValues;
  const { formatNumber } = useLocale();
  const { monsters } = useHitzoneMonsters();
  const monsterName = useMonsterName();
  const { zone, elementZones, spot } = hitzone;
  const spotMonster = spot && monsters?.find((m) => m.slug === spot.slug);
  const elementValue = (e: ShotElement) => (spot ? spot[e] : elementZones[e]);
  // A bowgun with a part picked takes each shot's element from its column,
  // too many to list; set by hand, they share one.
  const elements = target.shared ? (spot ? [] : target.elements.slice(0, 1)) : target.elements;

  return (
    <span className="flex min-w-0 flex-col gap-[0.4rem]">
      <span className="text-fine text-parchment">{tm.page.target}</span>
      <span className="whitespace-normal text-white">
        {spotMonster
          ? tm.bestiary.spot(monsterName(spotMonster), partLabel(t, spot.part))
          : tm.page.handSet}
      </span>
      <span className="flex flex-wrap gap-x-[1.2rem] text-fine text-parchment">
        <span>
          {tm.hitzone}{" "}
          <span className="text-white">{formatNumber(spot ? target.valueOf(spot) : zone)}</span>
        </span>
        {elements.map((e) => (
          <span key={e} className="text-element">
            {target.shared ? tm.element : (t.common.elements[cap(e)] ?? e)}{" "}
            {formatNumber(elementValue(e))}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * The hitzone struck, over the damage table, to compare quickly: the picked
 * monster's parts, or the hitzone and the weapon's element hitzones set by
 * hand. A value set by hand lets go of the part, keeping its values for the
 * others.
 */
export function HitzoneBar({ target, hitzone }: { target: Target; hitzone: HitzoneState }) {
  const t = useT();
  const tm = t.motionValues;
  const { formatNumber } = useLocale();
  const { monsters } = useHitzoneMonsters();
  const { zone, setZone, elementZones, setElementZones, spot, setSpot } = hitzone;
  const monster = spot && monsters?.find((m) => m.slug === spot.slug);
  if (monster)
    return <PartChips monster={monster} valueOf={target.valueOf} spot={spot} onPick={setSpot} />;
  // A part picked before the bestiary loads: no hand-set values to show yet.
  if (spot) return null;

  const zones = stepsWith(HITZONES, zone);
  const sharedSteps = stepsWith(ELEMENT_HITZONES, elementZones.fire);
  const all = (z: number) => Object.fromEntries(SHOT_ELEMENTS.map((e) => [e, z])) as ElementZones;
  return (
    <div className="flex flex-col gap-[0.4rem]">
      <Choice
        label={tm.hitzone}
        options={zones.map((z) => formatNumber(z))}
        index={zones.indexOf(zone)}
        hideCount
        onChange={(i) => setZone(zones[i]!)}
      />
      {target.shared
        ? // Shots of every element share one.
          target.elements.length > 0 && (
            <Choice
              label={tm.shots.elementHitzone}
              options={sharedSteps.map((z) => formatNumber(z))}
              index={sharedSteps.indexOf(elementZones.fire)}
              hideCount
              onChange={(i) => setElementZones(all(sharedSteps[i]!))}
            />
          )
        : target.elements.map((e) => {
            const steps = stepsWith(ELEMENT_HITZONES, elementZones[e]);
            return (
              <Choice
                key={e}
                label={tm.elementHitzone(t.common.elements[cap(e)] ?? e)}
                options={steps.map((z) => formatNumber(z))}
                index={steps.indexOf(elementZones[e])}
                hideCount
                onChange={(i) => setElementZones((z) => ({ ...z, [e]: steps[i]! }))}
              />
            );
          })}
    </div>
  );
}

/**
 * The target picker, in the damage page's sheet: the bestiary (only the
 * quest's monsters, given `only`), where a monster is struck on its weakest
 * part, or the hitzone set by hand, from the part's values. Either calls
 * `onPicked` (the page closes the sheet).
 */
export function TargetPicker({
  target,
  hitzone,
  only,
  onPicked,
}: {
  target: Target;
  hitzone: HitzoneState;
  /** The English names of the quest's large monsters. */
  only?: string[];
  onPicked: () => void;
}) {
  const t = useT();
  const tm = t.motionValues;
  const { monsters, error } = useHitzoneMonsters();
  const { setZone, setElementZones, spot, setSpot, category, setCategory } = hitzone;
  if (error) return <p className="text-small text-negative">{tm.bestiary.loadError}</p>;
  if (!monsters) return <Loading>{t.common.loading}</Loading>;
  const shown = only ? monsters.filter((m) => only.includes(m.name)) : monsters;

  return (
    <div className="flex flex-col gap-[1.2rem]">
      <button
        type="button"
        aria-pressed={!spot}
        className={cn(
          "self-start px-[1.2rem] py-[0.4rem] text-sub",
          spot ? "bg-selector hover:bg-selector-lit" : "bg-accent text-white",
        )}
        onClick={() => {
          if (spot) {
            setZone(target.valueOf(spot));
            // A bowgun's shots share one element hitzone: the part's highest.
            const shared = Math.max(...SHOT_ELEMENTS.map((x) => spot[x]));
            setElementZones(
              Object.fromEntries(
                SHOT_ELEMENTS.map((x) => [x, target.shared ? shared : spot[x]]),
              ) as ElementZones,
            );
          }
          setSpot(null);
          onPicked();
        }}
      >
        {tm.page.handSet}
      </button>
      <MonsterGrid
        monsters={shown}
        current={spot?.slug ?? null}
        onPick={(m) => {
          if (m.slug !== spot?.slug) setSpot(weakestPart(m, target.valueOf));
          onPicked();
        }}
        category={category}
        setCategory={setCategory}
        narrowed={!!only}
      />
    </div>
  );
}
