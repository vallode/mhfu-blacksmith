import assert from "node:assert/strict";
import { test } from "node:test";
import { readPac, writePac } from "mhfu-extract/src/models/pac.js";
import { parsePmoFile, writePmo, type GeVertex } from "mhfu-extract/src/models/pmo-file.js";
import { readTmh, swizzle } from "mhfu-extract/src/models/tmh.js";
import { packAtlas, reduceColors } from "../src/forge/atlas.js";
import {
  buildLibrary,
  forgeWeapon,
  guardCentred,
  headScaleFor,
  lendsHandle,
  lighterRecipes,
  rollRecipe,
  SCALE_RANGE,
  type ForgeMode,
  type Recipe,
} from "../src/forge/assemble.js";
import { cutWeapon, type Part, type PartVertex, type WeaponParts } from "../src/forge/parts.js";
import { SIMPLIFY_BELOW, simplified, stripTriangles } from "../src/forge/simplify.js";
import {
  buildGunnerLibrary,
  gapBetween,
  forgeGunner,
  rollGunnerRecipe,
  type GunnerRecipe,
} from "../src/forge/gunner-assemble.js";
import { packIslands, type IslandSource } from "../src/forge/gunner-atlas.js";
import { cutGunner, type GunnerParts } from "../src/forge/gunner-parts.js";
import { Rng } from "../src/rng.js";

/** u16 UVs, s16 positions, one u8 weight, u8 indices. */
const VTYPE = 2 | (2 << 7) | (1 << 9) | (1 << 11);
const SCALE: [number, number, number] = [20, 20, 200];

/** Main piece: bones 0 (handle) -> 1 (head); second piece: bone 2. */
function skeleton(parents = [-1, 0, -1]): Buffer {
  const buf = Buffer.alloc(0x20 + parents.length * 0x10c);
  buf.writeUInt32LE(0xc0000000, 0);
  buf.writeUInt32LE(buf.length, 8);
  buf.writeUInt32LE(0x14, 0x14);
  parents.forEach((parent, id) => {
    const at = 0x20 + id * 0x10c;
    buf.writeUInt32LE(0x40000001, at);
    buf.writeUInt32LE(0x10c, at + 8);
    buf.writeInt32LE(id, at + 0x0c);
    buf.writeInt32LE(parent, at + 0x10);
    [1, 1, 1, 1].forEach((v, k) => buf.writeFloatLE(v, at + 0x1c + k * 4));
  });
  return buf;
}

type Rgba = [number, number, number, number];

/** A 64x64 8-bit swizzled texture: the top half one colour, the bottom another. */
function texture(top: Rgba, bottom: Rgba): Buffer {
  const pixels = 64 * 64;
  const header = Buffer.alloc(48);
  header.write(".TMH0.14", 0, "latin1");
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(32 + 16 + pixels + 16 + 1024, 16);
  header.writeUInt32LE(1, 28);
  header.writeUInt32LE(16 + pixels, 32);
  header.writeUInt32LE(1, 36);
  header.writeUInt32LE(5, 40);
  header.writeUInt16LE(64, 44);
  header.writeUInt16LE(64, 46);
  const palette = Buffer.alloc(16 + 1024);
  palette.writeUInt32LE(16 + 1024, 0);
  palette.writeUInt32LE(3, 8);
  palette.writeUInt32LE(256, 12);
  palette.set([...top, ...bottom], 16);
  const indexed = Buffer.alloc(pixels);
  indexed.fill(1, pixels / 2);
  return Buffer.concat([header, swizzle(indexed, 64, 64), palette]);
}

/** A box along z as four triangle strips sharing its corners, textured at `v`, centred on x = `x0`. */
function box(z0: number, z1: number, hx: number, hy: number, v: number, x0 = 0) {
  const corners = [
    [hx, hy],
    [-hx, hy],
    [-hx, -hy],
    [hx, -hy],
  ] as const;
  const vertices: GeVertex[] = [];
  for (let side = 0; side < 4; side++) {
    for (const [x, y] of [corners[side]!, corners[(side + 1) % 4]!]) {
      for (const z of [z0, z1]) {
        vertices.push({
          weights: [128],
          uv: [Math.round((side / 4) * 0x8000), Math.round(v * 0x8000)],
          color: null,
          normal: null,
          position: [x + x0, y, z].map((c, k) => Math.round((c / SCALE[k]!) * 0x7fff)) as [
            number,
            number,
            number,
          ],
        });
      }
    }
  }
  return vertices;
}

function group(bone: number, boxes: GeVertex[][]) {
  const vertices = boxes.flat();
  return {
    materialSlot: 0,
    palette: [[0, bone]] as [number, number][],
    list: {
      vertexType: VTYPE,
      vertices,
      indices: vertices.map((_, i) => i),
      draws: [
        { frontFace: 0 },
        ...vertices
          .map((_, i) => i)
          .filter((i) => i % 4 === 0)
          .map(() => ({ prim: 4, count: 4 })),
      ],
    },
  };
}

/** A model of the given groups on the fixture's skeleton. */
function model(groups: ReturnType<typeof group>[], top: Rgba, bottom: Rgba): Buffer {
  const pmo = writePmo({
    radius: 200,
    scale: SCALE,
    materials: [{ diffuse: 0xffffffff, ambient: 0xffffffff, textureIndex: 0, extra: 0 }],
    meshes: [{ uvScale: [1, 1], flags: 0x80000003, blend: 0, materialSlots: [0], groups }],
  });
  return writePac([pmo, skeleton(), texture(top, bottom)]);
}

/**
 * A great sword: handle on bone 0, then a guard and a head of `headTop` on
 * bone 1, and a shield; all but the shield moved along z by `base`, the
 * head across by `headX`.
 */
function weapon(headTop: number, top: Rgba, bottom: Rgba, base = 0, headX = 0): Buffer {
  const pmo = writePmo({
    radius: 200,
    scale: SCALE,
    materials: [{ diffuse: 0xffffffff, ambient: 0xffffffff, textureIndex: 0, extra: 0 }],
    meshes: [
      {
        uvScale: [1, 1],
        flags: 0x80000003,
        blend: 0,
        materialSlots: [0],
        groups: [
          group(0, [box(base - 20, base + 10, 2, 2, 0.2)]),
          group(1, [
            box(base + 10, base + 16, 15, 3, 0.25),
            box(base + 16, base + headTop, 8, 1, 0.75, headX),
          ]),
          group(2, [box(30, 40, 10, 10, 0.3)]),
        ],
      },
    ],
  });
  return writePac([pmo, skeleton(), texture(top, bottom)]);
}

const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const YELLOW: Rgba = [255, 255, 0, 255];

const cut = (
  model: number,
  pac: Buffer,
  type: Parameters<typeof cutWeapon>[1] = "great-sword",
): WeaponParts => {
  const parts = cutWeapon(model, type, pac);
  assert.ok(typeof parts !== "string", String(parts));
  return parts;
};

test("a weapon is cut into handle, guard, head and second piece at its grip", () => {
  const w = cut(1, weapon(100, RED, BLUE));
  assert.equal(w.cut, 8);
  assert.deepEqual(w.parts.map((p) => p.slot).sort(), ["guard", "handle", "head", "second"]);
  assert.equal(w.handleBone, 0);
  assert.equal(w.headBone, 1);
});

test("a forged weapon puts the head on the handle's cut, scaled about it", () => {
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  const donor = cut(2, weapon(160, GREEN, YELLOW));
  const library = buildLibrary([frame, donor]);
  const recipe: Recipe = {
    frame,
    handle: frame,
    head: donor,
    headScale: 0.5,
    guard: null,
    guardScale: 1,
    extras: [],
    effect: null,
    second: frame,
    twin: false,
    headExtras: true,
    headMaterial: null,
    material: null,
  };
  const forged = forgeWeapon(framePac, recipe, library);
  assert.ok(Buffer.isBuffer(forged), String(forged));
  const [pmo, , tmh] = readPac(forged).map((e) => e.data);
  const file = parsePmoFile(pmo!);
  const zs = (bone: number) =>
    file.meshes
      .flatMap((m) => m.groups)
      .filter((g) => g.palette[0]![1] === bone)
      .flatMap((g) => g.list.vertices.map((v) => (v.position[2] / 0x7fff) * file.scale[2]));
  // The handle stays; the donor's guard and head (10 to 160, cut at 8) halve about z = 8.
  assert.ok(Math.abs(Math.min(...zs(0)) + 20) < 0.1);
  assert.ok(Math.abs(Math.max(...zs(1)) - (8 + (160 - 8) / 2)) < 0.1);
  assert.ok(Math.abs(Math.min(...zs(1)) - (8 + (10 - 8) / 2)) < 0.1);
  // The shield keeps its own bone, where it was.
  assert.ok(Math.abs(Math.max(...zs(2)) - 40) < 0.1);

  // The texture has the frame's handle colour and the donor's head colour.
  const [image] = readTmh(tmh!);
  const colors = new Set<string>();
  for (let p = 0; p < 64 * 64; p++) colors.add([...image!.rgba.subarray(p * 4, p * 4 + 4)].join());
  assert.ok(colors.has(RED.join()));
  assert.ok(colors.has(YELLOW.join()));
  assert.ok(!colors.has(BLUE.join()));
});

test("a head that carries its own grip keeps its place at the fist", () => {
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  // Its handle stops 30 below the fist: the hand holds its guard and head.
  const gripped = cut(2, weapon(160, GREEN, YELLOW, -40));
  assert.equal(frame.gripInHandle, true);
  assert.equal(gripped.gripInHandle, false);
  const library = buildLibrary([frame, gripped]);
  // Its handle is never lent.
  for (let i = 0; i < 20; i++) {
    assert.equal(
      rollRecipe(gripped, library, new Rng(`s${i}`), "class", { blendedEffects: false })?.handle,
      frame,
    );
  }
  const forged = forgeWeapon(
    framePac,
    {
      frame,
      handle: frame,
      head: gripped,
      headScale: 1,
      guard: null,
      guardScale: 1,
      extras: [],
      effect: null,
      second: null,
      twin: false,
      headExtras: true,
      headMaterial: null,
      material: null,
    },
    library,
  );
  assert.ok(Buffer.isBuffer(forged), String(forged));
  const file = parsePmoFile(readPac(forged)[0]!.data);
  const head = file.meshes
    .flatMap((m) => m.groups)
    .filter((g) => g.palette[0]![1] === 1)
    .flatMap((g) => g.list.vertices.map((v) => (v.position[2] / 0x7fff) * file.scale[2]));
  assert.ok(Math.abs(Math.min(...head) + 30) < 0.1);
  assert.ok(Math.abs(Math.max(...head) - 120) < 0.1);
});

test("packAtlas fits regions side by side, scaling them down when they don't fit", () => {
  const image = readTmh(texture(RED, BLUE))[0]!;
  const half = {
    image,
    uvMin: [0, 0] as [number, number],
    uvMax: [0.5, 1] as [number, number],
    material: null,
  };
  const atlas = packAtlas([half, half]);
  assert.ok(atlas);
  assert.deepEqual(atlas.place[0]!([0, 0]), [0.5 / 64, 0.5 / 64]);
  assert.deepEqual(atlas.place[1]!([0, 0]), [32.5 / 64, 0.5 / 64]);
  const shrunk = packAtlas([half, half, half]);
  assert.ok(shrunk);
  assert.ok(shrunk.place[2]!([0.5, 1])[1] < 1);
});

test("packAtlas packs a region drawn smaller at its parts' scale", () => {
  const image = readTmh(texture(RED, BLUE))[0]!;
  const region = { image, uvMin: [0, 0] as [number, number], uvMax: [1, 1] as [number, number] };
  const full = packAtlas([{ ...region, material: null }]);
  const half = packAtlas([{ ...region, material: null, density: 0.5 }]);
  assert.deepEqual(full?.place[0]!([1, 1]), [63.5 / 64, 63.5 / 64]);
  assert.deepEqual(half?.place[0]!([1, 1]), [31.5 / 64, 31.5 / 64]);
});

test("reduceColors keeps few colours as they are and cuts many to the limit", () => {
  const few = reduceColors(
    [
      { rgba: [1, 2, 3, 255], count: 4 },
      { rgba: [9, 9, 9, 255], count: 1 },
    ],
    256,
  );
  assert.deepEqual(few.index, [0, 1]);
  const many = Array.from({ length: 600 }, (_, i) => ({
    rgba: [i % 256, (i * 7) % 256, (i * 13) % 256, 255] as Rgba,
    count: 1 + (i % 3),
  }));
  const reduced = reduceColors(many, 256);
  assert.ok(reduced.palette.length <= 256);
  assert.equal(reduced.index.length, 600);
  assert.ok(reduced.index.every((i) => i >= 0 && i < reduced.palette.length));
});

/** The forged model's vertices on `bone`, in model units. */
function forgedVertices(forged: Buffer | string, bone: number): [number, number, number][] {
  assert.ok(Buffer.isBuffer(forged), String(forged));
  const file = parsePmoFile(readPac(forged)[0]!.data);
  return file.meshes
    .flatMap((m) => m.groups)
    .filter((g) => g.palette[0]![1] === bone)
    .flatMap((g) =>
      g.list.vertices.map(
        (v) => v.position.map((c, k) => (c / 0x7fff) * file.scale[k]!) as [number, number, number],
      ),
    );
}

test("a dual blades head turns half about the grip on a great sword, and back", () => {
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  // Its blade sits 5 to +x of the grip, the dual blades' edge side.
  const blades = cut(2, weapon(100, GREEN, YELLOW, 0, 5), "dual-blades");
  const library = buildLibrary([frame, blades]);
  const recipe = (frame: WeaponParts, head: WeaponParts): Recipe => ({
    frame,
    handle: frame,
    head,
    headScale: 1,
    guard: null,
    guardScale: 1,
    extras: [],
    effect: null,
    second: null,
    twin: false,
    headExtras: true,
    headMaterial: null,
    material: null,
  });
  const headX = (forged: Buffer | string) => {
    const xs = forgedVertices(forged, 1)
      .filter(([, , z]) => z > 20)
      .map(([x]) => x);
    return [Math.min(...xs), Math.max(...xs)].map((x) => Math.round(x));
  };
  assert.deepEqual(headX(forgeWeapon(framePac, recipe(frame, blades), library)), [-13, 3]);
  // On its own class it stays as it is.
  const bladesPac = weapon(100, GREEN, YELLOW, 0, 5);
  const own = cut(3, bladesPac, "dual-blades");
  const library2 = buildLibrary([own, blades]);
  assert.deepEqual(headX(forgeWeapon(bladesPac, recipe(own, blades), library2)), [-3, 13]);
});

test("a head that hangs on its own shaft goes on no other handle", () => {
  // The handle runs up to 60, through a narrow neck (10-30) into the head (30-80).
  const shaftPac = model(
    [
      group(0, [box(-70, 60, 1, 1, 0.2)]),
      group(1, [box(10, 30, 7, 7, 0.25), box(30, 80, 19, 1, 0.75)]),
    ],
    GREEN,
    YELLOW,
  );
  const shaft = cut(2, shaftPac);
  const frame = cut(1, weapon(100, RED, BLUE));
  assert.equal(shaft.cut, 8);
  assert.equal(shaft.shafted, true);
  assert.equal(frame.shafted, false);
  const library = buildLibrary([frame, shaft]);
  let own = 0;
  for (let i = 0; i < 40; i++) {
    const r = rollRecipe(frame, library, new Rng(`s${i}`), "class", { blendedEffects: false });
    if (r?.head === shaft) {
      assert.equal(r.handle, shaft);
      own++;
    }
  }
  assert.ok(own > 0, "it still goes on its own handle");
});

/** A hammer: a narrow shaft on bone 0 and a `side`-wide block of a head (10 to `top`) on bone 1. */
function hammer(side: number, top = 60, blocks = 1): Buffer {
  return model(
    [
      group(0, [box(-20, 10, 2, 2, 0.2)]),
      group(
        1,
        Array.from({ length: blocks }, (_, i) => box(10 + i * 0.5, top, side / 2, side / 2, 0.75)),
      ),
    ],
    GREEN,
    YELLOW,
  );
}

const plain = (frame: WeaponParts, head: WeaponParts, rest: Partial<Recipe> = {}): Recipe => ({
  frame,
  handle: frame,
  head,
  headScale: 1,
  guard: null,
  guardScale: 1,
  extras: [],
  effect: null,
  second: null,
  twin: false,
  headExtras: true,
  headMaterial: null,
  material: null,
  ...rest,
});

test("another class's head is scaled to the frame's length, held back when blunt", () => {
  const blades = cut(1, weapon(100, RED, BLUE), "dual-blades");
  const sword = cut(2, weapon(190, GREEN, YELLOW));
  const small = cut(3, weapon(60, GREEN, YELLOW), "sword-and-shield");
  const block = cut(4, hammer(36), "hammer");
  const library = buildLibrary([blades, sword, small, block]);
  // A flat blade down to a dual blade's length (92 of 182).
  assert.ok(Math.abs(headScaleFor(sword, "dual-blades", library) - 92 / 182) < 0.01);
  // A 36-wide block 52 long would come out longer by length (92 / 52); it
  // comes out no bulkier than the dual blade's 16 by 2 by 92 head.
  const bulky = Math.cbrt((16 * 2 * 92) / (36 * 36 * 52));
  assert.ok(Math.abs(headScaleFor(block, "dual-blades", library) - bulky) < 0.01);
  // Up (182 / 52 by length), no more than half again as wide as the frame class's heads.
  assert.ok(Math.abs(headScaleFor(small, "great-sword", library) - 1.5) < 0.01);
  assert.equal(headScaleFor(blades, "dual-blades", library), 1);
});

test("dual blades get a matching pair: the second blade is the first again, on its own bone", () => {
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac, "dual-blades");
  const block = cut(2, hammer(20), "hammer");
  const library = buildLibrary([frame, block]);
  const forged = forgeWeapon(
    framePac,
    plain(frame, block, { headScale: 0.5, twin: true }),
    library,
  );
  const key = (v: number[]) => v.map((c) => c.toFixed(1)).join();
  const first = [...forgedVertices(forged, 0), ...forgedVertices(forged, 1)].map(key).sort();
  assert.deepEqual(forgedVertices(forged, 2).map(key).sort(), first);
  // Other classes keep their second piece (a shield).
  const sword = cut(3, weapon(100, RED, BLUE));
  const swordLibrary = buildLibrary([sword, block]);
  const r = rollRecipe(sword, swordLibrary, new Rng("s"), "wild", { blendedEffects: false });
  assert.equal(r?.twin, false);
  assert.equal(
    rollRecipe(frame, library, new Rng("s"), "wild", { blendedEffects: false })?.twin,
    true,
  );
});

test("a recipe that doesn't fit gets lighter: no trim, then the second piece as it was", () => {
  const frame = cut(1, weapon(100, RED, BLUE), "dual-blades");
  const recipe = plain(frame, frame, {
    twin: true,
    extras: [{ part: frame.parts.find((p) => p.slot === "head")!, along: 0.5 }],
  });
  assert.deepEqual(
    lighterRecipes(recipe).map((r) => [r.twin, r.extras.length, r.headExtras]),
    [
      [true, 1, true],
      [true, 0, false],
      [false, 1, true],
      [false, 0, false],
    ],
  );
  assert.equal(lighterRecipes(plain(frame, frame)).length, 1);
});

test("modes take another class's head about as often as they say, from classes picked evenly", () => {
  const frame = cut(1, weapon(100, RED, BLUE), "dual-blades");
  const lances = [2, 3, 4, 5, 6].map((m) => cut(m, weapon(200, GREEN, YELLOW), "lance"));
  const hammers = [cut(7, hammer(12), "hammer")];
  const library = buildLibrary([frame, ...lances, ...hammers]);
  const share = (mode: ForgeMode) => {
    let cross = 0;
    let hammer = 0;
    for (let i = 0; i < 400; i++) {
      const r = rollRecipe(frame, library, new Rng(`${mode}${i}`), mode, { blendedEffects: false });
      if (r && r.head.type !== frame.type) cross++;
      if (r?.head.type === "hammer") hammer++;
    }
    return { cross: cross / 400, hammer: hammer / Math.max(1, cross) };
  };
  assert.equal(share("class").cross, 0);
  assert.ok(Math.abs(share("any").cross - 0.5) < 0.08);
  const wild = share("wild");
  assert.ok(Math.abs(wild.cross - 0.9) < 0.06);
  // One hammer against five lances, but half the borrowed heads are hammers.
  assert.ok(Math.abs(wild.hammer - 0.5) < 0.1);
});

test("heads too heavy for the frame's file are passed over for ones that could fit", () => {
  const frame = cut(1, weapon(100, RED, BLUE), "dual-blades");
  const lance = cut(2, weapon(200, GREEN, YELLOW), "lance");
  // Of the frame's class, so drawn at 1x and not simplified.
  const heavy = cut(3, hammer(12, 60, 10), "dual-blades");
  const library = buildLibrary([frame, lance, heavy]);
  for (let i = 0; i < 40; i++) {
    const r = rollRecipe(frame, library, new Rng(`r${i}`), "wild", {
      blendedEffects: false,
      room: 100,
    });
    assert.notEqual(r?.head, heavy);
  }
});

test("a head moved onto another handle leaves behind trim reaching down past its cut", () => {
  // A thin rod from 10 below the fist up into the head, over what is cut as its handle.
  const donorPac = model(
    [
      group(0, [box(-20, 10, 2, 2, 0.2)]),
      group(1, [
        box(10, 16, 15, 3, 0.25),
        box(16, 100, 8, 1, 0.75),
        box(-10, 60, 0.5, 0.5, 0.5, 4),
      ]),
    ],
    GREEN,
    YELLOW,
  );
  const donor = cut(2, donorPac);
  assert.ok(donor.parts.some((p) => p.slot === "extra" && p.min[2] < 0));
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  const library = buildLibrary([frame, donor]);
  const lowest = (forged: Buffer | string) =>
    Math.min(...forgedVertices(forged, 1).map(([, , z]) => z));
  assert.ok(lowest(forgeWeapon(framePac, plain(frame, donor), library)) > 5);
  const own = forgeWeapon(donorPac, { ...plain(donor, donor) }, library);
  assert.ok(lowest(own) < -5);
  // Nor is it borrowed as trim.
  const rod = donor.parts.find((p) => p.slot === "extra" && p.min[2] < 0);
  for (let i = 0; i < 60; i++) {
    const r = rollRecipe(frame, library, new Rng(`t${i}`), "wild", { blendedEffects: false });
    assert.ok(!r?.extras.some(({ part }) => part === rod));
  }
});

test("a borrowed glow sits as far along the head as along its own, within it", () => {
  // A tall hammer (head 10 to 160) with a glowing ring near its top (150 to 158).
  const donorPac = writePac([
    writePmo({
      radius: 200,
      scale: SCALE,
      materials: [{ diffuse: 0xffffffff, ambient: 0xffffffff, textureIndex: 0, extra: 0 }],
      meshes: [
        {
          uvScale: [1, 1],
          flags: 0x80000003,
          blend: 0,
          materialSlots: [0],
          groups: [group(0, [box(-20, 10, 2, 2, 0.2)]), group(1, [box(10, 160, 6, 6, 0.75)])],
        },
        {
          uvScale: [1, 1],
          flags: 0x80000003,
          blend: 1,
          materialSlots: [0],
          groups: [group(1, [box(150, 158, 12, 12, 0.5)])],
        },
      ],
    }),
    skeleton(),
    texture(GREEN, YELLOW),
  ]);
  const donor = cut(2, donorPac, "hammer");
  const glow = donor.parts.find((p) => p.slot === "effect");
  assert.ok(glow);
  // A great sword's head runs 16 to 100.
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  // Great swords' heads are longer than this one's, so the class scale (174 / 150) alone would overshoot.
  const library = buildLibrary([frame, cut(3, weapon(190, RED, BLUE)), donor]);
  const forged = forgeWeapon(
    framePac,
    plain(frame, frame, { effect: { part: glow, from: donor } }),
    library,
  );
  // The ring is the only thing wider than the guard's 3 across y.
  const ring = forgedVertices(forged, 1).filter(([, y]) => Math.abs(y) > 3.5);
  assert.ok(ring.length > 0);
  const zs = ring.map(([, , z]) => z);
  // Once kept at its own height (154 above the fist, scaled up), now within 16 to 100.
  assert.ok(Math.min(...zs) >= 16 - 0.5 && Math.max(...zs) <= 100 + 0.5, String(zs));
  // 144 of 150 along its own head: 96.6 on this one, scaled down to fit (84 / 150).
  const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
  assert.ok(Math.abs(mid - (16 + (84 * 144) / 150)) < 0.5, String(mid));
  assert.ok(Math.max(...zs) - Math.min(...zs) <= (8 * 84) / 150 + 0.5);
});

test("a head scaled up past its own guard is let down onto it", () => {
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  // Its guard runs 10 to 16, its blade 16 up: at 2x the blade would start
  // 16 above the cut (8), over a guard sized 1x that ends 8 above it.
  const blades = cut(2, weapon(90, GREEN, YELLOW), "dual-blades");
  const library = buildLibrary([frame, blades]);
  const forged = forgeWeapon(framePac, plain(frame, blades, { headScale: 2 }), library);
  // The blade's corners are 16 across at 2x, the guard's 15.
  const blade = forgedVertices(forged, 1).filter(([x]) => Math.abs(x) > 15.5);
  assert.ok(Math.abs(Math.min(...blade.map(([, , z]) => z)) - 17) < 0.2);
});

// Gunners: models fold on their bones, so the fixtures carry bone places and turns.

const GSCALE: [number, number, number] = [80, 80, 200];

interface GunnerBone {
  parent: number;
  translation?: [number, number, number];
  rotation?: [number, number, number];
}

function gunnerSkeleton(bones: GunnerBone[]): Buffer {
  const buf = Buffer.alloc(0x20 + bones.length * 0x10c);
  buf.writeUInt32LE(0xc0000000, 0);
  buf.writeUInt32LE(buf.length, 8);
  buf.writeUInt32LE(0x14, 0x14);
  bones.forEach((bone, id) => {
    const at = 0x20 + id * 0x10c;
    buf.writeUInt32LE(0x40000001, at);
    buf.writeUInt32LE(0x10c, at + 8);
    buf.writeInt32LE(id, at + 0x0c);
    buf.writeInt32LE(bone.parent, at + 0x10);
    [1, 1, 1, 1].forEach((v, k) => buf.writeFloatLE(v, at + 0x1c + k * 4));
    (bone.rotation ?? [0, 0, 0]).forEach((v, k) => buf.writeFloatLE(v, at + 0x2c + k * 4));
    (bone.translation ?? [0, 0, 0]).forEach((v, k) => buf.writeFloatLE(v, at + 0x3c + k * 4));
  });
  return buf;
}

/** A box along z centred on (x0, y0), on one bone, as four strips sharing its corners. */
function gunnerBox(
  bone: number,
  z0: number,
  z1: number,
  x0: number,
  y0: number,
  h: number,
  v: number,
) {
  const vertices: GeVertex[] = [];
  const corners = [
    [h, h],
    [-h, h],
    [-h, -h],
    [h, -h],
  ] as const;
  for (let side = 0; side < 4; side++) {
    for (const [x, y] of [corners[side]!, corners[(side + 1) % 4]!]) {
      for (const z of [z0, z1]) {
        vertices.push({
          weights: [128],
          uv: [Math.round((side / 4) * 0x8000), Math.round(v * 0x8000)],
          color: null,
          normal: null,
          position: [x + x0, y + y0, z].map((c, k) => Math.round((c / GSCALE[k]!) * 0x7fff)) as [
            number,
            number,
            number,
          ],
        });
      }
    }
  }
  return {
    materialSlot: 0,
    palette: [[0, bone]] as [number, number][],
    list: {
      vertexType: VTYPE,
      vertices,
      indices: vertices.map((_, i) => i),
      draws: [{ frontFace: 0 }, ...[0, 1, 2, 3].map(() => ({ prim: 4, count: 4 }))],
    },
  };
}

function gunnerPac(bones: GunnerBone[], groups: ReturnType<typeof gunnerBox>[], top: Rgba): Buffer {
  const pmo = writePmo({
    radius: 250,
    scale: GSCALE,
    materials: [{ diffuse: 0xffffffff, ambient: 0xffffffff, textureIndex: 0, extra: 0 }],
    meshes: [{ uvScale: [1, 1], flags: 0x80000003, blend: 0, materialSlots: [0], groups }],
  });
  return writePac([pmo, gunnerSkeleton(bones), texture(top, BLUE)]);
}

/** A heavy bowgun's hinge: bone 2 at (0, -30, 10), turned half about x when drawn. */
const HINGE: [number, number, number] = [0, -30, 10];

/**
 * A heavy bowgun: its stock on bone 1 (z -60 to 10) and its barrel on bone 2,
 * folded back under the stock (z -100 to 5, y -40), or modelled unfolded
 * (z 15 to 120, y -20, bone 2 already turned) when `unfolded`.
 */
function heavyBowgun(top: Rgba, unfolded = false, barrelEnd = 120): Buffer {
  const bones: GunnerBone[] = [
    { parent: -1 },
    { parent: 0 },
    { parent: 1, translation: HINGE, rotation: unfolded ? [Math.PI, 0, 0] : [0, 0, 0] },
    { parent: 2 },
  ];
  const barrel = unfolded
    ? gunnerBox(2, 15, barrelEnd, 0, -20, 4, 0.75)
    : gunnerBox(2, 20 - barrelEnd, 5, 0, -40, 4, 0.75);
  return gunnerPac(bones, [gunnerBox(1, -60, 10, 0, -10, 10, 0.25), barrel], top);
}

const cutG = (model: number, pac: Buffer, type: Parameters<typeof cutGunner>[1]): GunnerParts => {
  const parts = cutGunner(model, type, pac);
  assert.ok(typeof parts !== "string", String(parts));
  return parts;
};

const recipeOf = (frame: GunnerParts, rest: Partial<GunnerRecipe> = {}): GunnerRecipe => ({
  frame,
  body: frame,
  stock: null,
  barrel: null,
  limbs: null,
  second: null,
  accentMaterial: null,
  material: null,
  ...rest,
});

/** The forged model's vertices whose first bone is `bone`, in model units. */
function gunnerVertices(forged: Buffer | string, bone: number): [number, number, number][] {
  assert.ok(Buffer.isBuffer(forged), String(forged));
  const file = parsePmoFile(readPac(forged)[0]!.data);
  return file.meshes
    .flatMap((m) => m.groups)
    .filter((g) => g.palette[0]![1] === bone)
    .flatMap((g) =>
      g.list.vertices.map(
        (v) => v.position.map((c, k) => (c / 0x7fff) * file.scale[k]!) as [number, number, number],
      ),
    );
}

const span = (vs: [number, number, number][], k: number) =>
  [Math.min(...vs.map((v) => v[k]!)), Math.max(...vs.map((v) => v[k]!))].map((c) => Math.round(c));

test("a heavy bowgun is cut at its hinge, as the drawn weapon has it", () => {
  const w = cutG(1, heavyBowgun(RED), "heavy-bowgun");
  assert.deepEqual(w.parts.map((p) => p.slot).sort(), ["barrel", "body"]);
  const barrel = w.parts.find((p) => p.slot === "barrel")!;
  // Unfolded half a turn about x at the hinge: z 15 to 120, y -20.
  assert.deepEqual([barrel.min[2], barrel.max[2]].map(Math.round), [15, 120]);
  assert.deepEqual([barrel.min[1], barrel.max[1]].map(Math.round), [-24, -16]);
  // One modelled unfolded cuts the same.
  const open = cutG(2, heavyBowgun(GREEN, true), "heavy-bowgun");
  const openBarrel = open.parts.find((p) => p.slot === "barrel")!;
  assert.deepEqual([openBarrel.min[2], openBarrel.max[2]].map(Math.round), [15, 120]);
});

test("a forged heavy bowgun folds another's barrel onto the frame's skeleton", () => {
  const framePac = heavyBowgun(RED);
  const frame = cutG(1, framePac, "heavy-bowgun");
  // Modelled unfolded and longer: on the frame it is folded back as the frame's barrel is.
  const donor = cutG(2, heavyBowgun(GREEN, true, 160), "heavy-bowgun");
  const forged = forgeGunner(framePac, recipeOf(frame, { barrel: donor }));
  const barrel = gunnerVertices(forged, 2);
  assert.deepEqual(span(barrel, 2), [20 - 160, 5]);
  assert.deepEqual(span(barrel, 1), [-44, -36]);
  // The stock stays where it was, on bone 1.
  assert.deepEqual(span(gunnerVertices(forged, 1), 2), [-60, 10]);
});

test("a heavy bowgun forged from its own parts comes out as it was", () => {
  for (const unfolded of [false, true]) {
    const pac = heavyBowgun(RED, unfolded);
    const w = cutG(1, pac, "heavy-bowgun");
    const forged = forgeGunner(pac, recipeOf(w, { barrel: w }));
    assert.deepEqual(span(gunnerVertices(forged, 2), 2), unfolded ? [15, 120] : [-100, 5]);
    assert.ok(Buffer.isBuffer(forged) && forged.length <= pac.length);
  }
});

/**
 * A light bowgun along a bore at y -27: a stock (z -70 to -30), a body (-15
 * to 40) and a barrel from `barrelStart` to 110, on bone 1, and crossbow
 * limbs on bone 3 at `limbZ`.
 */
function lightBowgun(top: Rgba, barrelStart: number, limbZ = 59): Buffer {
  const bones: GunnerBone[] = [
    { parent: -1 },
    { parent: 0 },
    { parent: 1, translation: [-4, -27, 0] },
    { parent: 1, translation: [-4, -25, limbZ] },
  ];
  return gunnerPac(
    bones,
    [
      gunnerBox(1, -70, -30, -4, -20, 6, 0.1),
      gunnerBox(1, -15, 40, -4, -20, 8, 0.3),
      gunnerBox(1, barrelStart, 110, -4, -27, 3, 0.6),
      gunnerBox(3, limbZ - 3, limbZ + 3, -4, -27, 30, 0.9),
    ],
    top,
  );
}

test("a light bowgun is cut into stock, body, barrel and limbs, and a barrel slides onto the body", () => {
  const framePac = lightBowgun(RED, 50);
  const frame = cutG(1, framePac, "light-bowgun");
  assert.deepEqual(frame.parts.map((p) => p.slot).sort(), ["barrel", "body", "limbs", "stock"]);
  assert.equal(Math.round(frame.barrelStart), 50);
  const donor = cutG(2, lightBowgun(GREEN, 70, 65), "light-bowgun");
  const forged = forgeGunner(
    framePac,
    recipeOf(frame, { stock: frame, barrel: donor, limbs: donor }),
  );
  const onOne = gunnerVertices(forged, 1);
  // The donor's barrel (70 to 110) starts where the frame's did.
  assert.deepEqual(
    span(
      onOne.filter(([, , z]) => z > 45),
      2,
    ),
    [50, 90],
  );
  // Its limbs sit at the frame's limb bone.
  assert.deepEqual(span(gunnerVertices(forged, 3), 2), [56, 62]);
});

test("a heavy bowgun recipe takes another model's barrel", () => {
  const hbgs = [1, 2, 3].map((m) => cutG(m, heavyBowgun(RED), "heavy-bowgun"));
  const library = buildGunnerLibrary(hbgs);
  for (let i = 0; i < 20; i++) {
    const r = rollGunnerRecipe(hbgs[0]!, library, new Rng(`g${i}`));
    assert.ok(r && r.barrel && r.barrel !== r.body);
    assert.equal(r.stock, null);
    assert.equal(r.second, null);
  }
});

/** A heavy bowgun whose body reaches z 18 along the bore and whose folded barrel ends at `barrelEnd` (drawn, it starts at 20 - `barrelEnd`). */
function boredHeavyBowgun(barrelEnd: number): Buffer {
  const bones: GunnerBone[] = [
    { parent: -1 },
    { parent: 0 },
    { parent: 1, translation: HINGE },
    { parent: 2 },
  ];
  return gunnerPac(
    bones,
    [gunnerBox(1, -60, 18, 0, -35, 8, 0.25), gunnerBox(2, -100, barrelEnd, 0, -40, 4, 0.75)],
    RED,
  );
}

test("a heavy bowgun takes only barrels that meet its body along the bore", () => {
  const near = [1, 2].map((m) => cutG(m, boredHeavyBowgun(5), "heavy-bowgun"));
  // This barrel starts at z 60, some 40 ahead of where the bodies end.
  const far = cutG(3, boredHeavyBowgun(-40), "heavy-bowgun");
  assert.ok(gapBetween(near[0]!, near[1]!) <= 6);
  assert.ok(gapBetween(near[0]!, far) > 30);
  const library = buildGunnerLibrary([...near, far]);
  for (let i = 0; i < 20; i++) {
    const r = rollGunnerRecipe(near[0]!, library, new Rng(`b${i}`))!;
    assert.notEqual(r.barrel, far);
  }
});

/** A 64x64 texture whose every texel has its own colour, and a part drawing two squares of it. */
function islandSource(key: string, blue: number, squares: [number, number][]): IslandSource {
  const rgba = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) rgba.set([x * 4, y * 4, blue, 255], (y * 64 + x) * 4);
  const vertices = squares.flatMap(([x, y]) =>
    [
      [x, y],
      [x + 20, y],
      [x, y + 20],
      [x + 20, y + 20],
    ].map(([u, v]) => ({
      position: [0, 0, 0] as [number, number, number],
      normal: null,
      uv: [u! / 64, v! / 64] as [number, number],
      weights: [0x80],
      bones: [0],
    })),
  );
  return {
    key,
    image: { width: 64, height: 64, rgba, hasAlpha: false },
    material: null,
    chunks: [
      {
        flags: 0,
        blend: 0,
        diffuse: 0,
        ambient: 0,
        vertices,
        strips: squares.map((_, i) => ({
          prim: 4,
          frontFace: 0,
          indices: [0, 1, 2, 3].map((k) => i * 4 + k),
        })),
      },
    ],
  };
}

test("packIslands keeps scattered texture islands at full size, texel for texel", () => {
  // Each part spans its whole texture corner to corner, but draws with two 20x20 squares of it.
  const a = islandSource("a", 0, [
    [2, 2],
    [42, 42],
  ]);
  const b = islandSource("b", 200, [
    [42, 2],
    [2, 42],
  ]);
  const atlas = packIslands([a, b])!;
  assert.equal(atlas.scale, 1);
  for (const source of [a, b]) {
    for (const v of source.chunks[0]!.vertices) {
      // The texel inside each square's corner is copied unchanged.
      const inside: [number, number] = [
        v.uv[0] + ((v.uv[0] * 64) % 40 < 20 ? 0.5 : -0.5) / 64,
        v.uv[1] + ((v.uv[1] * 64) % 40 < 20 ? 0.5 : -0.5) / 64,
      ];
      const [u, w] = atlas.place(source.key, v.uv).map((c) => c * 64);
      const [iu, iw] = [u! + (inside[0] - v.uv[0]) * 64, w! + (inside[1] - v.uv[1]) * 64];
      const at = (Math.floor(iw) * 64 + Math.floor(iu)) * 4;
      const from = (Math.floor(inside[1] * 64) * 64 + Math.floor(inside[0] * 64)) * 4;
      assert.deepEqual(
        [...atlas.rgba.subarray(at, at + 4)],
        [...source.image.rgba.subarray(from, from + 4)],
      );
    }
  }
});

test("stripTriangles winds every triangle of a strip as its first", () => {
  assert.deepEqual(stripTriangles({ prim: 4, frontFace: 0, indices: [0, 1, 2, 3] }), [
    [0, 1, 2],
    [2, 1, 3],
  ]);
  assert.deepEqual(stripTriangles({ prim: 5, frontFace: 0, indices: [0, 1, 2, 3] }), [
    [0, 1, 2],
    [0, 2, 3],
  ]);
});

/** A thin plate, `n` by `n` quads on each side, as strips: its faces look along +x and -x. */
function plate(n: number): Part {
  const vertices: PartVertex[] = [];
  const strips = [];
  for (const side of [1, -1]) {
    const base = vertices.length;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        vertices.push({
          position: [side * 0.1, j, i * 2],
          normal: [side, 0, 0],
          uv: [j / n, i / n],
          weights: [0x80],
          bones: [1],
        });
      }
    }
    for (let i = 0; i < n; i++) {
      const indices: number[] = [];
      for (let j = 0; j <= n; j++)
        indices.push(base + i * (n + 1) + j, base + (i + 1) * (n + 1) + j);
      strips.push({ prim: 4, frontFace: side > 0 ? 0 : 1, indices });
    }
  }
  return {
    slot: "head",
    model: 1,
    type: "great-sword",
    chunks: [{ flags: 0, blend: 0, diffuse: 0, ambient: 0, vertices, strips }],
    min: [-0.1, 0, 0],
    max: [0.1, n, 2 * n],
    uvMin: [0, 0],
    uvMax: [1, 1],
    triangles: 4 * n * n,
    area: 4 * n * n,
  };
}

test("a part drawn smaller keeps about the detail it had: fewer vertices, both sides, same span", () => {
  const part = plate(16);
  assert.equal(simplified(part, 1), part);
  assert.equal(simplified(part, SIMPLIFY_BELOW), part);
  const small = simplified(part, 0.3);
  const [before, after] = [part, small].map((p) => p.chunks[0]!.vertices.length);
  assert.ok(after! < before! / 4, `${after} of ${before}`);
  const chunk = small.chunks[0]!;
  const faces = new Set(chunk.vertices.map((v) => Math.sign(v.normal![0])));
  assert.deepEqual([...faces].sort(), [-1, 1]);
  for (const strip of chunk.strips) {
    assert.equal(strip.prim, 3);
    for (const [a, b, c] of stripTriangles(strip)) assert.ok(a !== b && b !== c && a !== c);
  }
  for (let k = 1; k < 3; k++) {
    const values = chunk.vertices.map((v) => v.position[k]!);
    assert.ok(Math.min(...values) < 0.25 * part.max[k]!);
    assert.ok(Math.max(...values) > 0.75 * part.max[k]!);
  }
  assert.equal(simplified(part, 0.3), small);
});

test("a guard off one side of the shaft isn't borrowed", () => {
  const ring = cut(1, weapon(100, RED, BLUE));
  assert.ok(guardCentred(ring));
  const side = cut(
    2,
    model(
      [
        group(0, [box(-20, 10, 2, 2, 0.2)]),
        group(1, [box(10, 14, 6, 6, 0.4, 12), box(14, 100, 3, 1, 0.75)]),
      ],
      GREEN,
      YELLOW,
    ),
  );
  assert.ok(side.parts.some((p) => p.slot === "guard"));
  assert.equal(guardCentred(side), false);
});

test("a head on another handle is seated on the handle's shaft", () => {
  // A head that starts 20 above its own grip, with nothing between.
  const donorPac = model(
    [group(0, [box(-20, 10, 2, 2, 0.2)]), group(1, [box(30, 100, 8, 1, 0.75)])],
    GREEN,
    YELLOW,
  );
  const donor = cut(2, donorPac);
  const framePac = weapon(100, RED, BLUE);
  const frame = cut(1, framePac);
  const library = buildLibrary([frame, donor]);
  const forged = forgeWeapon(framePac, plain(frame, donor), library);
  const top = Math.max(...forgedVertices(forged, 0).map(([, , z]) => z));
  const bottom = Math.min(...forgedVertices(forged, 1).map(([, , z]) => z));
  assert.ok(Math.abs(bottom - top + 1) < 0.5, `head starts ${bottom - top} above the handle`);
  // On its own handle it stays as it was.
  const own = forgeWeapon(donorPac, plain(donor, donor), library);
  assert.ok(Math.min(...forgedVertices(own, 1).map(([, , z]) => z)) > 25);
});

test("handles reaching out past the cut and heads off the axis stay on their own", () => {
  const plainFrame = cut(1, weapon(100, RED, BLUE));
  assert.ok(lendsHandle(plainFrame));
  // A grip with a horn rising beside where the head goes.
  const horn = cut(
    2,
    model(
      [
        group(0, [box(-20, 10, 2, 2, 0.2), box(-10, 40, 1, 1, 0.3, 15)]),
        group(1, [box(10, 100, 8, 1, 0.75)]),
      ],
      GREEN,
      YELLOW,
    ),
  );
  assert.equal(lendsHandle(horn), false);
  // A head out beside the grip.
  const claw = cut(
    3,
    model(
      [group(0, [box(-20, 10, 2, 2, 0.2)]), group(1, [box(10, 100, 4, 2, 0.75, 14)])],
      GREEN,
      YELLOW,
    ),
  );
  const library = buildLibrary([plainFrame, horn, claw]);
  for (let i = 0; i < 60; i++) {
    const r = rollRecipe(plainFrame, library, new Rng(`h${i}`), "class", { blendedEffects: false });
    assert.notEqual(r?.handle, horn);
    if (r?.head === claw) assert.equal(r.handle, claw);
  }
});
