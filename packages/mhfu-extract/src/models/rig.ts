/**
 * A package's model ready for gltf.ts: its PMO with a severable tail tip put
 * back on (attach.ts), and, for a monster, the skeleton to skin it to and the
 * clips from its motion bank (motion.ts, animation.ts).
 */
import { buildClips, type ClipOptions } from "./animation.js";
import { attachDetachedParts, skeletonFor, skinDetachedParts } from "./attach.js";
import type { Rig } from "./gltf.js";
import { isMotionBank, readMotionBank } from "./motion.js";
import type { PacEntry } from "./pac.js";
import { readPmo, type Pmo } from "./pmo.js";

export interface PackageModel {
  pmo: Pmo;
  /** Absent for a model without a skeleton (weapons, armor). */
  rig?: Rig;
}

/**
 * The model of PMO entry `pmoIndex`. Its skeleton is the last `.ahi` before
 * it and its motion bank the first after it; a palette naming a bone the
 * skeleton doesn't have leaves the model unskinned, and a bank that doesn't
 * parse leaves it without clips, so a mesh always converts.
 */
export function packageModel(
  entries: PacEntry[],
  pmoIndex: number,
  clipOptions?: ClipOptions,
): PackageModel {
  const bones = skeletonFor(entries, pmoIndex);
  const pmo = attachDetachedParts(readPmo(entries[pmoIndex]!.data), bones);
  const fits = pmo.meshes.every((mesh) =>
    mesh.primitives.every((p) => p.bones.every((bone) => bone < bones.length)),
  );
  if (bones.length === 0 || !fits) return { pmo };
  const bank = entries.slice(pmoIndex + 1).find((entry) => isMotionBank(entry.data));
  let clips: Rig["clips"] = [];
  try {
    if (bank) clips = buildClips(bones, readMotionBank(bank.data), clipOptions);
  } catch {
    clips = [];
  }
  return { pmo: skinDetachedParts(pmo, bones), rig: { bones, clips } };
}
