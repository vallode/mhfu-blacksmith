/**
 * The set search's translation step: the schema a model answers in, what
 * the bot makes of an answer, and the Claude call (with a stand-in client,
 * so the tests never reach the API).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claudeTranslator, TranslateError } from "../src/claude.js";
import {
  armorWordList,
  keywordTranslator,
  resolveSetRequest,
  setRequestPrompt,
  setRequestSchema,
  type SetRequest,
} from "../src/set-request.js";
import { index } from "./helpers.js";

const empty: SetRequest = {
  rank: null,
  hunterType: null,
  skills: [],
  weaponSlots: null,
  always: [],
  never: [],
  monster: null,
  unmatched: [],
};

type Schema = {
  properties: Record<string, { items?: { enum?: string[] }; anyOf?: { enum?: string[] }[] }>;
};

describe("the schema", () => {
  const schema = setRequestSchema(index) as unknown as Schema;

  it("lists the data's skills, armor words and large monsters", () => {
    const skills = schema.properties.skills!.items!.enum!;
    assert.ok(skills.includes("Evade +2") && skills.includes("Auto Reload"));
    assert.ok(!skills.includes("Attack Down (Small)"), "no negative skills");
    const words = schema.properties.never!.items!.enum!;
    assert.ok(words.includes("Fatalis") && words.includes("Kirin"));
    assert.ok(!words.includes("Helm"));
    const monsters = schema.properties.monster!.anyOf![0]!.enum!;
    assert.ok(monsters.includes("Rajang") && !monsters.includes("Velociprey"));
  });

  it("stays small enough to send with every request", () => {
    assert.ok(armorWordList(index).length < 700);
    const tokens = (JSON.stringify(schema).length + setRequestPrompt(index).length) / 4;
    assert.ok(tokens < 12_000, `about ${Math.round(tokens)} tokens`);
  });

  it("gives the model the data's other spellings and nicknames", () => {
    const prompt = setRequestPrompt(index);
    assert.match(prompt, /Defense \(also Defence\)/);
    assert.match(prompt, /- Rajang: Raja/);
  });
});

describe("resolveSetRequest", () => {
  it("drops names that aren't in the data", () => {
    const r = resolveSetRequest(index, { ...empty, skills: ["Evade +2", "Super Mega Attack"] });
    assert.deepEqual(r.link.skills, ["Evade +2"]);
  });

  it("names left-out armor by word and counts the pieces this search could use", () => {
    const r = resolveSetRequest(index, {
      ...empty,
      skills: ["Evade +2"],
      hunterType: "Gunner",
      rank: "g-rank",
      never: ["Fatalis", "Nonexistent"],
    });
    assert.deepEqual(r.link.never, ["Fatalis"]);
    assert.ok(r.excluded.length > 0);
    assert.ok(r.excluded.every((p) => p.hunterType !== "Blademaster"));
    assert.ok(r.excluded.every((p) => /Fatalis/.test(p.name)));
    assert.deepEqual(r.unmatched, ["Nonexistent"]);
  });

  it("locks the best piece of an armor in its slot, within the rank", () => {
    const g = resolveSetRequest(index, {
      ...empty,
      skills: ["Evade +2"],
      always: [{ slot: "helmet", word: "Kirin" }],
    });
    assert.equal(g.locked[0]?.rank, "g-rank");
    assert.match(g.locked[0]?.name ?? "", /^Kirin .* X$/);
    const hr = resolveSetRequest(index, {
      ...empty,
      skills: ["Evade +2"],
      rank: "high-rank",
      always: [{ slot: "helmet", word: "Kirin" }],
    });
    assert.equal(hr.locked[0]?.rank, "high-rank");
    assert.ok(hr.path.includes("lock=helmet%2Fhigh-rank%2F"));
  });

  it("links the monster a set is for", () => {
    const r = resolveSetRequest(index, { ...empty, skills: ["Evade +2"], monster: "Rajang" });
    assert.deepEqual(r.monster, { name: "Rajang", path: "/monsters/pelagus/rajang/" });
  });
});

describe("keywordTranslator", () => {
  it("finds names written as the data spells them", async () => {
    const r = await keywordTranslator(index)(
      "HR blademaster, Attack Up (Large) and Sharpness +1, 2 slots, no Kushala",
    );
    assert.equal(r.rank, "high-rank");
    assert.equal(r.hunterType, "Blademaster");
    assert.deepEqual(r.skills, ["Attack Up (Large)", "Sharpness +1"]);
    assert.equal(r.weaponSlots, 2);
    assert.deepEqual(r.never, ["Kushala"]);
  });
});

describe("claudeTranslator", () => {
  function fakeClient(reply: { text: string; stop_reason?: string }) {
    const calls: Record<string, unknown>[] = [];
    const client = {
      beta: {
        messages: {
          create: async (params: Record<string, unknown>) => {
            calls.push(params);
            return {
              stop_reason: reply.stop_reason ?? "end_turn",
              content: [{ type: "text", text: reply.text }],
            };
          },
        },
      },
    };
    return { calls, client: client as never };
  }

  it("asks for the schema at low effort, with the prompt cached", async () => {
    const answer: SetRequest = { ...empty, skills: ["Evade +2"], hunterType: "Gunner" };
    const { calls, client } = fakeClient({ text: JSON.stringify(answer) });
    const translate = claudeTranslator(index, { apiKey: "test", client });
    assert.deepEqual(await translate("gunner, evasion +2"), answer);
    const params = calls[0]!;
    assert.equal(params.model, "claude-opus-5-5");
    const config = params.output_config as {
      effort: string;
      format: { type: string; schema: unknown };
    };
    assert.equal(config.effort, "low");
    assert.equal(config.format.type, "json_schema");
    assert.deepEqual(config.format.schema, setRequestSchema(index));
    const system = params.system as { cache_control?: unknown }[];
    assert.deepEqual(system[0]?.cache_control, { type: "ephemeral" });
    assert.deepEqual(params.messages, [{ role: "user", content: "gunner, evasion +2" }]);
    assert.equal(params.fallbacks, "default");
  });

  it("sends Haiku without the fallback it doesn't have", async () => {
    const { calls, client } = fakeClient({ text: JSON.stringify(empty) });
    await claudeTranslator(index, { apiKey: "test", client, model: "claude-haiku-5-5" })("x");
    assert.equal(calls[0]!.model, "claude-haiku-5-5");
    assert.equal(calls[0]!.fallbacks, undefined);
  });

  it("fails clearly on a refusal or a cut-off answer", async () => {
    const refused = fakeClient({ text: "", stop_reason: "refusal" });
    await assert.rejects(
      claudeTranslator(index, { apiKey: "t", client: refused.client })("x"),
      TranslateError,
    );
    const cut = fakeClient({ text: '{"rank":', stop_reason: "max_tokens" });
    await assert.rejects(
      claudeTranslator(index, { apiKey: "t", client: cut.client })("x"),
      TranslateError,
    );
  });
});
