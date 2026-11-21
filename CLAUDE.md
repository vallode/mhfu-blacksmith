# MHFU monorepo

Tools and websites for Monster Hunter Freedom Unite (MHP2G), as a pnpm
workspace:

- `apps/blacksmith`: the MHFU Blacksmith website (Next.js, static export).
  Its own `CLAUDE.md` covers styling.
- `apps/randomfu`: randomfu's static web app (esbuild). Borrows the site's
  design tokens and sprites at build time (`build.mjs`).
- `packages/mhfu-extract`: datamining pipeline from a disc image to `data/`
  and the site's `public/models/`.
- `packages/randomfu`: the randomizer, a library with no front end of its
  own; `apps/randomfu` is the only way to run it.
  Its own `CLAUDE.md` covers styling text written into the game.
- `packages/game-data`: the one way into `data/`. Everything that reads the
  game data does so with its `readData`, and `build-data` writes with its
  `writeData`.
- `data/`: the game data, shared by the site and the extractor, one
  directory per game (`data/mhfu/`; `data/schemas/` is shared). Records
  carry game IDs and refer to each other by ID; names are in
  `data/<game>/strings/<lang>.json`. Each game's config (weapon types,
  ranks, which sections it has, …) is `game-data`'s `games.ts`. See
  `packages/game-data/README.md`.

Packages import each other by package name, never by a relative path out of
their own directory (`mhfu-extract/src/container/image.js`, not
`../../mhfu-extract/src/…`), and list each other as `workspace:*`
dependencies.

Checks, from the root: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm format:check`. Run one package's scripts with
`pnpm --filter <name> <script>` (`blacksmith`, `randomfu-web`,
`mhfu-extract`, `randomfu`, `game-data`). Never commit a disc image or an unpacked dump
of one (see `.gitignore`).

Each disc image is close to 1 GB, and nothing clears temp folders or
session scratchpads for you. Delete every disc you write (randomized
output, probe and test discs) once you no longer need it, before you end the
task. `pnpm clean:discs` deletes the discs left in Claude Code scratchpads
(`--dry-run` lists them). Tests that write files do so under `tmpdir()` and
remove them afterwards: randomfu's `tempDir()` (`test/temp.ts`) does this
when the process ends, unless `KEEP_TEST_DISCS=1`.
