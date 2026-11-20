/**
 * How the game passes a bone's scale on to its children: per axis, along
 * each child's own axes (Softimage's "hierarchical" scaling), not through
 * the parent's matrix as glTF and three.js do.
 *
 * Motions scale a bone and scale its children back: a Hermitaur's bone 11
 * by 0.5 along z and its grandchild 13, which carries the shell, by 2.
 * Through the matrices that only cancels while the bones between point the
 * same way. Shen Gaoren's skull (bone 13, 1.6875) hangs off a squashed bone
 * 11 (0.625) through bones bent some 35 degrees, and drawn the matrix way
 * the skull shears out of shape. Scaled per axis, the two come to 1.05 and
 * the skull keeps its shape.
 *
 * A bone's pose is translation `p`, rotation `q` and scale `s`, with
 * `s` = parent `s` * own scale (per axis), `q` = parent `q` * own rotation,
 * and `p` = parent `p` + parent `q` applied to (parent `s` * own
 * translation): a child sits where the scaled parent puts it, but the
 * parent's scale doesn't skew it.
 */

import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from "three";

/**
 * Poses the bones under a model as the game does. three.js stops updating
 * their world matrices (`matrixWorldAutoUpdate`); `update`, after each
 * motion step, sets them. Whatever hangs off a bone still follows it.
 */
export class GamePose {
  /** Every bone under the root, parents first. */
  private readonly bones: Bone[] = [];
  /** Each bone's parent in `bones`; -1 for the top of a chain. */
  private readonly parents: number[];
  /** The top of each bone's chain, whose parent's space the chain is posed in. */
  private readonly tops: number[] = [];
  /** Each bone's pose, in the space its chain's top bone hangs in. */
  private readonly p: Vector3[];
  private readonly q: Quaternion[];
  private readonly s: Vector3[];
  private readonly local = new Matrix4();

  constructor(root: Object3D) {
    root.traverse((object) => {
      if ((object as Bone).isBone) this.bones.push(object as Bone);
    });
    const index = new Map<Object3D, number>(this.bones.map((bone, i) => [bone, i]));
    this.parents = this.bones.map((bone) => (bone.parent && index.get(bone.parent)) ?? -1);
    this.parents.forEach((parent, i) => this.tops.push(parent < 0 ? i : this.tops[parent]!));
    this.p = this.bones.map(() => new Vector3());
    this.q = this.bones.map(() => new Quaternion());
    this.s = this.bones.map(() => new Vector3());
    for (const bone of this.bones) bone.matrixWorldAutoUpdate = false;
  }

  /** Sets the bones' world matrices from their local transforms. */
  update(): void {
    const { bones, parents, tops, p, q, s, local } = this;
    bones.forEach((bone, i) => {
      const j = parents[i]!;
      const space = bones[tops[i]!]!.parent;
      if (j < 0) {
        space?.updateWorldMatrix(true, false);
        p[i]!.copy(bone.position);
        q[i]!.copy(bone.quaternion);
        s[i]!.copy(bone.scale);
      } else {
        p[i]!.copy(bone.position).multiply(s[j]!).applyQuaternion(q[j]!).add(p[j]!);
        q[i]!.multiplyQuaternions(q[j]!, bone.quaternion);
        s[i]!.multiplyVectors(s[j]!, bone.scale);
      }
      local.compose(p[i]!, q[i]!, s[i]!);
      if (space) bone.matrixWorld.multiplyMatrices(space.matrixWorld, local);
      else bone.matrixWorld.copy(local);
    });
  }
}

/** Whether a motion scales a bone that has bones under it, the only case where `GamePose` differs. */
export function scalesParent(
  tracks: readonly { bone: number; path: string; values: ArrayLike<number> }[],
  hasChildBones: (bone: number) => boolean,
): boolean {
  return tracks.some(
    (track) =>
      track.path === "scale" &&
      hasChildBones(track.bone) &&
      Array.prototype.some.call(track.values, (v: number) => Math.abs(v - 1) > 1e-6),
  );
}
