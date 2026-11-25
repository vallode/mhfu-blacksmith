/**
 * /monster, /item and /weapon: autocomplete on names, and a short embed
 * linking to the site's page. Monster pages unfurl into their own large
 * cards, so the link is also in the message text for Discord to preview.
 */
import { clip, LIMITS, type Embed } from "./discord.js";
import { bestMatches } from "./match.js";
import type { BotIndex, ItemEntry, MonsterEntry, WeaponEntry } from "./types.js";

export type LookupKind = "monster" | "item" | "weapon";

/** The site's gold, for embeds. */
export const EMBED_COLOR = 0xd9b863;

const titleCase = (slug: string) =>
  slug
    .split("-")
    .map((w) => (w === "and" ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");

interface Kind<T> {
  entries: (index: BotIndex) => readonly T[];
  /** The autocomplete choice's value: stable, short (at most 100 characters). */
  key: (e: T) => string;
  /** Spellings to match, the name first. */
  spellings: (e: T) => readonly string[];
  /** The autocomplete choice's label. */
  label: (e: T) => string;
  path: (e: T) => string;
  embed: (e: T, url: string) => Embed;
}

const monster: Kind<MonsterEntry> = {
  entries: (i) => i.monsters,
  key: (m) => `m:${m.id}`,
  spellings: (m) => [m.name, ...m.aliases],
  label: (m) => (m.small ? `${m.name} (small)` : m.name),
  path: (m) => `/monsters/${m.category}/${m.slug}/`,
  embed: (m, url) => {
    const fields: Embed["fields"] = [{ name: "Type", value: titleCase(m.category), inline: true }];
    if (m.hp !== undefined) fields.push({ name: "Base HP", value: String(m.hp), inline: true });
    if (m.weak.length) fields.push({ name: "Weak to", value: m.weak.join(", "), inline: true });
    if (m.breaks.length) {
      fields.push({ name: "Breaks", value: m.breaks.map(titleCase).join(", "), inline: true });
    }
    if (m.crowns) {
      fields.push({
        name: "Crowns",
        value: `Mini ≤ ${m.crowns.mini}% · Silver ≥ ${m.crowns.silver}% · Gold ≥ ${m.crowns.gold}%`,
      });
    }
    return {
      title: m.name,
      url,
      ...(m.description && { description: clip(m.description, 300) }),
      color: EMBED_COLOR,
      fields,
    };
  },
};

const item: Kind<ItemEntry> = {
  entries: (i) => i.items,
  key: (it) => `i:${it.id}`,
  spellings: (it) => [it.name, ...it.aliases, ...(it.jp ? [it.jp] : [])],
  label: (it) => (it.jp ? `${it.name} (${it.jp})` : it.name),
  path: (it) => `/items/${it.slug}/`,
  embed: (it, url) => {
    const fields: Embed["fields"] = [];
    if (it.jp) fields.push({ name: "Japanese", value: it.jp, inline: true });
    if (it.rarity !== undefined)
      fields.push({ name: "Rarity", value: String(it.rarity), inline: true });
    if (it.price !== undefined)
      fields.push({ name: "Sells for", value: `${it.price}z`, inline: true });
    return { title: it.name, url, color: EMBED_COLOR, fields };
  },
};

const weapon: Kind<WeaponEntry> = {
  entries: (i) => i.weapons,
  key: (w) => `w:${w.type}:${w.slug}`,
  spellings: (w) => [w.name],
  label: (w) => `${w.name} (${titleCase(w.type)})`,
  path: (w) => `/blacksmith/${w.type}/${w.slug}/`,
  embed: (w, url) => {
    const fields: Embed["fields"] = [{ name: "Type", value: titleCase(w.type), inline: true }];
    if (w.attack !== undefined)
      fields.push({ name: "Attack", value: String(w.attack), inline: true });
    if (w.affinity) fields.push({ name: "Affinity", value: w.affinity, inline: true });
    if (w.elements.length)
      fields.push({ name: "Element", value: w.elements.join(", "), inline: true });
    if (w.slots !== undefined) {
      fields.push({ name: "Slots", value: w.slots ? "○".repeat(w.slots) : "None", inline: true });
    }
    if (w.rarity !== undefined)
      fields.push({ name: "Rarity", value: String(w.rarity), inline: true });
    return { title: w.name, url, color: EMBED_COLOR, fields };
  },
};

const KINDS = { monster, item, weapon } as const;

/** Autocomplete choices for what's been typed so far. */
export function autocomplete(
  index: BotIndex,
  kind: LookupKind,
  typed: string,
): { name: string; value: string }[] {
  const k = KINDS[kind] as Kind<unknown>;
  return bestMatches(k.entries(index), typed, k.spellings, LIMITS.choices).map((e) => ({
    name: clip(k.label(e), LIMITS.choiceName),
    value: k.key(e),
  }));
}

/**
 * The entry an option's value names: an autocomplete choice's key, or else
 * the best match for text typed without picking one.
 */
export function find(index: BotIndex, kind: LookupKind, value: string): unknown {
  const k = KINDS[kind] as Kind<unknown>;
  const entries = k.entries(index);
  return entries.find((e) => k.key(e) === value) ?? bestMatches(entries, value, k.spellings, 1)[0];
}

/** The reply to a lookup: the page link (for Discord's preview) and the embed. */
export function lookupReply(
  index: BotIndex,
  kind: LookupKind,
  value: string,
  siteUrl: string,
): { content: string; embeds: Embed[] } | null {
  const k = KINDS[kind] as Kind<unknown>;
  const entry = find(index, kind, value);
  if (!entry) return null;
  const url = `${siteUrl}${k.path(entry)}`;
  // A large monster's page has its own large preview card, which Discord
  // draws from a link in the text; the embed keeps to the quick facts.
  const content = kind === "monster" && !(entry as MonsterEntry).small ? url : "";
  return { content, embeds: [k.embed(entry, url)] };
}
