/**
 * How the game passes a bone's scale on to its children: per axis, along
 * each child's own axes (Softimage's "hierarchical" scaling), not through
 * the parent's matrix as glTF and three.js do. Plain data here, so it can be
 * tested without three.js; ModelViewer poses a model's bones with it.
 *
 * Motions scale a bone and scale its children back: a Hermitaur's bone 11
 * by 0.5 along z and its grandchild 13, which carries the shell, by 2.
 * Through the matrices that only cancels while the bones between point the
 * same way. Shen Gaoren's skull (bone 13, 1.6875) hangs off a squashed bone
 * 11 (0.625) through bones bent some 35 degrees, and drawn the matrix way
 * the skull shears out of shape. Scaled per axis, the two come to 1.05 and
 * the skull keeps its shape.
 *
 * A bone's world is translation `p`, rotation `q` and scale `s`, with
 * `s` = parent `s` * own scale (per axis), `q` = parent `q` * own rotation,
 * and `p` = parent `p` + parent `q` applied to (parent `s` * own
 * translation): a child sits where the scaled parent puts it, but the
 * parent's scale doesn't skew it.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** A bone as a motion leaves it: its parent and its transform from the parent. */
export interface BoneLocal {
  /** Index of the parent in the same list (always earlier); -1 for a root. */
  parent: number;
  position: Readonly<Vec3>;
  quaternion: Readonly<Quat>;
  scale: Readonly<Vec3>;
}

/**
 * Each bone's matrix in the space its root's parent is in, column-major
 * (16 numbers a bone, as three.js's `Matrix4.elements`), into `out`.
 */
export function hierarchicalPose(
  bones: readonly BoneLocal[],
  out: Float64Array = new Float64Array(bones.length * 16),
): Float64Array {
  const p = new Float64Array(bones.length * 3);
  const q = new Float64Array(bones.length * 4);
  const s = new Float64Array(bones.length * 3);
  bones.forEach((bone, i) => {
    const [tx, ty, tz] = bone.position;
    const [bx, by, bz, bw] = bone.quaternion;
    const [sx, sy, sz] = bone.scale;
    const j = bone.parent;
    if (j < 0) {
      p.set([tx, ty, tz], i * 3);
      q.set([bx, by, bz, bw], i * 4);
      s.set([sx, sy, sz], i * 3);
    } else {
      if (j >= i) throw new Error(`Bone ${i} comes before its parent ${j}`);
      const [ax, ay, az, aw] = [q[j * 4]!, q[j * 4 + 1]!, q[j * 4 + 2]!, q[j * 4 + 3]!];
      const [px, py, pz] = [s[j * 3]!, s[j * 3 + 1]!, s[j * 3 + 2]!];
      // Parent rotation applied to the parent-scaled translation.
      const [vx, vy, vz] = rotate([ax, ay, az, aw], [tx * px, ty * py, tz * pz]);
      p.set([p[j * 3]! + vx, p[j * 3 + 1]! + vy, p[j * 3 + 2]! + vz], i * 3);
      q.set(
        [
          aw * bx + ax * bw + ay * bz - az * by,
          aw * by - ax * bz + ay * bw + az * bx,
          aw * bz + ax * by - ay * bx + az * bw,
          aw * bw - ax * bx - ay * by - az * bz,
        ],
        i * 4,
      );
      s.set([px * sx, py * sy, pz * sz], i * 3);
    }
    compose(p.subarray(i * 3), q.subarray(i * 4), s.subarray(i * 3), out, i * 16);
  });
  return out;
}

/** `v` turned by unit quaternion `q`. */
function rotate([x, y, z, w]: Quat, [vx, vy, vz]: Vec3): Vec3 {
  // v + 2w(u x v) + 2u x (u x v), with u the vector part.
  const cx = y * vz - z * vy;
  const cy = z * vx - x * vz;
  const cz = x * vy - y * vx;
  return [
    vx + 2 * (w * cx + y * cz - z * cy),
    vy + 2 * (w * cy + z * cx - x * cz),
    vz + 2 * (w * cz + x * cy - y * cx),
  ];
}

/** Translation * rotation * scale, column-major, at `out[at]` (three.js's `Matrix4.compose`). */
function compose(
  p: Float64Array,
  q: Float64Array,
  s: Float64Array,
  out: Float64Array,
  at: number,
): void {
  const [x, y, z, w] = [q[0]!, q[1]!, q[2]!, q[3]!];
  const [sx, sy, sz] = [s[0]!, s[1]!, s[2]!];
  const [x2, y2, z2] = [x + x, y + y, z + z];
  const [xx, xy, xz] = [x * x2, x * y2, x * z2];
  const [yy, yz, zz] = [y * y2, y * z2, z * z2];
  const [wx, wy, wz] = [w * x2, w * y2, w * z2];
  out.set(
    [
      (1 - (yy + zz)) * sx,
      (xy + wz) * sx,
      (xz - wy) * sx,
      0,
      (xy - wz) * sy,
      (1 - (xx + zz)) * sy,
      (yz + wx) * sy,
      0,
      (xz + wy) * sz,
      (yz - wx) * sz,
      (1 - (xx + yy)) * sz,
      0,
      p[0]!,
      p[1]!,
      p[2]!,
      1,
    ],
    at,
  );
}
