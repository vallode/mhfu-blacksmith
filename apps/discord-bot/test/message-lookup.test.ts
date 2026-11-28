/**
 * "Look up in Blacksmith": names found in a message's text, the ephemeral
 * rows, and the Post buttons' public replies.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CommandType,
  EPHEMERAL,
  InteractionType,
  ResponseType,
  type Button,
  type Interaction,
  type InteractionResponse,
  type MessageData,
} from "../src/discord.js";
import { lookupReply } from "../src/lookup.js";
import { findInText, MAX_MATCHES, MESSAGE_LOOKUP, messageText } from "../src/message-lookup.js";
import { call, index } from "./helpers.js";

const SITE = "https://mhfu.vallode.com";
const names = (text: string) => findInText(index, text).map((f) => f.entry.name);

describe("finding names in a message", () => {
  it("takes loose spellings, nicknames and plurals", () => {
    assert.deepEqual(names("where do i farm rath plates?? still running bone g lol"), [
      "Rathian Plate",
      "Bone G",
    ]);
    assert.deepEqual(names("kutku and lao shan, then power coatings"), [
      "Yian Kut-Ku",
      "Lao-Shan Lung",
      "Power Coating",
    ]);
  });

  it("finds nothing in a message that names nothing", () => {
    assert.deepEqual(names("any tips for this quest? i keep carting"), []);
    // Everyday words that are also items count only when nothing else is named.
    assert.deepEqual(names("rathian plate, it's on the map"), ["Rathian Plate"]);
    assert.deepEqual(names("where do i get stone"), ["Stone"]);
  });

  it("lets the longer name have overlapping words, and counts a name once", () => {
    // Not Rathian as well, nor Bone and Bone G.
    assert.deepEqual(names("rathian plate"), ["Rathian Plate"]);
    assert.deepEqual(names("bone g"), ["Bone G"]);
    // Rath is Rathalos; Rathalos Plate keeps its own words.
    assert.deepEqual(names("rath drops a rathalos plate"), ["Rathalos", "Rathalos Plate"]);
    assert.deepEqual(names("Rajang, raja, RAJANG"), ["Rajang"]);
  });

  it("stops at a handful, the first named first", () => {
    const found = names("rath, narga, kush, teo, raja, tigrex and khezu");
    assert.equal(found.length, MAX_MATCHES);
    assert.deepEqual(found, ["Rathalos", "Nargacuga", "Kushala Daora", "Teostra", "Rajang"]);
    // A longer name later on doesn't push out one named earlier.
    assert.deepEqual(names("rath, narga, kush, teo, raja, then rathian plate").at(-1), "Rajang");
  });

  it("reads a forwarded message, or embeds, when there's no text", () => {
    assert.equal(
      messageText({
        id: "1",
        content: "",
        message_snapshots: [{ message: { content: "bone g?" } }],
      }),
      "bone g?",
    );
    const text = messageText({
      id: "1",
      content: "",
      embeds: [{ title: "Rathian Plate", fields: [{ name: "Drops", value: "Rathian" }] }],
    });
    assert.deepEqual(names(text), ["Rathian Plate", "Rathian"]);
  });
});

const lookUp = (content: string): Interaction => ({
  id: "1",
  application_id: "app",
  type: InteractionType.ApplicationCommand,
  token: "tok",
  guild_id: "700",
  channel_id: "800",
  data: {
    name: MESSAGE_LOOKUP,
    type: CommandType.Message,
    target_id: "900",
    resolved: { messages: { "900": { id: "900", channel_id: "800", content } } },
  },
  member: { user: { id: "42", username: "hunter" } },
});

/** Pressing a button on the ephemeral answer. */
const press = (answer: MessageData, custom_id: string): Interaction => ({
  id: "2",
  application_id: "app",
  type: InteractionType.MessageComponent,
  token: "tok2",
  guild_id: "700",
  channel_id: "800",
  data: { custom_id, component_type: 2 },
  message: { id: "901", channel_id: "800", components: answer.components },
  member: { user: { id: "43", username: "helper" } },
});

function messageOf(r: InteractionResponse): MessageData {
  assert.equal(r.type, ResponseType.ChannelMessage);
  return (r as { data: MessageData }).data;
}

// The answer's buttons are all plain buttons with custom_ids.
const buttons = (m: MessageData) =>
  (m.components ?? []).flatMap((r) => r.components) as (Button & { custom_id: string })[];
const JUMP = "-# ↪ Answering [this message](<https://discord.com/channels/700/800/900>)";

describe("the message command", () => {
  const question = "where do i farm rath plates?? still running bone g lol";

  it("answers only the asker, a row for each name", async () => {
    const m = messageOf(await call(lookUp(question)));
    assert.equal(m.flags, EPHEMERAL);
    const [plate, bone] = m.embeds ?? [];
    assert.equal(plate?.title, "Rathian Plate");
    assert.equal(plate?.url, `${SITE}/items/rathian-plate/`);
    assert.equal(plate?.description, "Best: Rathian HR tail carve 12%");
    assert.match(plate?.thumbnail?.url ?? "", /^https:\/\/mhfu\.vallode\.com\/embed\/icons\//);
    assert.equal(bone?.title, "Bone G");
    assert.equal(bone?.url, `${SITE}/blacksmith/long-sword/bone-g/`);
    assert.equal(bone?.description, "Long Sword · 1392 attack · Rarity 9");
    assert.deepEqual(
      buttons(m).map((b) => b.label),
      ["Post Rathian Plate", "Post Bone G", "Post all as a reply"],
    );
    assert.ok(buttons(m).every((b) => b.custom_id.length <= 100));
  });

  it("shows a monster's type and weakness", async () => {
    const m = messageOf(await call(lookUp("is kutku hard")));
    assert.equal(m.embeds?.[0]?.description, "Bird Wyvern · Weak to Water, Thunder");
    assert.deepEqual(
      buttons(m).map((b) => b.label),
      ["Post it"],
    );
  });

  it("says so when the message names nothing", async () => {
    const m = messageOf(await call(lookUp("gg")));
    assert.equal(m.flags, EPHEMERAL);
    assert.equal(m.content, "I couldn't find a monster, item or weapon in that message.");
    assert.equal(m.embeds, undefined);
  });

  it("posts an entry's usual reply for everyone, pointing at the message", async () => {
    const answer = messageOf(await call(lookUp(question)));
    const post = messageOf(await call(press(answer, buttons(answer)[0]!.custom_id)));
    assert.equal(post.flags, undefined);
    const usual = lookupReply(index, "item", "i:523", SITE)!;
    assert.deepEqual(post.embeds, usual.embeds);
    assert.equal(post.content, JUMP);
    assert.deepEqual(post.allowed_mentions, { parse: [] });
  });

  it("posts a monster with its card and its tab buttons", async () => {
    const answer = messageOf(await call(lookUp("rath")));
    const post = messageOf(await call(press(answer, buttons(answer)[0]!.custom_id)));
    const usual = lookupReply(index, "monster", "Rathalos", SITE)!;
    assert.equal(post.content, JUMP);
    assert.ok(post.embeds?.[0]?.image);
    assert.deepEqual(post.components, usual.components);
  });

  it("posts them all in one reply", async () => {
    const answer = messageOf(await call(lookUp(question)));
    const all = buttons(answer).at(-1)!;
    const post = messageOf(await call(press(answer, all.custom_id)));
    assert.equal(post.flags, undefined);
    assert.deepEqual(
      post.embeds?.map((e) => e.title),
      ["Rathian Plate", "Bone G"],
    );
    assert.equal(post.content, JUMP);
  });

  it("tells the presser when a button names nothing it knows", async () => {
    const answer = messageOf(await call(lookUp(question)));
    for (const id of ["look:900:weapon:w:long-sword:no-such", "look:all:999"]) {
      const stale = messageOf(await call(press(answer, id)));
      assert.equal(stale.flags, EPHEMERAL, id);
      assert.equal(stale.embeds, undefined, id);
    }
    // Post all without the answer's buttons to read says so.
    const blind = messageOf(await call(press({}, buttons(answer).at(-1)!.custom_id)));
    assert.equal(blind.flags, EPHEMERAL);
    assert.match(blind.content ?? "", /couldn't read that answer's buttons/);
  });
});
