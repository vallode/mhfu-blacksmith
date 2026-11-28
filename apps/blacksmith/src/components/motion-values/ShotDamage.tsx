"use client";

import AmmoName from "@/components/AmmoName";
import Loading from "@/components/Loading";
import type { HitzoneState } from "./hitzone-state";
import { useLocale, useT } from "@/context/LanguageContext";
import { useShots } from "@/lib/client-data";
import { buffedAttack, type Buffs } from "@/lib/damage-buffs";
import { loadsShot, shotDamage, SHOT_ELEMENTS, type ShotHitzones } from "@/lib/shots";
import type { Weapon } from "@/lib/types";
import { motionName, motionValueTable } from "@/styles/tables";

/**
 * A bowgun's damage table: each shot the weapon loads, its motion value (and
 * hits) and the damage it deals on the page's target, with Crag and Clust
 * S's explosions after their own hit, with the hunter's `buffs` (the
 * damage page's options) on the true attack. The damage page's calculator
 * for Light and Heavy Bowguns.
 */
export default function ShotDamage({
  weapon,
  buffs,
  hitzone,
  defense = 1,
}: {
  weapon: Weapon;
  buffs: Buffs;
  /** The hitzone struck, the page's, so it stays when the weapon changes. */
  hitzone: HitzoneState;
  /** The quest's defense multiplier for the monster struck. */
  defense?: number;
}) {
  const t = useT();
  const tm = t.motionValues;
  const ts = tm.shots;
  const { formatNumber } = useLocale();
  const { shots: file, error } = useShots();
  const { zone, elementZones, spot } = hitzone;
  // Shots of every element share one hand-set element hitzone.
  const elementZone = elementZones.fire;

  if (error) return <p className="text-negative">{ts.loadError}</p>;
  if (!file) return <Loading>{t.common.loading}</Loading>;
  const shots = file.shots.filter((s) => loadsShot(weapon, s));
  if (shots.length === 0) return null;

  const raw = buffedAttack(weapon.raw_attack ?? 0, buffs);
  const mvText = (mv: number, hits?: number) =>
    hits ? ts.hits(formatNumber(mv), formatNumber(hits)) : formatNumber(mv);
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
    <table className={motionValueTable}>
      <thead>
        <tr>
          <th className={motionName}>{ts.ammo}</th>
          <th>{tm.mv}</th>
          <th>{tm.damage}</th>
        </tr>
      </thead>
      <tbody>
        {shots.map((s) => (
          <tr key={s.shot}>
            <AmmoName
              className={motionName}
              name={s.ammo}
              suffix={
                file.shots.some((o) => o.ammo === s.ammo && o.level > 1)
                  ? ` ${ts.level(formatNumber(s.level))}`
                  : undefined
              }
            />
            <td
              title={s.explosion && !s.explosion.attack_scaled ? ts.fixedExplosionHint : undefined}
            >
              <span className="text-muted">
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
              </span>
            </td>
            <td>
              {formatNumber(shotDamage(raw, s, struck, file.bowgun_shot_multiplier, defense))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
