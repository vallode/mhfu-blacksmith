"use client";

import { useState } from "react";
import Choice from "./Choice";
import Loading from "@/components/Loading";
import HitzonePicker, { useMonsterName } from "./HitzonePicker";
import { useLocale, useT } from "@/context/LanguageContext";
import { useHitzoneMonsters, useMotionValues } from "@/lib/client-data";
import { spotValue, type HitzoneSpot } from "@/lib/hitzone-pick";
import { partLabel } from "@/lib/i18n/monster-labels";
import type { WeaponType } from "@/lib/constants";
import {
  GUNNER_MELEE_SHARPNESS,
  hasDemonMode,
  hasFullSpeedCharge,
  hasSpiritGlow,
  hitDamage,
  hitValues,
  moveTotal,
  moveWeights,
  movesIn,
  SHARPNESS_MULTIPLIERS,
  weightedHitzone,
} from "@/lib/motion-values";
import type { Weapon } from "@/lib/types";
import { motionValueTable } from "@/styles/tables";

/** Hitzone values to step through, 5 to 160 in fives (monsters' raw hitzones run 10 to 160). */
const HITZONES = Array.from({ length: 32 }, (_, i) => (i + 1) * 5);
const DEFAULT_HITZONE = 45;

/** The sharpness colours the weapon reaches (Sharpness +1 included). */
function sharpnessLevels(w: Weapon): number[] {
  const reached = [w.sharpness ?? [], w.sharpness_plus ?? []];
  const levels = SHARPNESS_MULTIPLIERS.map((_, i) => i).filter((i) =>
    reached.some((s) => Number(s[i] ?? 0) > 0),
  );
  return levels.length ? levels : [2];
}

/** The colour the weapon starts in without Sharpness +1: the last of its own bar. */
const ownSharpness = (w: Weapon) => (w.sharpness ?? []).findLastIndex((n) => Number(n) > 0);

/**
 * A weapon's damage calculator: pick its sharpness and the hitzone struck
 * (and Demon Mode, for Dual Blades), and each of its type's moves shows its
 * motion value (its hits summed) and the damage it deals, each hit rounded
 * down. The weapon page's Motion Values tab.
 */
export default function MotionDamage({ type, weapon }: { type: WeaponType; weapon: Weapon }) {
  const t = useT();
  const tm = t.motionValues;
  const { formatNumber } = useLocale();
  const names: Record<string, string> = tm.moves[type];
  const { moves: allMoves, error } = useMotionValues(type);
  const [sharpPick, setSharpPick] = useState<number>();
  const [zone, setZone] = useState(DEFAULT_HITZONE);
  const [spot, setSpot] = useState<HitzoneSpot | null>(null);
  const [demon, setDemon] = useState(false);
  const [glow, setGlow] = useState(false);
  const [fullSpeed, setFullSpeed] = useState(false);
  const { monsters, error: monstersError } = useHitzoneMonsters();
  const monsterName = useMonsterName();

  if (error) return <p className="text-negative">{tm.loadError}</p>;
  if (!allMoves) return <Loading>{t.common.loading}</Loading>;
  if (allMoves.length === 0) return null;
  const moves = movesIn(allMoves, demon);

  const levels = sharpnessLevels(weapon);
  const own = ownSharpness(weapon);
  const level =
    sharpPick !== undefined && levels.includes(sharpPick)
      ? sharpPick
      : levels.includes(own)
        ? own
        : levels.at(-1)!;
  const multiplier = SHARPNESS_MULTIPLIERS[level]!;
  // The weights most of the type's moves use, to show a part's value. A move
  // with its own (Great Sword charges, the Lance's charge at full speed)
  // takes the part's columns with those, so no one value matches every move.
  const weights = allMoves[0]!.hitzone_weights;
  // A picked part shows as the hand-set value that deals the same damage.
  const shownZone = spot ? spotValue(spot, weights) : zone;
  // The hand-set steps, with a picked value between them in its place.
  const zones = HITZONES.includes(shownZone)
    ? HITZONES
    : [...HITZONES, shownZone].sort((a, b) => a - b);
  const spotMonster = spot && monsters?.find((m) => m.slug === spot.slug);
  const raw = weapon.raw_attack ?? 0;
  const gunnerSharpness = GUNNER_MELEE_SHARPNESS[type];
  const melee = gunnerSharpness === undefined;
  const sharpness = gunnerSharpness ?? multiplier;
  // A picked part has both columns; a value set by hand stands for either.
  const struck = spot ?? { cut: zone, bash: zone };

  return (
    <div className="flex flex-col gap-[1.2rem]">
      <div className="flex flex-col gap-[0.4rem]">
        {hasDemonMode(allMoves) && (
          <Choice
            label={tm.mode}
            options={[tm.normal, tm.demonMode]}
            index={demon ? 1 : 0}
            onChange={(i) => setDemon(i === 1)}
          />
        )}
        {hasSpiritGlow(allMoves) && (
          <Choice
            label={tm.spiritGauge}
            options={[tm.normal, tm.glowing]}
            index={glow ? 1 : 0}
            onChange={(i) => setGlow(i === 1)}
          />
        )}
        {hasFullSpeedCharge(allMoves) && (
          <Choice
            label={tm.charge}
            options={[tm.runUp, tm.fullSpeed]}
            index={fullSpeed ? 1 : 0}
            onChange={(i) => setFullSpeed(i === 1)}
          />
        )}
        {melee && (
          <Choice
            label={tm.sharpness}
            options={levels.map((l) => (
              <span key={l} className="inline-flex items-center gap-[0.8rem]">
                <span
                  className="inline-block size-[1.2rem] flex-none"
                  style={{ background: `var(--color-sharpness-${l + 1})` }}
                />
                {tm.sharpnessColors[l]}
              </span>
            ))}
            index={levels.indexOf(level)}
            onChange={(i) => setSharpPick(levels[i])}
          />
        )}
        <Choice
          label={tm.hitzone}
          options={zones.map((z) =>
            z === shownZone && spotMonster ? (
              <span key={z}>
                {formatNumber(z)}{" "}
                <span className="text-muted">
                  {tm.bestiary.spot(monsterName(spotMonster), partLabel(t, spot!.part))}
                </span>
              </span>
            ) : (
              formatNumber(z)
            ),
          )}
          index={zones.indexOf(shownZone)}
          hideCount
          onChange={(i) => {
            setZone(zones[i]!);
            setSpot(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-[0.8rem] border-y border-hr py-[1.2rem]">
        {monsters ? (
          <HitzonePicker monsters={monsters} weights={weights} spot={spot} onPick={setSpot} />
        ) : monstersError ? (
          <p className="text-small text-negative">{tm.bestiary.loadError}</p>
        ) : (
          <Loading>{t.common.loading}</Loading>
        )}
      </div>
      <table className={motionValueTable}>
        <thead>
          <tr>
            <th>{tm.move}</th>
            <th>{tm.mv}</th>
            <th>{tm.damage}</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((move) => (
            <tr key={move.move}>
              <td>{names[move.move] ?? move.move}</td>
              <td>{formatNumber(moveTotal(move, demon))}</td>
              <td>
                {formatNumber(
                  hitValues(move, demon).reduce(
                    (n, mv) =>
                      n +
                      hitDamage(
                        raw,
                        mv,
                        sharpness,
                        weightedHitzone(struck, moveWeights(move, { glow, fullSpeed })),
                      ),
                    0,
                  ),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
