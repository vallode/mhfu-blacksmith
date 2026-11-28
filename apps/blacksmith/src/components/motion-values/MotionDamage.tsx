"use client";

import Choice from "./Choice";
import Loading from "@/components/Loading";
import type { HitzoneState } from "./hitzone-state";
import type { WeaponSettings } from "./weapon-settings";
import { useLocale, useT } from "@/context/LanguageContext";
import { useMotionValues } from "@/lib/client-data";
import type { WeaponType } from "@/lib/constants";
import {
  ELEMENT_SHARPNESS_MULTIPLIERS,
  GUNNER_MELEE_SHARPNESS,
  hasDemonMode,
  hasFullSpeedCharge,
  hasSpiritGlow,
  moveDamage,
  moveTotal,
  movesIn,
  SHARPNESS_MULTIPLIERS,
  type HitKind,
  type MotionMove,
  type StruckZone,
} from "@/lib/motion-values";
import {
  buffedAffinity,
  buffedAttack,
  hitElement,
  weaponAttributes,
  type Buffs,
} from "@/lib/damage-buffs";
import type { Weapon } from "@/lib/types";
import { motionValueTable } from "@/styles/tables";

/** The sharpness colours the weapon reaches (Sharpness +1 included). */
function sharpnessLevels(w: Weapon): number[] {
  const reached = [w.sharpness ?? [], w.sharpness_plus ?? []];
  const levels = SHARPNESS_MULTIPLIERS.map((_, i) => i).filter((i) =>
    reached.some((s) => Number(s[i] ?? 0) > 0),
  );
  return levels.length ? levels : [2];
}

/** The colour the weapon starts in: the last of its own bar, or of Sharpness +1's with the skill. */
const startSharpness = (w: Weapon, plus: boolean) =>
  ((plus && w.sharpness_plus) || w.sharpness || []).findLastIndex((n) => Number(n) > 0);

/**
 * What the weapon's settings come to: the modes its type has, the sharpness
 * colour (the picked one if the weapon reaches it, else the one it starts
 * in), its buffed attack, and the critical its affinity lands (a negative
 * one below 0), if any.
 */
function motionSetup(
  allMoves: MotionMove[],
  type: WeaponType,
  weapon: Weapon,
  buffs: Buffs,
  settings: WeaponSettings,
) {
  const modes = {
    demon: hasDemonMode(allMoves),
    glow: hasSpiritGlow(allMoves),
    fullSpeed: hasFullSpeedCharge(allMoves),
  };
  const demon = modes.demon && settings.demon;
  const glow = modes.glow && settings.glow;
  const fullSpeed = modes.fullSpeed && settings.fullSpeed;
  const levels = sharpnessLevels(weapon);
  const start = startSharpness(weapon, buffs.sharpnessPlus);
  const level =
    settings.sharpness !== undefined && levels.includes(settings.sharpness)
      ? settings.sharpness
      : levels.includes(start)
        ? start
        : levels.at(-1)!;
  const gunnerSharpness = GUNNER_MELEE_SHARPNESS[type];
  const melee = gunnerSharpness === undefined;
  const affinityAt = (l: number) =>
    buffedAffinity(Number.parseInt(weapon.affinity ?? "0", 10) || 0, buffs, l);
  const kindOf = (a: number): Exclude<HitKind, "normal"> | null =>
    a > 0 ? "critical" : a < 0 ? "weak" : null;
  // Affinity is rolled only above red sharpness (+0x5F2 above 0), so the
  // Bow's melee hits, at the gunners' level 0, never land a critical.
  const crit = melee && level > 0 ? kindOf(affinityAt(level)) : null;
  // The critical's column stays at every sharpness the weapon reaches, so
  // the table keeps its layout: its kind is the first colour's that lands one.
  const critColumn = melee
    ? (crit ??
      levels
        .filter((l) => l > 0)
        .map((l) => kindOf(affinityAt(l)))
        .find(Boolean) ??
      null)
    : null;
  return {
    modes,
    demon,
    glow,
    fullSpeed,
    levels,
    level,
    melee,
    crit,
    critColumn,
    sharpness: gunnerSharpness ?? SHARPNESS_MULTIPLIERS[level]!,
    elementSharpness: gunnerSharpness ?? ELEMENT_SHARPNESS_MULTIPLIERS[level]!,
    attack: buffedAttack(weapon.raw_attack ?? 0, buffs, { spiritGlow: glow }),
  };
}

/**
 * How the weapon is used, beside it on the damage page: Demon Mode for Dual
 * Blades, the spirit gauge for Long Swords, the Lance's charge and the
 * sharpness colour. Each shows only where the weapon has it.
 */
export function MotionSettings({
  type,
  weapon,
  buffs,
  settings,
}: {
  type: WeaponType;
  weapon: Weapon;
  buffs: Buffs;
  settings: WeaponSettings;
}) {
  const tm = useT().motionValues;
  const { moves: allMoves } = useMotionValues(type);
  if (!allMoves?.length) return null;
  const s = motionSetup(allMoves, type, weapon, buffs, settings);

  return (
    <div className="flex flex-col gap-[0.4rem]">
      {s.modes.demon && (
        <Choice
          label={tm.mode}
          options={[tm.normal, tm.demonMode]}
          index={s.demon ? 1 : 0}
          onChange={(i) => settings.setDemon(i === 1)}
        />
      )}
      {s.modes.glow && (
        <Choice
          label={tm.spiritGauge}
          options={[tm.normal, tm.glowing]}
          index={s.glow ? 1 : 0}
          onChange={(i) => settings.setGlow(i === 1)}
        />
      )}
      {s.modes.fullSpeed && (
        <Choice
          label={tm.charge}
          options={[tm.runUp, tm.fullSpeed]}
          index={s.fullSpeed ? 1 : 0}
          onChange={(i) => settings.setFullSpeed(i === 1)}
        />
      )}
      {s.melee && (
        <Choice
          label={tm.sharpness}
          options={s.levels.map((l) => (
            <span key={l} className="inline-flex items-center gap-[0.8rem]">
              <span
                className="inline-block size-[1.2rem] flex-none"
                style={{ background: `var(--color-sharpness-${l + 1})` }}
              />
              {tm.sharpnessColors[l]}
            </span>
          ))}
          index={s.levels.indexOf(s.level)}
          // The colour's name needs the room in the page's narrow card.
          hideCount
          onChange={(i) => settings.setSharpness(s.levels[i])}
        />
      )}
    </div>
  );
}

/**
 * A weapon's damage table: each of its type's moves, its motion value (its
 * hits summed) and the damage it deals on the page's target, with the
 * page's settings, the hunter's `buffs` and the quest's `defense`: the
 * total first, then the total on a critical (a negative one, below 0
 * affinity) when the weapon's affinity lands one, then a weapon with an
 * element splits the total into raw and element, each hit's truncated on
 * its own.
 */
export default function MotionDamage({
  type,
  weapon,
  buffs,
  settings,
  hitzone,
  defense = 1,
}: {
  type: WeaponType;
  weapon: Weapon;
  buffs: Buffs;
  settings: WeaponSettings;
  /** The hitzone struck, the page's, so it stays when the weapon changes. */
  hitzone: HitzoneState;
  /** The quest's defense multiplier for the monster struck. */
  defense?: number;
}) {
  const t = useT();
  const tm = t.motionValues;
  const { formatNumber } = useLocale();
  const names: Record<string, string> =
    (tm.moves as Partial<Record<WeaponType, Record<string, string>>>)[type] ?? {};
  const { moves: allMoves, error } = useMotionValues(type);

  if (error) return <p className="text-negative">{tm.loadError}</p>;
  if (!allMoves) return <Loading>{t.common.loading}</Loading>;
  if (allMoves.length === 0) return null;
  const s = motionSetup(allMoves, type, weapon, buffs, settings);
  const moves = movesIn(allMoves, s.demon);
  const { zone, elementZones, spot } = hitzone;
  // A picked part has every column; values set by hand stand for both
  // physical columns, and each element's for that element.
  const struck: StruckZone = spot ?? { cut: zone, bash: zone, ...elementZones };
  const attributes = weaponAttributes(weapon.elements);
  const elementTypes = [...new Set(attributes.flatMap((a) => (a.type ? [a.type] : [])))];
  const elemental = elementTypes.length > 0;
  const dualBlades = type === "dual-blades";
  const damage = (move: MotionMove, hit: HitKind) =>
    moveDamage(move, {
      attack: s.attack,
      sharpness: s.sharpness,
      elementSharpness: s.elementSharpness,
      elementOf: (h) => hitElement(attributes, buffs, h, dualBlades),
      zone: struck,
      demon: s.demon,
      glow: s.glow,
      fullSpeed: s.fullSpeed,
      hit,
      defense,
    });

  return (
    <table className={motionValueTable}>
      <thead>
        <tr>
          <th>{tm.move}</th>
          <th>{tm.mv}</th>
          <th>{elemental ? tm.total : tm.damage}</th>
          {s.critColumn && (
            <th>
              <abbr className="no-underline" title={tm.critHint[s.critColumn]}>
                {tm.crit[s.critColumn]}
              </abbr>
            </th>
          )}
          {elemental && (
            <>
              <th>{tm.raw}</th>
              <th>
                <span className="text-element">
                  {elementTypes.length === 1
                    ? (t.common.elements[cap(elementTypes[0]!)] ?? elementTypes[0])
                    : tm.element}
                </span>
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {moves.map((move) => {
          const d = damage(move, "normal");
          // A critical that doesn't land here (red sharpness): a dash.
          const c = s.crit === s.critColumn && s.crit && damage(move, s.crit);
          return (
            <tr key={move.move}>
              <td>{names[move.move] ?? move.move}</td>
              <td>
                <span className={muted}>{formatNumber(moveTotal(move, s.demon))}</span>
              </td>
              <td>{formatNumber(d.raw + d.element)}</td>
              {s.critColumn && (
                <td>{c ? formatNumber(c.raw + c.element) : <span className={muted}>–</span>}</td>
              )}
              {elemental && (
                <>
                  <td>
                    <span className={muted}>{formatNumber(d.raw)}</span>
                  </td>
                  <td>
                    <span className="text-element/70">{formatNumber(d.element)}</span>
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The figures read past the total: the motion value, and the total's raw part. */
const muted = "text-muted";

/** "fire" → "Fire", the key of `common.elements`. */
export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
