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

/**
 * The Messages API request for one /sets translation, without the request
 * text. The bot and the eval (eval/sets.ts) send the same one.
 */
export function claudeRequest(index: BotIndex, model: string = DEFAULT_MODEL) {
  // Haiku has no server-side fallback; the others retry a refusal on the
  // model the API picks.
  const fallback = model.startsWith("claude-haiku")
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  return {
    model,
    max_tokens: 2000,
    // A narrow translation: little to think about.
    output_config: {
      effort: "low" as const,
      format: { type: "json_schema" as const, schema: setRequestSchema(index) },
    },
    system: [
      {
        type: "text" as const,
        text: setRequestPrompt(index),
        cache_control: { type: "ephemeral" as const },
      },
    ],
    ...fallback,
  };
}

/** The SetRequest in a response, or why there isn't one. */
export function parseClaudeAnswer(response: {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}): SetRequest {
  if (response.stop_reason === "refusal")
    throw new TranslateError("The model declined that request");
  if (response.stop_reason === "max_tokens")
    throw new TranslateError("The model's answer was cut off");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text ?? ""] : [])).join("");
  try {
    return JSON.parse(text) as SetRequest;
  } catch {
    throw new TranslateError("The model's answer wasn't JSON");
  }
}

export function claudeTranslator(index: BotIndex, options: ClaudeOptions): Translator {
  const client =
    options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout: 20_000 });
  const params = claudeRequest(index, options.model || DEFAULT_MODEL);
  return async (request) => {
    const response = await client.beta.messages.create({
      ...params,
      messages: [{ role: "user", content: request }],
    });
    return parseClaudeAnswer(response);
  };
}
