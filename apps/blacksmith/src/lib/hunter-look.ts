/**
 * The hunter's look in the armor viewer: the face, hairstyle, hair colour and
 * clothes picked at character creation (mhfu-extract's `models/look.ts`),
 * which the site dresses its bare hunter in (`hunter-armor.ts`). The pieces
 * and what can be picked come from `export-site`: `hunter/look.json` lists,
 * for each sex, how many faces and hairstyles there are, each face's skin
 * tone, the clothing models and the helmets' face masks.
 */
const HUNTER_DIR = "/models/hunter";
export const HUNTER_LOOK_DATA = `${HUNTER_DIR}/look.json`;

export type LookSex = "m" | "f";

/** A hunter's look; `hairColor` is RGB (0xRRGGBB). */
export interface HunterLook {
  face: number;
  hair: number;
  hairColor: number;
  clothing: number;
}

/** The look of the bare hunters `export-site` writes (mhfu-extract's `HUNTER_*`). */
export const DEFAULT_LOOK: HunterLook = { face: 0, hair: 0, hairColor: 0x4a3020, clothing: 2 };

/** Clothes to pick from: a column of each `clothing` table. */
export const CLOTHING_COUNT = 8;

/** The slots clothes are worn in (the waist has none). */
export const CLOTHING_SLOTS = ["plate", "gauntlets", "leggings"] as const;
export type ClothingSlot = (typeof CLOTHING_SLOTS)[number];

/** One sex's `look.json` entry (mhfu-extract's `SiteLook`). */
export interface LookOptions {
  faces: number;
  hairstyles: number;
  /** Each face's skin tone, 0-3. */
  faceSkinTones: number[];
  /** Images in each skin tone. */
  skinImages: number;
  /** Each slot's armor model, by clothing then skin tone. */
  clothing: Record<ClothingSlot, number[][]>;
  /** What each helmet model hides of the face (`FACE_MASK` bits), by model ID. */
  faceMasks: Record<string, number>;
}

export type LookData = Partial<Record<LookSex, LookOptions>>;

let lookData: Promise<LookData | null> | null = null;

/** `look.json`, fetched once; null when this export has none. */
export function fetchLookData(): Promise<LookData | null> {
  lookData ??= fetch(HUNTER_LOOK_DATA)
    .then((res) => (res.ok ? (res.json() as Promise<LookData>) : null))
    .catch(() => null);
  return lookData;
}

/** The look as a save stores it (`save-worker.js`): its hair colour is the game's 0xAABBGGRR. */
export interface SaveLook {
  face: number;
  hair: number;
  hairColor: number;
  clothing: number;
}

export function lookFromSave(look: SaveLook): HunterLook {
  const abgr = look.hairColor;
  return {
    face: look.face,
    hair: look.hair,
    hairColor: ((abgr & 0xff) << 16) | (((abgr >> 8) & 0xff) << 8) | ((abgr >> 16) & 0xff),
    clothing: look.clothing,
  };
}

/** `look`, with each pick brought within what `options` offers. */
export function clampLook(look: HunterLook, options: LookOptions): HunterLook {
  const within = (value: number, count: number) =>
    Number.isInteger(value) && value >= 0 && value < count ? value : 0;
  return {
    face: within(look.face, options.faces),
    hair: within(look.hair, options.hairstyles),
    hairColor: within(look.hairColor, 0x1000000),
    clothing: within(look.clothing, CLOTHING_COUNT),
  };
}

const pad = (id: number) => String(id).padStart(3, "0");

export const faceUrl = (sex: LookSex, id: number) => `${HUNTER_DIR}/look/${sex}_face${pad(id)}.glb`;
export const hairstyleUrl = (sex: LookSex, id: number) =>
  `${HUNTER_DIR}/look/${sex}_head${pad(id)}.glb`;
/** Image `k` of skin tone `tone`. */
export const skinUrl = (sex: LookSex, tone: number, k: number) =>
  `${HUNTER_DIR}/skin/${sex}_${tone}_${k}.png`;

/** `#rrggbb` for a colour input. */
export function hexColor(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

/** The looks picked in the viewer, by sex, kept across sessions; a sex with none shows the save's or the default. */
export type PickedLooks = Partial<Record<"male" | "female", HunterLook>>;

const KEY = "hunter-look";

function isLook(value: unknown): value is HunterLook {
  if (typeof value !== "object" || value === null) return false;
  const look = value as Record<string, unknown>;
  return (["face", "hair", "hairColor", "clothing"] as const).every((key) =>
    Number.isInteger(look[key]),
  );
}

export function readPickedLooks(): PickedLooks {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const picked: PickedLooks = {};
    for (const sex of ["male", "female"] as const)
      if (isLook(stored[sex])) picked[sex] = stored[sex];
    return picked;
  } catch {
    return {};
  }
}

export function writePickedLooks(picked: PickedLooks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(picked));
  } catch {
    // Ignore storage errors (e.g. private browsing quota).
  }
}
