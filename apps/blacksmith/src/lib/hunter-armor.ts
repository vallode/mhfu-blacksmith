/**
 * Dressing the viewer's hunter in an armor piece: the piece's model takes the
 * place of the default set's in its slot, skinned to the hunter's skeleton so
 * it moves with the hunter's motions.
 *
 * The hunter (`HUNTER_MODEL`, `HUNTER_FEMALE_MODEL` in `hunter.ts`) is the
 * default armor set of one sex composed on that sex's skeleton (mhfu-extract's
 * `models/hunter.ts`), each primitive naming its slot by index in
 * `HUNTER_SLOTS` (`extras.part`). A piece goes on the hunter of its own sex:
 * the two skeletons differ.
 *
 * An armor piece's own model is unskinned and sits where its package's
 * partial skeleton puts it: around the joint its first bone maps to
 * (`SLOT_ROOT`), at the origin. So a piece goes on the hunter moved to that
 * joint, and takes its bone weights from the default piece of the same slot,
 * vertex by nearest vertex: the game's pieces of a slot share one skeleton
 * and are weighted alike.
 *
 * three.js comes in as an argument, as the viewer imports it on demand.
 */
import { ARMOR_SLOTS, type ArmorSlot } from "@/lib/constants";

type Three = typeof import("three");

export type HunterSlot = ArmorSlot;

/** The slots, in the order the hunter's primitives number them (mhfu-extract's `HUNTER_ARMOR`). */
export const HUNTER_SLOTS: readonly HunterSlot[] = ARMOR_SLOTS;

/**
 * The player joint each slot's piece is modelled around: the one its
 * skeleton's first bone maps to (mhfu-extract's `ARMOR_JOINT_MAPS[slot][1]`).
 * Chest for helmets and gauntlets, the hips for the rest (at the origin).
 */
export const SLOT_ROOT: Record<HunterSlot, number> = {
  helmet: 10,
  plate: 2,
  gauntlets: 10,
  waist: 2,
  leggings: 1,
};

/** Which piece the hunter wears: its slot, and its sex, which picks the hunter's model. */
export interface HunterOutfit {
  slot: HunterSlot;
  sex: "male" | "female";
}

/** Vertices with skin weights: 3 numbers a position, 4 joints and 4 weights a vertex. */
export interface SkinSource {
  positions: ArrayLike<number>;
  joints: ArrayLike<number>;
  weights: ArrayLike<number>;
}

/** Source vertices blended into each target vertex's weights. */
const NEIGHBOURS = 4;

/**
 * Skin weights for `positions` (3 numbers a vertex) from the nearest
 * vertices of `source`, blended by inverse squared distance so weights
 * change smoothly between the source's vertices: four joints a vertex, the
 * heaviest, normalized.
 */
export function transferSkin(
  positions: ArrayLike<number>,
  source: SkinSource,
): { joints: Uint16Array; weights: Float32Array } {
  const count = positions.length / 3;
  const sourceCount = source.positions.length / 3;
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const near = new Int32Array(NEIGHBOURS);
  const nearDistance = new Float64Array(NEIGHBOURS);
  const total = new Map<number, number>();
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    near.fill(-1);
    nearDistance.fill(Infinity);
    // Brute force: a slot's default piece has a few hundred vertices.
    for (let s = 0; s < sourceCount; s++) {
      const dx = source.positions[s * 3]! - x;
      const dy = source.positions[s * 3 + 1]! - y;
      const dz = source.positions[s * 3 + 2]! - z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance >= nearDistance[NEIGHBOURS - 1]!) continue;
      let k = NEIGHBOURS - 1;
      while (k > 0 && nearDistance[k - 1]! > distance) {
        nearDistance[k] = nearDistance[k - 1]!;
        near[k] = near[k - 1]!;
        k--;
      }
      nearDistance[k] = distance;
      near[k] = s;
    }
    total.clear();
    for (let k = 0; k < NEIGHBOURS; k++) {
      const s = near[k]!;
      if (s < 0) break;
      // A vertex on top of a source vertex takes its weights outright.
      const share = 1 / Math.max(nearDistance[k]!, 1e-6);
      for (let j = 0; j < 4; j++) {
        const weight = source.weights[s * 4 + j]!;
        if (weight <= 0) continue;
        const joint = source.joints[s * 4 + j]!;
        total.set(joint, (total.get(joint) ?? 0) + share * weight);
      }
    }
    const heaviest = [...total].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = heaviest.reduce((acc, [, weight]) => acc + weight, 0);
    heaviest.forEach(([joint, weight], j) => {
      joints[v * 4 + j] = joint;
      weights[v * 4 + j] = sum > 0 ? weight / sum : 0;
    });
  }
  return { joints, weights };
}

/**
 * Puts `piece` (an armor piece's loaded glTF scene) on the hunter (the
 * hunter model's scene) in place of the default set's piece of `slot`. Its
 * meshes move into the hunter's model, keeping their materials; the replaced
 * default meshes are dropped. Throws, leaving the hunter as it was, when its
 * model isn't laid out as expected.
 */
export function dressHunter(
  THREE: Three,
  hunter: import("three").Object3D,
  slot: HunterSlot,
  piece: import("three").Object3D,
) {
  const defaults: import("three").SkinnedMesh[] = [];
  hunter.traverse((object) => {
    if ((object as import("three").SkinnedMesh).isSkinnedMesh)
      defaults.push(object as import("three").SkinnedMesh);
  });
  // Each primitive names its slot (`extras.part`); an export from before
  // that has one primitive per slot, in slot order.
  const tagged = defaults.every((mesh) => typeof mesh.geometry.userData.part === "number");
  if (!tagged && defaults.length !== HUNTER_SLOTS.length)
    throw new Error(`hunter has ${defaults.length} untagged meshes, not one a slot`);
  const replaced = defaults.filter(
    (mesh, i) => HUNTER_SLOTS[tagged ? (mesh.geometry.userData.part as number) : i] === slot,
  );
  if (replaced.length === 0) throw new Error(`hunter has no ${slot}`);
  hunter.updateMatrixWorld(true);
  const { skeleton, bindMatrix } = defaults[0]!;
  // Skinned, the model's scale is in the inverse bind matrices: in the bind
  // pose a bone's matrix times its inverse takes the mesh's stored positions
  // to the model's units.
  const toModel = new THREE.Matrix4().multiplyMatrices(
    skeleton.bones[0]!.matrixWorld,
    skeleton.boneInverses[0]!,
  );
  const fromModel = toModel.clone().invert();
  const vertex = new THREE.Vector3();

  // The default piece's vertices, in the model's units, as weights to copy.
  const source = { positions: [] as number[], joints: [] as number[], weights: [] as number[] };
  for (const mesh of replaced) {
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!position || !skinIndex || !skinWeight) throw new Error(`${slot}: no skin`);
    // A glTF mesh's primitives share their vertices: take the slot's own.
    const index = mesh.geometry.index;
    const used = index ? new Set(Array.from(index.array)) : Array(position.count).keys();
    for (const i of used) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(toModel);
      source.positions.push(vertex.x, vertex.y, vertex.z);
      source.joints.push(
        skinIndex.getX(i),
        skinIndex.getY(i),
        skinIndex.getZ(i),
        skinIndex.getW(i),
      );
      source.weights.push(
        skinWeight.getX(i),
        skinWeight.getY(i),
        skinWeight.getZ(i),
        skinWeight.getW(i),
      );
    }
  }

  const root = skeleton.bones[SLOT_ROOT[slot]];
  if (!root) throw new Error(`${slot}: no joint ${SLOT_ROOT[slot]}`);
  const offset = root.getWorldPosition(new THREE.Vector3());
  const meshes: import("three").SkinnedMesh[] = [];
  piece.updateMatrixWorld(true);
  piece.traverse((object) => {
    const mesh = object as import("three").Mesh;
    if (!mesh.isMesh) return;
    const { position, normal, uv } = mesh.geometry.attributes;
    if (!position) return;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const positions = new Float32Array(position.count * 3);
    const stored = new Float32Array(position.count * 3);
    const normals = normal ? new Float32Array(normal.count * 3) : null;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).add(offset);
      vertex.toArray(positions, i * 3);
      vertex.applyMatrix4(fromModel).toArray(stored, i * 3);
      if (normal && normals)
        // three.js skins normals by the skinning matrix itself, which
        // scales them as positions: store them divided by that scale.
        vertex
          .fromBufferAttribute(normal, i)
          .applyMatrix3(normalMatrix)
          .transformDirection(fromModel)
          .toArray(normals, i * 3);
    }
    const { joints, weights } = transferSkin(positions, source);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(stored, 3));
    if (normals) geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    if (uv) geometry.setAttribute("uv", uv);
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(joints, 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(weights, 4));
    if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index);
    const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
    skinned.name = `${slot}_${meshes.length}`;
    meshes.push(skinned);
  });
  if (meshes.length === 0) throw new Error(`${slot}: no mesh`);

  // Only now change the hunter, once the piece is ready.
  const place = replaced[0]!;
  for (const mesh of meshes) {
    mesh.position.copy(place.position);
    mesh.quaternion.copy(place.quaternion);
    mesh.scale.copy(place.scale);
    place.parent!.add(mesh);
    mesh.bind(skeleton, bindMatrix);
  }
  // Never drawn, so nothing to free; their vertices are shared with the
  // other slots' meshes, so their geometry mustn't be disposed either.
  for (const mesh of replaced) mesh.removeFromParent();
}
