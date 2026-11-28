# discord-bot

A Discord bot that answers from the MHFU Blacksmith's data. It's a
Cloudflare Worker set as the application's **Interactions Endpoint URL**:
Discord POSTs each slash command and autocomplete keystroke to it and takes
the response as the reply, so there's no gateway process to keep running.

| Command               | Reply                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| `/monster name:`      | The monster page's card, with Hitzones, Drops and Quests buttons and the page link      |
| `/item name:`         | The item's card: the best monster drops and quest rewards with their chances            |
| `/weapon name:`       | The weapon's card: stats, sharpness, upgrades and materials; links to its page and tree |
| `/settings string:`   | A RandomFU settings string's seed, preset and every option it changes                   |
| `/sets request:`      | A plain-English request as a set builder search: a link that opens with it filled in    |
| Look up in Blacksmith | On any message (right-click › Apps): the monsters, items and weapons it names           |

Each reply is an embed with the site's card as its image, the game icon in
its author line and the bar in the rarity's colour. A monster's buttons swap
the card for its drops (one card per rank, picked from a menu, High Rank
first) or its quests by board. Buttons edit the reply for whoever asked and
send anyone else a copy only they see.

**Look up in Blacksmith** answers someone's question without retyping it.
It finds up to five names in the message, loosely spelled ("where do i farm
rath plates?? still running bone g" finds Rathian Plate and Bone G):
nicknames, plurals, words typed short and names run together count, the
longer of two overlapping names wins, and everyday words that are also items
("map", "stone") count only when nothing else is named. Only you see the answer: a row for
each, linked to its page, with an item's best source, a weapon's type,
attack and rarity, or a monster's type and weakness. Its buttons post that
entry's usual `/monster`, `/item` or `/weapon` reply in the channel, under a
link to the message it answers, or all of them in one. Discord sends the
message's text with the command, so the bot needs no message content intent.
It's `src/message-lookup.ts`.

`name` autocompletes: by name, the data's other spellings and the community's
nicknames (`src/nicknames.ts`: "Raja", "Kush", "Fatty"). Large monsters come
before small ones that match as well.

## How it works

- `scripts/index-data.ts` builds the search index from `data/` with
  game-data's `readData`, and the site's own slug functions, so every link is
  a page's address. It's generated (`pnpm index`) and bundled into the
  Worker; the whole script is about 290 KB gzipped.
- The cards are the site's. Monster cards are drawn at build time
  (`generate-embeds`); weapon, item and drops cards are drawn on request by
  the site's Worker from data the build writes (`src/lib/detail-card.ts` in
  `apps/blacksmith`) and cached. The index stores each card's path with a
  version taken from what it shows, so Discord fetches it again only when it
  changes.
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

## Testing on your own server

Run the Worker locally behind a tunnel and point a test application's
Interactions Endpoint URL at the tunnel. Secrets go in `.dev.vars`
(`DISCORD_PUBLIC_KEY=…`, `OPENCODE_API_KEY=…`). `pnpm --filter blacksmith
generate-embeds` draws the embed images into the site's `public/`. The Worker
serves them itself, so `ASSET_URL` takes icons and monster cards from the
tunnel and links still go to the live site. The weapon, item and drops cards
come from the site's Worker, not from `public/`, so they only show once the
site is deployed with the same data (point `ASSET_URL` at the live site to
see them):

```sh
cloudflared tunnel --url http://localhost:8787
npx wrangler dev --assets ../blacksmith/public --var ASSET_URL:https://<tunnel>.trycloudflare.com
```

Wrangler reloads on code changes. Rerun `pnpm index` after changing
`scripts/index-data.ts`.
