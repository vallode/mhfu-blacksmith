/**
 * The bot as Discord reaches it in the tests: requests signed with a key
 * made here, and the index built from data/.
 */
import { createBot, type BotOptions, type Env, type ExecutionContext } from "../src/bot.js";
import type { CommandOption, Interaction, InteractionResponse } from "../src/discord.js";
import { buildIndex } from "../scripts/index-data.js";
import type { BotIndex } from "../src/types.js";

export const index: BotIndex = buildIndex();

const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair;
const hex = (buf: ArrayBuffer) => Buffer.from(buf).toString("hex");
export const publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));

export async function signed(body: string, timestamp = "1764000000"): Promise<Request> {
  const sig = await crypto.subtle.sign(
    "Ed25519",
    keys.privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return new Request("https://bot.example/", {
    method: "POST",
    headers: { "x-signature-ed25519": hex(sig), "x-signature-timestamp": timestamp },
    body,
  });
}

export function interaction(
  type: number,
  name: string,
  options: CommandOption[] = [],
): Interaction {
  return {
    id: "1",
    application_id: "app",
    type,
    token: "tok",
    data: { name, options },
    member: { user: { id: "42", username: "hunter" } },
  };
}

/** Waits for what the bot hands `waitUntil`. */
export function context(): ExecutionContext & { done: () => Promise<void> } {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p) => void pending.push(p),
    done: async () => void (await Promise.all(pending)),
  };
}

export async function call(
  body: Interaction,
  env: Partial<Env> = {},
  options: BotOptions = {},
  ctx = context(),
): Promise<InteractionResponse> {
  const bot = createBot(index, options);
  const res = await bot.fetch(
    await signed(JSON.stringify(body)),
    { DISCORD_PUBLIC_KEY: publicKey, ...env },
    ctx,
  );
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  return (await res.json()) as InteractionResponse;
}
