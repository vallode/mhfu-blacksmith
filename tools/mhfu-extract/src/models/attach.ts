/**
 * Puts a monster's severable tail tip back on.
 *
 * A monster whose tail can be cut keeps the tail tip apart from the rest of
 * the model. The body's tail ends at the cut, closed by a flesh cap, and
 * the tip is skinned to a second, parentless bone chain (part 3 in the
 * skeleton, see ahi.ts) and modelled around the origin, so the game can
 * leave it on the ground once cut. While the tail is on, the game moves
 * that chain onto the tail's last bones; the static bind pose doesn't,
 * which leaves the tip inside the body and the cut tail showing.
 *
 * The parentless chain is a copy of the end of the tail chain: its leaf has
 * the same offset from its parent as one leaf of the main hierarchy (e.g.
 * em34 Cephalos: bones 46 -> 47 copy 43 -> 44, both +73.07 along z). Moving
 * the chain so that its leaf's parent sits on that leaf's parent, and the
 * tip's vertices with it, puts the tip's cut face on the body's (the two
 * caps meet inside the tail, out of sight).
 */
import { isAhi, readAhi, type Bone } from "./ahi.js";
import type { PacEntry } from "./pac.js";
import type { Pmo } from "./pmo.js";

type Vec3 = [number, number, number];

const EPSILON = 1e-3;

const near = (a: readonly number[], b: readonly number[]): boolean =>
  a.every((c, k) => Math.abs(c - b[k]!) < EPSILON);

/**
 * The skeleton for the PMO entry `pmoIndex` of a package: the last `.ahi`
 * entry before it. Empty when there is none or it doesn't parse, so a model
 * always converts, at worst without its tail tip attached.
 */
export function skeletonFor(entries: PacEntry[], pmoIndex: number): Bone[] {
  const ahi = entries
    .slice(0, pmoIndex)
    .reverse()
    .find((entry) => isAhi(entry.data));
  if (!ahi) return [];
  try {
    return readAhi(ahi.data);
  } catch {
    return [];
  }
}

/**
 * Offset to move each bone of a parentless (detached) chain onto the main
 * hierarchy, by bone index. Bones without an entry stay where they are.
 */
export function detachedBoneOffsets(bones: Bone[]): Map<number, Vec3> {
  const offsets = new Map<number, Vec3>();
  // Only pure translations are handled: every MHFU skeleton seen so far has
  // identity rotations and unit scales in its bind pose.
  if (!bones.every((b) => near(b.rotation, [0, 0, 0]) && near(b.scale, [1, 1, 1]))) return offsets;

  const children = new Map<number, number[]>();
  for (const bone of bones) {
    if (bone.parent >= 0)
      children.set(bone.parent, [...(children.get(bone.parent) ?? []), bone.id]);
  }
  const world = (id: number): Vec3 => {
    const sum: Vec3 = [0, 0, 0];
    for (let b = bones[id]; b; b = b.parent >= 0 ? bones[b.parent] : undefined) {
      b.translation.forEach((c, k) => (sum[k] = sum[k]! + c));
    }
    return sum;
  };
  const subtree = (root: number): number[] => {
    const ids = [root];
    for (let i = 0; i < ids.length; i++) ids.push(...(children.get(ids[i]!) ?? []));
    return ids;
  };
  const isLeaf = (id: number) => !children.has(id);

  const [main, ...detached] = bones.filter((b) => b.parent < 0).map((b) => subtree(b.id));
  if (!main) return offsets;
  const mainLeaves = main.filter((id) => isLeaf(id) && bones[id]!.parent >= 0);

  for (const chain of detached) {
    let offset: Vec3 | null = null;
    let consistent = true;
    for (const leaf of chain.filter((id) => isLeaf(id) && bones[id]!.parent >= 0)) {
      const matches = mainLeaves.filter((id) =>
        near(bones[id]!.translation, bones[leaf]!.translation),
      );
      if (matches.length !== 1) continue;
      const target = world(bones[matches[0]!]!.parent);
      const source = world(bones[leaf]!.parent);
      const candidate = target.map((c, k) => c - source[k]!) as Vec3;
      if (offset && !near(offset, candidate)) consistent = false;
      offset ??= candidate;
    }
    if (!offset || !consistent || near(offset, [0, 0, 0])) continue;
    for (const id of chain) offsets.set(id, offset);
  }
  return offsets;
}

/**
 * The PMO with the vertices skinned to detached chains moved onto the main
 * hierarchy (see the module comment). The position scale grows to fit the
 * moved vertices; models without detached chains come back unchanged.
 */
export function attachDetachedParts(pmo: Pmo, bones: Bone[]): Pmo {
  const offsets = detachedBoneOffsets(bones);
  if (offsets.size === 0) return pmo;

  let moved = false;
  // Positions in model units, per primitive and vertex.
  const positions = pmo.meshes.map((mesh) =>
    mesh.primitives.map((primitive) =>
      primitive.geometry.vertices.map((v) => {
        const p = v.position.map((c, k) => c * pmo.scale[k]!) as Vec3;
        v.weights?.forEach((weight, slot) => {
          const offset = offsets.get(primitive.bones[slot] ?? -1);
          if (!offset || weight === 0) return;
          offset.forEach((c, k) => (p[k] = p[k]! + weight * c));
          moved = true;
        });
        return p;
      }),
    ),
  );
  if (!moved) return pmo;

  const scale = pmo.scale.map((s, k) =>
    Math.max(s, ...positions.flat(2).map((p) => Math.abs(p[k]!))),
  ) as Vec3;
  return {
    ...pmo,
    scale,
    meshes: pmo.meshes.map((mesh, m) => ({
      ...mesh,
      primitives: mesh.primitives.map((primitive, i) => ({
        ...primitive,
        geometry: {
          ...primitive.geometry,
          vertices: primitive.geometry.vertices.map((v, j) => ({
            ...v,
            position: positions[m]![i]![j]!.map((c, k) => c / scale[k]!) as Vec3,
            // Normals are stored in scaled model space (gltf.ts multiplies
            // them by the scale): rescale so n * scale keeps its direction.
            normal: v.normal?.map((c, k) => (c * pmo.scale[k]!) / scale[k]!) as Vec3 | undefined,
          })),
        },
      })),
    })),
  };
}
