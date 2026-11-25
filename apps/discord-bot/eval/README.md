# The /sets eval

How well a model turns a player's request into a set builder search.
`cases.json` holds 36 requests, each with the answer a careful reader would
give: other names for skills ("Razor Sharp", "Evasion +2"), Japanese, monster
nicknames, armor the game names differently ("no Ukanlos armor" is
Ucamulbas), cut-short names ("Wht Fatalis"), locks, slots and requests with
no skills in them.

Both the expected answer and the model's go through the bot's own
`resolveSetRequest`, and each case is graded on what the set builder would
get: skills, rank, hunter type, weapon slots, the pieces left out, the
pieces locked and the monster. "All correct" is all seven.

| `--model`          | What runs                                                     |
| ------------------ | ------------------------------------------------------------- |
| `keyword`          | The bot's keyword matching, the floor a model has to beat     |
| `claude-haiku-5-5` | The bot's own Claude request (`src/claude.ts`)                |
| `claude-opus-5-5`  | The same, on Opus                                             |
| `deepseek-flash`   | DeepSeek's API, same prompt and schema, as a strict tool call |

## Running it

From the repository root. `pnpm --filter discord-bot eval:check` runs the
offline checks first: the expected answers must score 100%.

The harness (`run-eval.mjs`) refuses to run until its files are approved:
review them, then pass `--approve-harness` once. Each model is a variant
directory under `.claude/hillclimb/sets-translation/` (gitignored):

```sh
TSX=apps/discord-bot/node_modules/.bin/tsx
RUN="$TSX apps/discord-bot/eval/run-eval.mjs --flow .claude/hillclimb/sets-translation"
$RUN --variant baseline --model keyword
ANTHROPIC_API_KEY=… $RUN --variant v1 --model claude-haiku-5-5
ANTHROPIC_API_KEY=… $RUN --variant v2 --model claude-opus-5-5
DEEPSEEK_API_KEY=… $RUN --variant v3 --model deepseek-flash
$TSX apps/discord-bot/eval/summary.ts .claude/hillclimb/sets-translation
```

`summary.ts` prints each variant's scores, median latency and cost.
`--reps 2` runs every case twice. A finished case isn't run again, so a run
can be stopped and resumed.
