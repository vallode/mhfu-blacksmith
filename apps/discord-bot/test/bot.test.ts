/**
 * The Worker end to end: signed requests in, interaction responses out.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultSettings,
  encodeSettings,
  OPTIONS,
  PRESETS,
  type Settings,
} from "randomfu/src/settings.js";
import { createBot } from "../src/bot.js";
import {
  InteractionType,
  ResponseType,
  type InteractionResponse,
  type MessageData,
} from "../src/discord.js";
import { call, context, index, interaction, publicKey, signed } from "./helpers.js";

const command = (name: string, option: string, value: string) =>
  interaction(InteractionType.ApplicationCommand, name, [{ name: option, type: 3, value }]);

function messageOf(r: InteractionResponse): MessageData {
  assert.equal(r.type, ResponseType.ChannelMessage);
  return (r as { data: MessageData }).data;
}

describe("requests", () => {
  it("answers Discord's ping", async () => {
    assert.deepEqual(await call(interaction(InteractionType.Ping, "")), {
      type: ResponseType.Pong,
    });
  });

  it("turns away a bad signature", async () => {
    const bot = createBot(index);
    const req = await signed(JSON.stringify(interaction(InteractionType.Ping, "")));
    const forged = new Request(req.url, {
      method: "POST",
      headers: { "x-signature-ed25519": "00".repeat(64), "x-signature-timestamp": "1764000000" },
      body: await req.text(),
    });
    const res = await bot.fetch(forged, { DISCORD_PUBLIC_KEY: publicKey }, context());
    assert.equal(res.status, 401);
  });

  it("turns away a signed request from long ago (a replay)", async () => {
    const bot = createBot(index);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const req = await signed(JSON.stringify(interaction(InteractionType.Ping, "")), old);
    const res = await bot.fetch(req, { DISCORD_PUBLIC_KEY: publicKey }, context());
    assert.equal(res.status, 401);
  });

  it("turns away a body that isn't the one signed", async () => {
    const bot = createBot(index);
    const req = await signed(JSON.stringify(interaction(InteractionType.Ping, "")));
    const tampered = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: '{"type":2}',
    });
    const res = await bot.fetch(tampered, { DISCORD_PUBLIC_KEY: publicKey }, context());
    assert.equal(res.status, 401);
  });
});

describe("autocomplete", () => {
  const choices = async (name: string, typed: string) => {
    const r = await call(
      interaction(InteractionType.Autocomplete, name, [
        { name: "name", type: 3, value: typed, focused: true },
      ]),
    );
    assert.equal(r.type, ResponseType.AutocompleteResult);
    return (r as { data: { choices: { name: string; value: string }[] } }).data.choices;
  };

  it("finds monsters by name, spelling and nickname", async () => {
    assert.equal((await choices("monster", "raja"))[0]?.name, "Rajang");
    assert.equal((await choices("monster", "kutku"))[0]?.name, "Yian Kut-Ku");
    assert.equal((await choices("monster", "fatty"))[0]?.name, "Fatalis");
    assert.equal((await choices("monster", "One-Ear"))[0]?.name, "Scarred Yian Garuga");
  });

  it("lists large monsters before small ones that match as well", async () => {
    const names = (await choices("monster", "veloci")).map((c) => c.name);
    assert.deepEqual(names.slice(0, 2), ["Velocidrome", "Velociprey"]);
    assert.ok(names.every((n) => !n.includes("(")));
  });

  it("offers at most 25 choices, short enough for Discord", async () => {
    const all = await choices("weapon", "");
    assert.equal(all.length, 25);
    assert.ok(all.every((c) => c.name.length <= 100 && c.value.length <= 100));
  });
});

describe("/monster, /item, /weapon", () => {
  it("links the monster's page, which unfurls, with a short embed", async () => {
    const m = messageOf(await call(command("monster", "name", "rath")));
    assert.equal(m.content, "https://mhfu.vallode.com/monsters/flying-wyvern/rathalos/");
    const embed = m.embeds?.[0];
    assert.equal(embed?.title, "Rathalos");
    assert.ok(embed?.fields?.some((f) => f.name === "Weak to" && f.value.includes("Ice")));
  });

  it("leads an item's embed with where it drops and the chances", async () => {
    const m = messageOf(await call(command("item", "name", "Rathalos Scale")));
    const fields = m.embeds?.[0]?.fields ?? [];
    assert.equal(fields[0]?.name, "Monster drops");
    // One line per monster and ranks, its ways in it; carve counts left out.
    const [lr, early] = (fields[0]?.value ?? "").split("\n");
    assert.match(lr ?? "", /^\*\*Rathalos\*\* LR: break head \d+%, tail carves /);
    assert.match(early ?? "", /^\*\*Rathalos\*\* LR ★1-2: /);
    assert.doesNotMatch(fields[0]?.value ?? "", /×3/);
    assert.match(fields[1]?.value ?? "", /^\*\*[^*]+\*\* (Guild LR|Village) ★\d: \d+%/);
    assert.ok(fields.every((f) => f.name !== "Japanese" && f.name !== "Rarity"));
    // Rarity and price under the title, the stripe in the rarity's colour.
    assert.equal(m.embeds?.[0]?.description, "-# Rarity 4 · Sells for 4,900z");
    assert.equal(m.embeds?.[0]?.color, 0x52f152);
    assert.equal(
      m.embeds?.[0]?.thumbnail?.url,
      "https://mhfu.vallode.com/embed/icons/item-23-1.png",
    );
  });

  it("takes the images from ASSET_URL, the links still from the site", async () => {
    const env = { ASSET_URL: "https://test.example" };
    const embed = messageOf(await call(command("item", "name", "Rathalos Scale"), env)).embeds?.[0];
    assert.equal(embed?.thumbnail?.url, "https://test.example/embed/icons/item-23-1.png");
    assert.match(embed?.url ?? "", /^https:\/\/mhfu\.vallode\.com\//);
  });

  it("takes an autocomplete choice's key", async () => {
    const it = messageOf(await call(command("item", "name", "i:1")));
    assert.equal(it.embeds?.[0]?.url, "https://mhfu.vallode.com/items/book-of-combos-1/");
  });

  it("links weapons under their type", async () => {
    const w = messageOf(await call(command("weapon", "name", "Demon Halberd")));
    assert.equal(
      w.embeds?.[0]?.url,
      "https://mhfu.vallode.com/blacksmith/long-sword/demon-halberd/",
    );
    assert.ok(
      w.embeds?.[0]?.fields?.some((f) => f.name === "Element" && f.value === "Thunder 180"),
    );
  });

  it("tells only the asker when nothing matches", async () => {
    const m = messageOf(await call(command("monster", "name", "zzzzqqq")));
    assert.equal(m.flags, 1 << 6);
  });
});

describe("/settings", () => {
  it("fits Discord's embed size with every option changed", async () => {
    const settings = defaultSettings("hunt42") as unknown as Record<string, unknown>;
    for (const o of OPTIONS) {
      const t = o.type;
      settings[o.key] =
        t.kind === "boolean"
          ? !o.default
          : t.kind === "number"
            ? t.max
            : (t.choices.find((c) => c.value !== o.default)?.value ?? o.default);
    }
    const m = messageOf(
      await call(command("settings", "string", encodeSettings(settings as unknown as Settings))),
    );
    const e = m.embeds?.[0];
    const total =
      (e?.title?.length ?? 0) +
      (e?.description?.length ?? 0) +
      (e?.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
    assert.ok(total <= 6000, `embed is ${total} characters`);
    assert.ok((e?.fields?.length ?? 0) <= 25);
  });

  it("lists the seed, the preset and what it changes", async () => {
    const preset = PRESETS[0]!;
    const settings = { ...defaultSettings("hunt42"), ...preset.changes } as Settings;
    const m = messageOf(await call(command("settings", "string", encodeSettings(settings))));
    const fields = m.embeds?.[0]?.fields ?? [];
    assert.equal(fields.find((f) => f.name === "Seed")?.value, "`hunt42`");
    assert.equal(fields.find((f) => f.name === "Preset")?.value, preset.name);
    assert.ok(fields.length > 2);
  });

  it("says what's wrong with a damaged string, to the asker only", async () => {
    const m = messageOf(await call(command("settings", "string", "RF!!!")));
    assert.equal(m.flags, 1 << 6);
    assert.match(m.content ?? "", /damaged/);
  });
});

describe("/sets", () => {
  async function sets(request: string, env = {}) {
    const edits: MessageData[] = [];
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      edits.push(JSON.parse(String(init?.body)) as MessageData);
      return new Response("{}");
    }) as typeof fetch;
    const ctx = context();
    const r = await call(command("sets", "request", request), env, { fetcher }, ctx);
    await ctx.done();
    return { r, edits };
  }

  it("defers, then edits in a set builder link", async () => {
    const { r, edits } = await sets(
      "G rank gunner set with Evade +2 and Auto Reload for Raja, no Fatalis gear",
    );
    assert.equal(r.type, ResponseType.DeferredChannelMessage);
    const embed = edits[0]?.embeds?.[0];
    const url = new URL(embed?.url ?? "");
    assert.equal(url.pathname, "/set-builder/");
    assert.deepEqual(url.searchParams.getAll("skill"), ["Evade +2", "Auto Reload"]);
    assert.equal(url.searchParams.get("type"), "gunner");
    assert.equal(url.searchParams.get("rank"), "g-rank");
    assert.deepEqual(url.searchParams.getAll("never"), ["Fatalis"]);
    assert.match(embed?.description ?? "", /\*\*For:\*\* \[Rajang\]/);
  });

  it("keeps a long request's reply inside Discord's limits", async () => {
    const { edits } = await sets("nothing to match here ".repeat(200));
    assert.ok((edits[0]?.content ?? "").length <= 2000);
  });

  it("replaces the thinking message when Discord refuses the reply", async () => {
    const edits: MessageData[] = [];
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      edits.push(JSON.parse(String(init?.body)) as MessageData);
      return new Response("{}", { status: edits.length === 1 ? 400 : 200 });
    }) as typeof fetch;
    const ctx = context();
    await call(command("sets", "request", "Evade +2"), {}, { fetcher }, ctx);
    await ctx.done();
    assert.equal(edits.length, 2);
    assert.match(edits[1]?.content ?? "", /couldn't send that answer/);
  });

  it("asks for a skill when it finds none", async () => {
    const { edits } = await sets("something nice for Rajang");
    assert.match(edits[0]?.content ?? "", /couldn't find a skill/);
  });

  it("holds back a user over the limit", async () => {
    const { r, edits } = await sets("Evade +2", {
      SET_LIMITER: { limit: async () => ({ success: false }) },
    });
    assert.equal(messageOf(r).flags, 1 << 6);
    assert.equal(edits.length, 0);
  });
});
