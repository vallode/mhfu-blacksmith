"use client";

import { useState } from "react";
import AmmoName from "@/components/AmmoName";
import Loading from "@/components/Loading";
import Choice from "./Choice";
import HitzonePicker, { useMonsterName } from "./HitzonePicker";
import { useLocale, useT } from "@/context/LanguageContext";
import { useHitzoneMonsters, useShots } from "@/lib/client-data";
import type { HitzoneSpot } from "@/lib/hitzone-pick";
import { partLabel } from "@/lib/i18n/monster-labels";
import { loadsShot, shotDamage, SHOT_ELEMENTS, type ShotHitzones } from "@/lib/shots";
import type { Weapon } from "@/lib/types";
import { motionValueTable } from "@/styles/tables";

/** Shot hitzone values to step through, 5 to 160 in fives, as the melee calculator's. */
const HITZONES = Array.from({ length: 32 }, (_, i) => (i + 1) * 5);
const DEFAULT_HITZONE = 45;
/** Element hitzone values, 0 to 100 in fives. */
const ELEMENT_HITZONES = Array.from({ length: 21 }, (_, i) => i * 5);
const DEFAULT_ELEMENT_HITZONE = 20;

/**
 * A bowgun's damage calculator: pick the hitzone struck (a value, or a
 * monster's part from the bestiary), and each shot the weapon loads shows
 * its motion value (and hits) and the damage it deals, with Crag and Clust
 * S's explosions after their own hit. The weapon page's
 * Motion Values tab for Light and Heavy Bowguns.
 */
export default function ShotDamage({ weapon }: { weapon: Weapon }) {
  const t = useT();
  const tm = t.motionValues;
  const ts = tm.shots;
  const { formatNumber } = useLocale();
  const { shots: file, error } = useShots();
  const [zone, setZone] = useState(DEFAULT_HITZONE);
  const [elementZone, setElementZone] = useState(DEFAULT_ELEMENT_HITZONE);
  const [spot, setSpot] = useState<HitzoneSpot | null>(null);
  const { monsters, error: monstersError } = useHitzoneMonsters();
  const monsterName = useMonsterName();

  if (error) return <p className="text-negative">{ts.loadError}</p>;
  if (!file) return <Loading>{t.common.loading}</Loading>;
  const shots = file.shots.filter((s) => loadsShot(weapon, s));
  if (shots.length === 0) return null;

  const raw = weapon.raw_attack ?? 0;
  const mvText = (mv: number, hits?: number) =>
    hits ? ts.hits(formatNumber(mv), formatNumber(hits)) : formatNumber(mv);
  const shownZone = spot ? spot.shot : zone;
  // The hand-set steps, with a picked value between them in its place.
  const zones = HITZONES.includes(shownZone)
    ? HITZONES
    : [...HITZONES, shownZone].sort((a, b) => a - b);
  const spotMonster = spot && monsters?.find((m) => m.slug === spot.slug);
  // A picked part has every column; values set by hand stand for the shot
  // column and for whichever element a shot has.
  const struck: ShotHitzones = spot ?? {
    shot: zone,
    ...(Object.fromEntries(SHOT_ELEMENTS.map((e) => [e, elementZone])) as Record<
      (typeof SHOT_ELEMENTS)[number],
      number
    >),
  };

  return (
    <div className="flex flex-col gap-[1.2rem]">
      <div className="flex flex-col gap-[0.4rem]">
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
        {!spot && shots.some((s) => s.element || s.explosion?.element) && (
          <Choice
            label={ts.elementHitzone}
            options={ELEMENT_HITZONES.map((z) => formatNumber(z))}
            index={ELEMENT_HITZONES.indexOf(elementZone)}
            hideCount
            onChange={(i) => setElementZone(ELEMENT_HITZONES[i]!)}
          />
        )}
      </div>
      <div className="flex flex-col gap-[0.8rem] border-y border-hr py-[1.2rem]">
        {monsters ? (
          <HitzonePicker monsters={monsters} valueOf={(p) => p.shot} spot={spot} onPick={setSpot} />
        ) : monstersError ? (
          <p className="text-small text-negative">{tm.bestiary.loadError}</p>
        ) : (
          <Loading>{t.common.loading}</Loading>
        )}
      </div>
      <table className={motionValueTable}>
        <thead>
          <tr>
            <th>{ts.ammo}</th>
            <th>{tm.mv}</th>
            <th>{tm.damage}</th>
          </tr>
        </thead>
        <tbody>
          {shots.map((s) => (
            <tr key={s.shot}>
              <AmmoName
                name={s.ammo}
                suffix={
                  file.shots.some((o) => o.ammo === s.ammo && o.level > 1)
                    ? ` ${ts.level(formatNumber(s.level))}`
                    : undefined
                }
              />
              <td
                title={
                  s.explosion && !s.explosion.attack_scaled ? ts.fixedExplosionHint : undefined
                }
              >
                {!s.explosion
                  ? mvText(s.motion_value, s.hits)
                  : s.explosion.attack_scaled
                    ? ts.explosion(
                        mvText(s.motion_value, s.hits),
                        mvText(s.explosion.power, s.explosion.hits),
                      )
                    : ts.fixedExplosion(
                        mvText(s.motion_value, s.hits),
                        mvText(s.explosion.power, s.explosion.hits),
                      )}
              </td>
              <td>{formatNumber(shotDamage(raw, s, struck, file.bowgun_shot_multiplier))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
