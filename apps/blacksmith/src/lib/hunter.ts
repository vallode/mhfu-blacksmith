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
 * A lance or gunlance in the left fist. It doesn't run along the fist's grip:
 * the fist drives forward along (0.64, 0.07, 0.76) of its own frame in the
 * classes' forward thrusts (the fastest frame of each, lance and gunlance
 * alike), so that's the weapon's length, its Z turned 40 degrees toward X.
 */
const lanceHand: WeaponMount = { ...leftHand, rotation: [-0.089, 0.697, 0] };

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
 * weapon is turned. A sword's `rotation` Z gives it the roll that leaves none
 * in the right fist (`right.rotation`'s Z is 0), the fist at its origin. That
 * turns a great sword's spine away from the hunter, as in the game. A hammer's
 * origin is in the left fist, and the tilt that puts its handle through the
 * right fist is nearly none, so it's the left fist that holds it unturned, as
 * a shielded weapon is held (its `right.rotation` Z is the half turn between
 * the fists).
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
 * A bowgun is in the left fist. In nearly every frame of both classes' motions
 * the right fist is at the same place in the left fist's frame, (22, -19, 39):
 * on the stock, behind and below. Aiming level, up or down, the left fist's -Z
 * is the aim. A heavy bowgun's barrel runs along -Z, so it's held unturned; a
 * light bowgun's runs along +Z (its stock at -Z), so it's turned half round Y.
 */
const heavyBowgun = leftHand;
const lightBowgun: WeaponMount = { ...leftHand, rotation: [0, Math.PI, 0] };

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

/** A bow's quiver, on the back whether the bow is drawn or not. */
const quiver = back([22, -20, -23], [0, 0, 0]);

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
        { position: [-3.8, -23.5, -73.2], rotation: [-0.297, -0.086, Math.PI] },
        0,
        79,
        [0.074, -0.018, 0.019],
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
  // A shielded weapon is in the left fist (the bow's), the shield on the right:
  // the class's motions swing and thrust with the left and hold the right out
  // in front to guard. The weapon models are made for that fist (a sword's hook
  // along +X, as on a dual blade). A shield is flat in XZ, facing +Y, and
  // symmetric across X, so in the right fist it needs no turn of its own.
  lance: {
    drawn: [lanceHand, rightHand],
    sheathed: [back([-14, -30, -14], headUp(30)), back([0, 12, -8], headUp(0))],
  },
  gunlance: {
    drawn: [lanceHand, rightHand],
    sheathed: [back([-14, -30, -14], headUp(30)), back([0, 12, -8], headUp(0))],
  },
  "sword-and-shield": {
    drawn: [leftHand, rightHand],
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
  // Bowguns from screenshots of the game, gun body out from the back. The game
  // folds them on the back, which isn't applied, so these are placed by their
  // middle (light z 17, heavy z -45 over the models). A light bowgun stands
  // straight down the spine, barrel up, its middle at the small of the back. A
  // heavy one lies across the back from the right hip, where the drawing hand
  // reaches, its barrel up toward the left shoulder 40 degrees from upright.
  "light-bowgun": {
    drawn: [lightBowgun],
    sheathed: [back([-6, -23, -8], [-1.675, -0.086, 3.133])],
  },
  "heavy-bowgun": {
    drawn: [heavyBowgun],
    sheathed: [back([-20, -37, -4], [1.441, -0.694, -0.083])],
  },
  // From screenshots of the game. A bow lies in its YZ plane, its length along
  // (0, 0.72, 0.69) over the models, 70 above the grip and 110 below. On the
  // back it lies flat, from behind the right of the neck down past the left
  // hip, 25 degrees from upright, its middle where the game's is (the game
  // folds it shorter). A quiver runs along X with its arrows at -X, its middle
  // at x -17: across the small of the back, arrows to the right, outside the
  // body and under the bow.
  bow: {
    drawn: [leftHand, quiver],
    sheathed: [back([14, -6, -30], [-1.256, -1.233, -1.38]), quiver],
  },
};
