import assert from "node:assert/strict";
import { test } from "node:test";
import { readPac, writePac } from "mhfu-extract/src/models/pac.js";
import { parsePmoFile, writePmo, type GeVertex } from "mhfu-extract/src/models/pmo-file.js";
import { readTmh, swizzle } from "mhfu-extract/src/models/tmh.js";
import { BLOB_MAGIC, linkBlob } from "../src/blob/link.js";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { buildLibrary, forgeWeapon, type Recipe } from "../src/forge/assemble.js";
import { cutWeapon, type WeaponParts } from "../src/forge/parts.js";
import { forgeGunner, type GunnerRecipe } from "../src/forge/gunner-assemble.js";
import { cutGunner, type GunnerParts } from "../src/forge/gunner-parts.js";
import { HEAVY_BOWGUN, type GunnerStitchRecipe } from "../src/forge/stitch-gunner.js";
import {
  materialExtra,
  place,
  placeStitch,
  recolor,
  stitchWeapon,
  STITCH_MODES,
  XorShift,
  type Instance,
  type Stitched,
  type StitchMode,
  type StitchRecipe,
} from "../src/forge/stitch.js";
import {
  buildForgeLibrary,
  GUNNER_CLASS,
  Q,
  readForgeLibrary,
  REDUCED,
  type ForgeLibrary,
} from "../src/forge/stitch-library.js";
import { HOOK, assembleBuildHook } from "../src/patches/game-hooks.js";
import {
  relicModeExtern,
  stitchModeExtern,
  stitchObjects,
} from "../src/patches/weapon-stitcher.js";
import { relicState, relicTable, type Relic } from "../src/forge/relics.js";
import { Cpu } from "./mips-cpu.js";

/** u16 UVs, s16 positions, one u8 weight, u8 indices. */
const VTYPE = 2 | (2 << 7) | (1 << 9) | (1 << 11);
const SCALE: [number, number, number] = [40, 40, 200];

type Rgba = [number, number, number, number];

/** Main piece: bones 0 (handle) -> 1 (head); second piece: bones 2 -> 3. */
function skeleton(parents = [-1, 0, -1, 2]): Buffer {
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

/** A 64x64 8-bit swizzled texture: four bands of colour, top to bottom. */
function texture(colors: Rgba[]): Buffer {
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
  colors.forEach((c, i) => palette.set(c, 16 + i * 4));
  const indexed = Buffer.alloc(pixels);
  for (let p = 0; p < pixels; p++) indexed[p] = Math.floor(p / 64 / 16);
  return Buffer.concat([header, swizzle(indexed, 64, 64), palette]);
}

/** A box along z as four triangle strips, textured in the band at `v`, centred on x = `x0`. */
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
          uv: [Math.round(((side + 0.5) / 4) * 0x8000), Math.round(v * 0x8000)],
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
        ...vertices.filter((_, i) => i % 4 === 0).map(() => ({ prim: 4, count: 4 })),
      ],
    },
  };
}

interface Shape {
  /** Where the handle starts and ends, and the head's top. */
  handle: [number, number];
  headTop: number;
  guard: boolean;
  /** A second piece (a shield, or for dual blades the other blade). */
  second?: "shield" | "blade";
  /** A small piece of trim beside the blade, and a glow along it (drawn blended). */
  trim?: boolean;
  glow?: boolean;
  colors: Rgba[];
}

function weapon(s: Shape): Buffer {
  const [h0, h1] = s.handle;
  const groups = [
    group(0, [box(h0, h1, 2, 2, 0.1)]),
    group(1, [
      ...(s.guard ? [box(10, 16, 15, 3, 0.35)] : []),
      box(s.guard ? 16 : 10, s.headTop, 8, 1, 0.6),
    ]),
  ];
  if (s.trim) groups.push(group(1, [box(60, 70, 2, 2, 0.35, 12)]));
  if (s.second === "shield") groups.push(group(2, [box(30, 40, 10, 10, 0.85)]));
  if (s.second === "blade") {
    groups.push(group(2, [box(h0, h1, 2, 2, 0.85)]), group(3, [box(10, s.headTop, 8, 1, 0.85)]));
  }
  const pmo = writePmo({
    radius: 200,
    scale: SCALE,
    materials: [{ diffuse: 0xffffffff, ambient: 0xffffffff, textureIndex: 0, extra: 0 }],
    meshes: [
      { uvScale: [1, 1], flags: 0x80000003, blend: 0, materialSlots: [0], groups },
      ...(s.glow
        ? [
            {
              uvScale: [1, 1] as [number, number],
              flags: 0x80000003,
              blend: 0x44,
              materialSlots: [0],
              groups: [group(1, [box(20, s.headTop - 10, 10, 0.5, 0.6)])],
            },
          ]
        : []),
    ],
  });
  return writePac([pmo, skeleton(), texture(s.colors)]);
}

const RED: Rgba = [200, 30, 30, 255];
const BLUE: Rgba = [30, 30, 200, 255];
const GREEN: Rgba = [30, 200, 30, 255];
const GREY: Rgba = [128, 128, 128, 255];
const YELLOW: Rgba = [220, 220, 40, 255];

/** Great swords and dual blades of a few shapes: model number to package. */
function arsenal(): Map<number, { pac: Buffer; type: "great-sword" | "dual-blades" }> {
  const out = new Map<number, { pac: Buffer; type: "great-sword" | "dual-blades" }>();
  const palettes = [
    [RED, GREY, BLUE, YELLOW],
    [GREEN, RED, GREY, BLUE],
    [BLUE, YELLOW, GREEN, RED],
    [GREY, BLUE, RED, GREEN],
  ];
  const swords: Shape[] = [
    {
      handle: [-20, 10],
      headTop: 120,
      guard: true,
      second: "shield",
      trim: true,
      colors: palettes[0]!,
    },
    {
      handle: [-25, 4],
      headTop: 150,
      guard: true,
      second: "shield",
      glow: true,
      colors: palettes[1]!,
    },
    { handle: [-18, 12], headTop: 100, guard: false, colors: palettes[2]! },
    { handle: [-22, 10], headTop: 170, guard: true, trim: true, glow: true, colors: palettes[3]! },
  ];
  swords.forEach((s, k) => out.set(10 + k, { pac: weapon(s), type: "great-sword" }));
  const blades: Shape[] = [
    { handle: [-15, 10], headTop: 70, guard: true, second: "blade", colors: palettes[0]! },
    {
      handle: [-12, 6],
      headTop: 90,
      guard: true,
      second: "blade",
      trim: true,
      glow: true,
      colors: palettes[2]!,
    },
    { handle: [-15, 9], headTop: 60, guard: false, second: "blade", colors: palettes[3]! },
  ];
  blades.forEach((s, k) => out.set(20 + k, { pac: weapon(s), type: "dual-blades" }));
  return out;
}

function library() {
  const pacs = arsenal();
  const weapons: WeaponParts[] = [];
  for (const [model, { pac, type }] of pacs) {
    const parts = cutWeapon(model, type, pac);
    assert.ok(typeof parts !== "string", String(parts));
    weapons.push(parts);
  }
  const forge = buildForgeLibrary(weapons);
  return { pacs, weapons, forge, lib: readForgeLibrary(forge) };
}

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const BUILD = 0x08868234;
const RES = 0x09400000;
const HUNTER = 0x090b3440;
const BUFFER = 0x09600000;
const CAP = 0x5800;
const FILE_BASE = 0xd50;
const SEED = 0x1234567;
const SAVE_POINTER = 0x089cc438;
const SAVE = 0x09999c60;
/** The save's hunter block, its equipment box and the equipped weapon's box index (relics.ts). */
const BLOCK = SAVE + 0x4a0;
const BOX = BLOCK + 0xa8;
const WEAPON_INDEX = BLOCK + 0x4020;
const SLOT = 6;
const STUBS = {
  sceIoOpen: 0x0890de00,
  sceIoRead: 0x0890de60,
  sceIoClose: 0x0890de10,
  sceKernelDcacheWritebackAll: 0x0890de20,
  sceKernelIcacheInvalidateAll: 0x0890de28,
  rf_io_lseek: 0x0890de98,
  rf_time_low: 0x0890dfb8,
};

/** The blob in a CPU, with FORGE.BIN behind the IO calls and a resources object. */
function machine(forge: Buffer, mode: StitchMode = "class", relics: Relic[] | null = null) {
  const blob = linkBlob(
    [
      ...RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") })),
      ...stitchObjects(),
    ],
    BLOB,
    {
      ...STUBS,
      rf_weapon_file_base: FILE_BASE,
      rf_stitch_mode: stitchModeExtern(mode),
      rf_relic_mode: relicModeExtern(relics !== null),
      rf_save_pointer: SAVE_POINTER,
    },
    Infinity,
    { rf_relics: relicTable(relics ?? []) },
  );
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  let at = 0;
  let open = 0;
  const io = { opens: 0, reads: 0 };
  cpu.native.set(STUBS.sceIoOpen, () => {
    assert.equal(cpu.string(arg(0)), "disc0:/PSP_GAME/USRDIR/FORGE.BIN");
    io.opens++;
    open++;
    return 3;
  });
  cpu.native.set(STUBS.sceIoClose, () => (open--, 0));
  cpu.native.set(STUBS.rf_io_lseek, () => {
    assert.equal(arg(0), 3);
    assert.equal(cpu.reg[8], 0, "whence SEEK_SET in $t0");
    assert.equal(arg(3), 0, "the offset's high word");
    at = arg(2);
    return at;
  });
  cpu.native.set(STUBS.sceIoRead, () => {
    const n = Math.max(0, Math.min(arg(2), forge.length - at));
    cpu.write(arg(1), forge.subarray(at, at + n));
    at += n;
    io.reads++;
    return n;
  });
  cpu.native.set(STUBS.rf_time_low, () => SEED);
  cpu.native.set(STUBS.sceKernelDcacheWritebackAll, () => 0);
  cpu.native.set(STUBS.sceKernelIcacheInvalidateAll, () => 0);
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  cpu.setU32(SAVE_POINTER, SAVE);
  cpu.setU32(RES + 0x80258 + SLOT * 4, BUFFER);
  cpu.setU32(RES + 0x80318 + SLOT * 4, CAP);
  const status = () => cpu.u32(blob.symbols.get("rf_stitch_status")!);
  /** Puts `pac` in the weapon slot as DATA.BIN file `FILE_BASE + model` and runs the hook. */
  const build = (model: number, pac: Buffer, n = 0) => {
    cpu.fill(BUFFER, CAP, 0xee);
    cpu.write(BUFFER, pac);
    cpu.setU16(RES + 0x80408 + SLOT * 2, FILE_BASE + model);
    cpu.call(blob.symbols.get("rf_hook7")!, [RES, HUNTER, n]);
    assert.equal(open, 0, "FORGE.BIN is closed again");
  };
  return { cpu, blob, build, status, io };
}

/** Whether a recipe's head comes from another class than its frame's. */
const crossClass = (lib: ForgeLibrary, s: Stitched) =>
  lib.index[melee(s).head]!.type !== lib.index[s.recipe.frame]!.type;

/** A melee stitch's recipe. */
const melee = (s: Stitched) => s.recipe as StitchRecipe;

for (const mode of STITCH_MODES) {
  test(`the blob stitches what the TypeScript stitcher does, byte for byte ("${mode}")`, () => {
    const { pacs, forge, lib } = library();
    const { cpu, build, status } = machine(forge, mode);
    const rng = new XorShift(SEED);
    let stitched = 0;
    let cross = 0;
    let scaled = 0;
    const recipes = new Set<string>();
    for (let round = 0; round < 8; round++) {
      for (const [model, { pac }] of pacs) {
        const want = stitchWeapon(forge, model, pac, CAP, rng, lib, mode);
        build(model, pac);
        assert.ok(want, `model ${model} stitches`);
        assert.equal(status(), 0);
        const got = cpu.bytes(BUFFER, want.pac.length);
        assert.ok(got.equals(want.pac), `model ${model}, round ${round}: the packages differ`);
        // Past the new package, the slot's old bytes stay.
        assert.equal(cpu.u8(BUFFER + Math.max(want.pac.length, pac.length)), 0xee);
        stitched++;
        if (crossClass(lib, want)) cross++;
        if (melee(want).headScale !== Q || melee(want).guardScale !== Q) scaled++;
        recipes.add(JSON.stringify(want.recipe));
      }
    }
    assert.equal(stitched, 8 * pacs.size);
    assert.ok(recipes.size > 20, `${recipes.size} different recipes`);
    if (mode === "class") assert.equal(cross + scaled, 0, "class mode keeps every part's size");
    else {
      // "any" about half, "wild" nine in ten.
      const share = cross / stitched;
      assert.ok(mode === "any" ? share > 0.3 && share < 0.7 : share > 0.75, `${mode}: ${share}`);
      assert.ok(scaled >= cross, "another class's head is scaled");
    }
  });
}

test("other hunters' weapons, models not in FORGE.BIN and slots too small keep their bytes", () => {
  const { pacs, forge } = library();
  const { cpu, build, status } = machine(forge);
  const { pac } = pacs.get(10)!;
  build(10, pac, 1);
  assert.ok(cpu.bytes(BUFFER, pac.length).equals(pac), "hunter 1's weapon is left alone");
  build(99, pac);
  assert.equal(status(), 3);
  assert.ok(cpu.bytes(BUFFER, pac.length).equals(pac));
  // Room for the skeleton DATA.BIN's package has, but no model and texture.
  cpu.setU32(RES + 0x80318 + SLOT * 4, pac.readUInt32LE(12) + pac.readUInt32LE(16) + 64);
  build(10, pac);
  assert.equal(status(), 7, "nothing fits");
  assert.ok(cpu.bytes(BUFFER, pac.length).equals(pac));
});

test("a relic keeps the look its slot's seed rolls, and other weapons keep their bytes", () => {
  const { pacs, forge, lib } = library();
  const relics: Relic[] = [
    { ranged: false, id: 40, model: 10 },
    { ranged: false, id: 41, model: 11 },
  ];
  const { cpu, build, status } = machine(forge, "any", relics);
  const { pac } = pacs.get(10)!;
  /** Box slot 3 holds melee weapon `id` with `seed`, equipped, and the equipped copies match it. */
  const equip = (id: number, seed: number) => {
    const slot = Buffer.from([1, 5, id, 0, seed & 0xff, seed >> 8, 0, 0, 0, 0, 0, 0]);
    cpu.write(BOX + 3 * 12, slot);
    for (const copy of [BLOCK + 0x20, SAVE + 0x60, HUNTER + 0x4e8]) cpu.write(copy, slot);
    cpu.setU16(WEAPON_INDEX, 3);
  };
  const want = (seed: number) =>
    stitchWeapon(forge, 10, pac, CAP, new XorShift(relicState(seed, 10)), lib, "any")!.pac;

  // Freshly crafted: the seed comes from the clock and is kept in the slot and its copies.
  equip(40, 0);
  build(10, pac);
  assert.equal(status(), 0);
  const seed = (SEED ^ (SEED >>> 16)) & 0xffff;
  for (const at of [BOX + 3 * 12, BLOCK + 0x20, SAVE + 0x60, HUNTER + 0x4e8]) {
    assert.equal(cpu.u16(at + 4), seed, `the seed at ${at.toString(16)}`);
  }
  const first = cpu.bytes(BUFFER, CAP);
  assert.ok(
    first.subarray(0, want(seed).length).equals(want(seed)),
    "as the TypeScript stitches it",
  );
  // Built again (another stage, another day): the same look.
  build(10, pac);
  assert.ok(cpu.bytes(BUFFER, CAP).equals(first));
  // Another copy, with its own seed: another look.
  equip(40, 0x4242);
  build(10, pac);
  assert.ok(cpu.bytes(BUFFER, want(0x4242).length).equals(want(0x4242)));
  assert.ok(!want(0x4242).equals(want(seed)));

  // Not a relic, a relic built as another model, no equipped weapon: as DATA.BIN has it.
  for (const [id, model, index] of [
    [42, 10, 3],
    [41, 10, 3],
    [40, 10, 0xffff],
  ] as const) {
    equip(id, 0);
    cpu.setU16(WEAPON_INDEX, index);
    build(model, pac);
    assert.equal(status(), 8);
    assert.ok(cpu.bytes(BUFFER, pac.length).equals(pac));
    assert.equal(cpu.u16(BOX + 3 * 12 + 4), 0, "no seed is kept");
  }
});

/** How far the farthest of `a`'s vertices is from the nearest of `b`'s on its bone. */
const farthest = (a: number[][], b: number[][]) =>
  Math.max(
    ...a.map((v) =>
      Math.min(
        ...b
          .filter((u) => u[0] === v[0])
          .map((u) => Math.hypot(u[1]! - v[1]!, u[2]! - v[2]!, u[3]! - v[3]!)),
      ),
    ),
  );

/** Every vertex of a package's model as (bone, x, y, z). */
function vertices(pac: Buffer): number[][] {
  const pmo = parsePmoFile(Buffer.from(readPac(pac)[0]!.data));
  const out: number[][] = [];
  for (const mesh of pmo.meshes) {
    for (const g of mesh.groups) {
      for (const v of g.list.vertices) {
        const slot = v.weights.indexOf(Math.max(...v.weights));
        out.push([g.palette[slot]![1], ...v.position.map((c, k) => (c / 0x7fff) * pmo.scale[k]!)]);
      }
    }
  }
  return out;
}

for (const mode of STITCH_MODES) {
  test(`a stitched weapon puts its parts where the forge would ("${mode}")`, () => {
    const { pacs, weapons, forge, lib } = library();
    const library2 = buildLibrary(weapons);
    const rng = new XorShift(99);
    const model = (n: number | null) => (n === null ? null : weapons[n]!);
    /** A piece's part, by its bounds. */
    const unit = 2 ** lib.unitShift;
    const part = (k: number) => {
      const p = lib.pieces[k]!;
      return weapons[p.model]!.parts.find(
        (q) =>
          q.slot === (p.glow ? "effect" : "extra") &&
          [...q.min, ...q.max].every((v, j) => Math.round(v * unit) === [...p.min, ...p.max][j]),
      )!;
    };
    const reducedBlocks = new Set(
      lib.records.flatMap((r) => r.refs.slice(REDUCED).map(([at]) => at)),
    );
    let compared = 0;
    let cross = 0;
    const borrowed = { trim: 0, glow: 0 };
    for (const [m, { pac }] of pacs) {
      for (let k = 0; k < 8; k++) {
        const s: Stitched | null = stitchWeapon(forge, m, pac, CAP, rng, lib, mode);
        assert.ok(s);
        // The forge simplifies its own way.
        const placed = placeStitch(lib, melee(s), s.take)!;
        if (placed.some((i) => reducedBlocks.has(i.block))) continue;
        const r = melee(s);
        const recipe: Recipe = {
          frame: model(r.frame)!,
          handle: model(r.handle)!,
          head: model(r.head)!,
          headScale: r.headScale / Q,
          guard: model(r.guard),
          guardScale: r.guardScale / Q,
          extras: s.take.extras
            ? r.extras.map(({ piece, along }) => ({ part: part(piece), along: along / Q }))
            : [],
          effect:
            s.take.extras && r.effect !== null
              ? { part: part(r.effect), from: model(lib.pieces[r.effect]!.model)! }
              : null,
          second: model(r.second),
          twin: s.take.twin,
          headExtras: s.take.extras,
          headMaterial: null,
          material: null,
        };
        const forged = forgeWeapon(pac, recipe, library2);
        assert.ok(typeof forged !== "string", String(forged));
        const want = vertices(forged);
        const got = vertices(s.pac);
        // Under 0.8 the forge simplifies small pieces away (trim with no fewer-vertex block):
        // what it keeps is still checked.
        const glow = s.take.extras && r.effect !== null ? lib.pieces[r.effect]! : null;
        if (glow) {
          // Within the head's length as placed.
          const along = (i: Instance, z: number) => place(i, [0, 0, z])[2];
          const D = lib.records[r.head]!;
          const head = placed[1]!;
          const at = placed.find((i) => i.block === glow.block)!;
          const [lo, hi] = [D.cut + D.headBottom, D.cut + D.headTop].map((z) => along(head, z));
          const [from, to] = [glow.min[2], glow.max[2]].map((z) => along(at, z));
          const fits = from! >= lo! - 2 && to! <= hi! + 2;
          const centred = Math.abs(from! + to! - lo! - hi!) <= 2;
          assert.ok(
            fits || centred,
            `model ${m}, roll ${k}: glow ${from}..${to}, head ${lo}..${hi}`,
          );
        }
        const simplifies = placed.some((i) => i.scale < 3277);
        if (!simplifies) assert.equal(got.length, want.length);
        const off =
          got.length === want.length
            ? Math.max(farthest(got, want), farthest(want, got))
            : farthest(want, got);
        assert.ok(off < 0.15, `model ${m}, roll ${k}: ${off} off, ${JSON.stringify(r)}`);
        compared++;
        if (crossClass(lib, s)) cross++;
        if (recipe.extras.length > 0) borrowed.trim++;
        if (glow) borrowed.glow++;
      }
    }
    assert.ok(compared > 20, `${compared} compared`);
    assert.ok(borrowed.trim > 3 && borrowed.glow > 0, JSON.stringify(borrowed));
    if (mode !== "class") assert.ok(cross > 5, `${cross} across classes compared`);
  });
}

test("a stitched texture set has one image per part, and the model's materials point at them", () => {
  const { pacs, forge, lib } = library();
  const rng = new XorShift(5);
  const s = stitchWeapon(forge, 10, pacs.get(10)!.pac, CAP, rng, lib)!;
  const [pmo, skeletonEntry, tmh] = readPac(s.pac).map((e) => Buffer.from(e.data));
  assert.ok(
    skeletonEntry!.equals(Buffer.from(readPac(pacs.get(10)!.pac)[1]!.data)),
    "the frame's skeleton",
  );
  const images = readTmh(tmh!);
  assert.ok(images.length >= 3, `${images.length} images`);
  for (const image of images) assert.ok(image.width <= 64 && image.height <= 64);
  const used = new Set(parsePmoFile(pmo!).materials.map((m) => m.textureIndex));
  assert.deepEqual(
    [...used].sort(),
    images.map((_, i) => i),
  );
});

test("a material recolours a palette entry along its ramp, in either palette format", () => {
  // Gold's ramp: black goes to its dark end, white to its light end, mixed 3:1.
  assert.equal(recolor(0xff000000, 3, 1), (0xff000000 | (4 << 16) | (26 << 8) | 45) >>> 0);
  assert.equal(recolor(0xffffffff, 3, 1), (0xff000000 | (154 << 16) | (229 << 8) | 255) >>> 0);
  // 5551 keeps its alpha bit.
  assert.equal(recolor(0x8000, 1, 1) & 0x8000, 0x8000);
  assert.equal(recolor(0x1234, 1, 0), 0x1234);
});

test("hook 7 runs the blob's build hook with the build's arguments, then the build", () => {
  const { pacs, forge } = library();
  const { cpu, blob, status } = machine(forge);
  const site = { build: BUILD, prologue: [0x27bdffd0, 0xafbf002c] as const };
  const stub = assembleBuildHook(HOOKS, BLOB, site);
  cpu.load(HOOKS, stub);
  assert.equal(cpu.u32(BLOB + 16 + HOOK.build * 4), blob.symbols.get("rf_hook7"));
  let seen: number[] = [];
  cpu.native.set(BUILD + 8, () => {
    seen = [4, 5, 6].map((r) => cpu.reg[r]! >>> 0);
    // The replayed prologue: a 0x30 frame with $ra at 0x2c.
    assert.equal(cpu.u32((cpu.reg[29]! >>> 0) + 0x2c), cpu.reg[31]! >>> 0);
    return 0x77;
  });
  const { pac } = pacs.get(11)!;
  cpu.write(BUFFER, pac);
  cpu.setU16(RES + 0x80408 + SLOT * 2, FILE_BASE + 11);
  assert.equal(cpu.call(HOOKS, [RES, HUNTER, 0]), 0x77);
  assert.deepEqual(seen, [RES, HUNTER, 0]);
  assert.equal(status(), 0);
  assert.ok(!cpu.bytes(BUFFER, pac.length).equals(pac), "the slot was stitched before the build");
  // Without the blob, straight to the build.
  cpu.setU32(BLOB, BLOB_MAGIC ^ 1);
  cpu.write(BUFFER, pac);
  assert.equal(cpu.call(HOOKS, [RES, HUNTER, 0]), 0x77);
  assert.ok(cpu.bytes(BUFFER, pac.length).equals(pac));
});

// Bows and bowguns: parts fold on their bones, so the fixtures carry bone places and turns.

const GSCALE: [number, number, number] = [80, 80, 200];

interface GunnerBone {
  parent: number;
  translation?: [number, number, number];
  rotation?: [number, number, number];
}

function gunnerSkeleton(bones: GunnerBone[]): Buffer {
  const buf = skeleton(bones.map((b) => b.parent));
  bones.forEach((bone, id) => {
    const at = 0x20 + id * 0x10c;
    (bone.rotation ?? [0, 0, 0]).forEach((v, k) => buf.writeFloatLE(v, at + 0x2c + k * 4));
    (bone.translation ?? [0, 0, 0]).forEach((v, k) => buf.writeFloatLE(v, at + 0x3c + k * 4));
  });
  return buf;
}

/** A box along z centred on (x0, y0) in band `v`, on one bone or blended over two (`weights`), its sides' normals outward. */
function gunnerBox(
  bones: number[],
  z0: number,
  z1: number,
  x0: number,
  y0: number,
  h: number,
  v: number,
  weights = [0x80],
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
          weights,
          uv: [Math.round(((side + 0.5) / 4) * 0x8000), Math.round(v * 0x8000)],
          color: null,
          normal: [
            [0, 127, 0],
            [-127, 0, 0],
            [0, -127, 0],
            [127, 0, 0],
          ][side] as [number, number, number],
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
    palette: bones.map((b, k): [number, number] => [k, b]),
    list: {
      vertexType: VTYPE | (1 << 5) | ((weights.length - 1) << 14),
      vertices,
      indices: vertices.map((_, i) => i),
      draws: [{ frontFace: 0 }, ...[0, 1, 2, 3].map(() => ({ prim: 4, count: 4 }))],
    },
  };
}

function gunnerPac(
  bones: GunnerBone[],
  groups: ReturnType<typeof gunnerBox>[],
  colors: Rgba[],
  extra = 0,
): Buffer {
  const pmo = writePmo({
    radius: 250,
    scale: GSCALE,
    materials: [{ diffuse: 0xffffffff, ambient: 0xffffffff, textureIndex: 0, extra }],
    meshes: [{ uvScale: [1, 1], flags: 0x80000003, blend: 0, materialSlots: [0], groups }],
  });
  return writePac([pmo, gunnerSkeleton(bones), texture(colors)]);
}

/** A heavy bowgun's hinge: bone 2 at (0, -30, 10). */
const HINGE: [number, number, number] = [0, -30, 10];

/**
 * A heavy bowgun: its body on bone 1 (z -60 to 18), a strap blended over
 * bones 1 and 2 by `blend`, and its barrel on bone 2, folded back under the
 * body (drawn, z 20 - `barrelEnd` to 5), or modelled unfolded.
 */
function heavyBowgun(
  colors: Rgba[],
  barrelEnd: number,
  unfolded = false,
  blend = [96, 32],
): Buffer {
  const bones: GunnerBone[] = [
    { parent: -1 },
    { parent: 0 },
    { parent: 1, translation: HINGE, rotation: unfolded ? [Math.PI, 0, 0] : [0, 0, 0] },
    { parent: 2 },
  ];
  const barrel = unfolded
    ? gunnerBox([2], 15, barrelEnd, 0, -20, 4, 0.6)
    : gunnerBox([2], 20 - barrelEnd, 5, 0, -40, 4, 0.6);
  return gunnerPac(
    bones,
    [
      gunnerBox([1], -60, 18, 0, -35, 8, 0.1),
      gunnerBox([1, 2], -40, -20, 0, -20, 3, 0.35, blend),
      barrel,
    ],
    colors,
    0x11223344,
  );
}

/** A light bowgun along a bore at y -27: stock, body, a barrel from `barrelStart` and limbs at `limbZ` on bone 3. */
function lightBowgun(colors: Rgba[], barrelStart: number, limbZ: number): Buffer {
  const bones: GunnerBone[] = [
    { parent: -1 },
    { parent: 0 },
    { parent: 1, translation: [-4, -27, 0] },
    { parent: 1, translation: [-4, -25, limbZ] },
  ];
  return gunnerPac(
    bones,
    [
      gunnerBox([1], -70, -30, -4, -20, 6, 0.1),
      gunnerBox([1], -15, 40, -4, -20, 8, 0.35),
      gunnerBox([1], barrelStart, 110, -4, -27, 3, 0.6),
      gunnerBox([3], limbZ - 3, limbZ + 3, -4, -27, 30, 0.85),
    ],
    colors,
  );
}

/** A bow: its body on bones 0 and 1, and a quiver of `quiver` length on its own bones (2, 3). */
function bow(colors: Rgba[], top: number, quiver: number): Buffer {
  const bones: GunnerBone[] = [
    { parent: -1 },
    { parent: 0, translation: [0, 0, 30] },
    { parent: -1, translation: [20, 0, 0] },
    { parent: 2 },
  ];
  return gunnerPac(
    bones,
    [
      gunnerBox([0], -top, 30, 0, 0, 3, 0.1),
      gunnerBox([1], 30, top, 0, 0, 3, 0.35),
      gunnerBox([2, 3], 0, quiver, 20, 0, 6, 0.85, [64, 64]),
    ],
    colors,
  );
}

type GunnerType = "light-bowgun" | "heavy-bowgun" | "bow";

/** Bows and bowguns of a few shapes: model number to package. */
function gunnerArsenal(): Map<number, { pac: Buffer; type: GunnerType }> {
  const out = new Map<number, { pac: Buffer; type: GunnerType }>();
  const palettes: Rgba[][] = [
    [RED, GREY, BLUE, YELLOW],
    [GREEN, RED, GREY, BLUE],
    [BLUE, YELLOW, GREEN, RED],
  ];
  [
    [50, 59],
    [70, 65],
    [60, 55],
  ].forEach(([start, limbs], k) =>
    out.set(30 + k, { pac: lightBowgun(palettes[k]!, start!, limbs!), type: "light-bowgun" }),
  );
  // Two whose barrels meet the bodies, one too short to reach and one modelled unfolded.
  out.set(40, { pac: heavyBowgun(palettes[0]!, 120), type: "heavy-bowgun" });
  out.set(41, { pac: heavyBowgun(palettes[1]!, 140, false, [64, 64]), type: "heavy-bowgun" });
  out.set(42, { pac: heavyBowgun(palettes[2]!, 75), type: "heavy-bowgun" });
  out.set(43, { pac: heavyBowgun(palettes[1]!, 160, true), type: "heavy-bowgun" });
  [
    [90, 50],
    [110, 70],
    [80, 40],
  ].forEach(([top, quiver], k) =>
    out.set(50 + k, { pac: bow(palettes[k]!, top!, quiver!), type: "bow" }),
  );
  return out;
}

function gunnerLibrary() {
  const melee = library();
  const pacs = gunnerArsenal();
  const gunners: GunnerParts[] = [];
  for (const [model, { pac, type }] of pacs) {
    const parts = cutGunner(model, type, pac);
    assert.ok(typeof parts !== "string", `${model}: ${String(parts)}`);
    gunners.push(parts);
  }
  const forge = buildForgeLibrary(melee.weapons, gunners);
  return { melee, pacs, gunners, forge, lib: readForgeLibrary(forge) };
}

const gunner = (s: Stitched) => s.recipe as GunnerStitchRecipe;

test("the blob stitches bows and bowguns as the TypeScript stitcher does, byte for byte", () => {
  const { melee: m, pacs, forge, lib } = gunnerLibrary();
  const { cpu, build, status } = machine(forge, "wild");
  const rng = new XorShift(SEED);
  const recipes = new Set<string>();
  const seen = { stock: 0, limbs: 0, slid: 0, donorSecond: 0, material: 0, accent: 0 };
  // Melee and gunners in turn, from one generator.
  const all = [...pacs, ...m.pacs] as [number, { pac: Buffer }][];
  for (let round = 0; round < 8; round++) {
    for (const [model, { pac }] of all) {
      const want = stitchWeapon(forge, model, pac, CAP, rng, lib, "wild");
      build(model, pac);
      assert.ok(want, `model ${model} stitches`);
      assert.equal(status(), 0);
      const got = cpu.bytes(BUFFER, want.pac.length);
      assert.ok(got.equals(want.pac), `model ${model}, round ${round}: the packages differ`);
      if (lib.index[want.recipe.frame]!.type < GUNNER_CLASS) continue;
      const r = gunner(want);
      recipes.add(JSON.stringify(r));
      if (r.stock !== null) seen.stock++;
      if (r.limbs !== null) seen.limbs++;
      if (r.barrel !== null && r.barrel !== r.body) seen.slid++;
      if (r.second !== null && r.second !== r.frame) seen.donorSecond++;
      if (r.material) seen.material++;
      if (r.accentMaterial) seen.accent++;
      // A heavy bowgun's barrel meets its body.
      if (lib.index[r.frame]!.type === HEAVY_BOWGUN)
        assert.ok(lib.records[r.body]!.gunner!.meets.includes(r.barrel!), JSON.stringify(r));
      // The frame's material word stays.
      const pmo = Buffer.from(readPac(want.pac)[0]!.data);
      assert.equal(materialExtra(pmo), materialExtra(Buffer.from(readPac(pac)[0]!.data)));
    }
  }
  assert.ok(recipes.size > 30, `${recipes.size} different recipes`);
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `no ${k}`);
});

/** Every vertex of a package's model with a normal, as (x, y, z, nx, ny, nz), the normal of unit length. */
function normals(pac: Buffer): number[][] {
  const pmo = parsePmoFile(Buffer.from(readPac(pac)[0]!.data));
  return pmo.meshes.flatMap((mesh) =>
    mesh.groups.flatMap((g) =>
      g.list.vertices.flatMap((v) => {
        if (!v.normal) return [];
        const length = Math.hypot(...v.normal);
        return [
          [
            ...v.position.map((c, k) => (c / 0x7fff) * pmo.scale[k]!),
            ...v.normal.map((c) => c / length),
          ],
        ];
      }),
    ),
  );
}

/** How far the worst of `a`'s normals turns from the closest of `b`'s at the same place. */
const turned = (a: number[][], b: number[][]) =>
  Math.max(
    ...a.map((v) =>
      Math.min(
        ...b
          .filter((u) => Math.hypot(u[0]! - v[0]!, u[1]! - v[1]!, u[2]! - v[2]!) < 0.2)
          .map((u) => 1 - (u[3]! * v[3]! + u[4]! * v[4]! + u[5]! * v[5]!)),
      ),
    ),
  );

test("a stitched bow or bowgun puts its parts where the gunner forge would", () => {
  const { pacs, gunners, forge, lib } = gunnerLibrary();
  const rng = new XorShift(7);
  const parts = (n: number | null) =>
    n === null ? null : gunners.find((g) => g.model === lib.index[n]!.model)!;
  let compared = 0;
  for (const [model, { pac }] of pacs) {
    for (let k = 0; k < 6; k++) {
      const s = stitchWeapon(forge, model, pac, CAP, rng, lib);
      assert.ok(s);
      const r = gunner(s);
      const recipe: GunnerRecipe = {
        frame: parts(r.frame)!,
        body: parts(r.body)!,
        stock: parts(r.stock),
        barrel: parts(r.barrel),
        limbs: parts(r.limbs),
        second: parts(r.second),
        accentMaterial: null,
        material: null,
      };
      const forged = forgeGunner(pac, recipe);
      assert.ok(Buffer.isBuffer(forged), String(forged));
      const want = vertices(forged);
      const got = vertices(s.pac);
      const off = Math.max(farthest(got, want), farthest(want, got));
      assert.ok(off < 0.15, `model ${model}, roll ${k}: ${off} off, ${JSON.stringify(r)}`);
      // Normals turn with their parts: within about 3 degrees.
      const [ours, theirs] = [normals(s.pac), normals(forged)];
      assert.ok(ours.length > 0 && ours.length === theirs.length);
      const bent = Math.max(turned(ours, theirs), turned(theirs, ours));
      assert.ok(bent < 0.0015, `model ${model}, roll ${k}: normals ${bent} off`);
      compared++;
    }
  }
  assert.equal(compared, 6 * pacs.size);
});
