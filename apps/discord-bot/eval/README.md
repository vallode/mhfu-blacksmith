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

| `--model`                   | What runs                                                   |
| --------------------------- | ----------------------------------------------------------- |
| `keyword`                   | The bot's keyword matching, the floor a model has to beat   |
| `claude-haiku-5-5`          | The bot's own Claude request, with structured outputs       |
| `claude-opus-5-5`           | The same, on Opus                                           |
| `deepseek-v4.1-flash`       | The bot's own DeepSeek request (its default model)          |
| `opencode:<provider/model>` | Any model opencode can reach, with the schema in the prompt |

DeepSeek and the models through opencode get the bot's instructions and the
JSON schema in their prompt and are asked for the JSON alone, since neither
checks an answer against a schema. Each call is a headless `opencode run` with an agent
that has no tools, in a directory of its own under the system temp folder.
An answer that isn't JSON scores zero; a name the model made up is dropped,
as the bot drops it.

## Running it

From the repository root. `pnpm --filter discord-bot eval:check` runs the
offline checks first: the expected answers must score 100%.

The harness (`run-eval.mjs`) refuses to run until its files are approved:
review them, then pass `--approve-harness` once. Each model is a variant
directory under `.claude/hillclimb/sets-translation/` (gitignored):

```sh
TSX=apps/discord-bot/node_modules/.bin/tsx
run() { $TSX apps/discord-bot/eval/run-eval.mjs --flow .claude/hillclimb/sets-translation "$@"; }
run --variant baseline --model keyword
ANTHROPIC_API_KEY=… run --variant v1 --model claude-haiku-5-5
ANTHROPIC_API_KEY=… run --variant v2 --model claude-opus-5-5
run --variant v3 --model opencode:opencode-go/deepseek-v4.1-flash
run --variant v4 --model opencode:opencode-go/qwen3.8-flash
run --variant v5 --model opencode:opencode-go/glm-5.3-flash
run --variant v6 --model opencode:opencode-go/mimo-v2.6-flash
run --variant v7 --model opencode:opencode-go/gpt-6-luna
OPENCODE_API_KEY=… run --variant v8 --model deepseek-v4.1-flash
$TSX apps/discord-bot/eval/summary.ts .claude/hillclimb/sets-translation
```

`summary.ts` prints each variant's scores, median latency and cost
(opencode's own figure for its calls, list prices for the others).
`--reps 2` runs every case twice. A finished case isn't run again, so a run
can be stopped and resumed.
