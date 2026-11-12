/**
 * Link embeds for shared sets (`/set-builder/?s=<code>`). The page is one
 * static file for every set, so the Cloudflare Worker
 * (src/cloudflare/worker.ts) decodes the code and writes these into its
 * meta tags: the set's skills as the title, its defense, resistances, pieces
 * and decorations as the description.
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
  embedIcon,
  lines,
  rankLabel,
  signed,
  slotGlyphs,
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
type EmbedDeco = Pick<Deco, "name" | "slots" | "points">;

/** Everything a share code can name, keyed the way codes name it. */
export interface SetEmbedData {
  trees: SkillTreeData[];
  /** "<slot>:<equipment ID>" (as CodecTables.pieceByGameId) -> piece. */
  pieces: Record<string, EmbedPiece>;
  /** Item ID -> decoration. */
  decorations: Record<string, EmbedDeco>;
}

/** The embed data from the search data and its codec tables. */
export function setEmbedData(data: SearchData, tables: CodecTables): SetEmbedData {
  const pieces: SetEmbedData["pieces"] = {};
  for (const [key, p] of tables.pieceByGameId) {
    const { name, rank, defence, res, slots, rarity, points } = p;
    pieces[key] = { name, rank, defence, res, slots, rarity, points };
  }
  const decorations: SetEmbedData["decorations"] = {};
  for (const [itemId, d] of tables.decoByItemId) {
    decorations[itemId] = { name: d.name, slots: d.slots, points: d.points };
  }
  return { trees: data.trees, pieces, decorations };
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
  title: string;
  description: string;
  /** The line above the title, served as oEmbed by the Worker. */
  author: string;
  /** Thumbnail, a path under the site. */
  image: { url: string; width: number; height: number };
  /** The embed's edge colour. */
  color: string;
}

/** Discord cuts an embed's title at 256 characters. */
const MAX_TITLE = 200;

/** Resistances in the game's order, as set-search keeps them. */
const RES_NAMES = ["Fire", "Water", "Thunder", "Ice", "Dragon"];

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** "Attack Jewel ×2, Expert Jewel" in the order they first appear. */
function countNames(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(", ");
}

/**
 * The embed for a set, or null for an empty one. The description puts what
 * matters most first, in case a client shortens it.
 */
export function buildSetEmbed(set: BuildSet, trees: SkillTreeData[]): SetEmbed | null {
  const pieces = set.pieces.filter((p): p is Piece => p !== null);
  if (pieces.length === 0 && set.decorations.length === 0) return null;
  const stats = evaluateBuild({ trees, pieces: [], decorations: [] }, set);

  const good = stats.skills.filter((s) => s.threshold > 0).map((s) => s.name);
  const bad = stats.skills.filter((s) => s.threshold < 0).map((s) => s.name);
  const title = truncate(good.length > 0 ? good.join(" · ") : "No skills", MAX_TITLE);

  const res = RES_NAMES.map((n, i) => `${ELEMENT_EMOJI[n]}${signed(stats.res[i])}`).join(" ");
  const pieceLines = ARMOR_SLOTS.map((slot, i) => {
    const p = set.pieces[i];
    return p && `${BIN_LABELS[slot]}: ${p.name}`;
  });
  const jewels = countNames(stats.decorations.map((d) => d.deco.name));
  const description = lines(
    `Defense ${stats.defence} · ${res}`,
    bad.length > 0 && `Bad skills: ${bad.join(", ")}`,
    ...pieceLines,
    set.weaponSlots > 0 && `Weapon slots: ${slotGlyphs(set.weaponSlots)}`,
    jewels && `Jewels: ${jewels}`,
    stats.freeSlots > 0 && `${stats.freeSlots} free slot${stats.freeSlots === 1 ? "" : "s"}`,
  );

  const rank = ARMOR_RANKS.findLast((r) => pieces.some((p) => p.rank === r));
  const rarity = Math.max(0, ...pieces.map((p) => p.rarity ?? 0)) || undefined;
  return {
    title,
    description,
    author: [rank && rankLabel(rank), set.hunterType, "Set"].filter(Boolean).join(" "),
    image: embedIcon("plate", rarity),
    color: tintFor(rarity) ?? THEME_COLOR,
  };
}

/** Share code -> its embed, or null when it doesn't open or holds nothing. */
export function setEmbedder(data: SetEmbedData): (code: string) => SetEmbed | null {
  const tables = embedCodecTables(data);
  return (code) => {
    const r = decodeSet(code, tables);
    return r.ok ? buildSetEmbed(r.set, data.trees) : null;
  };
}
