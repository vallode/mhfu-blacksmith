# The Discord bot: design and model choice

The bot (`apps/discord-bot`) answers questions in chat from the Blacksmith's
data, and turns plain-English set requests into set builder searches. This
is why it's built the way it is.

## Recommendation

- **Model: Claude, with structured outputs.** One Messages API call per
  `/sets` request. The JSON schema's enums list every skill activation, armor
  word and large monster from `data/`, so the answer always parses and never
  names gear that doesn't exist. The bot's default is `claude-opus-5-5` at
  low effort. `claude-haiku-5-5` costs about a fortieth as much. Which one to
  run is a cost decision: try both on a few dozen real requests before
  launch, then set `NL_MODEL`.
- **Not Jev, for this.** Jev is good at a single choice or a yes/no question.
  A set request is a list of skills, armor to leave out, a slot count and a
  rank, and Jev can't return a list.
- **Architecture: a Worker on Discord's HTTP interactions endpoint.** There's
  no gateway process. Every request is checked against the application's
  Ed25519 public key. Lookups are answered at once from a bundled index;
  `/sets` defers and edits its reply in once the model answers.
- **The search runs on the site.** The bot replies with a set builder link
  that fills in the search and runs it in the visitor's browser.

## What Jev is

[Jev](https://developers.cloudflare.com/ai/models/typesafe/jev/) is TypeSafe
AI's "decision model", released in September 2026. It takes a state (text or
JSON) and typed questions, and returns probabilities instead of text.

| Question type | Returns                                      |
| ------------- | -------------------------------------------- |
| `noul`        | A yes/no probability                         |
| `choice`      | One of the options you list, with confidence |
| `score`       | A point on a scale you describe              |

- **Hosting:** Workers AI hosts it as `typesafe/jev` (1.13) and
  `typesafe/jev-1.14.0`, called with `env.AI.run(…)` from a Worker binding,
  with no API key to keep.
- **Price:** $0.042 per million input tokens, with output free.
- **Context:** 32,000 tokens.

Sources: [Cloudflare's model page](https://developers.cloudflare.com/ai/models/typesafe/jev/),
[Simon Willison's notes](https://simonwillison.net/2026/Sep/21/jev/), and a
[September 2026 paper](https://arxiv.org/pdf/2610.06625) that found its
speed and cost claims not yet independently checked.

### For this task

A request like "G rank gunner set with Evasion +2 and Auto-Reload for Rajang,
no Fatalis gear" needs:

- the rank, hunter type and monster: one `choice` each, which Jev fits well;
- the skills: any number of 148 activations. Jev has no multi-select, so
  this takes a `noul` question per skill ("Does the player want Evade +2?").
  Each is judged on its own, with a threshold to pick;
- the armor to leave out or lock: another `noul` per armor word (241 of them),
  per slot for locks;
- the weapon slots: a number. Willison reports it is "not great with numbers".

That is about 400 questions per request. They fit the context window and cost
about $0.0004, but nothing published says how well Jev holds up over that
many independent judgements on game vocabulary. A local name matcher could
cut the questions down to a handful of candidates. That matcher, though, is
the part that has to know "Evasion +2" means Evade +2.

Jev would fit a single-choice job well, such as routing a free-text question
to the right command.

## Claude for the translation

**MHFU vocabulary.** The prompt gives the model what the schema can't hold:

- each skill tree with its activations, and the data's other spellings
  ("Defence");
- the community's monster nicknames (`src/nicknames.ts`).

The model already knows Monster Hunter's community terms and Japanese names.
The point is to map the player's words onto the data's names, which the
schema then enforces:

- "Evasion +2" becomes Evade +2 (the EU name);
- "Auto-Reload" becomes Auto Reload;
- "Raja" becomes Rajang;
- "LR/HR/G" become the ranks.

Armor is named by the words in piece names rather than by set, because the
game truncates names (`Wht Fatalis Mail`, `RdGuildGuardTricorne`). "No
Fatalis gear" becomes `never: ["Fatalis"]`, which the set builder expands to
every Fatalis, Crimson, White and "Wht" Fatalis piece the hunter can wear.

**Hosting.** It's an HTTPS call from the Worker through the official SDK. The
key is a Worker secret (`ANTHROPIC_API_KEY`). The system prompt is marked for
caching, so a burst of requests pays for it once every five minutes.

**Settings.**

- Effort is `low`.
- A refused request falls back to another model on the server (Opus only;
  Haiku has no server-side fallback).
- A refusal or a cut-off answer becomes a short "try again" reply with the
  set builder's link.

## Costs

The prompt and schema together are about 4,500 input tokens, the same for
every request. The answer is about 150 tokens of JSON, plus whatever the
model thinks at low effort. Estimates per `/sets` request:

| Model                         | Uncached         | Prompt cached     | 1,000 requests |
| ----------------------------- | ---------------- | ----------------- | -------------- |
| `claude-opus-5-5`, low effort | about $0.02–0.03 | about $0.005–0.01 | about $10–30   |
| `claude-haiku-5-5`            | under $0.001     | under $0.001      | under $1       |
| Jev (about 400 questions)     | about $0.0004    | n/a               | under $0.50    |

These are estimates from list prices: Opus $4/$20 per million input/output
tokens and $0.20 for cache reads, Haiku $0.10/$0.50. They haven't been
measured; nothing has called a paid API yet.

Cloudflare costs:

- **Lookups and autocomplete** run in the bot's own Worker with no model.
  Each autocomplete keystroke is one Worker request taking about 2 ms of CPU,
  inside the free plan's 10 ms.
- **The script** is about 220 KB gzipped, against a 3 MB limit on the free
  plan.
- **The rate limit** (four `/sets` per user a minute, per Cloudflare
  location) caps what one user can spend. The Anthropic console's spend
  limit is the hard cap.

## Why the search runs on the site

The set builder's solver (`apps/blacksmith/src/lib/set-search.ts`) is too
heavy for a Worker's CPU limits:

- it is exact, and runs in rounds for up to 20 seconds;
- it is split across several web workers in the browser;
- it needs every armor and decoration bundle.

A Worker on the free plan gets 10 ms of CPU per request. Paid gets 30 s by
default, which would still mean long, uneven waits.

So `/sets` replies with a search link: `/set-builder/?skill=Evade+%2B2&…`
(`apps/blacksmith/src/lib/search-link.ts`). On load, the set builder:

1. fills the form in from the link, keeping the visitor's sex and owned-armor
   settings;
2. expands `never` words to pieces;
3. runs the search;
4. takes the parameters off the address.

The same link format would let the site have a natural-language search box of
its own, using the same translation step.

A later step could run a short, capped search in the Worker and reply with
the best set's share link, which already unfurls into a set card.

## License

The bot bundles randomfu's settings module for `/settings`, so it's
GPL-3.0-or-later like randomfu.
