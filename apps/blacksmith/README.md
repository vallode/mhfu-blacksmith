# MHFU Blacksmith

The site: a statically exported [Next.js](https://nextjs.org/) app. See the root
`README.md` for setup and the repository layout; commands below run from
`apps/blacksmith`.

```sh
# Generate the client data bundles in public/ (needed once before `pnpm dev`,
# and again whenever data/ changes)
pnpm generate-data && pnpm generate-search

pnpm validate         # sanity-check data/
pnpm validate-schema  # check data/<game>/ against data/schemas/
```

Source data lives in `data/<game>/` (records and string tables, validated by `data/schemas/`). Generated files under `apps/blacksmith/public/data`, `apps/blacksmith/public/*.json` and `apps/blacksmith/out/` are git-ignored.

The crafting trees are built from `data/` when the site is (`src/lib/trees.ts`), so there is nothing to regenerate after adding or re-parenting weapons, armor, or decorations.

`apps/blacksmith/public/models/` holds 3D models extracted from the game, shown on detail pages by `src/components/ModelViewer.tsx`. They are generated, not hand-made: unpack your own disc image and run `pnpm --filter mhfu-extract export-site` (see `packages/mhfu-extract/README.md`, "3D models"), then commit the result.
