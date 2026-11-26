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

/** "Body carves" -> "body carves", inside a line. */
const lower = (s: string) => s[0]!.toLowerCase() + s.slice(1);

interface Kind<T> {
  entries: (index: BotIndex) => readonly T[];
  /** The autocomplete choice's value: stable, short (at most 100 characters). */
  key: (e: T) => string;
  /** The site's thumbnail for it, a path on the site. */
  icon?: (e: T) => string | undefined;
  /** Spellings to match, the name first. */
  spellings: (e: T) => readonly string[];
  /** The autocomplete choice's label. */
  label: (e: T) => string;
  /** Lower comes first among equally good matches (large monsters before small ones). */
  group?: (e: T) => number;
  path: (e: T) => string;
  embed: (e: T, url: string) => Embed;
}

const monster: Kind<MonsterEntry> = {
  entries: (i) => i.monsters,
  key: (m) => `m:${m.id}`,
  spellings: (m) => [m.name, ...m.aliases],
  label: (m) => m.name,
  group: (m) => (m.small ? 1 : 0),
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
  spellings: (it) => [it.name, ...it.aliases],
  icon: (it) => it.icon,
  label: (it) => it.name,
  path: (it) => `/items/${it.slug}/`,
  embed: (it, url) => {
    const fields: Embed["fields"] = [];
    // Where it comes from first: that's what a player looks an item up for.
    const more = (shown: number, all: number) =>
      all > shown ? `\n[…and ${all - shown} more](${url})` : "";
    if (it.drops.length) {
      const lines = it.drops.map(
        (d) =>
          `**${d.monster}** ${d.ranks}: ` +
          d.ways
            .map((w) => `${lower(w.how)} **${w.chance}%**${w.quantity ? ` ×${w.quantity}` : ""}`)
            .join(", "),
      );
      fields.push({
        name: "Monster drops",
        value: clip(lines.join("\n") + more(it.drops.length, it.dropCount), LIMITS.fieldValue),
      });
    }
    if (it.rewards.length) {
      const lines = it.rewards.map(
        (r) => `**${r.chance}%**${r.amount ? ` ×${r.amount}` : ""} ${r.quest} · ${r.where}`,
      );
      fields.push({
        name: "Quest rewards",
        value: clip(lines.join("\n") + more(it.rewards.length, it.rewardCount), LIMITS.fieldValue),
      });
    }
    if (!it.drops.length && !it.rewards.length) {
      fields.push({
        name: "Where to get it",
        value: `Gathering, shops and more: [its page](${url})`,
      });
    }
    // Rarity and price in small text under the title, the fields kept for sources.
    const facts = [
      it.rarity !== undefined && `Rarity ${it.rarity}`,
      it.price !== undefined && `Sells for ${it.price.toLocaleString("en-US")}z`,
    ].filter(Boolean);
    return {
      title: it.name,
      url,
      color: it.color ?? EMBED_COLOR,
      ...(facts.length && { description: `-# ${facts.join(" · ")}` }),
      fields,
    };
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
  return bestMatches(k.entries(index), typed, k.spellings, LIMITS.choices, k.group).map((e) => ({
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
  return (
    entries.find((e) => k.key(e) === value) ??
    bestMatches(entries, value, k.spellings, 1, k.group)[0]
  );
}

/** The reply to a lookup: the page link (for Discord's preview) and the embed. */
export function lookupReply(
  index: BotIndex,
  kind: LookupKind,
  value: string,
  siteUrl: string,
  /** Where the embed's images are served; the site by default. */
  assetUrl = siteUrl,
): { content: string; embeds: Embed[] } | null {
  const k = KINDS[kind] as Kind<unknown>;
  const entry = find(index, kind, value);
  if (!entry) return null;
  const url = `${siteUrl}${k.path(entry)}`;
  const embed = k.embed(entry, url);
  const icon = k.icon?.(entry);
  if (icon) embed.thumbnail = { url: `${assetUrl}${icon}` };
  // A large monster's page has its own large preview card, which Discord
  // draws from a link in the text; the embed keeps to the quick facts.
  const content = kind === "monster" && !(entry as MonsterEntry).small ? url : "";
  return { content, embeds: [embed] };
}
