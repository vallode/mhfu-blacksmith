"use client";

import ButtonInput from "./ButtonInput";
import { useInputColumn } from "./use-input-column";
import Choice from "./Choice";
import Loading from "@/components/Loading";
import type { HitzoneState } from "./hitzone-state";
import type { WeaponSettings } from "./weapon-settings";
import { useLocale, useT } from "@/context/LanguageContext";
import { useMotionValues } from "@/lib/client-data";
import type { WeaponType } from "@/lib/constants";
import {
  effectiveRaw,
  ELEMENT_SHARPNESS_MULTIPLIERS,
  GUNNER_MELEE_SHARPNESS,
  hasDemonMode,
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
  rolledAffinity,
  hitElement,
  weaponAttributes,
  type Buffs,
} from "@/lib/damage-buffs";
import { moveInput } from "@/lib/move-inputs";
import type { Weapon } from "@/lib/types";
import { motionInput, motionName, motionValueTable, underInput } from "@/styles/tables";

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
  };
  const demon = modes.demon && settings.demon;
  const glow = modes.glow && settings.glow;
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
  const weaponAffinity = Number.parseInt(weapon.affinity ?? "0", 10) || 0;
  const affinityAt = (l: number) => buffedAffinity(weaponAffinity, buffs, l);
  const kindOf = (a: number): Exclude<HitKind, "normal"> | null =>
    a > 0 ? "critical" : a < 0 ? "weak" : null;
  // Affinity isn't rolled in red sharpness, nor for the Bow's melee hits.
  const affinity = rolledAffinity(weaponAffinity, buffs, melee ? level : null);
  const crit = kindOf(affinity);
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
    levels,
    level,
    melee,
    affinity,
    crit,
    critColumn,
    sharpness: gunnerSharpness ?? SHARPNESS_MULTIPLIERS[level]!,
    elementSharpness: gunnerSharpness ?? ELEMENT_SHARPNESS_MULTIPLIERS[level]!,
    attack: buffedAttack(weapon.raw_attack ?? 0, buffs, { spiritGlow: glow }),
  };
}

/**
 * How the weapon is used, beside it on the damage page: Demon Mode for Dual
 * Blades, the spirit gauge for Long Swords and the sharpness colour. Each shows only where the weapon has it.
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
 * At the foot of the damage page's card, under the sharpness picked: the
 * weapon's true attack (the weapon's, then with buffs and the spirit glow,
 * when they change it) and, for a blademaster weapon, its effective raw in
 * the sharpness picked. The Bow and the Bowguns take no sharpness or roll no
 * affinity in the calculator, so they show only the true attack.
 */
export function AttackSummary({
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
  const t = useT();
  const text = t.motionValues.page;
  const { formatNumber } = useLocale();
  const { moves } = useMotionValues(type);
  const s = moves?.length ? motionSetup(moves, type, weapon, buffs, settings) : null;
  const raw = weapon.raw_attack ?? 0;
  // Until the motion values load (or if they don't), as the table: the
  // Long Sword's spirit glow, when set.
  const attack =
    s?.attack ?? buffedAttack(raw, buffs, { spiritGlow: settings.glow && type === "long-sword" });
  return (
    <p className="m-0 flex flex-wrap gap-x-[1.2rem] border-t border-white/15 px-[0.4rem] pt-[0.8rem] text-fine text-parchment">
      <span>
        {text.trueAttack}{" "}
        <span className="text-white">
          {attack !== raw ? `${formatNumber(raw)} → ${formatNumber(attack)}` : formatNumber(raw)}
        </span>
      </span>
      {s?.melee && (
        <span>
          <abbr className="no-underline" title={text.effectiveRawHint}>
            {text.effectiveRaw}
          </abbr>{" "}
          <span className="text-white">
            {formatNumber(Math.round(effectiveRaw(attack, s.sharpness, s.affinity)))}
          </span>
        </span>
      )}
    </p>
  );
}

/**
 * A weapon's damage table: each of its type's moves, its motion value (its
 * hits summed) and the damage it deals on the page's target, with the
 * page's settings, the hunter's `buffs` and the quest's `defense`: the
 * total first, then the total on a critical (a negative one, below 0
 * affinity) when the weapon's affinity lands one, then a weapon with an
 * element splits the total into raw and element, each hit's truncated on
 * its own. The Lance's charge has a row as it starts and one at full
 * speed, where it weighs the hitzone more. Each move's input with the
 * default controls comes before its name, or under it where the table's
 * card is too narrow for the column (`useInputColumn`).
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
  const inputs = useInputColumn(!!allMoves?.length);

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
  const damage = (move: MotionMove, hit: HitKind, fullSpeed: boolean) =>
    moveDamage(move, {
      attack: s.attack,
      sharpness: s.sharpness,
      elementSharpness: s.elementSharpness,
      elementOf: (h) => hitElement(attributes, buffs, h, dualBlades),
      zone: struck,
      demon: s.demon,
      glow: s.glow,
      fullSpeed,
      hit,
      defense,
    });

  return (
    <div ref={inputs.box} className="w-full">
      <table ref={inputs.table} data-inputs={inputs.place} className={motionValueTable}>
        <thead>
          <tr>
            {/* The icons say what they are; the heading is for screen readers. */}
            <th className={motionInput}>
              <span className="sr-only">{tm.input.label}</span>
            </th>
            <th className={motionName}>{tm.move}</th>
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
          {moves
            .flatMap((move) => {
              const name = names[move.move] ?? move.move;
              return move.charge_hitzone_weights
                ? [
                    { move, key: move.move, name: tm.chargeAt(name, tm.runUp), fullSpeed: false },
                    {
                      move,
                      key: `${move.move}-full-speed`,
                      name: tm.chargeAt(name, tm.fullSpeed),
                      fullSpeed: true,
                    },
                  ]
                : [{ move, key: move.move, name, fullSpeed: false }];
            })
            .map(({ move, key, name, fullSpeed }) => {
              const d = damage(move, "normal", fullSpeed);
              // A critical that doesn't land here (red sharpness): a dash.
              const c = s.crit === s.critColumn && s.crit && damage(move, s.crit, fullSpeed);
              const input = moveInput(type, move.move);
              return (
                <tr key={key}>
                  <td className={motionInput}>{input && <ButtonInput input={input} />}</td>
                  <td className={motionName}>
                    {name}
                    {input && <ButtonInput input={input} className={underInput} />}
                  </td>
                  <td>
                    <span className={muted}>{formatNumber(moveTotal(move, s.demon))}</span>
                  </td>
                  <td>{formatNumber(d.raw + d.element)}</td>
                  {s.critColumn && (
                    <td>
                      {c ? formatNumber(c.raw + c.element) : <span className={muted}>–</span>}
                    </td>
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
    </div>
  );
}

/** The figures read past the total: the motion value, and the total's raw part. */
const muted = "text-muted";

/** "fire" → "Fire", the key of `common.elements`. */
export const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
