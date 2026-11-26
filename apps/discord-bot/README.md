# discord-bot

A Discord bot that answers from the MHFU Blacksmith's data. It's a
Cloudflare Worker set as the application's **Interactions Endpoint URL**:
Discord POSTs each slash command and autocomplete keystroke to it and takes
the response as the reply, so there's no gateway process to keep running.

| Command             | Reply                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `/monster name:`    | Type, base HP, weaknesses, breakable parts and crowns, and the page link (which unfurls) |
| `/item name:`       | The best monster drops and quest rewards with their chances, rarity, price and the page  |
| `/weapon name:`     | Attack, affinity, element, slots and rarity, and the page link                           |
| `/settings string:` | A RandomFU settings string's seed, preset and every option it changes                    |
| `/sets request:`    | A plain-English request as a set builder search: a link that opens with it filled in     |

`name` autocompletes: by name, the data's other spellings and the community's
nicknames (`src/nicknames.ts`: "Raja", "Kush", "Fatty"). Large monsters come
before small ones that match as well.

## How it works

- `scripts/index-data.ts` builds the search index from `data/` with
  game-data's `readData`, and the site's own slug functions, so every link is
  a page's address. It's generated (`pnpm index`) and bundled into the
  Worker; the whole script is about 240 KB gzipped.
- `src/bot.ts` checks each request's Ed25519 signature against the
  application's public key, then answers it. `/settings` decodes with
  randomfu's own settings module.
- `/sets` defers its reply and translates the request with a model: by
  default DeepSeek V4.1 Flash through OpenCode's API (`src/deepseek.ts`), or Claude (`src/claude.ts`)
  when `NL_MODEL` names one. The prompt lists the skills, armor words and
  monsters from `data/` (`src/set-request.ts`), and the bot checks every name
  in the answer again, so a search never names gear that doesn't exist. It
  replies with a search link (`apps/blacksmith/src/lib/search-link.ts`). The
  set builder reads it, fills in the search and runs it in the visitor's
  browser, as it always does. Without the model's key, `/sets` matches names
  as written (`keywordTranslator`). `eval/` compares the models on 36
  requests.
- Each Discord user gets four `/sets` a minute (`SET_LIMITER` in
  `wrangler.jsonc`).

See [docs/discord-bot.md](../../docs/discord-bot.md) for why it's built this
way, the model choice and what it costs.

## Setting it up

1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   make an application with a bot. Note its application ID and public key
   (General Information) and the bot token (Bot).
2. Add credits and make an API key in the OpenCode console
   (https://opencode.ai/console), for its pay-as-you-go models; an OpenCode
   Go key doesn't work outside opencode. Deploy the Worker and give it its secrets, from this directory:

   ```sh
   npx wrangler deploy
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put OPENCODE_API_KEY
   ```

3. Set the Worker's URL (`https://mhfu-discord-bot.<account>.workers.dev/`)
   as the application's Interactions Endpoint URL. Discord checks it with a
   signed ping before saving.
4. Register the commands, in one server first (they show up at once there;
   global ones can take an hour):

   ```sh
   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… DISCORD_GUILD_ID=… pnpm --filter discord-bot register
   ```

5. Invite the bot with the `applications.commands` scope (OAuth2 > URL
   Generator).

`pnpm --filter discord-bot register --dry-run` prints the commands without
sending them, and `pnpm --filter discord-bot bundle-size` bundles the Worker
and prints its gzipped size.
