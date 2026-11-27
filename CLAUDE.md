# MHFU monorepo

Tools and websites for Monster Hunter Freedom Unite (MHP2G), as a pnpm
workspace:

- `apps/blacksmith`: the MHFU Blacksmith website (Next.js, static export).
  Its own `CLAUDE.md` covers styling.
- `apps/randomfu`: randomfu's static web app (esbuild). Borrows the site's
  design tokens and sprites at build time (`build.mjs`).
- `apps/discord-bot`: a Discord bot as a Cloudflare Worker on Discord's HTTP
  interactions endpoint, answering from an index built from `data/`. Its
  `README.md` covers setup and design.
- `packages/mhfu-extract`: datamining pipeline from a disc image to `data/`
  and the site's `public/models/`.
- `packages/randomfu`: the randomizer, a library with no front end of its
  own; `apps/randomfu` is the only way to run it.
  Its own `CLAUDE.md` covers styling text written into the game.
- `packages/game-data`: the one way into `data/`. Everything that reads the
  game data does so with its `readData`, and `build-data` writes with its
  `writeData`.
- `data/`: the game data, shared by the site and the extractor. Records
  carry game IDs and refer to each other by ID; names are in
  `data/strings/<lang>.json`. See `packages/game-data/README.md`.

Packages import each other by package name, never by a relative path out of
their own directory (`mhfu-extract/src/container/image.js`, not
`../../mhfu-extract/src/…`), and list each other as `workspace:*`
dependencies.

## Datamining: the disc and its cache

`packages/mhfu-extract` reads a disc image into its own `.cache/` directory
(gitignored, a few GB). The main checkout usually has the only copy; a fresh
worktree starts without one.

- Cache: `packages/mhfu-extract/.cache/`
  - `packages/mhfu-extract/.cache/mhfu/`: `unpack` output (`manifest.json`
    records its disc, plus `data-bin/` and `eboot.bin`).
  - `packages/mhfu-extract/.cache/mhfu/extracted/`: `extract` output
    (`quests/<board>.json`, `raw/quests.json`, `EXTRACTION.json`).
  - `packages/mhfu-extract/.cache/dlc/ULES01213.ini`: downloadable quests for
    `extract --dlc`.
- In a worktree, run `pnpm link:cache` once. It finds the main checkout
  through git and symlinks `.cache` here, so no local path is committed.
  `MHFU_CACHE` points the CLI at a different `.cache`; `MHFU_DISC` supplies
  `unpack --iso`.
- The disc image is not in the repo. If you need it, read `isoPath` from
  `packages/mhfu-extract/.cache/mhfu/manifest.json` (it records the disc
  `unpack` used); `unpack --iso` also takes `MHFU_DISC`.
- Read that manifest and `extracted/` rather than searching the filesystem for
  datamining inputs.

While iterating, run only the affected package's checks:
`pnpm --filter <name> <script>` (`blacksmith`, `randomfu-web`,
`discord-bot`, `mhfu-extract`, `randomfu`, `game-data`), for example
`pnpm --filter blacksmith test`. The root-wide `pnpm lint`,
`pnpm typecheck`, `pnpm test` and `pnpm format:check` are all-or-nothing;
`pnpm test` alone takes about 45 seconds, mostly randomfu's property tests.
Save the full set for before a PR. Never commit a disc image or an unpacked
dump of one (see `.gitignore`).

Each disc image is close to 1 GB, and nothing clears temp folders or
session scratchpads for you. Delete every disc you write (randomized
output, probe and test discs) once you no longer need it, before you end the
task. `pnpm clean:discs` deletes the discs left in Claude Code scratchpads
(`--dry-run` lists them). Tests that write files do so under `tmpdir()` and
remove them afterwards: randomfu's `tempDir()` (`test/temp.ts`) does this
when the process ends, unless `KEEP_TEST_DISCS=1`.

## Working efficiently

Every turn re-reads the whole conversation, so fewer turns and a smaller
context save the most time and money.

- Batch independent calls in one turn: several reads, greps or `git` queries
  together, not one per turn. Prefer one script that probes several
  things over a run of one-line probes.
- Read a file whole, or `grep -n` it first and then read one range. Don't
  page through it with many small `sed -n` slices.
- Test one file while iterating:
  `pnpm --filter <name> exec tsx --test test/<file>.test.ts`.
- Check pages in the browser with `read_page`, `find` or JavaScript first.
  Take a screenshot only for visual proof, since every image stays in
  context for the rest of the session.
- Give Bash a `timeout` for anything that can hang (PPSSPP debugger
  scripts, waiting on ports). For waits, use a short `until` loop with a
  deadline, not repeated `sleep` calls.
- Start a new session for each new task, and after a PR merges. Memory
  carries findings forward; a long session's context does not.
