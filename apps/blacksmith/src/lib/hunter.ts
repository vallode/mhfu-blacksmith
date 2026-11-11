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
const JOINT = { CHEST: 10, LEFT_HAND: 14, RIGHT_HAND: 18 } as const;

/** The game's weapon class of each site weapon type: `motion/wNN_tbl.bin`. */
const WEAPON_CLASS: Record<string, number> = {
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

/** A hunter's clip, as the viewer lists it. */
export interface HunterClip extends MotionClip {
  label: string;
  /** Whether the weapon is on the back (a common motion) instead of in hand. */
  sheathed: boolean;
}

/** Motion slot numbering in a player bank (mhfu-extract's `PLAYER_GROUP_SLOTS`). */
const GROUP_SLOTS = 1000;
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
    .map((clip): HunterClip => ({ ...clip, label: "Sheathed idle", sheathed: true }));
  // Weapon clips by file group: 0 movement and stance, 1 a lone action,
  // 2 on attacks. No other naming is on the disc.
  const count = new Map<string, number>();
  const named = (kind: string) => {
    const n = (count.get(kind) ?? 0) + 1;
    count.set(kind, n);
    return `${kind} ${n}`;
  };
  const drawn = weapon.map((clip): HunterClip => {
    const group = Math.floor(clip.slot / GROUP_SLOTS);
    const label =
      group === 0 && clip.slot === DRAWN_IDLE_SLOT
        ? "Drawn idle"
        : named(group >= 2 ? "Attack" : "Move");
    return { ...clip, label, sheathed: false };
  });
  return [
    ...sheathed,
    ...drawn.filter((clip) => clip.label === "Drawn idle"),
    ...drawn.filter((clip) => clip.label !== "Drawn idle"),
  ];
}

/** Where one piece of a weapon rides: under `joint`, `position` and `rotation` (X-Y-Z Euler radians) from it. */
export interface WeaponMount {
  joint: number;
  position: [number, number, number];
  rotation: [number, number, number];
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
 * A two-handed melee weapon, rigid in the left fist and running along its
 * grip, with its origin `reach` up the handle from it. In the motions the
 * right fist stays on the left fist's grip axis, at a set distance (great
 * sword 53, long sword 62, hammer 79, hunting horn 42, in most frames of each
 * class), while the left fist's place in the right fist's frame wanders: the
 * left hand holds the weapon and the right slides on it. The origin is the
 * upper hand's place, but a hammer's handle starts only 26 below its origin,
 * so its origin is the left fist itself. `rotation` tilts the handle onto the
 * right fist where that sits a little off the left fist's axis.
 */
const leftGrip = (reach: number, rotation: [number, number, number] = [0, 0, 0]): WeaponMount => ({
  ...leftHand,
  position: [LEFT_PALM[0], LEFT_PALM[1], LEFT_PALM[2] + reach],
  rotation,
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

/** Weapon pieces in order: part_0 is the main weapon, part_1 (a shield, second blade, quiver) if any. */
export interface WeaponMounts {
  drawn: WeaponMount[];
  sheathed: WeaponMount[];
}

/**
 * A weapon's length is its Z axis. Three's X-Y-Z Euler applies Y before X, so
 * `lean` swings the length toward the hunter's left (+X) before it's stood up.
 */
const headUp = (lean: number): [number, number, number] => [-110 * DEG, lean * DEG, 0];
const tipDown = (lean: number): [number, number, number] => [115 * DEG, lean * DEG, 0];

export const WEAPON_MOUNTS: Record<string, WeaponMounts> = {
  "great-sword": {
    drawn: [leftGrip(53)],
    sheathed: [back([-8, 22, -13], tipDown(30))],
  },
  "long-sword": {
    drawn: [leftGrip(62)],
    sheathed: [back([-8, 20, -12], tipDown(30)), back([-8, 20, -12], tipDown(30))],
  },
  hammer: {
    drawn: [leftGrip(0, [0.074, -0.018, 0])],
    sheathed: [back([-14, -30, -14], headUp(40))],
  },
  "hunting-horn": {
    drawn: [leftGrip(42)],
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
  "dual-blades": {
    drawn: [rightHand, leftHand],
    sheathed: [back([-8, 14, -11], tipDown(20)), back([8, 14, -11], tipDown(-20))],
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
