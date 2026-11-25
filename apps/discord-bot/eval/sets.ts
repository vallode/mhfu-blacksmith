/**
 * The /sets eval: how well a model turns a player's request into the set
 * builder's search. run-eval.mjs (the harness) calls loadCases, runCase and
 * gradeCase from here.
 *
 * A case's `expect` is the SetRequest a careful reader would write. Both it
 * and the model's answer go through the bot's own resolveSetRequest, and the
 * grade compares what the set builder would get: the skills, rank, hunter
 * type and slots in the link, every piece the `never` words leave out, the
 * pieces locked, and the monster linked.
 *
 * Models, by --model:
 * - `keyword`: the bot's keyword stub, the floor a model has to beat;
 * - `oracle`: the expected answer itself, to check the grader (all 1s);
 * - `claude-*`: the bot's own Messages API request (src/claude.ts);
 * - `deepseek-*`: DeepSeek's chat API with the same prompt and schema, as a
 *   strict function call, thinking off.
 */
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { hasArmorWord } from "blacksmith/src/lib/search-link.js";
import { buildIndex } from "../scripts/index-data.js";
import { claudeRequest, parseClaudeAnswer } from "../src/claude.js";
import {
  keywordTranslator,
  resolveSetRequest,
  setRequestPrompt,
  setRequestSchema,
  type ResolvedRequest,
  type SetRequest,
} from "../src/set-request.js";

const index = buildIndex();

interface Case {
  id: string;
  tags: string[];
  request: string;
  prompt: string;
  expect: SetRequest;
}

const EMPTY: SetRequest = {
  rank: null,
  hunterType: null,
  skills: [],
  weaponSlots: null,
  always: [],
  never: [],
  monster: null,
  unmatched: [],
};

/** The cases, with every name in them checked against the index. */
export function loadCases(): Case[] {
  const raw = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as {
    id: string;
    tags: string[];
    request: string;
    expect: Partial<SetRequest>;
  }[];
  const skills = new Set(index.skills.map((s) => s.name));
  const monsters = new Set(index.monsters.map((m) => m.name));
  return raw.map((c) => {
    const expect = { ...EMPTY, ...c.expect };
    for (const s of expect.skills) if (!skills.has(s)) throw new Error(`${c.id}: no skill ${s}`);
    if (expect.monster && !monsters.has(expect.monster))
      throw new Error(`${c.id}: no monster ${expect.monster}`);
    const resolved = resolveSetRequest(index, expect);
    if (resolved.unmatched.length)
      throw new Error(`${c.id}: expected answer has unmatched ${resolved.unmatched.join(", ")}`);
    return { ...c, prompt: c.request, expect };
  });
}

interface Run {
  output: SetRequest;
  transcript: unknown[];
  model: string;
  usage: Record<string, number>;
  stop_reason: string | null;
  status?: string;
}

const system = setRequestPrompt(index);
const schema = setRequestSchema(index);
const keyword = keywordTranslator(index);
let anthropic: Anthropic | undefined;

function transcript(request: string, answer: unknown, extra: object = {}) {
  return [
    { role: "system", content: system },
    { role: "user", content: request },
    {
      role: "assistant",
      content: "```json\n" + JSON.stringify(answer, null, 2) + "\n```",
      ...extra,
    },
  ];
}

export async function runCase(c: Case, ctx: { model?: string }): Promise<Run> {
  const model = ctx.model ?? "keyword";
  if (model === "keyword" || model === "oracle") {
    const output = model === "oracle" ? c.expect : await keyword(c.request);
    return {
      output,
      transcript: transcript(c.request, output),
      model,
      usage: {},
      stop_reason: "end_turn",
    };
  }
  if (model.startsWith("claude-")) return runClaude(c, model);
  if (model.startsWith("deepseek-")) return runDeepSeek(c, model);
  throw new Error(`no runner for model ${model}`);
}

async function runClaude(c: Case, model: string): Promise<Run> {
  // No SDK retries: the harness backs off itself and counts retries.
  anthropic ??= new Anthropic({ maxRetries: 0, timeout: 60_000 });
  const response = await anthropic.beta.messages.create({
    ...claudeRequest(index, model),
    messages: [{ role: "user", content: c.request }],
  });
  const usage = response.usage as unknown as Record<string, number>;
  const base = {
    model: response.model,
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    },
    stop_reason: response.stop_reason,
  };
  if (response.stop_reason === "max_tokens")
    return {
      ...base,
      output: EMPTY,
      status: "truncated",
      transcript: transcript(c.request, response.content),
    };
  // A refusal or bad JSON throws: an error row, not a zero.
  const output = parseClaudeAnswer(response);
  return { ...base, output, transcript: transcript(c.request, output) };
}

/** DeepSeek's strict mode wants every property required, as ours are. */
async function runDeepSeek(c: Case, model: string): Promise<Run> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key)
    throw Object.assign(new Error("DEEPSEEK_API_KEY is not set"), { failure_class: "config" });
  const res = await fetch("https://api.deepseek.com/beta/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: c.request },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "set_request",
            description: "The set builder search for the player's request.",
            strict: true,
            parameters: schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "set_request" } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`DeepSeek ${res.status}: ${text.slice(0, 300)}`), {
      status: res.status,
    });
  }
  const body = (await res.json()) as {
    model: string;
    choices: {
      finish_reason: string;
      message: { tool_calls?: { function: { arguments: string } }[] };
    }[];
    usage: {
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
      completion_tokens: number;
    };
  };
  const choice = body.choices[0];
  const base = {
    model: body.model,
    usage: {
      input_tokens: body.usage.prompt_cache_miss_tokens ?? 0,
      output_tokens: body.usage.completion_tokens,
      cache_read_input_tokens: body.usage.prompt_cache_hit_tokens ?? 0,
      cache_creation_input_tokens: 0,
    },
    stop_reason:
      choice?.finish_reason === "length" ? "max_tokens" : (choice?.finish_reason ?? null),
  };
  if (base.stop_reason === "max_tokens")
    return {
      ...base,
      output: EMPTY,
      status: "truncated",
      transcript: transcript(c.request, choice),
    };
  const args = choice?.message.tool_calls?.[0]?.function.arguments;
  if (!args)
    throw Object.assign(new Error("DeepSeek made no tool call"), { failure_class: "no_answer" });
  const output = JSON.parse(args) as SetRequest;
  return { ...base, output, transcript: transcript(c.request, output) };
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

const sameSet = (a: Iterable<string>, b: Iterable<string>) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};

/** Every piece the `never` words name, in any rank. */
const neverPieces = (r: ResolvedRequest) =>
  index.armor
    .filter((a) => r.link.never.some((w) => hasArmorWord(a.name, [w])))
    .map((a) => `${a.slot}/${a.rank}/${a.slug}`);

export const METRICS = [
  "all",
  "skills",
  "rank",
  "hunter_type",
  "slots",
  "never",
  "lock",
  "monster",
];

export function gradeCase(c: Case, run: Run) {
  // The model's answer is untrusted JSON: fill what it left out, as the bot's
  // resolver would meet it.
  const got = resolveSetRequest(index, { ...EMPTY, ...run.output });
  const want = resolveSetRequest(index, c.expect);
  const g: Record<string, number> = {
    skills: +sameSet(got.link.skills, want.link.skills),
    rank: +(got.link.rank === want.link.rank),
    hunter_type: +(got.link.hunterType === want.link.hunterType),
    slots: +((got.link.weaponSlots ?? 0) === (want.link.weaponSlots ?? 0)),
    never: +sameSet(neverPieces(got), neverPieces(want)),
    lock: +sameSet(got.link.lock, want.link.lock),
    monster: +(got.monster?.name === want.monster?.name),
  };
  const all = METRICS.slice(1).every((m) => g[m] === 1);
  const explanation: Record<string, string> = {};
  if (!g.skills) explanation.skills = `got ${got.link.skills.join(", ") || "none"}`;
  if (!g.never) explanation.never = `got never ${got.link.never.join(", ") || "none"}`;
  if (!g.lock) explanation.lock = `got ${got.locked.map((a) => a.name).join(", ") || "none"}`;
  return { grade: { all: +all, ...g }, explanation };
}
