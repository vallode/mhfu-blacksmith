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
 * - `opencode:<provider>/<model>`: any model opencode can reach (DeepSeek
 *   Flash and the other cheap ones), with the schema in the prompt.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  /** What the provider billed, when it says (opencode does). */
  cost_usd?: number;
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
  if (model.startsWith("opencode:")) return runOpencode(c, model.slice("opencode:".length));
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

/**
 * A model through opencode (`opencode:<provider>/<model>`), for the models
 * the bot has no SDK for. opencode has no structured outputs, so the prompt
 * carries the schema and asks for the JSON alone; the resolver then drops any
 * name the model made up, as it would in the bot.
 *
 * Each call is a headless `opencode run` with an agent that has every tool
 * removed, in a directory of its own outside the repo.
 */
const OPENCODE_DIR = join(tmpdir(), "mhfu-sets-eval-opencode");

function opencodeDir(): string {
  mkdirSync(OPENCODE_DIR, { recursive: true });
  writeFileSync(join(OPENCODE_DIR, "prompt.md"), jsonPrompt());
  writeFileSync(
    join(OPENCODE_DIR, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      agent: {
        translate: {
          description: "Answers with one JSON object. No tools.",
          mode: "primary",
          prompt: "{file:./prompt.md}",
          tools: { "*": false },
        },
      },
    }),
  );
  return OPENCODE_DIR;
}

/** The prompt for a model without structured outputs: the schema, in words. */
export function jsonPrompt(): string {
  return [
    system,
    "",
    "Reply with one JSON object and nothing else: no prose, no code fence. It must follow this JSON schema, whose enums are the only names allowed:",
    JSON.stringify(schema),
  ].join("\n");
}

let opencodeReady: string | undefined;

async function runOpencode(c: Case, model: string): Promise<Run> {
  opencodeReady ??= opencodeDir();
  const dir = opencodeReady;
  const lines = await new Promise<string[]>((resolve, reject) => {
    const child = spawn(
      "opencode",
      ["run", "--pure", "--dir", dir, "--title", `sets-eval ${c.id}`, "-m", model].concat([
        "--agent",
        "translate",
        "--format",
        "json",
        c.request,
      ]),
      { cwd: dir, stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d));
    // opencode can wait forever on a provider error (an expired key, a spent
    // free tier), so the call gets a ceiling of its own and is killed.
    const timer = setTimeout(() => {
      child.kill();
      reject(
        Object.assign(new Error("opencode gave no answer in 90 s"), { failure_class: "timeout" }),
      );
    }, 90_000);
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out.split("\n").filter((l) => l.trim()));
    });
  });
  let text = "";
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cost = 0;
  let reason: string | null = null;
  for (const line of lines) {
    const e = JSON.parse(line) as {
      type: string;
      error?: { data?: { message?: string; statusCode?: number } };
      part?: {
        text?: string;
        reason?: string;
        cost?: number;
        tokens?: { input: number; output: number; reasoning?: number; cache?: { read: number } };
      };
    };
    if (e.type === "error") {
      const data = e.error?.data;
      throw Object.assign(new Error(`opencode: ${data?.message ?? "error"}`.slice(0, 300)), {
        status: data?.statusCode,
        failure_class: "provider",
      });
    }
    if (e.type === "text") text += e.part?.text ?? "";
    if (e.type === "step_finish" && e.part) {
      const t = e.part.tokens;
      input += t?.input ?? 0;
      output += (t?.output ?? 0) + (t?.reasoning ?? 0);
      cacheRead += t?.cache?.read ?? 0;
      cost += e.part.cost ?? 0;
      reason = e.part.reason ?? reason;
    }
  }
  const base = {
    // opencode doesn't say which model served the call; it's the one asked for.
    model: `opencode:${model}`,
    usage: {
      input_tokens: input,
      output_tokens: output,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: 0,
    },
    cost_usd: cost,
    stop_reason: reason === "length" ? "max_tokens" : reason,
  };
  if (base.stop_reason === "max_tokens")
    return { ...base, output: EMPTY, status: "truncated", transcript: transcript(c.request, text) };
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: SetRequest;
  try {
    parsed = JSON.parse(json) as SetRequest;
  } catch {
    // Not JSON is the model's failure, not the harness's: score it, as the
    // bot would have had nothing to search with.
    return { ...base, output: EMPTY, transcript: transcript(c.request, text) };
  }
  return { ...base, output: parsed, transcript: transcript(c.request, parsed) };
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
