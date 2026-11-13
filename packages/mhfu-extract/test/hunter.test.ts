import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bone } from "../src/models/ahi.js";
import { buildPlayerClips, PLAYER_GROUP_SLOTS } from "../src/models/animation.js";
import { buildGlb } from "../src/models/gltf.js";
import {
  ARMOR_JOINT_MAPS,
  boneRoots,
  composeHunter,
  JOINT,
  PLAYER_BONE_COUNT,
  type HunterPiece,
} from "../src/models/hunter.js";
import type { Motion } from "../src/models/motion.js";
import type { Pmo } from "../src/models/pmo.js";

const bone = (
  id: number,
  parent: number,
  translation: [number, number, number],
  part = 0,
): Bone => ({
  id,
  parent,
  scale: [1, 1, 1],
  rotation: [0, 0, 0],
  translation,
  part,
});

/** A straight chain of 21 bones standing in for the player skeleton: bone 14 at (72, 36, -2). */
function playerSkeleton(): Bone[] {
  return Array.from({ length: PLAYER_BONE_COUNT }, (_, id) => {
    if (id === 0) return bone(0, -1, [0, 0, 0]);
    return bone(id, id - 1, [0, 0, 0], id < 9 ? 0 : 1);
  }).map((b) => (b.id === JOINT.CHEST ? { ...b, translation: [0, 14.4, 0] } : b));
}

function piece(slot: HunterPiece["slot"], bones: Bone[], palette: number[]): HunterPiece {
  const pmo: Pmo = {
    radius: 1,
    scale: [10, 10, 10],
    materials: [{ diffuse: 0, ambient: 0, textureIndex: 0 }],
    meshes: [
      {
        uvScale: [1, 1],
        primitives: [
          {
            materialIndex: 0,
            bones: palette,
            geometry: {
              vertices: [
                {
                  position: [0.1, 0.1, 0.1],
                  normal: [0, 1, 0],
                  uv: [0, 0],
                  weights: [1],
                  sizes: { position: 2, normal: 1, uv: 2 },
                },
              ] as never,
              triangles: [[0, 0, 0]],
            } as never,
          },
        ],
      },
    ],
  };
  return {
    slot,
    pmo,
    bones,
    textures: [{ width: 1, height: 1, indices: [], palette: [] }] as never,
  };
}

test("composeHunter moves a piece's vertices onto the player skeleton and joints", () => {
  const skeleton = playerSkeleton();
  const legs = piece("leggings", skeleton, [JOINT.LEFT_FOOT]);
  // A gauntlet: its chest bone (index 1) sits 14.4 lower than the player's.
  const arms = piece(
    "gauntlets",
    Array.from({ length: 10 }, (_, i) => bone(i, i - 1, [0, 0, 0])),
    [1],
  );
  const { pmo, textures, bones, meshSlots } = composeHunter([legs, arms]);
  assert.equal(bones.length, PLAYER_BONE_COUNT);
  assert.deepEqual(meshSlots, ["leggings", "gauntlets"]);
  assert.equal(textures.length, 2);
  assert.equal(pmo.meshes[1]!.primitives[0]!.materialIndex, 1);
  // Bone 1 maps to the chest, and its vertices rise by the chest's height.
  assert.deepEqual(pmo.meshes[1]!.primitives[0]!.bones, [JOINT.CHEST]);
  const vertex = pmo.meshes[1]!.primitives[0]!.geometry.vertices[0]!;
  assert.ok(Math.abs(vertex.position[1]! * pmo.scale[1] - 15.4) < 1e-6);
});

test("composeHunter needs leggings, and bones with a joint", () => {
  const arms = piece("gauntlets", [bone(0, -1, [0, 0, 0])], [0]);
  assert.throws(() => composeHunter([arms]), /leggings/);
  const legs = piece("leggings", playerSkeleton(), [JOINT.HIPS]);
  const tooMany = piece(
    "helmet",
    Array.from({ length: 6 }, (_, i) => bone(i, -1, [0, 0, 0])),
    [5],
  );
  assert.throws(() => composeHunter([legs, tooMany]), /no player joint/);
  assert.equal(ARMOR_JOINT_MAPS.waist.length, 7);
});

test("boneRoots numbers each root's bones in skeleton order", () => {
  assert.deepEqual(
    boneRoots([
      bone(0, -1, [0, 0, 0]),
      bone(1, 0, [0, 0, 0]),
      bone(2, -1, [0, 0, 0]),
      bone(3, 2, [0, 0, 0]),
    ]),
    [0, 0, 1, 1],
  );
});

function motion(frames: number, count: number): Motion {
  return { loop: false, loopStart: 0, frames, bones: Array.from({ length: count }, () => []) };
}

test("buildPlayerClips pairs a group's tables and numbers clips by group", () => {
  const bones = [bone(0, -1, [0, 0, 0], 0), bone(1, 0, [0, 0, 0], 1)];
  const clips = buildPlayerClips(bones, [
    [null, motion(10, 1)],
    [null, motion(10, 1)],
    [motion(20, 1), null],
    [motion(20, 1), null],
  ]);
  assert.deepEqual(
    clips.map((clip) => clip.slot),
    [1, PLAYER_GROUP_SLOTS],
  );
  assert.equal(clips[1]!.duration, 20 / 60);
});

test("buildGlb writes one named node per piece when a model has several", async () => {
  const shared = {
    weights: [1],
    position: [0, 0, 0],
    normal: [0, 1, 0],
    uv: [0, 0],
    sizes: { position: 2, normal: 1, uv: 2 },
  };
  const geometry = { vertices: [shared, shared, shared], triangles: [[0, 1, 2]] } as never;
  const pmo: Pmo = {
    radius: 1,
    scale: [1, 1, 1],
    materials: [{ diffuse: 0, ambient: 0, textureIndex: 0 }],
    meshes: [
      {
        uvScale: [1, 1],
        primitives: [
          { materialIndex: 0, bones: [1], geometry },
          { materialIndex: 0, bones: [4], geometry },
        ],
      },
    ],
  };
  const { glb } = await buildGlb(pmo, [], "weapon", {
    compress: false,
    partOf: (_mesh, primitive) => primitive,
  });
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf-8")) as {
    nodes: { name?: string; mesh?: number }[];
    meshes: unknown[];
  };
  assert.deepEqual(
    json.nodes.map((node) => node.name),
    ["part_0", "part_1"],
  );
  assert.equal(json.meshes.length, 2);
});

test("buildGlb keeps a skinned model's pieces on one mesh, each primitive naming its piece", async () => {
  const legs = piece("leggings", playerSkeleton(), [JOINT.HIPS]);
  const head = piece(
    "helmet",
    [0, 1, 2, 3].map((i) => bone(i, i - 1, [0, 0, 0])),
    [3],
  );
  const hunter = composeHunter([head, legs]);
  const { glb } = await buildGlb(
    hunter.pmo,
    [],
    "hunter",
    {
      compress: false,
      webp: false,
      partOf: (mesh) => (hunter.meshSlots[mesh] === "helmet" ? 0 : 4),
    },
    { bones: hunter.bones },
  );
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf-8")) as {
    nodes: { mesh?: number; skin?: number }[];
    meshes: { primitives: { extras?: { part: number } }[] }[];
  };
  assert.equal(json.meshes.length, 1);
  assert.deepEqual(json.nodes[0], { mesh: 0, skin: 0 });
  assert.deepEqual(
    json.meshes[0]!.primitives.map((primitive) => primitive.extras?.part),
    [0, 4],
  );
});

test("composeHunter keeps a texture index past a piece's own off the next piece's textures", () => {
  const skin = { width: 1, height: 1, rgba: Buffer.alloc(4), hasAlpha: false };
  const legs = piece("leggings", playerSkeleton(), [JOINT.HIPS]);
  const arms = piece(
    "gauntlets",
    Array.from({ length: 10 }, (_, i) => bone(i, i - 1, [0, 0, 0])),
    [1],
  );
  // The leggings' material points one past their own texture: the skin's slot.
  legs.pmo.materials[0] = { ...legs.pmo.materials[0]!, textureIndex: 1 };
  const bare = composeHunter([legs, arms]);
  // Without a skin, it is no texture at all, not the gauntlets'.
  assert.ok(bare.pmo.materials[0]!.textureIndex >= bare.textures.length);
  assert.equal(bare.pmo.materials[1]!.textureIndex, 1);

  // With the skin after each piece's own textures, both pieces share one image.
  legs.textures = [...legs.textures, skin];
  arms.textures = [...arms.textures, skin];
  const dressed = composeHunter([legs, arms]);
  assert.equal(dressed.textures.length, 3);
  assert.equal(dressed.textures[dressed.pmo.materials[0]!.textureIndex], skin);
  assert.equal(dressed.pmo.materials[1]!.textureIndex, 2);
});
