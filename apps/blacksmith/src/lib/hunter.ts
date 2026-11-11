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

/** The middle of each palm from its wrist joint, the median over the game's gauntlet meshes. */
const RIGHT_PALM: [number, number, number] = [-8.7, -0.8, 5.1];
const LEFT_PALM: [number, number, number] = [8.7, -0.8, 5.1];

const rightHand: WeaponMount = {
  joint: JOINT.RIGHT_HAND,
  position: RIGHT_PALM,
  rotation: [0, 0, 0],
};
const leftHand: WeaponMount = { joint: JOINT.LEFT_HAND, position: LEFT_PALM, rotation: [0, 0, 0] };

/**
 * A two-handed weapon in the right palm, turned so its handle reaches the left
 * palm in the class's drawn stance (group 0, slot 1 of its motion file). A heavy
 * bowgun's barrel runs along -Z, so its rotation includes a half turn. The hammer
 * isn't here: its left hand doesn't reach the shaft in that stance.
 */
const twoHanded = (x: number, y: number, z: number): WeaponMount => ({
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
    drawn: [twoHanded(-0.04, -0.538, -0.011)],
    sheathed: [back([-8, 22, -13], tipDown(30))],
  },
  "long-sword": {
    drawn: [twoHanded(-0.48, -0.209, -0.051)],
    sheathed: [back([-8, 20, -12], tipDown(30)), back([-8, 20, -12], tipDown(30))],
  },
  hammer: {
    drawn: [rightHand],
    sheathed: [back([-14, -30, -14], headUp(40))],
  },
  "hunting-horn": {
    drawn: [twoHanded(-0.007, -0.269, -0.001)],
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
    drawn: [twoHanded(0.363, -0.043, 0.008)],
    sheathed: [back([-10, -6, -14], headUp(25))],
  },
  "heavy-bowgun": {
    drawn: [twoHanded(-2.779, 0.043, -0.008)],
    sheathed: [back([-10, -6, -16], headUp(25))],
  },
  // A bow's length runs along its Y axis, so it stands upright as it is.
  bow: {
    drawn: [leftHand, back([0, -25, -8], [0, 0, 0])],
    sheathed: [back([0, 0, -12], [0, 0, -30 * DEG]), back([0, -25, -8], [0, 0, 0])],
  },
};
