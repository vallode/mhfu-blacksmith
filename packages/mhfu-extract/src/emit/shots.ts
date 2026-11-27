/**
 * The bowgun shots in `data/motion-values.json` (`tables/shots.ts`): each
 * ammo that deals damage through the shot hitzone, with its motion value,
 * hits and element. Crag and Clust S are left out, as most of their damage
 * is their explosions, other attacks not read here.
 */
import {
  ATTACK_SCALED_ELEMENT_SHOTS,
  BOWGUN_SHOT_MULTIPLIER,
  SHOT_KIND,
  type Shot,
} from "../tables/shots.js";
import type { HitzoneColumn } from "../monsters/hitzones.js";
import { SHOT_AMMO } from "./gunner.js";

export interface EmittedShot {
  /** The `ShotCoat` bit, the game's shot ID. */
  shot: number;
  /** The ammo's name and level, as the weapons' ammo lists give them. */
  ammo: string;
  level: number;
  motion_value: number;
  /** How many times it hits (a pierce shot's hits, a spread shot's pellets), when more than once. */
  hits?: number;
  element?: { type: HitzoneColumn; value: number; attack_scaled?: true };
}

export interface EmittedShots {
  /** A bowgun's shots deal this times their physical damage. */
  bowgun_shot_multiplier: number;
  shots: EmittedShot[];
}

/** Ammo whose damage is mostly its explosions, other attacks not read here. */
const SKIPPED_AMMO: ReadonlySet<string> = new Set(["Crag S", "Clust S"]);
const MULTI_HIT_KINDS: ReadonlySet<number> = new Set([SHOT_KIND.pierce, SHOT_KIND.spread]);

export function emitShots(shots: Shot[]): EmittedShots {
  const out: EmittedShot[] = [];
  for (const s of shots) {
    const ammo = SHOT_AMMO[s.shot];
    if (!ammo || !s.shotPath || SKIPPED_AMMO.has(ammo.name)) continue;
    if (s.motionValue === 0 && !s.element) continue;
    out.push({
      shot: s.shot,
      ammo: ammo.name,
      level: ammo.level,
      motion_value: s.motionValue,
      ...(MULTI_HIT_KINDS.has(s.kind) && s.count > 1 ? { hits: s.count } : {}),
      ...(s.element
        ? {
            element: {
              type: s.element.column,
              value: s.element.value,
              ...(ATTACK_SCALED_ELEMENT_SHOTS.has(s.shot) ? { attack_scaled: true as const } : {}),
            },
          }
        : {}),
    });
  }
  return { bowgun_shot_multiplier: BOWGUN_SHOT_MULTIPLIER, shots: out };
}
