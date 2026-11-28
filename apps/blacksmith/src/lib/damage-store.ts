/**
 * The damage calculator's last weapon, buffs and quest, kept in localStorage so the
 * page opens as it was left. The weapon is also in the page's URL
 * (`?weapon=<type>/<slug>`), which wins.
 */
import { WEAPON_TYPES, type WeaponType } from "./constants";
import {
  AFFINITY_SKILLS,
  ATTACK_SKILLS,
  DEMONDRUGS,
  HORN_ATTACK,
  HORN_ELEMENT,
  LOW_HEALTH,
  NO_BUFFS,
  SEEDS,
  type Buffs,
} from "./damage-buffs";

const STORAGE_KEY = "damage-calculator";
export const WEAPON_PARAM = "weapon";

export interface WeaponRef {
  type: WeaponType;
  slug: string;
}

export interface DamageState {
  weapon: WeaponRef | null;
  buffs: Buffs;
  /** The quest's ID, for its defense multipliers. */
  quest: number | null;
}

/** `great-sword/buster-sword`, as the URL and storage keep it. */
export const weaponKey = (w: WeaponRef) => `${w.type}/${w.slug}`;

export function parseWeaponKey(key: string | null | undefined): WeaponRef | null {
  const [type, slug, ...rest] = (key ?? "").split("/");
  if (rest.length || !slug || !(WEAPON_TYPES as readonly string[]).includes(type!)) return null;
  return { type: type as WeaponType, slug };
}

/** The calculator's page for a weapon. */
export const damageHref = (w: WeaponRef) =>
  `/damage/?${WEAPON_PARAM}=${encodeURIComponent(weaponKey(w)).replace("%2F", "/")}`;

const CHOICES: { [K in keyof Buffs]: Buffs[K] extends boolean ? "boolean" : object } = {
  attackSkill: ATTACK_SKILLS,
  powercharm: "boolean",
  powertalon: "boolean",
  demondrug: DEMONDRUGS,
  seed: SEEDS,
  hornAttack: HORN_ATTACK,
  lowHealth: LOW_HEALTH,
  affinitySkill: AFFINITY_SKILLS,
  elementAttack: "boolean",
  hornElement: HORN_ELEMENT,
  sharpnessPlus: "boolean",
};

/** Stored buffs, each one kept only if it's still a value the calculator knows. */
export function parseBuffs(value: unknown): Buffs {
  const out = { ...NO_BUFFS } as Record<string, unknown>;
  if (!value || typeof value !== "object") return NO_BUFFS;
  for (const [key, choices] of Object.entries(CHOICES)) {
    const v = (value as Record<string, unknown>)[key];
    if (choices === "boolean" ? typeof v === "boolean" : typeof v === "string" && v in choices)
      out[key] = v;
  }
  return out as unknown as Buffs;
}

export function readDamageState(): DamageState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return {
      weapon: parseWeaponKey(raw?.weapon),
      buffs: parseBuffs(raw?.buffs),
      quest: Number.isInteger(raw?.quest) ? raw.quest : null,
    };
  } catch {
    return { weapon: null, buffs: NO_BUFFS, quest: null };
  }
}

export function writeDamageState(state: DamageState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        weapon: state.weapon && weaponKey(state.weapon),
        buffs: state.buffs,
        quest: state.quest,
      }),
    );
  } catch {
    // Storage full or blocked: the page still works, it just won't remember.
  }
}
