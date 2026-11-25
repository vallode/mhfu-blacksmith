/**
 * The set search's translator on DeepSeek Flash, the bot's default: one
 * chat completion in JSON mode. DeepSeek has no schema-checked output for
 * plain answers, so the prompt carries the schema (setRequestJsonPrompt) and
 * resolveSetRequest checks every name in the answer.
 *
 * It scored best in the /sets eval (eval/README.md) at a twentieth of Opus's
 * cost. The API is OpenAI-compatible: DEEPSEEK_URL can point it at another
 * host serving the same model. The key is a Worker secret (DEEPSEEK_API_KEY).
 */
import {
  setRequestJsonPrompt,
  TranslateError,
  type SetRequest,
  type Translator,
} from "./set-request.js";
import type { BotIndex } from "./types.js";

export const DEEPSEEK_MODEL = "deepseek-flash";
export const DEEPSEEK_URL = "https://api.deepseek.com";

export interface DeepSeekOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

/** The chat completion body for one translation, without the request text. */
export function deepseekRequest(index: BotIndex, model: string = DEEPSEEK_MODEL) {
  return {
    model,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: setRequestJsonPrompt(index) }],
  };
}

export interface DeepSeekResponse {
  model: string;
  choices: { finish_reason: string; message: { content: string | null } }[];
  usage?: {
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    completion_tokens?: number;
  };
}

/** The SetRequest in a response, or why there isn't one. */
export function parseDeepSeekAnswer(body: DeepSeekResponse): SetRequest {
  const choice = body.choices[0];
  if (choice?.finish_reason === "length")
    throw new TranslateError("The model's answer was cut off");
  // JSON mode blanks out an answer that isn't JSON rather than failing.
  const text = choice?.message.content?.trim();
  if (!text) throw new TranslateError("The model gave no answer");
  try {
    return JSON.parse(text) as SetRequest;
  } catch {
    throw new TranslateError("The model's answer wasn't JSON");
  }
}

export function deepseekTranslator(index: BotIndex, options: DeepSeekOptions): Translator {
  const url = `${(options.baseUrl || DEEPSEEK_URL).replace(/\/+$/, "")}/chat/completions`;
  const base = deepseekRequest(index, options.model || DEEPSEEK_MODEL);
  const fetcher = options.fetcher ?? fetch;
  return async (request) => {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        ...base,
        messages: [...base.messages, { role: "user", content: request }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new TranslateError("The model couldn't be reached");
    return parseDeepSeekAnswer((await res.json()) as DeepSeekResponse);
  };
}
