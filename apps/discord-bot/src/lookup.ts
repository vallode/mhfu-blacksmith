/**
 * /monster, /item and /weapon: autocomplete on names, and an embed with the
 * site's card for it as its image, linking to its page. Monsters get tabs:
 * buttons that swap the card for the monster's drops (at a rank the menu
 * picks) or the quests it's hunted in, editing the same message.
 *
 * The cards are the site's: a monster page's own preview card, and the
 * weapon, item and drops cards its Worker draws (blacksmith's
 * src/lib/detail-card.ts). Their paths, with versions, are in the index.
 */
import {
  ButtonStyle,
  clip,
  ComponentType,
  LIMITS,
  type ActionRow,
  type Button,
  type Embed,
} from "./discord.js";
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

/** Where links go and where images come from (a local test's tunnel, say). */
export interface Urls {
  site: string;
  assets: string;
}

/** A reply: the embed and its buttons. */
export interface LookupReply {
  embeds: Embed[];
  components: ActionRow[];
}

interface Kind<T> {
  entries: (index: BotIndex) => readonly T[];
  /** The autocomplete choice's value: stable, short (at most 100 characters). */
  key: (e: T) => string;
  /** Its small icon, a path on the site (Look up in Blacksmith's rows). */
  icon?: (e: T) => string | undefined;
  /** Spellings to match, the name first. */
  spellings: (e: T) => readonly string[];
  /** The autocomplete choice's label. */
  label: (e: T) => string;
  /** Lower comes first among equally good matches (large monsters before small ones). */
  group?: (e: T) => number;
  path: (e: T) => string;
  reply: (e: T, urls: Urls) => LookupReply;
}

const linkButton = (label: string, url: string): Button => ({
  type: ComponentType.Button,
  style: ButtonStyle.Link,
  label: clip(label, LIMITS.buttonLabel),
  url,
});

const linkRow = (...buttons: Button[]): ActionRow[] => [
  { type: ComponentType.ActionRow, components: buttons },
];

// ——— Monsters ———

export type MonsterTab = "card" | "drops" | "quests";
const TABS: { tab: MonsterTab; label: string }[] = [
  { tab: "card", label: "Hitzones" },
  { tab: "drops", label: "Drops" },
  { tab: "quests", label: "Quests" },
];

const monsterPath = (m: MonsterEntry) => `/monsters/${m.category}/${m.slug}/`;

/** The rank a Drops tab opens at: High Rank, where most hunting happens, else the first. */
function defaultRank(m: MonsterEntry): string | undefined {
  return (m.dropRanks.find((r) => r.rank === "high-rank") ?? m.dropRanks[0])?.rank;
}

/** A tab button's custom_id: `mt:<monster id>:<tab>`; the rank menu's is `mr:<monster id>`. */
const tabId = (m: MonsterEntry, tab: MonsterTab) => `mt:${m.id}:${tab}`;
const rankId = (m: MonsterEntry) => `mr:${m.id}`;

/** What a monster's button or menu asks for, or null for a custom_id that isn't one. */
export function parseMonsterComponent(
  customId: string,
  values: string[] = [],
): { id: number; tab: MonsterTab; rank?: string } | null {
  const tab = customId.match(/^mt:(\d+):(card|drops|quests)$/);
  if (tab) return { id: Number(tab[1]), tab: tab[2] as MonsterTab };
  const rank = customId.match(/^mr:(\d+)$/);
  if (rank && values[0]) return { id: Number(rank[1]), tab: "drops", rank: values[0] };
  return null;
}

/** The monster's facts as fields, for a monster without a card. */
function monsterFields(m: MonsterEntry): Embed["fields"] {
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
  return fields;
}

/** The quests tab: a field per board, a line per quest, linked. */
function questFields(m: MonsterEntry, site: string): Embed["fields"] {
  const boards = new Map<string, string[]>();
  for (const q of m.quests) {
    const lines = boards.get(q.board) ?? [];
    lines.push(`${q.stars} [${q.title}](${site}${q.path})`);
    boards.set(q.board, lines);
  }
  const page = `${site}${monsterPath(m)}`;
  return [...boards].slice(0, LIMITS.fields).map(([board, lines]) => {
    // As many lines as fit, then a link for the rest. Under the whole
    // embed's limit too: 8 boards of 600 characters at most.
    const max = 600;
    const kept: string[] = [];
    let length = 0;
    for (const line of lines) {
      if (length + line.length + 1 > max - 40) break;
      kept.push(line);
      length += line.length + 1;
    }
    if (kept.length < lines.length) kept.push(`[…and ${lines.length - kept.length} more](${page})`);
    return { name: board, value: kept.join("\n"), inline: false };
  });
}

/** A monster's reply at a tab (and, for drops, a rank). */
export function monsterView(
  m: MonsterEntry,
  tab: MonsterTab,
  rank: string | undefined,
  urls: Urls,
): LookupReply {
  const url = `${urls.site}${monsterPath(m)}`;
  const embed: Embed = {
    author: {
      name: `${titleCase(m.category)} · ${m.small ? "Small" : "Large"} monster`,
      ...(m.icon && { icon_url: `${urls.assets}${m.icon}` }),
    },
    title: m.name,
    url,
    color: EMBED_COLOR,
  };
  const drops =
    m.dropRanks.find((r) => r.rank === rank) ?? m.dropRanks.find((r) => r.rank === defaultRank(m));
  if (tab === "drops" && drops) {
    embed.title = `${m.name} · ${drops.label} drops`;
    embed.image = { url: `${urls.assets}${drops.card}` };
  } else if (tab === "quests" && m.quests.length) {
    embed.title = `${m.name} · Quests`;
    embed.fields = questFields(m, urls.site);
  } else {
    tab = "card";
    if (m.description) embed.description = clip(m.description, 300);
    if (m.card) embed.image = { url: `${urls.assets}${m.card}` };
    else embed.fields = monsterFields(m);
  }

  const tabs: Button[] = TABS.map(({ tab: t, label }) => ({
    type: ComponentType.Button,
    style: t === tab ? ButtonStyle.Primary : ButtonStyle.Secondary,
    label,
    custom_id: tabId(m, t),
    // The open tab, and a tab with nothing in it, can't be pressed.
    disabled:
      t === tab || (t === "drops" && !m.dropRanks.length) || (t === "quests" && !m.quests.length),
  }));
  const components: ActionRow[] = [
    { type: ComponentType.ActionRow, components: [...tabs, linkButton("Page", url)] },
  ];
  if (tab === "drops" && drops && m.dropRanks.length > 1) {
    components.push({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: rankId(m),
          options: m.dropRanks.map((r) => ({
            label: r.label,
            value: r.rank,
            default: r.rank === drops.rank,
          })),
        },
      ],
    });
  }
  return { embeds: [embed], components };
}

const monster: Kind<MonsterEntry> = {
  entries: (i) => i.monsters,
  key: (m) => `m:${m.id}`,
  spellings: (m) => [m.name, ...m.aliases],
  label: (m) => m.name,
  group: (m) => (m.small ? 1 : 0),
  path: monsterPath,
  reply: (m, urls) => monsterView(m, "card", undefined, urls),
};

// ——— Items ———

/** Where an item comes from, as fields, for an item without a card. */
function itemFields(it: ItemEntry, url: string): Embed["fields"] {
  const fields: Embed["fields"] = [];
  const more = (shown: number, all: number) =>
    all > shown ? `\n[…and ${all - shown} more](${url})` : "";
  if (it.drops.length) {
    const lines = it.drops.map(
      (d) =>
        `**${d.monster}** ${d.ranks}: ` +
        d.ways
          .map((w) => `${lower(w.how)} ${w.chance}%${w.quantity ? ` ×${w.quantity}` : ""}`)
          .join(", "),
    );
    fields.push({
      name: "Monster drops",
      value: clip(lines.join("\n") + more(it.drops.length, it.dropCount), LIMITS.fieldValue),
    });
  }
  if (it.rewards.length) {
    const lines = it.rewards.map(
      (r) => `**${r.quest}** ${r.where}: ${r.chance}%${r.amount ? ` ×${r.amount}` : ""}`,
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
  return fields;
}

const item: Kind<ItemEntry> = {
  entries: (i) => i.items,
  key: (it) => `i:${it.id}`,
  spellings: (it) => [it.name, ...it.aliases],
  icon: (it) => it.icon,
  label: (it) => it.name,
  path: (it) => `/items/${it.slug}/`,
  reply: (it, urls) => {
    const url = `${urls.site}/items/${it.slug}/`;
    const facts = [
      it.rarity !== undefined && `Rarity ${it.rarity}`,
      it.price !== undefined && `Sells for ${it.price.toLocaleString("en-US")}z`,
    ].filter(Boolean);
    const embed: Embed = {
      ...(facts.length && {
        author: {
          name: facts.join(" · "),
          ...(it.icon && { icon_url: `${urls.assets}${it.icon}` }),
        },
      }),
      title: it.name,
      url,
      color: it.color ?? EMBED_COLOR,
    };
    // The card says where it comes from; without one, fields do.
    if (it.card) embed.image = { url: `${urls.assets}${it.card}` };
    else {
      embed.fields = itemFields(it, url);
      if (it.icon) embed.thumbnail = { url: `${urls.assets}${it.icon}` };
    }
    return { embeds: [embed], components: linkRow(linkButton("Page", url)) };
  },
};

// ——— Weapons ———

const weapon: Kind<WeaponEntry> = {
  entries: (i) => i.weapons,
  key: (w) => `w:${w.type}:${w.slug}`,
  spellings: (w) => [w.name],
  label: (w) => `${w.name} (${titleCase(w.type)})`,
  path: (w) => `/blacksmith/${w.type}/${w.slug}/`,
  reply: (w, urls) => {
    const url = `${urls.site}/blacksmith/${w.type}/${w.slug}/`;
    const type = titleCase(w.type);
    const embed: Embed = {
      author: {
        name: w.rarity !== undefined ? `Rarity ${w.rarity} · ${type}` : type,
        ...(w.icon && { icon_url: `${urls.assets}${w.icon}` }),
      },
      title: w.name,
      url,
      color: w.color ?? EMBED_COLOR,
    };
    if (w.card) embed.image = { url: `${urls.assets}${w.card}` };
    else {
      const fields: Embed["fields"] = [];
      if (w.attack !== undefined)
        fields.push({ name: "Attack", value: String(w.attack), inline: true });
      if (w.affinity) fields.push({ name: "Affinity", value: w.affinity, inline: true });
      if (w.elements.length)
        fields.push({ name: "Element", value: w.elements.join(", "), inline: true });
      if (w.slots !== undefined) {
        fields.push({ name: "Slots", value: w.slots ? "○".repeat(w.slots) : "None", inline: true });
      }
      embed.fields = fields;
    }
    return {
      embeds: [embed],
      components: linkRow(
        linkButton("Page", url),
        linkButton(`${type} tree`, `${urls.site}/blacksmith/${w.type}/`),
      ),
    };
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

/** The reply to a lookup: the embed with its card, and its buttons. */
export function lookupReply(
  index: BotIndex,
  kind: LookupKind,
  value: string,
  siteUrl: string,
  /** Where the embed's images are served; the site by default. */
  assetUrl = siteUrl,
): LookupReply | null {
  const k = KINDS[kind] as Kind<unknown>;
  const entry = find(index, kind, value);
  return entry ? k.reply(entry, { site: siteUrl, assets: assetUrl }) : null;
}

/**
 * How another reply points at an entry: its key (which lookupReply takes),
 * its page and its thumbnail.
 */
export function entryLink(
  kind: LookupKind,
  entry: unknown,
  siteUrl: string,
  assetUrl = siteUrl,
): { key: string; url: string; icon?: string } {
  const k = KINDS[kind] as Kind<unknown>;
  const icon = k.icon?.(entry);
  return {
    key: k.key(entry),
    url: `${siteUrl}${k.path(entry)}`,
    ...(icon && { icon: `${assetUrl}${icon}` }),
  };
}
