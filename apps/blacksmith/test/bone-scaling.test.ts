import assert from "node:assert/strict";
import { test } from "node:test";
import { Bone, Group, Object3D, Scene } from "three";
import { GamePose, scalesParent } from "../src/lib/bone-scaling";

function close(actual: ArrayLike<number>, expected: number[]): void {
  assert.equal(actual.length, expected.length);
  expected.forEach((e, i) =>
    assert.ok(Math.abs(actual[i]! - e) < 1e-9, `[${i}] ${actual[i]} ≠ ${e}`),
  );
}

/** A chain of bones under `parent`, each the child of the one before. */
function chain(parent: Object3D, count: number): Bone[] {
  const bones: Bone[] = [];
  for (let i = 0; i < count; i++) {
    const bone = new Bone();
    (bones[i - 1] ?? parent).add(bone);
    bones.push(bone);
  }
  return bones;
}

test("a child's scale undoes its ancestor's along its own axes, even when turned", () => {
  // Bone 0 squashed along z, bone 1 turned a quarter about x, bone 2 stretched back.
  const model = new Group();
  const [, one, two] = chain(model, 3) as [Bone, Bone, Bone];
  one.parent!.scale.set(1, 1, 0.5);
  one.position.set(0, 0, -10);
  one.rotation.x = Math.PI / 2;
  two.position.set(0, 0, -10);
  two.scale.set(1, 1, 2);
  new GamePose(model).update();
  // Bone 1 sits where the squashed parent puts it.
  close(one.matrixWorld.elements.slice(12, 15), [0, 0, -5]);
  // Bone 2: turned as bone 1, unscaled (0.5 * 2), not skewed; placed
  // 10 * 0.5 along bone 1's own -z, which the turn points along +y.
  close(two.matrixWorld.elements, [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 5, -5, 1]);
});

test("without scale it is the usual chain of transforms, in the model's space", () => {
  const scene = new Scene();
  const model = new Group();
  model.position.set(100, 0, 0);
  scene.add(model);
  const [top, child] = chain(model, 2) as [Bone, Bone];
  top.position.set(1, 2, 3);
  top.rotation.x = Math.PI / 2;
  child.position.set(0, 4, 0);
  child.rotation.x = Math.PI / 2;
  new GamePose(model).update();
  const ours = [...child.matrixWorld.elements];
  // Two quarter turns about x: y to -y, z to -z; the child's offset turns to +z.
  close(ours, [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 101, 2, 7, 1]);
  child.matrixWorldAutoUpdate = top.matrixWorldAutoUpdate = true;
  scene.updateMatrixWorld(true);
  close(child.matrixWorld.elements, ours);
});

test("three.js keeps the posed matrices, and what hangs off a bone follows them", () => {
  const scene = new Scene();
  const model = new Group();
  scene.add(model);
  const [top, mid, end] = chain(model, 3) as [Bone, Bone, Bone];
  top.scale.set(1, 1, 0.5);
  mid.rotation.x = Math.PI / 2;
  end.position.set(0, 0, -10);
  end.scale.set(1, 1, 2);
  const prop = new Object3D();
  prop.position.set(0, 0, -1);
  end.add(prop);
  new GamePose(model).update();
  const posed = [...end.matrixWorld.elements];
  scene.updateMatrixWorld(true);
  end.updateWorldMatrix(true, true);
  close(end.matrixWorld.elements, posed);
  // One unit along the end bone's -z: unscaled, turned to +y, from (0, 5, 0).
  close(prop.matrixWorld.elements.slice(12, 15), [0, 6, 0]);
});

test("only a motion that scales a bone with bones under it needs the game's posing", () => {
  const parent = (bone: number) => bone === 1;
  const scale = (bone: number, values: number[]) => ({ bone, path: "scale", values });
  assert.equal(scalesParent([scale(1, [1, 1, 0.5])], parent), true);
  assert.equal(scalesParent([scale(1, [1, 1, 1])], parent), false);
  assert.equal(scalesParent([scale(2, [2, 2, 2])], parent), false);
  assert.equal(scalesParent([{ bone: 1, path: "translation", values: [3, 0, 0] }], parent), false);
});
