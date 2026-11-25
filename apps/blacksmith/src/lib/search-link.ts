/**
 * Search links: a set builder address that opens with a search filled in
 * and runs it, `/set-builder/?skill=Evade+%2B2&skill=Auto-Reload&type=gunner`.
 * The Discord bot's set search replies with one, and anything else that turns
 * a request into the set builder's terms (a search box that takes plain
 * English) can too.
 *
 * Only what a search asks for is in it: the wanted skills, hunter type, rank,
 * weapon slots and the pieces to always or never use. Everything else (sex,
 * owned armor, quest progress) stays as the visitor has it. Pieces are their
 * page links without `/armorsmith/` and the slashes around it
 * (`plate/g-rank/rathalos-mail-x`), which survive data updates as the form's
 * own lists do. Pieces to leave out can also be named by a word of their
 * names (`never=Fatalis`: every Fatalis, Crimson, White and "Wht" Fatalis
 * piece), which keeps "no Fatalis gear" one short parameter.
 *
 * Pure and import-free: shared by the page and the bot's Worker, which
 * bundles it.
 */

export interface SearchLink {
  /** Wanted skills, by activation name ("Evade +2"). */
  skills: string[];
  hunterType?: "Blademaster" | "Gunner";
  /** Highest rank to use armor from. */
  rank?: "low-rank" | "high-rank" | "g-rank";
  weaponSlots?: number;
  /** Pieces in every set, by page link (`/armorsmith/<slot>/<rank>/<slug>/`). */
  lock: string[];
  /** Pieces the search leaves out, by page link. */
  exclude: string[];
  /** Words of piece names (`armorWords`) whose pieces the search leaves out. */
  never: string[];
}

export const SEARCH_LINK_PATH = "/set-builder/";

/** The address's parameters. A link is one when it has a `skill`. */
const P = {
  skill: "skill",
  type: "type",
  rank: "rank",
  slots: "slots",
  lock: "lock",
  exclude: "exclude",
  never: "never",
} as const;

const RANKS = ["low-rank", "high-rank", "g-rank"] as const;
const PIECE_PREFIX = "/armorsmith/";

/** `/armorsmith/plate/g-rank/x/` as `plate/g-rank/x`. */
function shortPiece(href: string): string {
  const inner = href.startsWith(PIECE_PREFIX) ? href.slice(PIECE_PREFIX.length) : href;
  return inner.replace(/^\/+|\/+$/g, "");
}

/** `plate/g-rank/x` as `/armorsmith/plate/g-rank/x/`, or null if it isn't three parts. */
function pieceHref(short: string): string | null {
  const parts = short.split("/").filter(Boolean);
  return parts.length === 3 ? `${PIECE_PREFIX}${parts.join("/")}/` : null;
}

/** A search link's path and query (`/set-builder/?skill=…`). */
export function searchLinkPath(link: SearchLink): string {
  const params = new URLSearchParams();
  for (const s of link.skills) params.append(P.skill, s);
  if (link.hunterType) params.set(P.type, link.hunterType.toLowerCase());
  if (link.rank) params.set(P.rank, link.rank);
  if (link.weaponSlots) params.set(P.slots, String(link.weaponSlots));
  for (const h of link.lock) params.append(P.lock, shortPiece(h));
  for (const h of link.exclude) params.append(P.exclude, shortPiece(h));
  for (const w of link.never) params.append(P.never, w);
  return `${SEARCH_LINK_PATH}?${params.toString()}`;
}

/**
 * The search a page address asks for (its `location.search`), or null when
 * it has no wanted skill. Values it can't read are left out.
 */
export function parseSearchLink(search: string): SearchLink | null {
  const params = new URLSearchParams(search);
  const skills = params
    .getAll(P.skill)
    .map((s) => s.trim())
    .filter(Boolean);
  if (skills.length === 0) return null;
  const link: SearchLink = { skills: [...new Set(skills)], lock: [], exclude: [], never: [] };
  const type = params.get(P.type)?.toLowerCase();
  if (type === "blademaster") link.hunterType = "Blademaster";
  if (type === "gunner") link.hunterType = "Gunner";
  const rank = params.get(P.rank);
  const knownRank = RANKS.find((r) => r === rank);
  if (knownRank) link.rank = knownRank;
  const slots = Number(params.get(P.slots));
  if (Number.isInteger(slots) && slots >= 1 && slots <= 3) link.weaponSlots = slots;
  const pieces = (key: string) =>
    params.getAll(key).flatMap((s) => {
      const href = pieceHref(s);
      return href ? [href] : [];
    });
  link.lock = pieces(P.lock);
  link.exclude = pieces(P.exclude);
  link.never = [
    ...new Set(
      params
        .getAll(P.never)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];
  return link;
}

/** Words in piece names that only say which piece it is, never which armor. */
const PIECE_WORDS = new Set(
  (
    "helm cap mail vest vambraces guards tasset coat greaves leggings coil head headpiece " +
    "torso chest gauntlet gauntlets pants boots gloves sleeves crown mask suit jacket " +
    "trousers leg legs feet fist claw horn hood hat helmet plate waist belt braces tights " +
    "socks wrap raiment costume camise"
  ).split(" "),
);

/**
 * A piece name's words, as `never` names armor: split at spaces and at the
 * game's run-together capitals ("RdGuildGuardTricorne" is "Rd Guild Guard
 * Tricorne"), without tier letters, "+" and the words for the piece itself.
 */
export function armorWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s()+]+/)
    .filter((w) => w.length >= 3 && !PIECE_WORDS.has(w.toLowerCase()));
}

/** Whether a piece's name has one of `words` (any case). */
export function hasArmorWord(name: string, words: readonly string[]): boolean {
  if (words.length === 0) return false;
  const wanted = new Set(words.map((w) => w.toLowerCase()));
  return armorWords(name).some((w) => wanted.has(w.toLowerCase()));
}

/** Whether an address carries any search link parameter (to clear them once read). */
export function hasSearchLinkParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return Object.values(P).some((k) => params.has(k));
}

/** The address's search without the search link's parameters (`?a=1`, or "" if none are left). */
export function withoutSearchLink(search: string): string {
  const params = new URLSearchParams(search);
  for (const k of Object.values(P)) params.delete(k);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
