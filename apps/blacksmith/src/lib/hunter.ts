/**
 * The hunter shown holding a weapon in the 3D viewer: the rigged model and
 * per-weapon-class motions `export-site` writes (see mhfu-extract's README,
 * "Hunter"), which of those to offer, and where a weapon rides on the
 * skeleton.
 */
import { fetchMotions, type MotionClip } from "@/lib/motions";

const HUNTER_DIR = "/models/hunter";
export const HUNTER_MODEL = `${HUNTER_DIR}/hunter.glb`;

/** The player's joints (mhfu-extract's `src/models/hunter.ts`). */
export const JOINT = { CHEST: 10, LEFT_HAND: 14, RIGHT_HAND: 18 } as const;

/** The game's weapon class of each site weapon type: `motion/wNN_tbl.bin`. */
export const WEAPON_CLASS: Record<string, number> = {
  "great-sword": 0,
  "heavy-bowgun": 1,
  hammer: 2,
  lance: 3,
  "sword-and-shield": 4,
  "light-bowgun": 5,
  "dual-blades": 6,
  "long-sword": 7,
  "hunting-horn": 8,
  gunlance: 9,
  bow: 10,
};

/**
 * What a hunter clip is, for its name in the viewer: the two idles, or the
 * weapon file's Nth movement or attack (the disc names none of them).
 */
export type HunterMotion =
  { kind: "sheathed-idle" | "drawn-idle" } | { kind: "move" | "attack"; n: number };

/** A hunter's clip, as the viewer lists it. */
export interface HunterClip extends MotionClip {
  motion: HunterMotion;
  /** Whether the weapon is on the back (a common motion) instead of in hand. */
  sheathed: boolean;
}

/** Motion slot numbering in a player bank (mhfu-extract's `PLAYER_GROUP_SLOTS`). */
export const GROUP_SLOTS = 1000;
/** The looping stance motion that opens every weapon file's first group. */
const DRAWN_IDLE_SLOT = 1;
/** The common standing motion, weapon put away. */
const SHEATHED_IDLE_SLOT = 1;

/** The clips the viewer offers for a weapon type: sheathed idle, the drawn stance, then the rest of its file. */
export async function fetchHunterClips(type: string, signal?: AbortSignal): Promise<HunterClip[]> {
  const weaponClass = WEAPON_CLASS[type];
  if (weaponClass === undefined) return [];
  const [weapon, common] = await Promise.all([
    fetchMotions(`${HUNTER_DIR}/w${String(weaponClass).padStart(2, "0")}.motions.bin`, signal),
    fetchMotions(`${HUNTER_DIR}/common.motions.bin`, signal),
  ]);
  const sheathed = common
    .filter((clip) => clip.slot === SHEATHED_IDLE_SLOT)
    .map((clip): HunterClip => ({ ...clip, motion: { kind: "sheathed-idle" }, sheathed: true }));
  // Weapon clips by file group: 0 movement and stance, 1 a lone action,
  // 2 on attacks. No other naming is on the disc.
  const count = { move: 0, attack: 0 };
  const numbered = (kind: "move" | "attack"): HunterMotion => ({ kind, n: ++count[kind] });
  const drawn = weapon.map((clip): HunterClip => {
    const group = Math.floor(clip.slot / GROUP_SLOTS);
    const motion: HunterMotion =
      group === 0 && clip.slot === DRAWN_IDLE_SLOT
        ? { kind: "drawn-idle" }
        : numbered(group >= 2 ? "attack" : "move");
    return { ...clip, motion, sheathed: false };
  });
  const isDrawnIdle = (clip: HunterClip) => clip.motion.kind === "drawn-idle";
  return [...sheathed, ...drawn.filter(isDrawnIdle), ...drawn.filter((clip) => !isDrawnIdle(clip))];
}

type Vec3 = [number, number, number];

/** Where one piece of a weapon rides: under `joint`, `position` and `rotation` (X-Y-Z Euler radians) from it. */
export interface WeaponMount {
  joint: number;
  position: Vec3;
  rotation: Vec3;
  /**
   * A second hand that takes the weapon over while the first is on its grip:
   * the weapon follows `hold` when `fist` (in `joint`'s frame) is within a few
   * units of the handle line through `grip` (in `hold.joint`'s frame, along
   * its Z), and `joint` otherwise.
   */
  hold?: { joint: number; position: Vec3; rotation: Vec3; grip: Vec3; fist: Vec3 };
}

/**
 * The middle of each fist from its wrist joint: the centre of the median
 * bounding box of the hand vertices over the game's gauntlet meshes. A fist
 * grips along its joint's Z axis.
 */
const RIGHT_PALM: [number, number, number] = [-10.5, 0, 1.9];
const LEFT_PALM: [number, number, number] = [10.5, 0, 1.9];

const rightHand: WeaponMount = {
  joint: JOINT.RIGHT_HAND,
  position: RIGHT_PALM,
  rotation: [0, 0, 0],
};
const leftHand: WeaponMount = { joint: JOINT.LEFT_HAND, position: LEFT_PALM, rotation: [0, 0, 0] };

/**
 * A two-handed melee weapon. It's the right hand's: drawing and sheathing,
 * the right hand carries it alone. While both hold it, though, the right fist
 * stays on the left fist's grip axis, at a set distance (great sword 53, long
 * sword 62, hammer 79, hunting horn 42) in most frames of each class, but turns
 * about it, while the left fist's place in the right fist's frame wanders. So
 * then the weapon runs along the left fist's grip, with the right fist on it.
 *
 * `right` is the weapon in the right fist (the left-held place, carried into
 * the right fist's frame in the drawn stance, group 0 slot 1 frame 0, so the
 * two agree there). `left` is the weapon's place from the left fist: its origin
 * `reach` up the left fist's grip, `rotation` from there; the right fist sits
 * `fistReach` up it. The origin is the upper hand's place, except on a hammer,
 * whose handle starts only 26 below its origin: there it's the left fist, its
 * X and Y rotation tilting the handle onto the right fist, which sits a little
 * off the left fist's axis. The fists don't say how far round its length a
 * weapon is turned, so `rotation`'s Z gives it the roll that leaves none in the
 * right fist (`right.rotation`'s Z is 0), the right fist's own, as one-handed
 * weapons have it. That turns a great sword's spine away from the hunter, as
 * in the game.
 */
const twoHanded = (
  right: { position: Vec3; rotation: Vec3 },
  reach: number,
  fistReach = reach,
  rotation: Vec3 = [0, 0, 0],
): WeaponMount => ({
  joint: JOINT.RIGHT_HAND,
  ...right,
  hold: {
    joint: JOINT.LEFT_HAND,
    position: [LEFT_PALM[0], LEFT_PALM[1], LEFT_PALM[2] + reach],
    rotation,
    grip: [LEFT_PALM[0], LEFT_PALM[1], LEFT_PALM[2] + fistReach],
    fist: RIGHT_PALM,
  },
});

/**
 * A bowgun in the right fist, turned so its stock reaches the left fist in most
 * frames of the class's motions. A heavy bowgun's barrel runs along -Z, so its
 * rotation includes a half turn.
 */
const bowgun = (x: number, y: number, z: number): WeaponMount => ({
  ...rightHand,
  rotation: [x, y, z],
});

/**
 * Sheathed places, relative to the chest (Y up, Z forward) and placed by eye:
 * the game positions these in code that isn't decoded.
 */
const DEG = Math.PI / 180;
const back = (
  position: [number, number, number],
  rotation: [number, number, number],
): WeaponMount => ({ joint: JOINT.CHEST, position, rotation });

/**
 * The morph target a great sword's or long sword's model carries for its
 * bones' sheathed pose; the mesh itself is drawn (mhfu-extract's
 * weapon-pose.ts).
 */
export const SHEATHED_TARGET = "sheathed";

/** Weapon pieces in order: part_0 is the main weapon, part_1 (a shield, second blade, quiver) if any. */
export interface WeaponMounts {
  drawn: WeaponMount[];
  sheathed: WeaponMount[];
}

/**
 * A weapon's length is its Z axis. Three's X-Y-Z Euler applies Y before X, so
 * `lean` swings the length toward the hunter's left (+X) before it's stood up,
 * and `roll` (Z, applied first) turns the weapon about its length.
 */
const headUp = (lean: number): [number, number, number] => [-110 * DEG, lean * DEG, 0];
const tipDown = (lean: number, roll = 0): [number, number, number] => [115 * DEG, lean * DEG, roll];

export const WEAPON_MOUNTS: Record<string, WeaponMounts> = {
  "great-sword": {
    drawn: [
      twoHanded(
        { position: [-9.6, -1.3, 2.1], rotation: [-0.034, -0.544, 0] },
        53,
        53,
        [0, 0, -2.787],
      ),
    ],
    sheathed: [back([-8, 22, -13], tipDown(30))],
  },
  "long-sword": {
    drawn: [
      twoHanded(
        { position: [-7.7, -0.2, 2.3], rotation: [-0.542, -0.183, 0] },
        62,
        62,
        [0, 0, 2.455],
      ),
    ],
    sheathed: [back([-8, 20, -12], tipDown(30)), back([-8, 20, -12], tipDown(30))],
  },
  hammer: {
    drawn: [
      twoHanded(
        { position: [-3.8, -23.5, -73.2], rotation: [-0.297, -0.086, 0] },
        0,
        79,
        [0.074, -0.018, -3.123],
      ),
    ],
    sheathed: [back([-14, -30, -14], headUp(40))],
  },
  "hunting-horn": {
    drawn: [
      twoHanded(
        { position: [-6.6, -1.8, 2.9], rotation: [0.042, -0.278, 0] },
        42,
        42,
        [0, 0, -0.032],
      ),
    ],
    sheathed: [back([-14, -30, -14], headUp(40))],
  },
  lance: {
    drawn: [rightHand, leftHand],
    sheathed: [back([-14, -30, -14], headUp(30)), back([0, 12, -8], headUp(0))],
  },
  gunlance: {
    drawn: [rightHand, leftHand],
    sheathed: [back([-14, -30, -14], headUp(30)), back([0, 12, -8], headUp(0))],
  },
  "sword-and-shield": {
    drawn: [rightHand, leftHand],
    sheathed: [back([-10, -18, -8], headUp(10)), back([0, 12, -8], headUp(0))],
  },
  // Both blades are the same mesh, its hook along +X: the left fist's fingers
  // side. The right fist's fingers are at -X, so its blade turns half round
  // its grip to put the hook past the knuckles there too, as the game has it.
  // On the back it keeps that turn, so the hooks face away from each other.
  "dual-blades": {
    drawn: [{ ...rightHand, rotation: [0, 0, Math.PI] }, leftHand],
    sheathed: [back([-8, 14, -11], tipDown(20, Math.PI)), back([8, 14, -11], tipDown(-20))],
  },
  "light-bowgun": {
    drawn: [bowgun(0.376, 0.078, -0.015)],
    sheathed: [back([-10, -6, -14], headUp(25))],
  },
  "heavy-bowgun": {
    drawn: [bowgun(-2.812, -0.034, 0.006)],
    sheathed: [back([-10, -6, -16], headUp(25))],
  },
  // A bow's length runs along its Y axis and its limbs curve along Z. On the
  // back it leans 40 degrees toward the left shoulder, turned so the curve lies
  // across the back instead of through the body.
  bow: {
    drawn: [leftHand, back([0, -25, -8], [0, 0, 0])],
    sheathed: [back([0, 0, -20], [90 * DEG, 50 * DEG, -90 * DEG]), back([0, -25, -8], [0, 0, 0])],
  },
};
