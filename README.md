![Monster hunter freedom unite blacksmith](/apps/blacksmith/public/images/blacksmith-scaled.png)

# MHFU - Blacksmith

[![Netlify Status](https://api.netlify.com/api/v1/badges/92498c7e-45eb-449e-861f-764c6e6cf57c/deploy-status)](https://app.netlify.com/sites/mhfu-blacksmith/deploys)

Detailed weapon trees, armor lists, and monster information for Monster Hunter Freedom Unite / P2G in the style of the in-game UI!

![Screenshot of the website](/apps/blacksmith/public/images/screenshot.png)

## Credits

Thank you to all the people below, and anyone I missed, for the invaluable help with this project:

- Aino
- Arxx
- Assis
- Athena
- Danzell
- Darkcola
- Emanon
- Hay_AJ
- Hunsterverse contributors
- Ice Cream
- Jely
- kpworthi
- kushala
- lirkas
- Mustard
- rafaellum
- Shiro
- Vid (Firaga)
- WillTheHunter
- Yaas
- Zack

In-game item IDs and names (`data/items.json`, used by the save loader on `/hunter`) were imported once from the MIT-licensed datamines [Daigo829/mhfu-save-viewer](https://github.com/Daigo829/mhfu-save-viewer) and [IncognitoMan/mhp2g-patterns](https://github.com/IncognitoMan/mhp2g-patterns), and are edited by hand since. Each item's rarity, carry limit and price come from the disc (`packages/mhfu-extract`).

The skill activation table (`data/skills.json`, used by the set builder on `/set-builder`) comes from the MIT-licensed [Kolyn090/mhfu-db](https://github.com/Kolyn090/mhfu-db) (Kolyn090, Gustavo Augustini), with tree names changed to the game's `SkillID` spelling and the site's other spellings listed as `aliases`. The set builder itself is modelled on Athena's Armor Set Search.

## Repository layout

This is a [pnpm workspace](https://pnpm.io/workspaces):

| Path                    | Package        | What it is                                                                                      |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `apps/blacksmith`       | `blacksmith`   | The MHFU Blacksmith website, a statically exported [Next.js](https://nextjs.org/) app           |
| `apps/randomfu`         | `randomfu-web` | The randomizer as a static web app that runs in the browser, at randomfu.vallode.com            |
| `packages/mhfu-extract` | `mhfu-extract` | Datamining pipeline: reads a disc image and emits `data/` and the site's 3D models              |
| `packages/randomfu`     | `randomfu`     | Seeded randomizer: library, command line and local settings page                                |
| `data`                  |                | The game data the site is built from (JSON, validated by `data/schemas/`), shared by everything |

Packages import each other by name (`import … from "mhfu-extract/src/container/image.js"`),
declared as `workspace:*` dependencies.

## Development

Dependencies:

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (version pinned in `package.json`; `corepack enable` will pick it up)
- [ImageMagick](https://imagemagick.org/) (optional, for `apps/blacksmith/scripts/crop-images.sh`)

From the repository root:

```sh
pnpm install

pnpm dev            # the site's dev server on http://localhost:3000
pnpm build          # regenerate the site's data + static export to apps/blacksmith/out/
pnpm lint           # ESLint
pnpm typecheck      # tsc in every package
pnpm test           # every package's tests
pnpm format         # Prettier, for the whole repository
```

Run any package's own scripts with `pnpm --filter <package> <script>`, or
from its directory. The site's (from `apps/blacksmith`):

```sh
# Generate the client data bundles in public/ (needed once before `pnpm dev`,
# and again whenever data/ or content/ changes)
pnpm generate-data && pnpm generate-search

pnpm validate         # sanity-check data/ and content/
pnpm validate-schema  # check data/ against data/schemas/
```

Source data lives in `data/` (items, validated by `data/schemas/`) and `apps/blacksmith/content/` (crafting trees). Generated files under `apps/blacksmith/public/data`, `apps/blacksmith/public/*.json` and `apps/blacksmith/out/` are git-ignored.

The crafting trees in `apps/blacksmith/content/**/map.json` are generated from `data/` with `pnpm generate-maps`. Rerun it after adding or re-parenting weapons, armor, or decorations.

`apps/blacksmith/public/models/` holds 3D models extracted from the game, shown on detail pages by `src/components/ModelViewer.tsx`. They are generated, not hand-made: unpack your own disc image and run `pnpm --filter mhfu-extract export-site` (see `packages/mhfu-extract/README.md`, "3D models"), then commit the result.

`data/equipment-ids.json` maps the game's equipment IDs (the ones stored in a save file's equipment box) to the weapons and armor in `data/`. It is generated with `pnpm generate-equipment-ids` (in `apps/blacksmith`) from the `equip.enum` name tables in [IncognitoMan/mhp2g-patterns](https://github.com/IncognitoMan/mhp2g-patterns) (MIT, vendored under `packages/mhfu-extract/vendor/`), plus the hand-checked aliases in `apps/blacksmith/scripts/equipment-id-aliases.json` for names that differ between MHP2G and MHFU. Rerun it after renaming or adding weapons or armor; `pnpm validate` fails if it's stale.

The site is deployed by [Netlify](https://app.netlify.com/sites/mhfu-blacksmith/deploys) (`netlify.toml`). randomfu's web app is a second Netlify site on this repository, served at [randomfu.vallode.com](https://randomfu.vallode.com). Its config is `apps/randomfu/netlify.toml`, which Netlify finds because that site's base directory is `apps/randomfu`.

Both sites are built on demand only: Netlify skips the builds it would start for pushes and pull requests. To deploy, run the **Deploy to Netlify** workflow (Actions > Deploy to Netlify > Run workflow), choosing the branch and the site. `main` deploys to production; any other branch is a branch deploy. The workflow calls each site's build hook, whose URL is in the `NETLIFY_BLACKSMITH_BUILD_HOOK` and `NETLIFY_RANDOMFU_BUILD_HOOK` repository secrets.
