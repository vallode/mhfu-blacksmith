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
  shelling?: ShellingInfo | null;
  rapid_fire?: string | null;
  recoil?: string | null;
  reload?: string | null;
  create_cost?: number | null;
  improve_cost?: number | null;
  improve_from?: string[] | null;
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
  // set by generate-pages.rb based on hr field
  rank?: string;
  hr?: string | number;
  elder?: string | number;
}

export interface WeaponTreeNode {
  slug: string;
  name: string;
  type: string;
  rarity?: number;
  color?: string;
  element?: string;
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
  rank?: string;
  defence?: string | number;
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
  name: string;
  chance: string;
}

export interface Monster {
  name: string;
  slug: string;
  type: string;
  description?: string;
  habitats?: string[];
  hitzones?: Record<string, HitzoneValues>;
  drops?: Record<string, Record<string, MonsterDrop[]>>;
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
}
