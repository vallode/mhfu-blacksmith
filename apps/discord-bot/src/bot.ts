/**
 * The bot's Worker: Discord's interactions endpoint. Every request is
 * checked against the application's public key, then answered:
 *
 * - autocomplete keystrokes with the best matching names;
 * - /monster, /item, /weapon and /settings at once, from the bundled index
 *   and randomfu's settings module;
 * - /sets with a deferred reply ("thinking…"), since the model can take
 *   longer than the 3 seconds Discord waits, edited into the answer once
 *   the request is translated. Each user gets a few per minute (SET_LIMITER).
 */
import { claudeTranslator, TranslateError } from "./claude.js";
import {
  editOriginal,
  EPHEMERAL,
  focusedOption,
  InteractionType,
  optionValue,
  ResponseType,
  userOf,
  verifySignature,
  type Embed,
  type Interaction,
  type InteractionResponse,
  type MessageData,
} from "./discord.js";
import { autocomplete, EMBED_COLOR, lookupReply, type LookupKind } from "./lookup.js";
import {
  keywordTranslator,
  resolveSetRequest,
  type ResolvedRequest,
  type Translator,
} from "./set-request.js";
import { settingsReply } from "./settings.js";
import type { BotIndex } from "./types.js";

export interface Env {
  /** The application's public key (Developer Portal > General Information), hex. */
  DISCORD_PUBLIC_KEY: string;
  /** Secret. Without it /sets matches names as written (keywordTranslator). */
  ANTHROPIC_API_KEY?: string;
  NL_MODEL?: string;
  SITE_URL?: string;
  RANDOMFU_URL?: string;
  /** Workers rate limiting binding (wrangler.jsonc), keyed by Discord user. */
  SET_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const SITE_URL = "https://mhfu.vallode.com";
const RANDOMFU_URL = "https://randomfu.vallode.com";

const LOOKUPS: readonly LookupKind[] = ["monster", "item", "weapon"];

const RANK_LABEL = {
  "low-rank": "Low Rank",
  "high-rank": "High Rank",
  "g-rank": "G Rank",
} as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const message = (data: MessageData): InteractionResponse => ({
  type: ResponseType.ChannelMessage,
  data: { allowed_mentions: { parse: [] }, ...data },
});

const onlyYou = (content: string): InteractionResponse => message({ content, flags: EPHEMERAL });

/** The /sets reply for a resolved request. */
export function setsMessage(
  request: string,
  r: ResolvedRequest,
  siteUrl: string,
  how: string,
): MessageData {
  if (r.link.skills.length === 0) {
    const missed = r.unmatched.length ? ` (couldn't match: ${r.unmatched.join(", ")})` : "";
    return {
      content: `I couldn't find a skill to search for in “${request}”${missed}. Name at least one, like Evade +2 or Attack Up (Large).`,
    };
  }
  const lines = [`**Skills:** ${r.link.skills.join(", ")}`];
  if (r.link.hunterType) lines.push(`**Hunter:** ${r.link.hunterType}`);
  if (r.link.rank) lines.push(`**Armor up to:** ${RANK_LABEL[r.link.rank]}`);
  if (r.link.weaponSlots) lines.push(`**Weapon slots:** ${r.link.weaponSlots}`);
  if (r.locked.length) lines.push(`**Always:** ${r.locked.map((p) => p.name).join(", ")}`);
  if (r.link.never.length) {
    lines.push(`**Leaving out:** ${r.link.never.join(", ")} armor (${r.excluded.length} pieces)`);
  }
  if (r.monster) lines.push(`**For:** [${r.monster.name}](${siteUrl}${r.monster.path})`);
  if (r.unmatched.length) lines.push(`**Couldn't match:** ${r.unmatched.join(", ")}`);
  const embed: Embed = {
    title: "Open this search in the set builder",
    url: `${siteUrl}${r.path}`,
    description: lines.join("\n"),
    color: EMBED_COLOR,
    footer: { text: `${how} · The search runs in your browser` },
  };
  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

export interface BotOptions {
  /** The translator for an Env; by default Claude with a key, keywords without. */
  translator?: (env: Env) => { translate: Translator; how: string };
  fetcher?: typeof fetch;
}

export function createBot(index: BotIndex, options: BotOptions = {}) {
  const translatorFor =
    options.translator ??
    ((env: Env) =>
      env.ANTHROPIC_API_KEY
        ? {
            translate: claudeTranslator(index, {
              apiKey: env.ANTHROPIC_API_KEY,
              model: env.NL_MODEL,
            }),
            how: "Read by Claude",
          }
        : { translate: keywordTranslator(index), how: "Matched by name" });

  async function answerSets(interaction: Interaction, request: string, env: Env): Promise<void> {
    const siteUrl = env.SITE_URL ?? SITE_URL;
    const { translate, how } = translatorFor(env);
    let reply: MessageData;
    try {
      reply = setsMessage(
        request,
        resolveSetRequest(index, await translate(request)),
        siteUrl,
        how,
      );
    } catch (e) {
      const why = e instanceof TranslateError ? e.message : "Something went wrong reading that";
      reply = {
        content: `${why}. Try again, or build the search yourself: ${siteUrl}/set-builder/`,
      };
    }
    await editOriginal(interaction, reply, options.fetcher);
  }

  async function handle(
    interaction: Interaction,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<InteractionResponse> {
    if (interaction.type === InteractionType.Ping) return { type: ResponseType.Pong };
    const name = interaction.data?.name;

    if (interaction.type === InteractionType.Autocomplete) {
      const kind = LOOKUPS.find((k) => k === name);
      const typed = String(focusedOption(interaction)?.value ?? "");
      return {
        type: ResponseType.AutocompleteResult,
        data: { choices: kind ? autocomplete(index, kind, typed) : [] },
      };
    }

    if (interaction.type !== InteractionType.ApplicationCommand)
      return onlyYou("I don't know that one.");

    const kind = LOOKUPS.find((k) => k === name);
    if (kind) {
      const value = optionValue(interaction, "name") ?? "";
      const reply = lookupReply(index, kind, value, env.SITE_URL ?? SITE_URL);
      return reply ? message(reply) : onlyYou(`No ${kind} matches “${value}”.`);
    }

    if (name === "settings") {
      const r = settingsReply(
        optionValue(interaction, "string") ?? "",
        env.RANDOMFU_URL ?? RANDOMFU_URL,
      );
      return "error" in r ? onlyYou(r.error) : message({ embeds: [r.embed] });
    }

    if (name === "sets") {
      const request = (optionValue(interaction, "request") ?? "").trim();
      if (!request) return onlyYou("Describe the set you want.");
      const user = userOf(interaction)?.id ?? "anonymous";
      if (env.SET_LIMITER && !(await env.SET_LIMITER.limit({ key: user })).success) {
        return onlyYou("That's a lot of set searches at once. Try again in a minute.");
      }
      ctx.waitUntil(answerSets(interaction, request, env));
      return { type: ResponseType.DeferredChannelMessage };
    }

    return onlyYou("I don't know that one.");
  }

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      if (request.method !== "POST") {
        return new Response(
          "The MHFU Blacksmith's Discord bot. Discord posts its interactions here.",
        );
      }
      const body = await request.text();
      const ok = await verifySignature(
        env.DISCORD_PUBLIC_KEY,
        request.headers.get("x-signature-ed25519"),
        request.headers.get("x-signature-timestamp"),
        body,
      );
      if (!ok) return new Response("Bad request signature", { status: 401 });
      let interaction: Interaction;
      try {
        interaction = JSON.parse(body) as Interaction;
      } catch {
        return new Response("Not JSON", { status: 400 });
      }
      return json(await handle(interaction, env, ctx));
    },
  };
}
