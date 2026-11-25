/**
 * The set search's translator on Claude: one Messages API call with
 * structured outputs, so the answer follows setRequestSchema and names only
 * what data/ has. The schema and instructions are the same for every
 * request, so the system prompt is cached and only the request is new.
 *
 * The model is a Worker variable (NL_MODEL); the API key is a Worker secret
 * (ANTHROPIC_API_KEY), never in the code or wrangler.jsonc.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  setRequestPrompt,
  setRequestSchema,
  type SetRequest,
  type Translator,
} from "./set-request.js";
import type { BotIndex } from "./types.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  /** For tests: the client to call instead of the API's. */
  client?: Pick<Anthropic, "beta">;
}

export class TranslateError extends Error {}

export function claudeTranslator(index: BotIndex, options: ClaudeOptions): Translator {
  const client =
    options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout: 20_000 });
  const model = options.model || DEFAULT_MODEL;
  const system = setRequestPrompt(index);
  const schema = setRequestSchema(index);
  // Haiku has no server-side fallback; the others retry a refusal on the
  // model the API picks.
  const fallback = model.startsWith("claude-haiku")
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

  return async (request) => {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 2000,
      // A narrow translation: little to think about.
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: request }],
      ...fallback,
    });
    if (response.stop_reason === "refusal")
      throw new TranslateError("The model declined that request");
    if (response.stop_reason === "max_tokens")
      throw new TranslateError("The model's answer was cut off");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      return JSON.parse(text) as SetRequest;
    } catch {
      throw new TranslateError("The model's answer wasn't JSON");
    }
  };
}
