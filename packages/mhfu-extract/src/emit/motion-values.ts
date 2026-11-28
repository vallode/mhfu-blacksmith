/**
 * `data/mhfu/motion-values.json` (schema: `data/schemas/motion-values.schema.json`):
 * each weapon type's moves (`overlay/weapon-moves.json`) with their hits'
 * motion values from the disc's table (`tables/motion-values.ts`), and,
 * for Dual Blades, what each hit becomes in Demon Mode.
 */
import type { WeaponMove } from "../overlay/weapon-moves.js";
import {
  demonModeValue,
  DEMON_MODE_MULTIPLIER,
  type HitzoneWeights,
  type HitzoneWeightTables,
  type MotionTable,
} from "../tables/motion-values.js";
import { WEAPON_TYPE_NAMES } from "../tables/weapons.js";

/** The weapon type whose motion values Demon Mode raises. */
export const DEMON_MODE_TYPE = "dual-blades";

export interface EmittedHit {
  row: number;
  motion_value: number;
  /** Dual Blades only: the motion value in Demon Mode. */
  demon_mode?: number;
  /** How many times the move deals it, when more than once. */
  count?: number;
}

export interface EmittedMove {
  move: string;
  demon?: true;
  /** The percentages its hits weigh a part's cut and impact hitzones by; the larger counts. */
  hitzone_weights: HitzoneWeights;
  /** Long Sword: the weights while its spirit gauge glows. */
  glow_hitzone_weights?: HitzoneWeights;
  /** Lance: the charge's weights once it runs at full speed. */
  charge_hitzone_weights?: HitzoneWeights;
  hits: EmittedHit[];
}

export interface EmittedMotionValues {
  /** Dual Blades' motion values in Demon Mode are this times their own, truncated. */
  demon_mode_multiplier: number;
  /** By weapon type (the site's slug), in the site's order. */
  weapons: Record<string, EmittedMove[]>;
}

export class MotionValuesError extends Error {}

/** `weights` is the weapon classes' hitzone weights (`readHitzoneWeights`). */
export function emitMotionValues(
  table: MotionTable,
  moves: Record<string, WeaponMove[]>,
  weights: HitzoneWeightTables,
): EmittedMotionValues {
  const weapons: Record<string, EmittedMove[]> = {};
  for (const [type, list] of Object.entries(moves)) {
    for (const m of list)
      if (m.fullSpeed && WEAPON_TYPE_NAMES[weights.charge.weaponClass] !== type)
        throw new MotionValuesError(`${type} ${m.move}: only the Lance's charge speeds up`);
    const weaponClass = WEAPON_TYPE_NAMES.indexOf(type as (typeof WEAPON_TYPE_NAMES)[number]);
    const own = weights.classes[weaponClass];
    if (!own) throw new MotionValuesError(`${type}: no hitzone weights for this weapon type`);
    const glows = weaponClass === weights.spiritGlow.weaponClass;
    const { cut, impact } = weights.charge;
    const charge = { cut, impact };
    weapons[type] = list.map((m) => ({
      move: m.move,
      ...(m.demon ? { demon: true as const } : {}),
      hitzone_weights: m.cutWeight === undefined ? { ...own } : { ...own, cut: m.cutWeight },
      ...(glows ? { glow_hitzone_weights: { ...own, cut: weights.spiritGlow.cut } } : {}),
      ...(m.fullSpeed ? { charge_hitzone_weights: charge } : {}),
      hits: m.hits.map(({ row, count }) => {
        const found = table.rows[row];
        if (!found || row === 0 || found.motionValue === 0)
          throw new MotionValuesError(`${type} ${m.move}: row ${row} has no motion value`);
        return {
          row,
          motion_value: found.motionValue,
          ...(type === DEMON_MODE_TYPE ? { demon_mode: demonModeValue(found.motionValue) } : {}),
          ...(count && count > 1 ? { count } : {}),
        };
      }),
    }));
  }
  return { demon_mode_multiplier: DEMON_MODE_MULTIPLIER, weapons };
}
