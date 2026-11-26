/**
 * /sets: a request in plain English ("G rank gunner set with Evade +2 and
 * Auto-Reload for Rajang, no Fatalis gear") as a set builder search.
 *
 * A model only translates: it fills in a `SetRequest`, whose JSON schema
 * (`setRequestSchema`) lists the skills, armor words and monsters from
 * data/, so a reply can't name gear that doesn't exist. The bot then turns
 * that into the set builder's own terms (`resolveSetRequest`) and replies
 * with a search link (blacksmith's lib/search-link.ts) that runs the search
 * in the visitor's browser, as the set builder always does.
 *
 * Armor is named by the words in pieces' names (search-link's `armorWords`),
 * since the game truncates them ("Wht Fatalis Mail", "RdGuildGuardTricorne"):
 * "never Fatalis" leaves out every piece with the word, and "always Kirin
 * helmet" locks the best Kirin helmet the hunter can wear.
 */
import {
  armorWords,
  hasArmorWord,
  searchLinkPath,
  type SearchLink,
} from "blacksmith/src/lib/search-link.js";
import { normalize } from "./match.js";
import type { ArmorEntry, ArmorRank, ArmorSlot, BotIndex, HunterType } from "./types.js";

export const ARMOR_SLOTS: ArmorSlot[] = ["helmet", "plate", "gauntlets", "waist", "leggings"];
const RANKS: ArmorRank[] = ["low-rank", "high-rank", "g-rank"];

/** What a model makes of a request. Every name is one from the schema's lists. */
export interface SetRequest {
  rank: ArmorRank | null;
  hunterType: HunterType | null;
  /** Activation names ("Evade +2"). */
  skills: string[];
  weaponSlots: number | null;
  /** Pieces to wear in every set: a slot and a word of the piece's name. */
  always: { slot: ArmorSlot; word: string }[];
  /** Words of the names of pieces to leave out ("Fatalis"). */
  never: string[];
  /** The monster the set is for, if the request names one. */
  monster: string | null;
  /** Parts of the request that matched nothing in the lists, as written. */
  unmatched: string[];
}

const wordCache = new WeakMap<BotIndex, string[]>();

/** Every word armor is named by, for the schema. */
export function armorWordList(index: BotIndex): string[] {
  let words = wordCache.get(index);
  if (!words) {
    const set = new Set<string>();
    for (const a of index.armor) for (const w of armorWords(a.name)) set.add(w);
    words = [...set].sort((a, b) => a.localeCompare(b));
    wordCache.set(index, words);
  }
  return words;
}

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

/**
 * The JSON schema a model's answer must follow (structured outputs): every
 * skill, armor word and monster is an enum from the index.
 */
export function setRequestSchema(index: BotIndex): Record<string, unknown> {
  const words = armorWordList(index);
  return {
    type: "object",
    properties: {
      rank: nullable({ type: "string", enum: RANKS }),
      hunterType: nullable({ type: "string", enum: ["Blademaster", "Gunner"] }),
      skills: { type: "array", items: { type: "string", enum: index.skills.map((s) => s.name) } },
      weaponSlots: nullable({ type: "integer", enum: [0, 1, 2, 3] }),
      always: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slot: { type: "string", enum: ARMOR_SLOTS },
            word: { type: "string", enum: words },
          },
          required: ["slot", "word"],
          additionalProperties: false,
        },
      },
      never: { type: "array", items: { type: "string", enum: words } },
      monster: nullable({
        type: "string",
        enum: index.monsters.filter((m) => !m.small).map((m) => m.name),
      }),
      unmatched: { type: "array", items: { type: "string" } },
    },
    required: [
      "rank",
      "hunterType",
      "skills",
      "weaponSlots",
      "always",
      "never",
      "monster",
      "unmatched",
    ],
    additionalProperties: false,
  };
}

/**
 * The instructions for the model, with the vocabulary the schema's enums
 * can't carry: the skill trees' other spellings and the monsters'
 * nicknames. Stable for a given index, so it caches.
 */
export function setRequestPrompt(index: BotIndex): string {
  const trees = new Map<string, string[]>();
  for (const s of index.skills) {
    const names = trees.get(s.tree) ?? [];
    names.push(`${s.name} (${s.points})`);
    trees.set(s.tree, names);
  }
  const skillLines = [...trees].map(([tree, names]) => {
    const aliases = index.skills.find((s) => s.tree === tree)?.aliases ?? [];
    return `- ${tree}${aliases.length ? ` (also ${aliases.join(", ")})` : ""}: ${names.join(", ")}`;
  });
  const monsterLines = index.monsters
    .filter((m) => !m.small && m.aliases.length)
    .map((m) => `- ${m.name}: ${m.aliases.join(", ")}`);
  return [
    "You turn a Monster Hunter Freedom Unite player's request for an armor set into the search terms of the MHFU Blacksmith set builder. You only translate; the set builder does the search.",
    "",
    "Rules:",
    "- Use only names from the schema's lists. Players write skills, monsters and gear many ways (Japanese, other regions' spellings, nicknames, abbreviations such as Evasion +2 for Evade +2, ReloadUp for Reloading Speed, LR/HR/G for the ranks). Map each to the list's name.",
    "- A skill is an activation, not a tree. If the request names a tree without a level, pick its highest activation.",
    "- rank: the highest rank to use armor from (Low Rank, High Rank, G Rank). null if not said.",
    "- hunterType: Blademaster for melee weapons, Gunner for bows and bowguns. null if not said and no weapon implies it.",
    "- weaponSlots: the weapon's decoration slots, if said.",
    '- never: for "no X gear" or "without X", the words naming that armor (often the monster). The game cuts long names short, so give each spelling the list has ("White" and "Wht").',
    "- always: a piece the player wants in every set, by slot and the word naming its armor.",
    "- monster: the monster the set is for, if named. It doesn't change the search; the reply links to it.",
    "- unmatched: any part of the request you couldn't map, as the player wrote it. Never guess a skill the player didn't ask for.",
    "",
    "Skill trees and their activations (points):",
    ...skillLines,
    "",
    "Monster nicknames:",
    ...monsterLines,
  ].join("\n");
}

/**
 * The instructions for a model without structured outputs (DeepSeek): the
 * same, with the schema written out and the JSON asked for alone. The bot
 * checks every name in the answer again, so one the model makes up is
 * dropped, never searched for.
 */
export function setRequestJsonPrompt(index: BotIndex): string {
  return [
    setRequestPrompt(index),
    "",
    "Reply with one JSON object and nothing else: no prose, no code fence. It must follow this JSON schema, whose enums are the only names allowed:",
    JSON.stringify(setRequestSchema(index)),
  ].join("\n");
}

/** Why a model gave no SetRequest, in words for the reply. */
export class TranslateError extends Error {}

/** Turns a request into a SetRequest: a model, or the keyword stub. */
export type Translator = (request: string) => Promise<SetRequest>;

/** A SetRequest in the set builder's terms, and what the reply says about it. */
export interface ResolvedRequest {
  link: SearchLink;
  path: string;
  /** Pieces left out, by name, for the reply. */
  excluded: ArmorEntry[];
  locked: ArmorEntry[];
  /** Words of `always` and `never` that no piece has, and the model's unmatched. */
  unmatched: string[];
  monster: { name: string; path: string } | null;
}

const rankOrder = (r: ArmorRank) => RANKS.indexOf(r);

const href = (a: ArmorEntry) => `/armorsmith/${a.slot}/${a.rank}/${a.slug}/`;

function wears(a: ArmorEntry, type: HunterType | null): boolean {
  return a.hunterType === "Both" || type === null || a.hunterType === type;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** A model's answer with every field the shape resolveSetRequest reads. */
function coerce(answer: unknown): SetRequest {
  const a = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;
  const slots = Number(a.weaponSlots);
  return {
    rank: typeof a.rank === "string" ? (a.rank as ArmorRank) : null,
    hunterType: typeof a.hunterType === "string" ? (a.hunterType as HunterType) : null,
    skills: strings(a.skills),
    weaponSlots: Number.isInteger(slots) && slots >= 1 ? Math.min(3, slots) : null,
    always: (Array.isArray(a.always) ? a.always : []).filter(
      (x): x is { slot: ArmorSlot; word: string } =>
        !!x &&
        typeof x === "object" &&
        ARMOR_SLOTS.includes((x as { slot: ArmorSlot }).slot) &&
        typeof (x as { word: unknown }).word === "string",
    ),
    never: strings(a.never),
    monster: typeof a.monster === "string" ? a.monster : null,
    unmatched: strings(a.unmatched),
  };
}

/**
 * Puts a model's answer in the set builder's terms, checking every name
 * against the index again (a model's output is never trusted to follow its
 * schema).
 */
export function resolveSetRequest(index: BotIndex, answer: SetRequest): ResolvedRequest {
  const req = coerce(answer);
  const skillNames = new Set(index.skills.map((s) => s.name));
  const skills = [...new Set(req.skills)].filter((s) => skillNames.has(s));
  const rank = req.rank && RANKS.includes(req.rank) ? req.rank : null;
  const type =
    req.hunterType === "Blademaster" || req.hunterType === "Gunner" ? req.hunterType : null;
  const top = rankOrder(rank ?? "g-rank");
  const inRank = (a: ArmorEntry) => rankOrder(a.rank) <= top;
  const hasWord = (a: ArmorEntry, word: string) => hasArmorWord(a.name, [word]);
  const unmatched = [...req.unmatched];

  // The link names these by word, and the set builder finds their pieces;
  // the reply counts the ones this search could have used.
  const never: string[] = [];
  const excluded = new Map<string, ArmorEntry>();
  for (const word of new Set(req.never)) {
    const pieces = index.armor.filter((a) => hasWord(a, word));
    if (pieces.length === 0) {
      unmatched.push(word);
      continue;
    }
    never.push(word);
    for (const p of pieces) if (inRank(p) && wears(p, type)) excluded.set(href(p), p);
  }

  const locked: ArmorEntry[] = [];
  const lockedSlots = new Set<ArmorSlot>();
  for (const { slot, word } of req.always) {
    if (lockedSlots.has(slot)) continue;
    const pieces = index.armor.filter(
      (a) =>
        a.slot === slot &&
        inRank(a) &&
        wears(a, type) &&
        hasWord(a, word) &&
        !excluded.has(href(a)),
    );
    // The best of them: the highest rank allowed, then the last listed (the
    // game lists upgrades after the piece they come from).
    const best = (list: ArmorEntry[]) =>
      [...list].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank)).at(-1);
    const top = best(pieces);
    if (!top) {
      unmatched.push(`${word} ${slot}`);
      continue;
    }
    lockedSlots.add(slot);
    if (top.sex === "Both") {
      locked.push(top);
      continue;
    }
    // A piece only one sex wears: lock the best for each, and the set
    // builder keeps the one the visitor's hunter can wear.
    for (const sex of ["Male", "Female"] as const) {
      const p = best(pieces.filter((a) => a.sex === "Both" || a.sex === sex));
      if (p && !locked.includes(p)) locked.push(p);
    }
  }

  const link: SearchLink = {
    skills,
    ...(type && { hunterType: type }),
    ...(rank && { rank }),
    ...(req.weaponSlots && { weaponSlots: req.weaponSlots }),
    lock: locked.map(href),
    exclude: [],
    never,
  };
  const m = req.monster ? index.monsters.find((x) => x.name === req.monster) : undefined;
  return {
    link,
    path: searchLinkPath(link),
    excluded: [...excluded.values()],
    locked,
    unmatched: [...new Set(unmatched)],
    monster: m ? { name: m.name, path: `/monsters/${m.category}/${m.slug}/` } : null,
  };
}

// ---------------------------------------------------------------------------
// The keyword stub: no model, for development and as the baseline a model
// has to beat. It finds names written as the lists spell them.
// ---------------------------------------------------------------------------

const RANK_WORDS: [RegExp, ArmorRank][] = [
  [/\b(g ?rank|g\d|g-rank)\b/, "g-rank"],
  [/\b(high ?rank|hr|high-rank)\b/, "high-rank"],
  [/\b(low ?rank|lr|low-rank)\b/, "low-rank"],
];

/** Whether `phrase` appears in `text` as whole words (both normalized). */
function hasPhrase(text: string, phrase: string): boolean {
  const p = normalize(phrase);
  return p.length > 0 && ` ${text} `.includes(` ${p} `);
}

export function keywordTranslator(index: BotIndex): Translator {
  return async (request) => {
    const text = normalize(request);
    const rank = RANK_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
    const hunterType: HunterType | null = /\b(gunner|bow|bowgun|lbg|hbg)\b/.test(text)
      ? "Gunner"
      : /\b(blademaster|blade|melee)\b/.test(text)
        ? "Blademaster"
        : null;
    // Longest first, so "Attack Up (Large)" wins over a shorter name inside it.
    const names = index.skills.map((s) => s.name).sort((a, b) => b.length - a.length);
    const found: { name: string; at: number }[] = [];
    let rest = ` ${text} `;
    for (const name of names) {
      const phrase = ` ${normalize(name)} `;
      const at = rest.indexOf(phrase);
      if (phrase.trim() && at >= 0) {
        found.push({ name, at });
        // Blanked out, keeping the positions of the rest.
        rest =
          rest.slice(0, at + 1) +
          "_".repeat(phrase.length - 2) +
          rest.slice(at + phrase.length - 1);
      }
    }
    // In the request's order.
    const skills = found.sort((a, b) => a.at - b.at).map((f) => f.name);
    const words = armorWordList(index);
    const never = [...text.matchAll(/\b(?:no|without|not|except|avoid)\s+([\p{L}\p{N}-]+)/gu)]
      .map((m) => words.find((w) => normalize(w) === m[1]))
      .filter((w): w is string => w !== undefined);
    const slots = /\b([1-3])\s*(?:slot|slots)\b/.exec(text);
    const monster =
      index.monsters.find((m) => !m.small && [m.name, ...m.aliases].some((n) => hasPhrase(text, n)))
        ?.name ?? null;
    return {
      rank,
      hunterType,
      skills,
      weaponSlots: slots ? Number(slots[1]) : null,
      always: [],
      never,
      monster,
      unmatched: [],
    };
  };
}
