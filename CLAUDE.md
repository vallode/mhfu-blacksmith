# MHFU monorepo

Tools and websites for Monster Hunter Freedom Unite (MHP2G), as a pnpm
workspace:

- `apps/blacksmith`: the MHFU Blacksmith website (Next.js, static export).
  Its own `CLAUDE.md` covers styling.
- `apps/randomfu`: randomfu's static web app (esbuild). Borrows the site's
  design tokens and sprites at build time (`build.mjs`).
- `packages/mhfu-extract`: datamining pipeline from a disc image to `data/`
  and the site's `public/models/`.
- `packages/randomfu`: the randomizer (library, CLI, local settings page).
  Its own `CLAUDE.md` covers styling text written into the game.
- `data/`: the game data, shared by the site and the extractor.

Packages import each other by package name, never by a relative path out of
their own directory (`mhfu-extract/src/container/image.js`, not
`../../mhfu-extract/src/…`), and list each other as `workspace:*`
dependencies.

Checks, from the root: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm format:check`. Run one package's scripts with
`pnpm --filter <name> <script>` (`blacksmith`, `randomfu-web`,
`mhfu-extract`, `randomfu`). Never commit a disc image or an unpacked dump
of one (see `.gitignore`).
