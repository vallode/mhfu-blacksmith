import type { Tier } from "./min-rank";

export interface Material {
  name: string;
  amount: string | number;
  type: string;
  color: string;
}

export interface WeaponElement {
  name: string;
  attack: number;
}

export interface ShellingInfo {
  type: string;
  level: number;
}

export interface AmmoEntry {
  name: string;
  capacity: number[];
}

export interface ShotEntry {
  name: string;
  level: number;
}

export interface Melody {
  combo: string[];
  effect: string;
  description: string | null;
  duration: string | null;
  extended_effect: string | null;
  extended_duration: string | null;
}

/** Earliest quest progress at which gear can be made (see min-rank.ts). */
export type MinRank = Tier;

export interface Weapon {
  name: string;
  slug: string;
  type: string;
  attack?: number;
  raw_attack?: number;
  max_attack?: number;
  affinity?: string;
  slots?: number;
  rarity?: number;
  bonus?: string | null;
  sharpness?: (string | number)[];
  sharpness_plus?: (string | number)[];
  elements?: WeaponElement[] | null;
  notes?: string[] | null;
  /** Hunting horn songs its notes can play. */
  melodies?: Melody[];
  shelling?: ShellingInfo | null;
  rapid_fire?: string | null;
  recoil?: string | null;
  reload?: string | null;
  create_cost?: number | null;
  improve_cost?: number | null;
  /** A single source is a bare string; several are a list. */
  improve_from?: string | string[] | null;
  improve_to?: string[] | null;
  create_mats?: Material[] | null;
  improve_mats?: Material[] | null;
  alternative_create_mats?: Material[] | null;
  ammo?: AmmoEntry[] | null;
  status_ammo?: AmmoEntry[] | null;
  element_ammo?: AmmoEntry[] | null;
  misc_ammo?: AmmoEntry[] | null;
  coatings?: string[] | null;
  shots?: ShotEntry[] | null;
  skills?: string[] | null;
  color?: string | null;
  /** Derived from quest drops and recipes; absent when no route is known. */
  min_rank?: MinRank;
}

export interface WeaponTreeNode {
  slug: string;
  name: string;
  type: string;
  rarity?: number;
  color?: string;
  element?: string;
  /** Earliest quest progress needed to make it; absent when no route is known. */
  min_rank?: MinRank;
  /** Armor only: defence at the highest upgrade level. */
  max_defence?: number;
  /**
   * The page of the weapon this one is upgraded from, when the tree row isn't
   * nested under it any more (its parent was pruned out of the tree).
   */
  parentHref?: string;
  children?: WeaponTreeNode[];
}

export interface WeaponTree {
  map: WeaponTreeNode[];
}

export interface ArmorSkill {
  name: string;
  amount: string | number;
}

export interface ArmorPiece {
  name: string;
  slug: string;
  type: string;
  hr?: string | number;
  elder?: string | number;
  rank: string;
  /** Derived from quest drops and recipes; absent when no route is known. */
  min_rank?: MinRank;
  defence?: string | number;
  /** Defence at the highest upgrade level, after Ukanlos opens the last True Armor Sphere levels. */
  max_defence?: number;
  /** Defence at the highest upgrade level before Ukanlos. */
  max_defence_pre_ukanlos?: number;
  fire_res?: string | number;
  thunder_res?: string | number;
  dragon_res?: string | number;
  water_res?: string | number;
  ice_res?: string | number;
  sex?: string;
  hunter_type?: string;
  rarity?: string | number;
  slots?: number;
  create_cost?: string | number | null;
  skills?: ArmorSkill[];
  create_mats?: Material[];
  /** A second recipe for the same piece (e.g. Felyne Piercing). */
  alternative_create_mats?: Material[];
}

export interface HitzoneValues {
  cut?: string;
  bash?: string;
  shot?: string;
  fir?: string;
  wtr?: string;
  thn?: string;
  ice?: string;
  drg?: string;
  ko?: string;
}

export interface MonsterDrop {
  /** Item name without the quantity suffix ("Plesioth Scale", not "Plesioth Scale x2") */
  name: string;
  chance: string;
  /** How many you get, when the source says so ("x2") */
  quantity?: number;
  /** Icon type and colour of the matching material, when it has one */
  type?: string;
  color?: string;
}

/** One break reward and the body parts behind it (from the disc; see tools/mhfu-extract `monsters/breaks.ts`). */
export interface MonsterBreak {
  /** The break's drop group label without "break " ("head", "wing"). */
  name: string;
  /** Body parts: the `part` numbers of the monster's hitbox capsules. */
  parts: number[];
  /** Flinches of a part that break it; null when another event does. */
  flinches: number | null;
  /** Every listed part must reach the count (else any one). */
  all_parts?: boolean;
  /** Fraction of max HP the monster must be under. */
  below_hp?: number;
  /** Damage the part must have taken. */
  damage?: "cut" | "fire" | "dragon";
}

export interface Monster {
  name: string;
  slug: string;
  type: string;
  description?: string;
  habitats?: string[];
  hitzones?: Record<string, HitzoneValues>;
  drops?: Record<string, Record<string, MonsterDrop[]>>;
  /** Smallest and largest size, in cm */
  sizes?: { min: number; max: number };
  /** HP before a quest's multiplier, from the disc */
  base_hp?: number;
  /** Breakable parts, one entry per break reward */
  breaks?: MonsterBreak[];
  /**
   * Damage each body part (hitbox capsule `part`) takes before the monster
   * flinches, before quest scaling; null where there's no such part. Only in
   * `data/`: the site's bundles carry `hitzone_flinch` instead.
   */
  flinch_thresholds?: (number | null)[];
  /**
   * Each hitzone row's flinch threshold, by hitzone part: one value or a
   * range ("100–160", see `flinchThreshold`). Worked out by the data build
   * from `flinch_thresholds` and the monster's hitboxes; rows without one
   * are absent, and so is the field when no row has one.
   */
  hitzone_flinch?: Record<string, string>;
}

export interface Decoration {
  name: string;
  slug: string;
  type: string;
  color?: string;
  category?: string;
  rarity?: number;
  slots?: number;
  create_cost?: number | null;
  skills?: string[];
  create_mats?: Material[];
  /** Earliest quest progress it can be made at (generated, see min-rank.ts). */
  min_rank?: MinRank;
}
