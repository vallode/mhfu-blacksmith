/**
 * Gunner-only weapon fields: bowgun ammo, reload, recoil, rapid fire and
 * max attack, and bow charge shots, coatings and coating bonuses
 * (vallode/mhfu-blacksmith#32).
 *
 * Every mapping below was derived by correlating the raw EU (ULES01213)
 * structs from `extract --raw` against the committed
 * `data/weapons/{light-bowgun,heavy-bowgun,bow}.json`:
 *
 * - Ammo: `BulletCharge` selects the `BGShotTable` row and the
 *   `ShotCoatings` bit for each ammo type says whether the gun can load it;
 *   a type it can't load shows capacity 0. 203 of 220 bowguns match
 *   exactly; without the mask, none do.
 * - `Reload` 0-4 is VerySlow to VeryFast, every bowgun.
 * - `RecoilCharge` is the recoil level on bowguns (2 Moderate, 3 Light,
 *   4 Weak, 5 VeryWeak; 0 and 1 don't occur) and the number of bow charge
 *   levels less one (capped at 4) on bows.
 * - Max attack is attack plus the last `BGModLevel.Attack_Inc` of the gun's
 *   mod type (`RangedPhysxTbl`), scaled like attack. It is 50 for every
 *   type, so +60 shown.
 * - Bow `BulletCharge` selects the `BowChargeTable` row: 105 of 106 bows.
 * - Bow `ShotCoatings` bits 7-9 are the poison, paralysis and sleep coating
 *   bonuses the site lists as `{ name, attack: "Add" }` elements.
 */
import type { BinaryReader } from "../binary/reader.js";
import {
  RAPID_FIRE_BITS,
  readBowChargeTable,
  readBowgunModTable,
  readBowgunShotTable,
  readRapidFireTable,
  type BowgunModLevel,
} from "../tables/gunner.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { decodeBowCoatings, type GunnerWeapon, type WeaponTypeName } from "../tables/weapons.js";

export interface AmmoCapacity {
  name: string;
  capacity: number[];
}

export interface BowShot {
  name: string;
  level: string;
}

/** Ammo groups in `ShotCoat` bit order: [field, [name, levels][]]. */
const AMMO_GROUPS: [string, [string, number][]][] = [
  [
    "ammo",
    [
      ["Normal S", 3],
      ["Pierce S", 3],
      ["Pellet S", 3],
      ["Crag S", 3],
      ["Clust S", 3],
    ],
  ],
  [
    "element_ammo",
    [
      ["Flame S", 1],
      ["Water S", 1],
      ["ThunderS", 1],
      ["Freeze S", 1],
      ["Dragon S", 1],
    ],
  ],
  [
    "status_ammo",
    [
      ["RecovS", 2],
      ["PoisnS", 2],
      ["Para S", 2],
      ["SleepS", 2],
    ],
  ],
  [
    "misc_ammo",
    [
      ["Tranq S", 1],
      ["Paint S", 1],
      ["Demon S", 1],
      ["Armor S", 1],
    ],
  ],
];

export const RELOAD_NAMES: readonly string[] = ["VerySlow", "Slow", "Normal", "Fast", "VeryFast"];
export const RECOIL_NAMES: Readonly<Record<number, string>> = {
  2: "Moderate",
  3: "Light",
  4: "Weak",
  5: "VeryWeak",
};

/** `BowChargeID` 0-14: Rapd, Sctr, Prce, each level 1-5. */
const CHARGE_KINDS = ["Rapd", "Sctr", "Prce"];
const MAX_BOW_CHARGES = 4;

/** `ShotCoatings` bits for the bow coating bonuses, in the site's element names. */
export const BOW_COATING_BONUS_BITS: readonly [string, number][] = [
  ["Poison", 7],
  ["Paralysis", 8],
  ["Sleep", 9],
];

export interface GunnerTables {
  shots: number[][];
  charges: number[][];
  mods: BowgunModLevel[][];
  rapidFire: Map<number, number>;
}

export function readGunnerTables(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): GunnerTables {
  return {
    shots: readBowgunShotTable(reader, resolver),
    charges: readBowChargeTable(reader, resolver),
    mods: readBowgunModTable(reader, resolver),
    rapidFire: readRapidFireTable(reader, resolver),
  };
}

/** The four bowgun ammo lists, keyed by their `data/` field. */
export function emitBowgunAmmo(
  row: number[] | undefined,
  shotCoatings: number,
): Record<string, AmmoCapacity[]> {
  const out: Record<string, AmmoCapacity[]> = {};
  let bit = 0;
  for (const [field, ammo] of AMMO_GROUPS) {
    out[field] = ammo.map(([name, levels]) => {
      const capacity: number[] = [];
      for (let l = 0; l < levels; l++, bit++) {
        const usable = ((shotCoatings >>> bit) & 1) === 1;
        capacity.push(usable ? (row?.[bit] ?? 0) : 0);
      }
      return { name, capacity };
    });
  }
  return out;
}

/** Rapid fire ammo joined with `|` as the site writes it, or null. */
export function emitRapidFire(flags: number | undefined): string | null {
  if (!flags) return null;
  const names: string[] = [];
  RAPID_FIRE_BITS.forEach((name, bit) => {
    if ((flags >>> bit) & 1 && !names.includes(name)) names.push(name);
  });
  return names.length > 0 ? names.join("|") : null;
}

/** A bow's charge shots: `RecoilCharge + 1` levels of its `BowChargeTable` row, at most 4. */
export function emitBowShots(row: number[] | undefined, recoilCharge: number): BowShot[] | null {
  if (!row) return null;
  const count = Math.min(recoilCharge + 1, MAX_BOW_CHARGES);
  const shots: BowShot[] = [];
  for (const id of row.slice(0, count)) {
    const kind = CHARGE_KINDS[Math.floor(id / 5)];
    if (!kind) return null;
    shots.push({ name: kind, level: String((id % 5) + 1) });
  }
  return shots.length > 0 ? shots : null;
}

/** Coating bonuses as the site stores them in `elements`. */
export function emitBowCoatingBonuses(shotCoatings: number): { name: string; attack: "Add" }[] {
  return BOW_COATING_BONUS_BITS.filter(([, bit]) => (shotCoatings >>> bit) & 1).map(([name]) => ({
    name,
    attack: "Add" as const,
  }));
}

export function bowCoatingNames(shotCoatings: number): string[] {
  return Object.entries(decodeBowCoatings(shotCoatings))
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag);
}

/** The gunner-only fields for one weapon, keyed by their `data/` field. */
export function emitGunnerDetails(
  w: GunnerWeapon,
  type: WeaponTypeName | null,
  classMod: number,
  tables: GunnerTables,
): Record<string, unknown> {
  if (type === "light-bowgun" || type === "heavy-bowgun") {
    const levels = tables.mods[w.rangedPhysxTbl] ?? [];
    const maxIncrease = Math.max(0, ...levels.map((l) => l.attackIncrease));
    return {
      max_attack: Math.round(((w.attack + maxIncrease) * classMod) / 100),
      rapid_fire: type === "light-bowgun" ? emitRapidFire(tables.rapidFire.get(w.index)) : null,
      reload: RELOAD_NAMES[w.reload] ?? null,
      recoil: RECOIL_NAMES[w.recoilCharge] ?? null,
      ...emitBowgunAmmo(tables.shots[w.bulletCharge], w.shotCoatings),
    };
  }
  if (type === "bow") {
    return {
      coatings: bowCoatingNames(w.shotCoatings),
      shots: emitBowShots(tables.charges[w.bulletCharge], w.recoilCharge),
    };
  }
  return {};
}
