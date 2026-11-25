/**
 * The Worker's entry (wrangler.jsonc): the bot over the index built from
 * data/ (scripts/build-index.ts, run before every build and check).
 */
import { createBot } from "./bot.js";
import index from "./generated/index.json" with { type: "json" };
import type { BotIndex } from "./types.js";

export default createBot(index as BotIndex);
