/**
 * Props a monster wears from its package's second model.
 *
 * Shakalaka packages (`em57`, `em79`) carry a second PMO after the body: the
 * props a Shakalaka hides under (bamboo shoot, mushroom, crystal, rock) and
 * the meat grill King Shakalaka wears as a crown. Both packages have the
 * same props, unskinned and modelled around the origin. Nothing in the
 * package says which prop goes where: the monster's code picks one and draws
 * it on a bone. Without its grill, a King Shakalaka looks like any other
 * Shakalaka with a club.
 *
 * `WORN` says which prop mesh a package draws on which bone, as it spawns.
 * The grill's bone is the one its mask is skinned to. Its offset is fitted by
 * eye to renders of the King (rim above the eyes); the game's own transform
 * is in its code and hasn't been read.
 */
import { bindMatrices, normalMatrix, transform, type Vec3 } from "./animation.js";
import type { Bone } from "./ahi.js";
import { placeVertices } from "./attach.js";
import type { PacEntry } from "./pac.js";
import { isPmo, readPmo, type Pmo } from "./pmo.js";
import { isTmh, readTmh, type TmhImage } from "./tmh.js";

export interface WornProp {
  /** Mesh index in the package's second PMO. */
  mesh: number;
  /** Bone (in the body's skeleton) the prop is carried by. */
  bone: number;
  /** Where the prop's origin sits, from the bone, in model units. */
  offset: Vec3;
}

/** Keyed by package, `emNN`. */
export const WORN: Record<string, WornProp[]> = {
  // The meat grill, on the head.
  em79: [{ mesh: 4, bone: 11, offset: [0, 16, 11] }],
};

/**
 * The body with package `pac`'s worn props added, each skinned wholly to its
 * bone, and the textures with the props' appended. The props' PMO is the
 * first after the body's (`pmoIndex`), its textures the first TMH after it.
 * The position scale grows to fit them (attach.ts). Unchanged when the
 * package wears nothing; throws when the package doesn't have what `table`
 * names.
 */
export function wearProps(
  pac: string,
  entries: PacEntry[],
  pmoIndex: number,
  body: Pmo,
  bones: Bone[],
  textures: TmhImage[],
  table: Record<string, WornProp[]> = WORN,
): { pmo: Pmo; textures: TmhImage[] } {
  const worn = table[pac];
  if (!worn?.length) return { pmo: body, textures };
  const propsAt = entries.findIndex((entry, i) => i > pmoIndex && isPmo(entry.data));
  const tmh = entries.slice(propsAt + 1).find((entry) => isTmh(entry.data));
  if (propsAt < 0 || !tmh) throw new Error(`${pac}: no props model`);
  // The props' textures go after the body's; a body material past them
  // would draw with a prop's.
  const textureBase = textures.length;
  if (body.materials.some((m) => m.textureIndex >= textureBase))
    throw new Error(`${pac}: body textures missing`);
  const props = readPmo(entries[propsAt]!.data);
  const binds = bindMatrices(bones);
  const materialBase = body.materials.length;

  const wornMeshes = worn.map(({ mesh, bone, offset }) => {
    const source = props.meshes[mesh];
    const bind = binds[bone];
    if (!source || !bind) throw new Error(`${pac}: no prop mesh ${mesh} or bone ${bone}`);
    const turn = normalMatrix(bind);
    return {
      ...source,
      primitives: source.primitives.map((primitive) => ({
        ...primitive,
        materialIndex: primitive.materialIndex + materialBase,
        bones: [bone],
        geometry: {
          ...primitive.geometry,
          vertices: primitive.geometry.vertices.map((v) => ({
            ...v,
            // In model units for now; placeVertices normalizes them.
            position: transform(
              bind,
              v.position.map((c, k) => c * props.scale[k]! + offset[k]!) as Vec3,
              1,
            ),
            // Stored so that n * scale keeps its direction (gltf.ts), at the body's scale.
            normal:
              v.normal &&
              (transform(turn, v.normal.map((c, k) => c * props.scale[k]!) as Vec3, 0).map(
                (c, k) => c / body.scale[k]!,
              ) as Vec3),
            weights: [1],
          })),
        },
      })),
    };
  });

  const pmo = {
    ...body,
    materials: [
      ...body.materials,
      ...props.materials.map((m) => ({ ...m, textureIndex: m.textureIndex + textureBase })),
    ],
    meshes: [...body.meshes, ...wornMeshes],
  };
  // A body s16 of -32768 reads as just past -1; gltf.ts clamps it, so it
  // mustn't grow the scale (and re-round every other vertex) either.
  const clamp = (c: number) => Math.max(-1, Math.min(1, c));
  const positions = [
    ...body.meshes.map((mesh) =>
      mesh.primitives.map((p) =>
        p.geometry.vertices.map((v) => v.position.map((c, k) => clamp(c) * body.scale[k]!) as Vec3),
      ),
    ),
    ...wornMeshes.map((mesh) =>
      mesh.primitives.map((p) => p.geometry.vertices.map((v) => v.position)),
    ),
  ];
  return {
    pmo: placeVertices(pmo, positions),
    textures: [...textures, ...readTmh(tmh.data)],
  };
}
