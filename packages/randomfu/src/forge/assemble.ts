/**
 * The forge: new melee weapon models put together from the parts
 * (`parts.ts`) of the game's own, the way procedural weapon games build
 * theirs (Borderlands' barrel, grip and stock; Tinkers' Construct's head,
 * binding and handle; Starbound's handle and blade with a colour swap):
 * a slot each, a socket each, and one material over them.
 *
 * - The frame is the model being replaced. It gives the file, skeleton and
 *   texture layout, and the bones the handle and head follow.
 * - The handle is one of the frame class's, where it was: every melee
 *   handle has the fist at the origin.
 * - The head (with its own small pieces, and its own guard when no other is
 *   chosen) is moved so that its cut sits on the handle's. A head from
 *   another class is scaled about that point to the frame class's usual
 *   head length, and turned to face the frame's way (`TURNED`). A head
 *   that hangs on its own shaft goes on no other handle.
 * - A guard, from a class that has them, sits on the cut the same way,
 *   sized to the frame class's usual guard.
 * - Extras are small pieces of other models, set somewhere along the head
 *   and sized for the frame's class.
 * - Effects are blended pieces: the head's own, sometimes another's.
 * - The second piece (shield, other blade) is the frame's or one of a
 *   model of the same class and skeleton, kept on its own bones.
 *
 * Each source model's texture is cropped to what its parts use and packed
 * into the frame's 64x64 texture (`atlas.ts`), recoloured by the material
 * if one was rolled.
 */
import { readPac, writePac } from "mhfu-extract/src/models/pac.js";
import {
  parsePmoFile,
  writePmo,
  type GeDraw,
  type GeVertex,
  type PmoMaterialRecord,
  type PmoMeshRecord,
  type PmoVertexGroup,
} from "mhfu-extract/src/models/pmo-file.js";
import { locateIndexedImage } from "mhfu-extract/src/models/tmh.js";
import type { WeaponTypeName } from "mhfu-extract/src/tables/weapons.js";
import type { Rng } from "../rng.js";
import { MATERIALS, packAtlas, writeAtlas, type AtlasRegion } from "./atlas.js";
import { GUARDED, type Part, type Slot, type Vec3, type WeaponParts } from "./parts.js";
import { simplified, stripTriangles } from "./simplify.js";

/** Where a melee weapon's parts may come from: its class, any class, or nearly always another. */
export type ForgeMode = "class" | "any" | "wild";

/** How often the head comes from another class. */
const CROSS_CLASS: Record<ForgeMode, number> = { class: 0, any: 0.5, wild: 0.9 };

/** Every usable weapon's parts, by class, and what a class's heads are like. */
export interface Library {
  weapons: WeaponParts[];
  byModel: Map<number, WeaponParts>;
  byType: Map<WeaponTypeName, WeaponParts[]>;
  /** Median head length (above the cut) per class. */
  headLength: Map<WeaponTypeName, number>;
  /** Median head width (the wider of x and y) per class. */
  headWidth: Map<WeaponTypeName, number>;
  /** Median head bulk (its box: across, through and along) per class. */
  headBulk: Map<WeaponTypeName, number>;
  /** Median guard width per class. */
  guardWidth: Map<WeaponTypeName, number>;
}

/** Parts whose UVs stay inside the texture (wrapping ones can't be cropped into the atlas). */
const fitsTexture = (part: Part) =>
  part.uvMin[0] >= -0.001 &&
  part.uvMin[1] >= -0.001 &&
  part.uvMax[0] <= 1.001 &&
  part.uvMax[1] <= 1.001;

const slotParts = (weapon: WeaponParts, ...slots: Slot[]) =>
  weapon.parts.filter((p) => slots.includes(p.slot));

/** Whether `weapon` has parts in `slot`, all of them inside its texture. */
export function hasSlot(weapon: WeaponParts, slot: Slot): boolean {
  const parts = slotParts(weapon, slot);
  return parts.length > 0 && parts.every(fitsTexture);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

const headTop = (weapon: WeaponParts) =>
  Math.max(...slotParts(weapon, "head").map((p) => p.max[2]));

const width = (part: Part) => Math.max(part.max[0] - part.min[0], part.max[1] - part.min[1]);

const guardWidthOf = (weapon: WeaponParts) => Math.max(0, ...slotParts(weapon, "guard").map(width));

/**
 * Whether a weapon's guard sits around its shaft. Some are a few plates
 * off one side of a ring cut short (Gatling Lance's three, all at x < 0,
 * the rest of its vamplate below the cut with the head): moved onto
 * another weapon, they hang beside it.
 */
export function guardCentred(weapon: WeaponParts): boolean {
  const guard = slotParts(weapon, "guard");
  if (guard.length === 0) return false;
  return [0, 1].every((k) => {
    const lo = Math.min(...guard.map((p) => p.min[k]!));
    const hi = Math.max(...guard.map((p) => p.max[k]!));
    return Math.abs(lo + hi) / 2 <= 0.25 * (hi - lo) + 1;
  });
}

/** The head's box across x and y, over all its head pieces. */
const headSpans = (weapon: WeaponParts): [number, number] => {
  const heads = slotParts(weapon, "head");
  if (heads.length === 0) return [0, 0];
  const span = (k: number) =>
    Math.max(...heads.map((p) => p.max[k]!)) - Math.min(...heads.map((p) => p.min[k]!));
  return [span(0), span(1)];
};

/** The head's width across, the wider of x and y. */
const headWidthOf = (weapon: WeaponParts) => Math.max(...headSpans(weapon));

/** The volume of the head's box, from the cut up. */
const headBulkOf = (weapon: WeaponParts) => {
  const [x, y] = headSpans(weapon);
  return Math.max(x, 1) * Math.max(y, 1) * Math.max(headTop(weapon) - weapon.cut, 1);
};

export function buildLibrary(weapons: WeaponParts[]): Library {
  const byType = new Map<WeaponTypeName, WeaponParts[]>();
  for (const w of weapons) (byType.get(w.type) ?? byType.set(w.type, []).get(w.type)!).push(w);
  const headLength = new Map<WeaponTypeName, number>();
  const headWidth = new Map<WeaponTypeName, number>();
  const headBulk = new Map<WeaponTypeName, number>();
  const guardWidth = new Map<WeaponTypeName, number>();
  for (const [type, list] of byType) {
    const withHead = list.filter((w) => hasSlot(w, "head"));
    const guards = list.filter((w) => hasSlot(w, "guard")).map(guardWidthOf);
    const h = median(withHead.map((w) => headTop(w) - w.cut));
    const hw = median(withHead.map(headWidthOf));
    const hb = median(withHead.map(headBulkOf));
    const g = median(guards);
    if (h !== undefined) headLength.set(type, h);
    if (hw !== undefined) headWidth.set(type, hw);
    if (hb !== undefined) headBulk.set(type, hb);
    if (g !== undefined) guardWidth.set(type, g);
  }
  return {
    weapons,
    byModel: new Map(weapons.map((w) => [w.model, w])),
    byType,
    headLength,
    headWidth,
    headBulk,
    guardWidth,
  };
}

/**
 * How far a part from another class may be scaled: from a lance's head
 * (265 units on the EU disc) down to a dual blade's (92), and from a sword
 * and shield's (89) up to a lance's.
 */
export const SCALE_RANGE = [0.25, 3] as const;

/** How much wider than its frame class's usual head a head from another class may come out. */
const HEAD_WIDE = 1.5;
/** And how much bulkier (its box's volume). */
const HEAD_BULK = 1;
/** How much wider than the head a guard around another class's head may be. */
const GUARD_OVER_HEAD = 1.5;

/**
 * How much a head is scaled on a frame of class `type`: to the class's
 * usual head length, unless that would leave it more than half again as
 * wide as the class's usual head, or bulkier (a blade is flat, a hammer's
 * head a block). Blunt heads (hammers, horns) are short, wide and deep, so
 * those hold them back: a hammer head on dual blades comes out a mace's
 * head (Iron Devil's at 0.68), not a dual blade's length of hammer.
 */
export function headScaleFor(head: WeaponParts, type: WeaponTypeName, library: Library): number {
  const target = library.headLength.get(type);
  const length = headTop(head) - head.cut;
  if (head.type === type || target === undefined || length <= 0) return 1;
  let scale = target / length;
  const targetWidth = library.headWidth.get(type);
  const across = headWidthOf(head);
  if (targetWidth !== undefined && across > 0) {
    scale = Math.min(scale, (HEAD_WIDE * targetWidth) / across);
  }
  const targetBulk = library.headBulk.get(type);
  if (targetBulk !== undefined) {
    scale = Math.min(scale, Math.cbrt((HEAD_BULK * targetBulk) / headBulkOf(head)));
  }
  return clamp(scale, ...SCALE_RANGE);
}

/** What a forged weapon is made of. */
export interface Recipe {
  frame: WeaponParts;
  handle: WeaponParts;
  head: WeaponParts;
  /** Scale of the head (and its effects and extras) about the cut. */
  headScale: number;
  /** A guard of another model, in place of the head's own. */
  guard: WeaponParts | null;
  /** Scale of the guard, or of the head's own guard when it is from another class. */
  guardScale: number;
  /** Borrowed small pieces, each with how far along the head it sits (0-1). */
  extras: { part: Part; along: number }[];
  /** A borrowed blended piece and its model. */
  effect: { part: Part; from: WeaponParts } | null;
  /** The model whose second piece the weapon has, or null for none. */
  second: WeaponParts | null;
  /**
   * Whether the second piece is built from the same parts as the first, on
   * the second piece's bones (dual blades: a matching pair), in place of `second`.
   */
  twin: boolean;
  /** Whether the head keeps its own small pieces (its trim). */
  headExtras: boolean;
  /** A material over the head, guard and extras, and one over everything. */
  headMaterial: string | null;
  material: string | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** How far below a head's cut its own trim and glows may reach on another handle. */
const BELOW_CUT = 8;

/** How far from the grip's axis (across, in x and y) a triangle is on it: a grip's or a blade's faces. */
const ON_AXIS = 6;
/** How near the axis some of a head has to come to be seated on another handle. */
const NEAR_AXIS = 8;
/** How far down into the shaft a seated head goes. */
const SEAT_OVERLAP = 1;
/** How far up past its cut, and out from the axis, a handle may reach under another head. */
const HANDLE_RISE = 8;
const HANDLE_REACH = 12;

/** How far from the axis a triangle's shadow across (on x and y) comes. */
function axisDistance(a: Vec3, b: Vec3, c: Vec3): number {
  const side = (p: Vec3, q: Vec3) => (q[0] - p[0]) * -p[1] - (q[1] - p[1]) * -p[0];
  const sides = [side(a, b), side(b, c), side(c, a)];
  if (sides.every((d) => d >= 0) || sides.every((d) => d <= 0)) return 0;
  const toSegment = (p: Vec3, q: Vec3) => {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const t = clamp(-(p[0] * dx + p[1] * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p[0] + t * dx, p[1] + t * dy);
  };
  return Math.min(toSegment(a, b), toSegment(b, c), toSegment(c, a));
}

/** The z spans of the triangles of `parts` (moved by `place`) within `reach` of the axis. */
function axisSpans(
  parts: { part: Part; place: (v: Vec3) => Vec3 }[],
  reach: number,
): [number, number][] {
  const spans: [number, number][] = [];
  for (const { part, place } of parts) {
    for (const chunk of part.chunks) {
      const at = chunk.vertices.map((v) => place(v.position));
      for (const strip of chunk.strips) {
        for (const [i, j, k] of stripTriangles(strip)) {
          const [a, b, c] = [at[i]!, at[j]!, at[k]!];
          if (axisDistance(a, b, c) > reach) continue;
          spans.push([Math.min(a[2], b[2], c[2]), Math.max(a[2], b[2], c[2])]);
        }
      }
    }
  }
  return spans;
}

/** Whether some of a weapon's head or guard comes near the axis, to be seated on a shaft. */
const reachesAxis = (weapon: WeaponParts) =>
  axisSpans(
    slotParts(weapon, "head", "guard").map((part) => ({ part, place: (v) => v })),
    NEAR_AXIS,
  ).length > 0;

/**
 * Whether a handle can take another model's head: nothing of it rises past
 * its cut out beside where the head goes (Polytan's grip is a horn curving
 * up and away from the axis, and Bronze Coin's is the lower half of a
 * cleaver: another head stood beside them).
 */
export function lendsHandle(weapon: WeaponParts): boolean {
  if (!weapon.gripInHandle || !hasSlot(weapon, "handle")) return false;
  return slotParts(weapon, "handle").every((part) =>
    part.chunks.every((c) =>
      c.vertices.every(
        ({ position: [x, y, z] }) =>
          z <= weapon.cut + HANDLE_RISE || Math.hypot(x, y) <= HANDLE_REACH,
      ),
    ),
  );
}

/** Small enough to add without crowding the head (or the file). */
const EXTRA_TRIANGLES = 40;
const MATERIAL_NAMES = Object.keys(MATERIALS);

/**
 * Rolls a recipe for `frame`. In "class" mode every part comes from the
 * frame's class. In "any" mode the head is from another class half the
 * time, and in "wild" mode nine times in ten, with more borrowed guards
 * and trim; the other class is picked evenly (not by how many models it
 * has), and guards, extras and effects come from any class.
 */
export function rollRecipe(
  frame: WeaponParts,
  library: Library,
  rng: Rng,
  mode: ForgeMode,
  options: {
    blendedEffects: boolean;
    /** About how many vertices the frame's file has room for (`vertexRoom`). */
    room?: number;
  },
): Recipe | null {
  const type = frame.type;
  const pick = <T>(items: T[]): T | undefined =>
    items.length > 0 ? items[rng.int(items.length)] : undefined;
  const same = library.byType.get(type) ?? [];
  const pool = mode === "class" ? same : library.weapons;
  const wild = mode === "wild";

  // A handle has to be what the fist holds.
  const handle = pick(same.filter(lendsHandle));
  if (!handle) return null;
  const twinned = TWINNED.has(type) && secondBones(frame) !== null;
  // The least a head takes: its pieces and the handle's, twice for a pair
  // (else with the second piece), without trim.
  const base = vertexCount(slotParts(handle, "handle"));
  const secondVertices = vertexCount(slotParts(frame, "second"));
  const leanest = (w: WeaponParts) => {
    const scale = w.type === type ? 1 : headScaleFor(w, type, library);
    const one = base + vertexCount(slotParts(w, "head", "guard").map((p) => simplified(p, scale)));
    return Math.min(twinned ? one * 2 : Infinity, one + secondVertices);
  };
  const usable = (w: WeaponParts) =>
    hasSlot(w, "head") &&
    slotParts(w, "extra", "guard", "effect").every(fitsTexture) &&
    // Its own shaft runs up into it, or nothing of it comes near the axis
    // (Amezari Claws' claw curls out beside the grip): on another handle it
    // would float, or hang beside it.
    (w === handle || (!w.shafted && reachesAxis(w))) &&
    // Most of it a glow, on a frame whose palette has no room for a glow's
    // alpha (one bit of it), it would be a few scraps: AncientFatalisBuster's
    // body is drawn blended.
    (options.blendedEffects || triangles(w, "effect") <= triangles(w, "head"));
  /** Heads that could fit the frame's file; all usable ones if none could. */
  const fitting = (list: WeaponParts[]) => {
    const ok = list.filter(usable);
    const small = ok.filter((w) => leanest(w) <= (options.room ?? Infinity));
    return small.length > 0 ? small : ok;
  };
  let heads = fitting(same);
  if (rng.float() < CROSS_CLASS[mode]) {
    // A class with a head that could fit, picked evenly.
    const others = [...library.byType]
      .filter(([t]) => t !== type)
      .map(([, list]) => fitting(list))
      .filter((list) => list.some((w) => leanest(w) <= (options.room ?? Infinity)));
    heads = pick(others) ?? heads;
  }
  const head = pick(heads);
  if (!head) return null;
  const headScale = headScaleFor(head, type, library);

  const wantsGuard = GUARDED.has(type)
    ? rng.float() < (wild ? 0.6 : 0.5)
    : mode !== "class" && rng.float() < (wild ? 0.35 : 0.2);
  const guard = wantsGuard
    ? (pick(pool.filter((w) => w !== head && guardCentred(w))) ?? null)
    : null;
  // The head's own guard, when no other is chosen, is sized like one; in a
  // class without guards, like the head (a lance's vamplate on a hammer).
  const sized = guard ?? head;
  const guardTarget = library.guardWidth.get(type);
  const fitted =
    sized.type === type || guardWidthOf(sized) <= 0
      ? 1
      : guardTarget !== undefined
        ? clamp(guardTarget / guardWidthOf(sized), 0.6, 1.6)
        : sized === head
          ? headScale
          : classScale(library, sized.type, type);
  // Around another class's head, no wider than half again the head as placed
  // (a lance's claw of a guard dwarfed a little mace head on dual blades).
  const guardScale =
    head.type === type || guardWidthOf(sized) <= 0
      ? fitted
      : Math.min(
          fitted,
          Math.max(
            SCALE_RANGE[0],
            (GUARD_OVER_HEAD * headWidthOf(head) * headScale) / guardWidthOf(sized),
          ),
        );

  const extraPool = pool.flatMap((w) =>
    w === head
      ? []
      : slotParts(w, "extra").filter(
          (p) =>
            p.triangles <= EXTRA_TRIANGLES &&
            fitsTexture(p) &&
            // Not a sliver of a grip or blade from below the cut (a strip of
            // Polytan's horn grip, 4 to 79, is cut as trim).
            p.min[2] >= w.cut - BELOW_CUT,
        ),
  );
  const roll = rng.float();
  const extraCount = wild
    ? roll < 0.35
      ? 0
      : roll < 0.75
        ? 1
        : 2
    : roll < 0.6
      ? 0
      : roll < 0.9
        ? 1
        : 2;
  const extras: Recipe["extras"] = [];
  for (let i = 0; i < extraCount; i++) {
    const part = pick(extraPool);
    if (part) extras.push({ part, along: 0.25 + rng.float() * 0.6 });
  }

  let effect: Recipe["effect"] = null;
  if (options.blendedEffects && rng.float() < 0.15) {
    const from = pick(pool.filter((w) => w !== head && hasSlot(w, "effect")));
    const part = from && pick(slotParts(from, "effect"));
    if (from && part) effect = { part, from };
  }

  let second: WeaponParts | null = null;
  if (slotParts(frame, "second").length > 0) {
    const donors = same.filter(
      (w) => w !== frame && w.shape === frame.shape && hasSlot(w, "second"),
    );
    second = rng.float() < 0.3 ? (pick(donors) ?? frame) : frame;
    if (!hasSlot(second, "second")) second = pick(donors) ?? null;
  }

  const material = rng.float();
  return {
    frame,
    handle,
    head,
    headScale,
    guard,
    guardScale,
    extras,
    effect,
    second,
    twin: twinned,
    headExtras: true,
    headMaterial: material >= 0.15 && material < 0.45 ? pick(MATERIAL_NAMES)! : null,
    material: material < 0.15 ? pick(MATERIAL_NAMES)! : null,
  };
}

/**
 * Classes whose models face the other way: a dual blades edge is on +x,
 * where every other bladed class has its back (Dual Tomahawk's axe edge
 * against Halberd's and Decider's, Double Dragon's spines against Hidden
 * Blaze's and Serpent Bite's). A part from one of them is turned half
 * about the grip's axis on another class's frame, and the other way round,
 * or it is swung back first.
 */
const TURNED: ReadonlySet<WeaponTypeName> = new Set(["dual-blades"]);

/** Whether `from`'s parts face the other way on `frame`. */
const turns = (from: WeaponTypeName, frame: WeaponTypeName) =>
  TURNED.has(from) !== TURNED.has(frame);

/**
 * How much bigger `from`'s parts are made on a `to` frame: as much as their
 * classes' usual heads differ.
 */
function classScale(library: Library, from: WeaponTypeName, to: WeaponTypeName): number {
  const target = library.headLength.get(to);
  const length = library.headLength.get(from);
  return from === to || !target || !length ? 1 : clamp(target / length, ...SCALE_RANGE);
}

/**
 * Classes whose second piece is a copy of the first in the other hand: a
 * dual blades model's second blade lies where the first does (along +z,
 * the fist at the origin; Dual Tomahawk's two are the same), on bones of
 * its own that the poses put in the other hand. So it is rebuilt from the
 * first's parts, for a pair that matches.
 */
const TWINNED: ReadonlySet<WeaponTypeName> = new Set(["dual-blades"]);

/**
 * The bones the frame's second piece's handle and head follow: those most
 * of its vertices below and above the frame's cut follow.
 */
export function secondBones(frame: WeaponParts): [handle: number, head: number] | null {
  const vertices = slotParts(frame, "second").flatMap((p) => p.chunks.flatMap((c) => c.vertices));
  const strongest = (list: typeof vertices) => {
    const count = new Map<number, number>();
    for (const v of list) {
      let best = 0;
      v.weights.forEach((w, s) => {
        if (w > (v.weights[best] ?? 0)) best = s;
      });
      const bone = v.bones[best] ?? -1;
      if (bone >= 0) count.set(bone, (count.get(bone) ?? 0) + 1);
    }
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const handle = strongest(vertices.filter((v) => v.position[2] < frame.cut));
  const head = strongest(vertices.filter((v) => v.position[2] >= frame.cut));
  if (handle === undefined && head === undefined) return null;
  return [handle ?? head!, head ?? handle!];
}

const triangles = (weapon: WeaponParts, slot: Slot) =>
  slotParts(weapon, slot).reduce((n, p) => n + p.triangles, 0);

const vertexCount = (parts: Part[]) =>
  parts.reduce((sum, p) => sum + p.chunks.reduce((n, c) => n + c.vertices.length, 0), 0);

/**
 * About how many vertices fit the frame's file: as many as its own model
 * has, for the bytes its model takes now, scaled to the room the file
 * leaves the model (DATA.BIN files can't grow). Vertices are most of a
 * model's bytes, and a model rebuilt from its own parts comes out about
 * its own size.
 */
export function vertexRoom(frame: WeaponParts, framePac: Buffer, fileLength: number): number {
  const model = readPac(framePac)[0]?.data.length ?? 0;
  if (model === 0) return Infinity;
  return (vertexCount(frame.parts) * (fileLength - (framePac.length - model))) / model;
}

/**
 * The recipe, then lighter takes on it to try when it doesn't fit the
 * frame's file: without trim and borrowed effects, then (for a pair)
 * with the second piece as it was.
 */
export function lighterRecipes(recipe: Recipe): Recipe[] {
  const bare =
    recipe.extras.length > 0 ||
    recipe.effect !== null ||
    (recipe.headExtras && slotParts(recipe.head, "extra").length > 0)
      ? { ...recipe, extras: [], effect: null, headExtras: false }
      : null;
  const out = [recipe, ...(bare ? [bare] : [])];
  if (recipe.twin) out.push(...out.map((r) => ({ ...r, twin: false })));
  return out;
}

/** A part as the forged weapon has it. */
interface Placement {
  part: Part;
  source: WeaponParts;
  /**
   * Turned half about z when `turn`, moved across by `offset` and along z
   * by `shift`, then scaled by `scale` about z = `pivot`.
   */
  turn?: boolean;
  offset?: [number, number];
  shift: number;
  pivot: number;
  scale: number;
  /** The bone every vertex follows, or null to keep each vertex's strongest. */
  bone: number | null;
  material: string | null;
}

function placements(recipe: Recipe, library: Library): Placement[] {
  const { frame, handle, head, guard } = recipe;
  const cut = handle.cut;
  // A head goes on the handle's cut, unless it carries its own grip: then
  // it keeps its place at the fist (and scales about it), over the handle.
  const onCut = (w: WeaponParts) =>
    w.gripInHandle ? { shift: cut - w.cut, pivot: cut } : { shift: 0, pivot: 0 };
  /** Where the head starts. */
  const socket = head.gripInHandle ? cut : head.cut * recipe.headScale;
  const headMaterial = recipe.headMaterial ?? recipe.material;
  const headTurn = turns(head.type, frame.type);
  const out: Placement[] = [];
  const place = (parts: Part[], source: WeaponParts, rest: Omit<Placement, "part" | "source">) => {
    for (const part of parts) out.push({ part, source, ...rest });
  };
  place(slotParts(handle, "handle"), handle, {
    shift: 0,
    pivot: 0,
    scale: 1,
    bone: frame.handleBone,
    material: recipe.material,
  });
  const headParts = slotParts(head, "head");
  // A head from another class, or over another guard, is let down onto
  // what is under it: its own guard, sized as a guard, can be far shorter
  // than the head's scale would make it (Rouge Flames' blade starts 13 above
  // its cut, over its guard, and at a great sword's 2.48x it floated 32
  // up, over a guard of 14).
  const drop = (() => {
    if (!head.gripInHandle || (head.type === frame.type && !guard)) return 0;
    const top = (parts: Part[], scale: number, cutAt: number) =>
      Math.max(0, ...parts.map((p) => (p.max[2] - cutAt) * scale));
    const bottom = (Math.min(...headParts.map((p) => p.min[2])) - head.cut) * recipe.headScale;
    const under = Math.max(
      guard
        ? top(slotParts(guard, "guard"), recipe.guardScale, guard.cut)
        : top(
            slotParts(head, "guard"),
            head.type === frame.type ? recipe.headScale : recipe.guardScale,
            head.cut,
          ),
      // Its own trim running up from below it (a rod through a hammer's head).
      top(
        slotParts(head, "extra").filter((p) => (p.min[2] - head.cut) * recipe.headScale < bottom),
        recipe.headScale,
        head.cut,
      ),
    );
    return Math.max(0, bottom - under - 1);
  })();
  const onHead = {
    ...onCut(head),
    shift: onCut(head).shift - drop / recipe.headScale,
    turn: headTurn,
    scale: recipe.headScale,
    bone: frame.headBone,
  };
  // Moved onto another handle, a head leaves behind the trim and glows that
  // reach down past its cut: they belong to its own blade below (Bronze
  // Coin's glow runs from its grip to its tip, over what is cut as handle).
  const above = (part: Part) =>
    head === handle || !head.gripInHandle || part.min[2] >= head.cut - BELOW_CUT;
  place(headParts, head, { ...onHead, material: headMaterial });
  if (recipe.headExtras) {
    place(slotParts(head, "extra").filter(above), head, { ...onHead, material: headMaterial });
  }
  place(slotParts(head, "effect").filter(above), head, { ...onHead, material: null });
  // A guard sits on the socket, sized for the frame's class: the head's own
  // too, when it comes from another class (it would be as wide as the head is long).
  const onSocket = (w: WeaponParts, scale: number) => ({
    turn: turns(w.type, frame.type),
    shift: socket - w.cut,
    pivot: socket,
    scale,
    bone: frame.headBone,
    material: headMaterial,
  });
  if (guard) place(slotParts(guard, "guard"), guard, onSocket(guard, recipe.guardScale));
  else if (head.type === frame.type) {
    place(slotParts(head, "guard"), head, { ...onHead, material: headMaterial });
  } else if (guardCentred(head)) {
    place(slotParts(head, "guard"), head, onSocket(head, recipe.guardScale));
  }
  const length = (headTop(head) - head.cut) * recipe.headScale;
  /** The head's sides as placed. */
  const [headMin, headMax] = [0, 1].reduce<[number[], number[]]>(
    ([lo, hi], k) => {
      const a = Math.min(...headParts.map((p) => p.min[k]!));
      const b = Math.max(...headParts.map((p) => p.max[k]!));
      const [from, to] = headTurn ? [-b, -a] : [a, b];
      return [
        [...lo, from * recipe.headScale],
        [...hi, to * recipe.headScale],
      ];
    },
    [[], []],
  );
  /** How far across a borrowed piece moves to sit in to the head's sides, so it doesn't float beside it. */
  const inward = (part: Part, scale: number, turn: boolean) =>
    [0, 1].map((k) => {
      const center = ((turn ? -1 : 1) * (part.min[k]! + part.max[k]!) * scale) / 2;
      // Within the middle of the head's bounds: its corners are often outside a round head.
      const mid = (headMin[k]! + headMax[k]!) / 2;
      const half = ((headMax[k]! - headMin[k]!) / 2) * 0.6;
      return (clamp(center, mid - half, mid + half) - center) / scale;
    }) as [number, number];
  // The head's span along z as placed; a borrowed piece is kept within it.
  const headBottom = (w: WeaponParts) => Math.min(...slotParts(w, "head").map((p) => p.min[2]));
  const placedZ = (z: number) =>
    transform({ ...onHead, part: headParts[0]!, source: head, material: null }, [0, 0, z])[2];
  const [lo, hi] = [placedZ(headBottom(head)), placedZ(headTop(head))];
  /** Centred at `at`, moved along to lie within the head (centred on it if longer). */
  const borrowed = (
    part: Part,
    source: WeaponParts,
    scale: number,
    at: number,
    material: string | null,
  ) => {
    const half = ((part.max[2] - part.min[2]) * scale) / 2;
    const z = hi - lo < 2 * half ? (lo + hi) / 2 : clamp(at, lo + half, hi - half);
    const turn = turns(part.type, frame.type);
    out.push({
      part,
      source,
      turn,
      offset: inward(part, scale, turn),
      shift: z - (part.min[2] + part.max[2]) / 2,
      pivot: z,
      scale,
      bone: frame.headBone,
      material,
    });
  };
  for (const { part, along } of recipe.extras) {
    const scale = classScale(library, part.type, frame.type);
    borrowed(part, library.byModel.get(part.model)!, scale, socket + length * along, headMaterial);
  }
  if (recipe.effect) {
    // Sized for the frame's class, not by the head's scale (a hammer's glow
    // at a sword and shield blade's 2.25x on a great sword hung beside it),
    // but no larger than this head is to its own nor longer than it, and as
    // far along it as along its own (a Jail Hammer ring kept its height and
    // hung past an Emerald Spear's tip).
    const { part, from } = recipe.effect;
    const own = headTop(from) - headBottom(from);
    const room = Math.max(0, hi - lo);
    let scale = classScale(library, from.type, frame.type);
    let along = 0.5;
    if (part.max[2] > part.min[2]) scale = Math.min(scale, room / (part.max[2] - part.min[2]));
    if (own > 0) {
      scale = Math.min(scale, room / own);
      along = clamp(((part.min[2] + part.max[2]) / 2 - headBottom(from)) / own, 0, 1);
    }
    if (scale > 0) borrowed(part, from, scale, lo + room * along, null);
  }
  // Seated on the handle's shaft: the head's lowest point on the axis is let
  // down onto the shaft's top (handles end anywhere from well below their cut
  // to above it, and a head on another left a gap in the grip).
  if (head !== handle) {
    const spans = (ps: Placement[]) =>
      axisSpans(
        ps.map((p) => ({ part: p.part, place: (v: Vec3) => transform(p, v) })),
        ON_AXIS,
      );
    const shaft = spans(out.filter((p) => p.part.slot === "handle"));
    const body = spans(out.filter((p) => p.part.slot === "head" || p.part.slot === "guard"));
    if (shaft.length > 0 && body.length > 0) {
      const gap = Math.min(...body.map(([lo]) => lo)) - Math.max(...shaft.map(([, hi]) => hi));
      // Down to 1 into the shaft, so they meet.
      if (gap > 0) {
        for (const p of out)
          if (p.part.slot !== "handle") p.shift -= (gap + SEAT_OVERLAP) / p.scale;
      }
    }
  }
  const twin = recipe.twin ? secondBones(frame) : null;
  if (twin) {
    // The same parts again, in the other hand.
    const [handleBone, headBone] = twin;
    for (const p of [...out])
      out.push({ ...p, bone: p.part.slot === "handle" ? handleBone : headBone });
  } else if (recipe.second) {
    place(slotParts(recipe.second, "second"), recipe.second, {
      shift: 0,
      pivot: 0,
      scale: 1,
      bone: null,
      material: recipe.material,
    });
  }
  return out;
}

const transform = (p: Placement, [x, y, z]: Vec3): Vec3 => {
  const sign = p.turn ? -1 : 1;
  return [
    (sign * x + (p.offset?.[0] ?? 0)) * p.scale,
    (sign * y + (p.offset?.[1] ?? 0)) * p.scale,
    p.pivot + (z + p.shift - p.pivot) * p.scale,
  ];
};

const turnNormal = (p: Placement, n: Vec3 | null): Vec3 | null =>
  n && p.turn ? [-n[0], -n[1], n[2]] : n;

/** A forged vertex before quantizing. */
interface OutVertex {
  position: Vec3;
  normal: Vec3 | null;
  uv: [number, number];
  bone: number;
}

interface OutGroup {
  flags: number;
  blend: number;
  material: number;
  vertices: OutVertex[];
  strips: { prim: number; frontFace: number; indices: number[] }[];
}

/** GE vertex type parts: u16 UVs, s8 normals, s16 positions, u8 weights. */
const VT_UV16 = 2;
const VT_NORMAL8 = 1 << 5;
const VT_POSITION16 = 2 << 7;
const VT_WEIGHT8 = 1 << 9;
/** The GE skins with at most 8 bones a vertex group. */
const MAX_BONES = 8;

function quantize(
  group: OutGroup,
  scale: Vec3,
  uvScale: readonly [number, number],
): PmoVertexGroup | string {
  const bones = [...new Set(group.vertices.map((v) => v.bone))].sort((a, b) => a - b);
  if (bones.length > MAX_BONES) return `a vertex group follows ${bones.length} bones`;
  const normals = group.vertices.every((v) => v.normal);
  const indexSize = group.vertices.length <= 0x100 ? 1 : 2;
  if (group.vertices.length > 0x10000) return "a vertex group has too many vertices";
  const vertexType =
    VT_UV16 |
    (normals ? VT_NORMAL8 : 0) |
    VT_POSITION16 |
    VT_WEIGHT8 |
    ((bones.length - 1) << 14) |
    (indexSize << 11);
  const vertices = group.vertices.map((v): GeVertex => ({
    weights: bones.map((b) => (b === v.bone ? 0x80 : 0)),
    uv: v.uv.map((c, k) => clamp(Math.round((c / uvScale[k]!) * 0x8000), 0, 0xffff)) as [
      number,
      number,
    ],
    color: null,
    normal: normals
      ? (v.normal!.map((c) => clamp(Math.round(c * 0x7f), -0x7f, 0x7f)) as Vec3)
      : null,
    position: v.position.map((c, k) =>
      clamp(Math.round((c / scale[k]!) * 0x7fff), -0x7fff, 0x7fff),
    ) as Vec3,
  }));
  const draws: GeDraw[] = [];
  const indices: number[] = [];
  let frontFace = -1;
  for (const strip of group.strips) {
    if (strip.frontFace !== frontFace) {
      frontFace = strip.frontFace;
      draws.push({ frontFace });
    }
    const last = draws[draws.length - 1]!;
    // Separate triangle lists can be drawn as one.
    if ("prim" in last && last.prim === 3 && strip.prim === 3) last.count += strip.indices.length;
    else draws.push({ prim: strip.prim, count: strip.indices.length });
    indices.push(...strip.indices);
  }
  return {
    materialSlot: group.material,
    palette: bones.map((bone, slot): [number, number] => [slot, bone]),
    list: { vertexType, vertices, indices, draws },
  };
}

/**
 * The frame's package with its model and texture replaced by the recipe's
 * weapon, or why it can't be made.
 */
export function forgeWeapon(framePac: Buffer, recipe: Recipe, library: Library): Buffer | string {
  const entries: Buffer[] = readPac(framePac).map((e) => Buffer.from(e.data));
  const forged = forgeModel(framePac, recipe, library);
  if (typeof forged === "string") return forged;
  entries[0] = forged.pmo;
  entries[2] = forged.texture;
  return writePac(entries);
}

/** The recipe's model and the frame's texture redrawn for it. */
function forgeModel(
  framePac: Buffer,
  recipe: Recipe,
  library: Library,
): { pmo: Buffer; texture: Buffer } | string {
  const [pmoBytes, , tmh] = readPac(framePac).map((e) => Buffer.from(e.data));
  if (!pmoBytes || !tmh) return "not a weapon package";
  const framePmo = parsePmoFile(pmoBytes);
  const parts = placements(recipe, library);

  const regionKeys = new Map<string, number>();
  const regions: AtlasRegion[] = [];
  const regionOf = parts.map((p) => {
    const key = `${p.source.model}/${p.material}`;
    // Drawn smaller, a source's texture is packed smaller too, to the
    // texel size it had (else a shrunk head looks finer than the rest).
    const density = Math.min(1, p.scale);
    let i = regionKeys.get(key);
    if (i === undefined) {
      i = regions.length;
      regionKeys.set(key, i);
      regions.push({
        image: p.source.texture,
        uvMin: [...p.part.uvMin],
        uvMax: [...p.part.uvMax],
        material: p.material,
        density,
      });
    } else {
      const r = regions[i]!;
      r.density = Math.max(r.density ?? 1, density);
      for (let k = 0; k < 2; k++) {
        r.uvMin[k] = Math.min(r.uvMin[k]!, p.part.uvMin[k]!);
        r.uvMax[k] = Math.max(r.uvMax[k]!, p.part.uvMax[k]!);
      }
    }
    return i;
  });
  const atlas = packAtlas(regions);
  if (!atlas) return "the parts' textures don't fit";
  const texture = writeAtlas(tmh, atlas);
  if (!texture) return "the frame's texture isn't one 64x64 8-bit image";

  const materials: PmoMaterialRecord[] = [];
  const extra = framePmo.materials[0]?.extra ?? 0;
  const materialOf = (diffuse: number, ambient: number) => {
    let i = materials.findIndex((m) => m.diffuse === diffuse && m.ambient === ambient);
    if (i < 0) i = materials.push({ diffuse, ambient, textureIndex: 0, extra }) - 1;
    return i;
  };
  const groups = new Map<string, OutGroup>();
  parts.forEach((p, n) => {
    const place = atlas.place[regionOf[n]!]!;
    for (const chunk of simplified(p.part, p.scale).chunks) {
      const material = materialOf(chunk.diffuse, chunk.ambient);
      // Parts on one bone share a group; the second piece keeps its bones, in groups of its own.
      const key = `${chunk.blend}/${chunk.flags}/${material}/${p.bone ?? `own${n}`}`;
      let group = groups.get(key);
      if (!group) {
        group = { flags: chunk.flags, blend: chunk.blend, material, vertices: [], strips: [] };
        groups.set(key, group);
      }
      const base = group.vertices.length;
      for (const v of chunk.vertices) {
        let bone = p.bone;
        if (bone === null) {
          let best = 0;
          v.weights.forEach((w, s) => {
            if (w > (v.weights[best] ?? 0)) best = s;
          });
          bone = v.bones[best] ?? -1;
        }
        // A frame whose handle or head had no bone of its own falls back on the other.
        if (bone < 0) bone = Math.max(0, recipe.frame.headBone, recipe.frame.handleBone);
        group.vertices.push({
          position: transform(p, v.position),
          normal: turnNormal(p, v.normal),
          uv: place(v.uv),
          bone,
        });
      }
      for (const strip of chunk.strips) {
        group.strips.push({ ...strip, indices: strip.indices.map((i) => i + base) });
      }
    }
  });

  const all = [...groups.values()].flatMap((g) => g.vertices);
  const scale = [0, 1, 2].map((k) =>
    Math.max(1e-3, ...all.map((v) => Math.abs(v.position[k]!))),
  ) as Vec3;
  const radius = Math.max(...all.map((v) => Math.hypot(...v.position)));

  // One mesh per flags and blend, opaque first, as the game's models draw.
  const meshes = new Map<string, PmoMeshRecord>();
  const ordered = [...groups.values()].sort(
    (a, b) => Number(a.blend !== 0) - Number(b.blend !== 0),
  );
  for (const group of ordered) {
    const key = `${group.blend}/${group.flags}`;
    let mesh = meshes.get(key);
    if (!mesh) {
      mesh = {
        uvScale: [1, 1],
        flags: group.flags,
        blend: group.blend,
        materialSlots: [],
        groups: [],
      };
      meshes.set(key, mesh);
    }
    let slot = mesh.materialSlots.indexOf(group.material);
    if (slot < 0) slot = mesh.materialSlots.push(group.material) - 1;
    const out = quantize({ ...group, material: slot }, scale, mesh.uvScale);
    if (typeof out === "string") return out;
    mesh.groups.push(out);
  }

  return { pmo: writePmo({ radius, scale, meshes: [...meshes.values()], materials }), texture };
}

/** The frame texture's palette format (1: 16-bit 5551, 3: 32-bit). */
export function paletteFormat(framePac: Buffer): number | null {
  const tmh = readPac(framePac)[2]?.data;
  return tmh ? (locateIndexedImage(Buffer.from(tmh))?.paletteFormat ?? null) : null;
}
