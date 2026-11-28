/**
 * "Look up in Blacksmith": a message's right-click command. It finds the
 * monsters, items and weapons a message names, however loosely ("rath
 * plates", "bone g"), and answers the one who asked with a row for each,
 * only them. A row's button posts that entry's usual /monster, /item or
 * /weapon reply (lookupReply) in the channel for everyone, pointing back
 * at the message; another posts them all.
 *
 * Discord sends the target message's text with the command, so the bot
 * needs no message content intent.
 */
import {
  ButtonStyle,
  clip,
  CommandType,
  ComponentType,
  EPHEMERAL,
  InteractionType,
  LIMITS,
  ResponseType,
  type ActionRow,
  type Button,
  type DiscordMessage,
  type Embed,
  type Interaction,
  type InteractionResponse,
} from "./discord.js";
import { EMBED_COLOR, entryLink, lookupReply, type LookupKind } from "./lookup.js";
import { normalize } from "./match.js";
import type { BotIndex, ItemEntry, MonsterEntry, WeaponEntry } from "./types.js";

/** The command's name, as Discord's Apps menu shows it. */
export const MESSAGE_LOOKUP = "Look up in Blacksmith";

/** How many names one lookup answers with at most. */
export const MAX_MATCHES = 5;

/** Buttons' custom_id prefix: `look:<message>:<kind>:<key>`, or `look:all:<message>`. */
const PREFIX = "look:";

/**
 * Single words that are everyday English as well as a name: they count
 * only when the message names nothing else.
 */
const COMMON_WORDS = new Set([
  "bone",
  "coal",
  "cricket",
  "flute",
  "frog",
  "garbage",
  "ian",
  "lava",
  "los",
  "luna",
  "map",
  "net",
  "ration",
  "stone",
  "worm",
]);

export type Found =
  | { kind: "monster"; entry: MonsterEntry }
  | { kind: "item"; entry: ItemEntry }
  | { kind: "weapon"; entry: WeaponEntry };

interface Spelling {
  found: Found;
  tokens: string[];
  /** The tokens run together, for "kut ku" against "kutku". */
  compact: string;
  /** Monsters first, then items, then weapons, when a phrase names several. */
  rank: number;
  /** The entry's own name's length: the closest completion wins ("rath plate"). */
  length: number;
  order: number;
}

/** Spellings by their first two letters, built once per index. */
const tables = new WeakMap<BotIndex, Map<string, Spelling[]>>();

function table(index: BotIndex): Map<string, Spelling[]> {
  let t = tables.get(index);
  if (t) return t;
  t = new Map();
  const add = (found: Found, names: readonly string[], rank: number) => {
    for (const name of new Set(names.map(normalize))) {
      const compact = name.replace(/ /g, "");
      if (compact.length < 3) continue;
      const key = compact.slice(0, 2);
      const list = t!.get(key) ?? [];
      list.push({
        found,
        tokens: name.split(" "),
        compact,
        rank: rank + (found.kind === "monster" && found.entry.small ? 0.5 : 0),
        length: found.entry.name.length,
        order: list.length,
      });
      t!.set(key, list);
    }
  };
  for (const entry of index.monsters)
    add({ kind: "monster", entry }, [entry.name, ...entry.aliases], 0);
  for (const entry of index.items) add({ kind: "item", entry }, [entry.name, ...entry.aliases], 1);
  for (const entry of index.weapons) add({ kind: "weapon", entry }, [entry.name], 2);
  tables.set(index, t);
  return t;
}

/** A word as written and as its singular: "plates", "plate". */
function forms(word: string): string[] {
  const out = [word];
  if (word.length > 3 && word.endsWith("ies")) out.push(`${word.slice(0, -3)}y`);
  if (word.length > 3 && word.endsWith("es")) out.push(word.slice(0, -2));
  if (word.length > 2 && word.endsWith("s")) out.push(word.slice(0, -1));
  return out;
}

const sameWord = (typed: string, name: string) =>
  forms(typed).includes(name) || typed + "s" === name;

interface Candidate {
  found: Found;
  start: number;
  /** One past the last word it covers. */
  end: number;
  /** Letters left off words typed short ("rath" for "rathian"). */
  loose: number;
  spelling: Spelling;
}

/**
 * Whether `s` is named starting at word `i`: word by word, the last word
 * plural or not, any word but one typed short (three letters at least) in
 * a name of more than one word; or the name's letters run together.
 */
function matchAt(
  words: string[],
  i: number,
  s: Spelling,
): Omit<Candidate, "found" | "start" | "spelling"> | null {
  let best: { end: number; loose: number } | null = null;
  if (i + s.tokens.length <= words.length) {
    let loose = 0;
    let exact = 0;
    let ok = true;
    for (let j = 0; j < s.tokens.length && ok; j++) {
      const typed = words[i + j]!;
      const name = s.tokens[j]!;
      if (sameWord(typed, name)) exact++;
      else if (s.tokens.length > 1 && typed.length >= 3 && name.startsWith(typed)) {
        loose += name.length - typed.length;
      } else ok = false;
    }
    if (ok && exact > 0) best = { end: i + s.tokens.length, loose };
  }
  let run = "";
  for (let k = i; k < words.length && run.length < s.compact.length; k++) {
    run += words[k];
    if (run.length >= s.compact.length && sameWord(run, s.compact)) {
      const end = k + 1;
      if (!best || end - i > best.end - i) best = { end, loose: 0 };
    }
  }
  return best;
}

const keyOf = (f: Found) => `${f.kind}:${entryLink(f.kind, f.entry, "").key}`;

/**
 * The monsters, items and weapons `text` names, in the order it names
 * them, at most `limit` (the first named). Where names overlap the one
 * covering more words wins (pick); no words count twice, and no entry
 * comes up twice.
 */
export function findInText(index: BotIndex, text: string, limit = MAX_MATCHES): Found[] {
  const words = normalize(text).split(" ").filter(Boolean);
  const t = table(index);
  const candidates: Candidate[] = [];
  for (let i = 0; i < words.length; i++) {
    const head = (words[i]! + (words[i + 1] ?? "")).slice(0, 2);
    for (const spelling of t.get(head) ?? []) {
      const m = matchAt(words, i, spelling);
      if (!m) continue;
      candidates.push({ found: spelling.found, start: i, spelling, ...m });
    }
  }
  const common = (c: Candidate) =>
    c.end - c.start === 1 && c.spelling.tokens.length === 1 && COMMON_WORDS.has(c.spelling.compact);
  const named = pick(
    candidates.filter((c) => !common(c)),
    words.length,
  );
  const chosen = named.length ? named : pick(candidates.filter(common), words.length);
  return chosen.slice(0, limit).map((c) => c.found);
}

/**
 * The candidates that don't overlap, the better first where they do (more
 * words, then typed more fully, then monsters before items before weapons,
 * then the shorter name); an entry once. In the message's order.
 */
function pick(candidates: Candidate[], words: number): Candidate[] {
  candidates.sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      a.loose - b.loose ||
      a.start - b.start ||
      a.spelling.rank - b.spelling.rank ||
      a.spelling.length - b.spelling.length ||
      a.spelling.order - b.spelling.order,
  );
  const taken = new Array<boolean>(words).fill(false);
  const seen = new Set<string>();
  const chosen: Candidate[] = [];
  for (const c of candidates) {
    const key = keyOf(c.found);
    if (seen.has(key)) continue;
    let free = true;
    for (let k = c.start; k < c.end; k++) if (taken[k]) free = false;
    if (!free) continue;
    for (let k = c.start; k < c.end; k++) taken[k] = true;
    seen.add(key);
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

const titleCase = (slug: string) =>
  slug
    .split("-")
    .map((w) => (w === "and" ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");

/** An item's best source: "Best: Rathian HR tail carve 12%". */
function itemFacts(it: ItemEntry): string {
  const drop = it.drops[0];
  const way = drop?.ways[0];
  const reward = it.rewards[0];
  if (drop && way && !(reward && reward.chance > way.chance)) {
    const how = way.how[0]!.toLowerCase() + way.how.slice(1).replace(/carves$/, "carve");
    const many = way.quantity ? ` ×${way.quantity}` : "";
    return `Best: ${drop.monster} ${drop.ranks} ${how} ${way.chance}%${many}`;
  }
  if (reward) {
    const many = reward.amount ? ` ×${reward.amount}` : "";
    return `Best: ${reward.quest} (${reward.where}) reward ${reward.chance}%${many}`;
  }
  const facts = [
    it.rarity !== undefined && `Rarity ${it.rarity}`,
    it.price !== undefined && `Sells for ${it.price.toLocaleString("en-US")}z`,
  ].filter(Boolean);
  return facts.length ? facts.join(" · ") : "Gathering, shops and more on its page";
}

/** One line about an entry, under its name. */
export function facts(f: Found): string {
  switch (f.kind) {
    case "item":
      return itemFacts(f.entry);
    case "weapon": {
      const w = f.entry;
      return [
        titleCase(w.type),
        w.attack !== undefined && `${w.attack} attack`,
        ...w.elements,
        w.rarity !== undefined && `Rarity ${w.rarity}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "monster": {
      const m = f.entry;
      return [
        titleCase(m.category),
        m.weak.length ? `Weak to ${m.weak.join(", ")}` : m.hp !== undefined && `Base HP ${m.hp}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

const button = (
  label: string,
  custom_id: string,
  style: number = ButtonStyle.Secondary,
): Button => ({
  type: ComponentType.Button,
  style,
  label: clip(label, LIMITS.buttonLabel),
  custom_id,
});

const row = (components: Button[]): ActionRow => ({ type: ComponentType.ActionRow, components });

/** The ephemeral answer to the command on a message's text. */
export function lookupRows(
  index: BotIndex,
  messageId: string,
  text: string,
  siteUrl: string,
  assetUrl = siteUrl,
): InteractionResponse {
  const found = findInText(index, text);
  if (!found.length) {
    return {
      type: ResponseType.ChannelMessage,
      data: {
        content: "I couldn't find a monster, item or weapon in that message.",
        flags: EPHEMERAL,
      },
    };
  }
  const embeds: Embed[] = [];
  const posts: Button[] = [];
  for (const f of found) {
    const link = entryLink(f.kind, f.entry, siteUrl, assetUrl);
    embeds.push({
      title: f.entry.name,
      url: link.url,
      description: facts(f),
      color: (f.kind === "item" && f.entry.color) || EMBED_COLOR,
      ...(link.icon && { thumbnail: { url: link.icon } }),
    });
    const label = found.length === 1 ? "Post it" : `Post ${f.entry.name}`;
    posts.push(button(label, `${PREFIX}${messageId}:${f.kind}:${link.key}`));
  }
  const components = [row(posts)];
  if (found.length > 1) {
    components.push(
      row([button("Post all as a reply", `${PREFIX}all:${messageId}`, ButtonStyle.Primary)]),
    );
  }
  return {
    type: ResponseType.ChannelMessage,
    data: { embeds, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
  };
}

const KINDS: readonly LookupKind[] = ["monster", "item", "weapon"];

/** A Post button's message and entry, from its custom_id. */
function parsePost(id: string): { message: string; kind: LookupKind; key: string } | null {
  if (!id.startsWith(PREFIX)) return null;
  const [message, kind, ...key] = id.slice(PREFIX.length).split(":");
  const k = KINDS.find((x) => x === kind);
  return message && k && key.length ? { message, kind: k, key: key.join(":") } : null;
}

const ENTRIES = {
  monster: (i: BotIndex) => i.monsters,
  item: (i: BotIndex) => i.items,
  weapon: (i: BotIndex) => i.weapons,
} as const;

function known(index: BotIndex, kind: LookupKind, key: string): boolean {
  return ENTRIES[kind](index).some((e: unknown) => entryLink(kind, e, "").key === key);
}

/** A line pointing at the message the post answers. */
function answering(interaction: Interaction, messageId: string): string {
  const channel = interaction.channel_id ?? interaction.message?.channel_id;
  if (!channel) return "";
  const url = `https://discord.com/channels/${interaction.guild_id ?? "@me"}/${channel}/${messageId}`;
  return `-# ↪ Answering [this message](<${url}>)`;
}

/** The public post for a Post button, or for Post all. */
export function postLookup(
  index: BotIndex,
  interaction: Interaction,
  siteUrl: string,
  assetUrl = siteUrl,
): InteractionResponse {
  const id = interaction.data?.custom_id ?? "";
  const all = id.startsWith(`${PREFIX}all:`);
  const messageId = all ? id.slice(`${PREFIX}all:`.length) : (parsePost(id)?.message ?? "");
  // Post all takes the entries from the other buttons on the same answer.
  const ids = all
    ? (interaction.message?.components ?? []).flatMap((r) => r.components.map((b) => b.custom_id))
    : [id];
  const posts = ids.map(parsePost).filter((p) => p !== null && p.message === messageId);
  const replies = posts
    // Only keys still in the index: lookupReply would match anything else by name.
    .filter((p) => known(index, p!.kind, p!.key))
    .map((p) => lookupReply(index, p!.kind, p!.key, siteUrl, assetUrl))
    .filter((r) => r !== null);
  if (!replies.length) {
    // Post all reads its entries off the answer's buttons; without them it
    // can't tell what was found.
    const why =
      all && !posts.length
        ? "I couldn't read that answer's buttons. Post them one at a time, or run the lookup again."
        : "That lookup is out of date. Run it on the message again.";
    return { type: ResponseType.ChannelMessage, data: { content: why, flags: EPHEMERAL } };
  }
  const head = answering(interaction, messageId);
  if (replies.length === 1) {
    const reply = replies[0]!;
    // A Components V2 reply can't carry text: post it as it is.
    if (isV2(reply)) return { type: ResponseType.ChannelMessage, data: reply };
    return {
      type: ResponseType.ChannelMessage,
      data: {
        ...reply,
        content: [head, reply.content].filter(Boolean).join("\n"),
        allowed_mentions: { parse: [] },
      },
    };
  }
  // One message for them all: their links and embeds, within Discord's
  // limits. Anything else a reply has (its own buttons, a Components V2
  // layout) belongs to that reply alone and is left out; a V2 reply, with
  // nothing but components, can't join in.
  const embeds: Embed[] = [];
  let total = 0;
  const joined = replies.filter((r) => !isV2(r));
  if (!joined.length) return { type: ResponseType.ChannelMessage, data: replies[0]! };
  for (const e of joined.flatMap((r) => r.embeds ?? [])) {
    const size = embedSize(e);
    if (embeds.length >= LIMITS.embeds || total + size > LIMITS.embedTotal) break;
    embeds.push(e);
    total += size;
  }
  return {
    type: ResponseType.ChannelMessage,
    data: {
      content: [head, ...joined.map((r) => r.content)].filter(Boolean).join("\n"),
      embeds,
      allowed_mentions: { parse: [] },
    },
  };
}

/** Discord's flag for a message laid out in components, with no content or embeds. */
const COMPONENTS_V2 = 1 << 15;

const isV2 = (reply: object) =>
  ((("flags" in reply && Number(reply.flags)) || 0) & COMPONENTS_V2) !== 0;

function embedSize(e: Embed): number {
  return (
    (e.title?.length ?? 0) +
    (e.description?.length ?? 0) +
    (e.footer?.text.length ?? 0) +
    (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0)
  );
}

/**
 * What a message says: its text, or with none a forwarded message's, or
 * else its embeds' (another bot's answer).
 */
export function messageText(m: DiscordMessage): string {
  const embedText = (embeds: readonly Embed[] = []) =>
    embeds
      .flatMap((e) => [
        e.title,
        e.description,
        ...(e.fields ?? []).flatMap((f) => [f.name, f.value]),
      ])
      .filter(Boolean)
      .join("\n");
  const forwarded = m.message_snapshots?.map((s) => s.message) ?? [];
  return (
    [m.content, ...forwarded.map((f) => f.content)].filter((t) => t?.trim()).join("\n") ||
    [m.embeds, ...forwarded.map((f) => f.embeds)]
      .map((e) => embedText(e))
      .filter(Boolean)
      .join("\n")
  );
}

/**
 * The answer to the message command or one of its buttons; null for any
 * other interaction.
 */
export function messageLookup(
  index: BotIndex,
  interaction: Interaction,
  siteUrl: string,
  assetUrl = siteUrl,
): InteractionResponse | null {
  const data = interaction.data;
  if (
    interaction.type === InteractionType.ApplicationCommand &&
    data?.type === CommandType.Message &&
    data.name === MESSAGE_LOOKUP
  ) {
    const id = data.target_id ?? "";
    const target = data.resolved?.messages?.[id];
    return lookupRows(index, id, target ? messageText(target) : "", siteUrl, assetUrl);
  }
  if (
    interaction.type === InteractionType.MessageComponent &&
    data?.custom_id?.startsWith(PREFIX)
  ) {
    return postLookup(index, interaction, siteUrl, assetUrl);
  }
  return null;
}
