/**
 * The parts of a monster's mesh the game doesn't draw while it is intact and
 * calm, as it spawns. A monster's PMO holds every look it can take: broken
 * heads and wings, the caps over a cut tail's stump, rage layers. Each frame
 * the monster's code picks which (mesh, material) pairs to draw; drawn all at
 * once, a broken head covers the intact one and hides its eyes.
 *
 * Which pairs are hidden at spawn comes from vendor/mhfu-monster-viewer
 * (MIT, see ../../NOTICE.md), whose builder found them by running each
 * monster's material pass under emulation. Keyed by package, `emNN`.
 */
import { readFileSync } from "node:fs";
import type { Pmo } from "./pmo.js";

/** A PMO mesh index and a material index (into `Pmo.materials`). */
export type MeshMaterial = [mesh: number, material: number];

let table: Record<string, MeshMaterial[]> | undefined;

/** The (mesh, material) pairs package `emNN` hides at spawn; empty when it hides none. */
export function spawnHidden(pac: string): MeshMaterial[] {
  table ??= JSON.parse(
    readFileSync(
      new URL("../../vendor/mhfu-monster-viewer/spawn-hide.json", import.meta.url),
      "utf-8",
    ),
  ) as Record<string, MeshMaterial[]>;
  return table[pac] ?? [];
}

/**
 * The PMO without the primitives drawn with a hidden (mesh, material) pair.
 * Throws when a pair matches nothing, as a table for another model would.
 */
export function withoutHidden(pmo: Pmo, hidden: readonly MeshMaterial[]): Pmo {
  if (hidden.length === 0) return pmo;
  const unused = new Set(hidden.map(([mesh, material]) => `${mesh}/${material}`));
  const meshes = pmo.meshes.map((mesh, m) => ({
    ...mesh,
    primitives: mesh.primitives.filter((primitive) => {
      const key = `${m}/${primitive.materialIndex}`;
      const hide = hidden.some(([mesh, material]) => `${mesh}/${material}` === key);
      if (hide) unused.delete(key);
      return !hide;
    }),
  }));
  if (unused.size) throw new Error(`hidden parts not in the model: ${[...unused].join(", ")}`);
  return { ...pmo, meshes };
}
