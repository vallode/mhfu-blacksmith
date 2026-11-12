/**
 * Which bone a hitbox capsule rides on when its model animates. The site's
 * hitbox files place each capsule in the bind pose without naming its joint
 * (see packages/mhfu-extract `monsters/hitboxes.ts`), so ModelViewer works it
 * out from the skin: the bone that carries most of the mesh inside the
 * capsule. Plain data here, so it can be tested without three.js.
 */

type Vec3 = [number, number, number];

/** A skinned model's vertices in the bind pose, as flat arrays. */
export interface BindSkin {
  /** x y z per vertex, in the capsules' space. */
  positions: ArrayLike<number>;
  /** 4 bone indices per vertex (into the caller's bone list). */
  bones: ArrayLike<number>;
  /** 4 weights per vertex, matching `bones`. */
  weights: ArrayLike<number>;
}

/** Squared distance from vertex `i` to the segment from `start` to `end`. */
function distanceSq(positions: ArrayLike<number>, i: number, start: Vec3, end: Vec3): number {
  const [ax, ay, az] = start;
  const dx = end[0] - ax;
  const dy = end[1] - ay;
  const dz = end[2] - az;
  const px = positions[i * 3]! - ax;
  const py = positions[i * 3 + 1]! - ay;
  const pz = positions[i * 3 + 2]! - az;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy + pz * dz) / lengthSq)) : 0;
  const ex = px - t * dx;
  const ey = py - t * dy;
  const ez = pz - t * dz;
  return ex * ex + ey * ey + ez * ez;
}

/**
 * The bone with the most skin weight among the vertices inside the capsule
 * (a sphere of `radius` swept from `start` to `end`); for a capsule with no
 * vertex inside, the main bone of the nearest one. Null without vertices.
 */
export function capsuleBone(skin: BindSkin, start: Vec3, end: Vec3, radius: number): number | null {
  const count = Math.floor(skin.positions.length / 3);
  const totals = new Map<number, number>();
  const radiusSq = radius * radius;
  let nearest = -1;
  let nearestSq = Infinity;
  for (let i = 0; i < count; i++) {
    const d = distanceSq(skin.positions, i, start, end);
    if (d <= radiusSq) {
      for (let k = i * 4; k < i * 4 + 4; k++) {
        const weight = skin.weights[k]!;
        if (weight > 0) totals.set(skin.bones[k]!, (totals.get(skin.bones[k]!) ?? 0) + weight);
      }
    } else if (d < nearestSq) {
      nearestSq = d;
      nearest = i;
    }
  }
  if (totals.size === 0 && nearest >= 0) {
    for (let k = nearest * 4; k < nearest * 4 + 4; k++)
      totals.set(skin.bones[k]!, (totals.get(skin.bones[k]!) ?? 0) + skin.weights[k]!);
  }
  let best: number | null = null;
  let bestWeight = 0;
  for (const [bone, weight] of totals) {
    if (weight > bestWeight) {
      best = bone;
      bestWeight = weight;
    }
  }
  return best;
}
