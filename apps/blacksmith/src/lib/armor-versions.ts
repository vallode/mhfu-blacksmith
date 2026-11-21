/**
 * Armor versions: the same piece made again at a later rank (Rathalos Helm,
 * Rathalos Helm S, Rathalos Helm X). The game has no link between them, so
 * they are grouped by name: a version is its base name plus a rank suffix
 * (S, U, X, Z, D, Haku, Ten, Kyoku) or prefix (Supreme, Ultimate, True).
 *
 * The game cuts names to 20 characters, dropping spaces and letters as it
 * likes ("SprmExtrvagantCamise", "RthianHeartLeggingsU", "Wht Fatalis Claw
 * Z"). Names are compared without spaces or case, and families from
 * different ranks whose names are abbreviations of each other are merged.
 */
import { ARMOR_RANKS, type ArmorRank } from "./constants";

/** Words after the base name that mark a later (or alternative) version. */
const SUFFIX = /(?:\s+|(?<=[a-z]))(?:S|U|X|Z|D|Haku|Ten|Kyoku)$/;
/** Words before the base name that mark a later version, as squashed. */
const PREFIX = /^(?:supreme|suprem|suprme|suprm|sprm|ultimate|true|tru)(?=.{4})/;

/** Versions renamed past what abbreviation matching can follow, by key. */
const RENAMED: Record<string, string> = {
  kushalagrasp: "kushalaembrace", // Kushala Grasp X
  guardnsprtbraces: "guardiansprtvambrces", // TrueGuardnSprtBraces
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The key shared by every version of a piece, before abbreviations are matched. */
export function armorVersionKey(name: string): string {
  const key = squash(name.trim().replace(SUFFIX, "")).replace(PREFIX, "");
  return RENAMED[key] ?? key;
}

/** `short` is `long` with letters left out. */
function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const c of long) if (c === short[i]) i++;
  return i === short.length;
}

/**
 * How well two keys match as abbreviations of one name: the number of letters
 * left out, or null if they don't. Either keeps the first letter, or the
 * shorter one drops a leading word ("Garuga Helm S" for "Yian Garuga Helm").
 */
function abbreviationDistance(a: string, b: string): number | null {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const gap = long.length - short.length;
  if (gap > 5 || short.length < 6) return null;
  if (short[0] === long[0] && isSubsequence(short, long)) return gap;
  if (long.endsWith(short)) return gap;
  return null;
}

export interface ArmorVersion {
  rank: ArmorRank;
  slug: string;
  name: string;
  rarity: number;
  /** Max defence, for comparing versions at a glance. */
  maxDefence?: number;
}

/** One piece and every version of it, low rank first. */
export interface ArmorVersionFamily {
  key: string;
  versions: ArmorVersion[];
}

interface Building {
  keys: string[];
  sex: string;
  versions: ArmorVersion[];
  ranks: Set<ArmorRank>;
}

/**
 * Group a slot's pieces (every rank) into families. Pieces with no other
 * version form a family of one. Families keep the order of their first piece.
 */
export function groupArmorVersions(
  pieces: (ArmorVersion & { sex?: string })[],
): ArmorVersionFamily[] {
  // Exact keys first. Pieces sold as separate Male and Female entries under
  // one name (Guild Guard) stay apart.
  const byKey = new Map<string, Building>();
  for (const { sex: rawSex, ...version } of pieces) {
    const sex = rawSex === "Male" || rawSex === "Female" ? rawSex : "";
    const key = armorVersionKey(version.name);
    let family = byKey.get(`${key}|${sex}`);
    if (!family) {
      family = { keys: [key], sex, versions: [], ranks: new Set() };
      byKey.set(`${key}|${sex}`, family);
    }
    family.versions.push(version);
    family.ranks.add(version.rank);
  }

  // Then abbreviations: merge a family into the closest match among those
  // with none of its ranks (two pieces of one rank are never versions).
  const families = [...byKey.values()];
  for (let i = families.length - 1; i >= 0; i--) {
    const family = families[i];
    let best: { into: Building; distance: number } | null = null;
    for (const other of families) {
      if (other === family || other.sex !== family.sex) continue;
      if ([...family.ranks].some((r) => other.ranks.has(r))) continue;
      for (const a of family.keys) {
        for (const b of other.keys) {
          const distance = abbreviationDistance(a, b);
          if (distance !== null && (!best || distance < best.distance)) {
            best = { into: other, distance };
          }
        }
      }
    }
    if (best) {
      best.into.keys.push(...family.keys);
      best.into.versions.push(...family.versions);
      for (const r of family.ranks) best.into.ranks.add(r);
      families.splice(i, 1);
    }
  }

  const rankOrder = (v: ArmorVersion) => ARMOR_RANKS.indexOf(v.rank);
  return families.map((f) => ({
    key: f.keys[0] + (f.sex ? `|${f.sex}` : ""),
    versions: f.versions.toSorted((a, b) => rankOrder(a) - rankOrder(b) || a.rarity - b.rarity),
  }));
}
