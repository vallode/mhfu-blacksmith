/**
 * Link embeds for shared sets (`/sets/<code>/<slug>/`, set-link.ts). The page is one
 * static file for every set, so the Cloudflare Worker
 * (src/cloudflare/worker.ts) decodes the code and writes these into its
 * meta tags: the set's name (or, without one, its skills) as the title, its
 * points in each skill tree that activates a skill as the description, and
 * its card (set-card.ts) as the image, with everything on the card also in
 * the image's alt text.
 *
 * The Worker can't load the /data bundles the client builds its search data
 * from (too much to parse per request), so the build writes just what a code
 * needs into one file (setEmbedData, written by scripts/generate-embeds.ts
 * to SET_EMBED_DATA_PATH).
 *
 * Pure: no fs, no process.env.
 */
import { ARMOR_RANKS, ARMOR_SLOTS, type ArmorSlot } from "./constants";
import {
  ELEMENT_EMOJI,
  lines,
  rankLabel,
  signed,
  slotGlyphs,
  tally,
  THEME_COLOR,
  tintFor,
} from "./embed-format";
import { BIN_LABELS, evaluateBuild, type BuildSet } from "./set-build";
import { decodeSet, type CodecTables } from "./set-codec";
import {
  TORSO_UP_TREE,
  type Deco,
  type Piece,
  type SearchData,
  type SkillTreeData,
} from "./set-search";

/** Where the build writes setEmbedData's file, under public/. */
export const SET_EMBED_DATA_PATH = "/embed/set-data.json";

/** What an embed needs of an armor piece. */
type EmbedPiece = Pick<Piece, "name" | "rank" | "defence" | "res" | "slots" | "rarity" | "points">;
/** What an embed needs of a decoration. */
type EmbedDeco = Pick<Deco, "name" | "slots" | "points" | "color">;

/** Everything a share code can name, keyed the way codes name it. */
export interface SetEmbedData {
  /** The game data's version (data-manifest.json), for cache keys. */
  version: string;
  trees: SkillTreeData[];
  /** "<slot>:<equipment ID>" (as CodecTables.pieceByGameId) -> piece. */
  pieces: Record<string, EmbedPiece>;
  /** Item ID -> decoration. */
  decorations: Record<string, EmbedDeco>;
}

/** The embed data from the search data and its codec tables. */
export function setEmbedData(data: SearchData, tables: CodecTables, version: string): SetEmbedData {
  const pieces: SetEmbedData["pieces"] = {};
  for (const [key, p] of tables.pieceByGameId) {
    const { name, rank, defence, res, slots, rarity, points } = p;
    pieces[key] = { name, rank, defence, res, slots, rarity, points };
  }
  const decorations: SetEmbedData["decorations"] = {};
  for (const [itemId, d] of tables.decoByItemId) {
    decorations[itemId] = { name: d.name, slots: d.slots, points: d.points, color: d.color };
  }
  return { version, trees: data.trees, pieces, decorations };
}

/**
 * Codec tables for decoding only (no Piece.id -> equipment ID map, which
 * encoding needs). The pieces have what evaluateSet reads; their ids and
 * links are placeholders, and hunter type and sex are "Both".
 */
export function embedCodecTables(data: SetEmbedData): CodecTables {
  const pieceByGameId = new Map<string, Piece>();
  for (const [key, p] of Object.entries(data.pieces)) {
    const slot = key.split(":")[0] as ArmorSlot;
    pieceByGameId.set(key, {
      ...p,
      id: -1,
      slot,
      slug: "",
      href: "",
      sex: "Both",
      hunterType: "Both",
      torsoUp: (p.points[TORSO_UP_TREE] ?? 0) > 0,
    });
  }
  const decoByItemId = new Map<number, Deco>();
  for (const [itemId, d] of Object.entries(data.decorations)) {
    decoByItemId.set(Number(itemId), { ...d, id: -1, slug: "", href: "", itemId: Number(itemId) });
  }
  return { pieceGameId: new Map(), pieceByGameId, decoByItemId };
}

export interface SetEmbed {
  /** The set's name, or its skills when it has none. */
  title: string;
  /**
   * Points in each skill tree that activates a skill: "Attack +21 · Paralysis −10".
   * Without any, "No skills" for a named set and empty for one titled that.
   */
  description: string;
  /** Everything in words, the description and then the pieces and decorations: the card's alt text. */
  details: string;
  /** The line above the title, served as oEmbed by the Worker. */
  author: string;
  /** The embed's edge colour. */
  color: string;
}

/** "G-Rank Blademaster Set": the highest rank among the pieces, and the hunter. */
export function setLabel(set: BuildSet): string {
  const rank = ARMOR_RANKS.findLast((r) => set.pieces.some((p) => p?.rank === r));
  return [rank && rankLabel(rank), set.hunterType, "Set"].filter(Boolean).join(" ");
}

/** Discord cuts an embed's title at 256 characters. */
const MAX_TITLE = 200;

/** Resistances in the game's order, as set-search keeps them. */
const RES_NAMES = ["Fire", "Water", "Thunder", "Ice", "Dragon"];

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** "Attack Jewel ×2, Expert Jewel" in the order they first appear. */
function countNames(names: string[]): string {
  return tally(names, (n) => n)
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(", ");
}

/** The embed for a set (and its name, from a saved set's share link), or null for an empty set. */
export function buildSetEmbed(
  set: BuildSet,
  trees: SkillTreeData[],
  name?: string,
): SetEmbed | null {
  const pieces = set.pieces.filter((p): p is Piece => p !== null);
  if (pieces.length === 0 && set.decorations.length === 0) return null;
  const stats = evaluateBuild({ trees, pieces: [], decorations: [] }, set);

  const good = stats.skills.filter((s) => s.threshold > 0).map((s) => s.name);
  const bad = stats.skills.filter((s) => s.threshold < 0).map((s) => s.name);
  const skills = good.length > 0 ? good.join(" · ") : "No skills";
  const title = truncate(name || skills, MAX_TITLE);

  const points = stats.skills.map((s) => `${s.tree} ${signed(s.points)}`).join(" · ");
  // A set with no skills says so in its title, unless it has a name.
  const description = points || (name ? "No skills" : "");

  const res = RES_NAMES.map((n, i) => `${ELEMENT_EMOJI[n]}${signed(stats.res[i])}`).join(" ");
  const pieceLines = ARMOR_SLOTS.map((slot, i) => {
    const p = set.pieces[i];
    return p && `${BIN_LABELS[slot]}: ${p.name}`;
  });
  const jewels = countNames(stats.decorations.map((d) => d.deco.name));
  const details = lines(
    name,
    `${setLabel(set)}: ${good.length > 0 ? good.join(", ") : "no skills"}`,
    bad.length > 0 && `Bad skills: ${bad.join(", ")}`,
    `Defense ${stats.defence} · ${res}`,
    ...pieceLines,
    set.weaponSlots > 0 && `Weapon slots: ${slotGlyphs(set.weaponSlots)}`,
    jewels && `Jewels: ${jewels}`,
    stats.freeSlots > 0 && `${stats.freeSlots} free slot${stats.freeSlots === 1 ? "" : "s"}`,
  );

  const rarity = Math.max(0, ...pieces.map((p) => p.rarity ?? 0)) || undefined;
  return {
    title,
    description,
    details,
    author: setLabel(set),
    color: tintFor(rarity) ?? THEME_COLOR,
  };
}

/** A shared set: what its code holds, decoded. */
export interface SharedSet {
  set: BuildSet;
  /** Its name, from a saved set's share link. */
  name?: string;
  /** The code without the name: one per set (DecodeResult.canonical). */
  canonical: string;
}

/** Share code -> its set, or null when it doesn't open or holds nothing. */
export type SetReader = (code: string) => SharedSet | null;

export function setReader(data: SetEmbedData): SetReader {
  const tables = embedCodecTables(data);
  return (code) => {
    const r = decodeSet(code, tables);
    if (!r.ok || (!r.set.pieces.some(Boolean) && r.set.decorations.length === 0)) return null;
    return { set: r.set, name: r.name, canonical: r.canonical };
  };
}
