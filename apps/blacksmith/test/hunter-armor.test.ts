import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CLOTHING_MODELS,
  FACE_MASK as GAME_FACE_MASK,
  FACE_PART,
  HAIR_PART as GAME_HAIR_PART,
  HUNTER_CLOTHING,
  HUNTER_FACE,
  HUNTER_HAIR_COLOR,
  HUNTER_HAIRSTYLE,
} from "mhfu-extract/src/models/look.js";
import {
  ARMOR_JOINT_MAPS,
  HUNTER_ARMOR,
  PIECE_JOINT_MAPS,
} from "mhfu-extract/src/models/hunter.js";
import {
  dressHunter,
  dyeHair,
  FACE_MASK,
  FACE_PARTS,
  faceMask,
  HAIR_PART,
  HUNTER_SLOTS,
  partSlot,
  skinHunter,
  SLOT_ROOT,
  transferSkin,
} from "../src/lib/hunter-armor";
import {
  clampLook,
  CLOTHING_COUNT,
  CLOTHING_SLOTS,
  DEFAULT_LOOK,
  lookFromSave,
  type LookOptions,
} from "../src/lib/hunter-look";
import { armorModelFile, armorSlotModelUrl } from "../src/lib/models";

// The viewer reads files `export-site` writes; these copies must match it.

test("slots are in the order the hunter's pieces are composed", () => {
  assert.deepEqual(HUNTER_SLOTS, Object.keys(HUNTER_ARMOR));
});

test("each slot's piece hangs from its skeleton's first mapped joint", () => {
  for (const slot of HUNTER_SLOTS) assert.equal(SLOT_ROOT[slot], ARMOR_JOINT_MAPS[slot][1], slot);
  assert.equal(SLOT_ROOT.face, PIECE_JOINT_MAPS.face[1]);
});

test("the face's parts and mask bits are the export's", () => {
  assert.deepEqual(FACE_PARTS, [FACE_PART, FACE_PART + 1]);
  assert.equal(FACE_PART, HUNTER_SLOTS.length);
  assert.deepEqual(FACE_MASK, GAME_FACE_MASK);
});

test("the hair's part is the export's, and part of the helmet slot", () => {
  assert.equal(HAIR_PART, GAME_HAIR_PART);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(partSlot), [
    ...HUNTER_SLOTS,
    "face",
    "face",
    "helmet",
    undefined,
  ]);
});

test("the default look is the bare hunter's, and the clothes are the export's", () => {
  assert.deepEqual(DEFAULT_LOOK, {
    face: HUNTER_FACE,
    hair: HUNTER_HAIRSTYLE,
    hairColor: HUNTER_HAIR_COLOR,
    clothing: HUNTER_CLOTHING,
  });
  assert.deepEqual(CLOTHING_SLOTS, Object.keys(CLOTHING_MODELS.m));
  for (const sex of ["m", "f"] as const)
    for (const slot of CLOTHING_SLOTS)
      assert.equal(CLOTHING_MODELS[sex][slot].length, CLOTHING_COUNT, `${sex} ${slot}`);
  // The default clothes at the first skin tone are the bare hunter's model 0.
  assert.equal(CLOTHING_MODELS.m.plate[HUNTER_CLOTHING]![0], 0);
  assert.equal(armorSlotModelUrl("plate", "m", 0), "/models/armor/m_body000.glb");
});

test("a save's look reads its hair colour from the game's 0xAABBGGRR", () => {
  assert.deepEqual(lookFromSave({ face: 3, hair: 14, hairColor: 0xff112233, clothing: 4 }), {
    face: 3,
    hair: 14,
    hairColor: 0x332211,
    clothing: 4,
  });
});

test("a look is brought within what the export offers", () => {
  const options = { faces: 32, hairstyles: 27 } as LookOptions;
  assert.deepEqual(clampLook({ face: 31, hair: 26, hairColor: 0xffffff, clothing: 7 }, options), {
    face: 31,
    hair: 26,
    hairColor: 0xffffff,
    clothing: 7,
  });
  assert.deepEqual(clampLook({ face: 32, hair: 40, hairColor: -1, clothing: 8 }, options), {
    face: 0,
    hair: 0,
    hairColor: 0,
    clothing: 0,
  });
});

/** A bare hunter: one skinned triangle a part, on one bone. */
function hunterModel(parts: number[]) {
  const root = new THREE.Group();
  const bones = Array.from({ length: 21 }, () => new THREE.Bone());
  root.add(bones[0]!);
  for (const bone of bones.slice(1)) bones[0]!.add(bone);
  const skeleton = new THREE.Skeleton(bones);
  for (const part of parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4),
    );
    geometry.userData.part = part;
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = `part ${part}`;
    root.add(mesh);
    mesh.bind(skeleton);
  }
  return root;
}

/** A piece placed on the player skeleton: a triangle a material, tagged `parts` if given. */
function pieceModel(parts: (number | undefined)[], materials?: THREE.Material[]) {
  const root = new THREE.Group();
  parts.forEach((part, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute("_joints_0", new THREE.BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute(
      "_weights_0",
      new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4),
    );
    if (part !== undefined) geometry.userData.part = part;
    root.add(new THREE.Mesh(geometry, materials?.[i] ?? new THREE.MeshStandardMaterial()));
  });
  return root;
}

const partsOf = (hunter: THREE.Object3D) => {
  const parts: number[] = [];
  hunter.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) parts.push(mesh.geometry.userData.part as number);
  });
  return parts.sort((a, b) => a - b);
};

test("the hunter can be dressed again: pieces keep their parts", () => {
  const hunter = hunterModel([0, 1, 2, 3, 4, 5, 6, 7]);
  const hair = new THREE.MeshStandardMaterial();
  // A face, and a hairstyle (its hair, and a tie that is the helmet's).
  dressHunter(THREE, hunter, [
    { slot: "face", model: pieceModel([5, 6]) },
    { slot: "helmet", model: pieceModel([HAIR_PART, 0], [hair]) },
  ]);
  assert.deepEqual(partsOf(hunter), [0, 1, 2, 3, 4, 5, 6, 7]);
  // A helmet over it takes the whole hairstyle's place; untagged, it's the helmet's.
  dressHunter(THREE, hunter, [{ slot: "helmet", model: pieceModel([undefined, undefined]) }]);
  assert.deepEqual(partsOf(hunter), [0, 0, 1, 2, 3, 4, 5, 6]);
  // And the clothes, then armor, in a slot.
  dressHunter(THREE, hunter, [{ slot: "plate", model: pieceModel([undefined]) }]);
  dressHunter(THREE, hunter, [{ slot: "plate", model: pieceModel([undefined]) }]);
  assert.deepEqual(partsOf(hunter), [0, 0, 1, 2, 3, 4, 5, 6]);
});

test("the hair is dyed and the skin toned on the hunter's own materials", () => {
  const hunter = hunterModel([0, 1]);
  const hair = new THREE.MeshStandardMaterial();
  const skin = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  skin.map!.flipY = false;
  skin.map!.wrapS = THREE.RepeatWrapping;
  skin.userData.skin = 0;
  dressHunter(THREE, hunter, [
    { slot: "helmet", model: pieceModel([HAIR_PART], [hair]) },
    { slot: "plate", model: pieceModel([undefined], [skin]) },
  ]);
  dyeHair(hunter, 0xff0000);
  const tone = new THREE.Texture();
  skinHunter(hunter, (k) => (k === 0 ? tone : undefined));
  const byPart = new Map<number, THREE.MeshStandardMaterial>();
  hunter.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh)
      byPart.set(
        mesh.geometry.userData.part as number,
        mesh.material as THREE.MeshStandardMaterial,
      );
  });
  assert.equal(byPart.get(HAIR_PART)!.color.getHex(), 0xff0000);
  const plate = byPart.get(1)!;
  assert.equal(plate.map!.source, tone.source);
  assert.equal(plate.map!.flipY, false);
  assert.equal(plate.map!.wrapS, THREE.RepeatWrapping);
  // The pieces' own materials are as loaded, to be worn again.
  assert.equal(hair.color.getHex(), 0xffffff);
  assert.notEqual(skin.map!.source, tone.source);
});

test("a helmet's face mask is looked up by its model ID", () => {
  const masks = { "3": FACE_MASK.ALL, "5": FACE_MASK.MATERIAL_0 };
  assert.equal(faceMask(masks, 3), FACE_MASK.ALL);
  assert.equal(faceMask(masks, 5), FACE_MASK.MATERIAL_0);
  assert.equal(faceMask(masks, 33), 0);
  assert.equal(faceMask(undefined, 3), 0);
});

test("an armor model's slot, sex and ID come from its URL", () => {
  assert.deepEqual(armorModelFile("/models/armor/m_hair003.glb"), {
    slot: "helmet",
    sex: "m",
    id: 3,
  });
  assert.deepEqual(armorModelFile("/models/armor/f_reg120.glb"), {
    slot: "leggings",
    sex: "f",
    id: 120,
  });
  assert.equal(armorModelFile("/models/weapons/we001.glb"), undefined);
  assert.equal(armorModelFile("/models/armor/m_face000.glb"), undefined);
});

test("skin weights come from the nearest source vertices", () => {
  const source = {
    // One vertex on joint 3, one on joint 7, 10 apart along X.
    positions: [0, 0, 0, 10, 0, 0],
    joints: [3, 0, 0, 0, 7, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0],
  };
  const { joints, weights } = transferSkin([0, 0, 0, 5, 0, 0, 9, 0, 0], source);
  // On a source vertex: its weights outright.
  assert.equal(joints[0], 3);
  assert.ok(weights[0]! > 0.999);
  // Halfway: both, evenly.
  assert.deepEqual([joints[4], joints[5]].sort(), [3, 7]);
  assert.ok(Math.abs(weights[4]! - 0.5) < 1e-6);
  // Nearer the second: mostly its joint, normalized.
  assert.equal(joints[8], 7);
  assert.ok(weights[8]! > 0.9);
  assert.ok(Math.abs(weights[8]! + weights[9]! - 1) < 1e-6);
});
