![Monster hunter freedom unite blacksmith](/public/images/blacksmith-scaled.png)

# MHFU - Blacksmith

[![Netlify Status](https://api.netlify.com/api/v1/badges/92498c7e-45eb-449e-861f-764c6e6cf57c/deploy-status)](https://app.netlify.com/sites/mhfu-blacksmith/deploys)

Detailed weapon trees, armor lists, and monster information for Monster Hunter Freedom Unite / P2G in the style of the in-game UI!

![Screenshot of the website](/public/images/screenshot.png)

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

In-game item IDs (`data/items.json`, used by the save loader on `/hunter`) come from the MIT-licensed datamines [Daigo829/mhfu-save-viewer](https://github.com/Daigo829/mhfu-save-viewer), [IncognitoMan/mhp2g-patterns](https://github.com/IncognitoMan/mhp2g-patterns) and [Kolyn090/mhfu-db](https://github.com/Kolyn090/mhfu-db) (Kolyn090, Gustavo Augustini). See `scripts/import-items.ts`.

## Development

The site is a statically exported [Next.js](https://nextjs.org/) app.

Dependencies:

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (version pinned in `package.json`; `corepack enable` will pick it up)
- [ImageMagick](https://imagemagick.org/) (optional, for `scripts/crop-images.sh`)

```sh
pnpm install

# Generate the client data bundles in public/ (needed once before `pnpm dev`,
# and again whenever data/ or content/ changes)
pnpm generate-data && pnpm generate-search && pnpm generate-weapons

pnpm dev       # local dev server on http://localhost:3000
pnpm build     # regenerate data + static export to out/
pnpm lint      # ESLint
pnpm validate  # sanity-check data/ and content/
pnpm validate-schema  # check data/ against data/schemas/
```

Source data lives in `data/` (items, validated by `data/schemas/`) and `content/` (crafting trees). Generated files under `public/data`, `public/*.json` and `out/` are git-ignored.

The crafting trees in `content/**/map.json` are generated from `data/` with `pnpm generate-maps`. Rerun it after adding or re-parenting weapons, armor, or decorations.

`public/models/` holds 3D models extracted from the game, shown on detail pages by `src/components/ModelViewer.tsx`. They are generated, not hand-made: unpack your own disc image and run `pnpm --filter mhfu-extract export-site` (see `tools/mhfu-extract/README.md`, "3D models"), then commit the result.

`data/equipment-ids.json` maps the game's equipment IDs (the ones stored in a save file's equipment box) to the weapons and armor in `data/`. It is generated with `pnpm generate-equipment-ids` from the `equip.enum` name tables in [IncognitoMan/mhp2g-patterns](https://github.com/IncognitoMan/mhp2g-patterns) (MIT, vendored under `tools/mhfu-extract/vendor/`), plus the hand-checked aliases in `scripts/equipment-id-aliases.json` for names that differ between MHP2G and MHFU. Rerun it after renaming or adding weapons or armor; `pnpm validate` fails if it's stale.

The site is deployed by [Netlify](https://app.netlify.com/sites/mhfu-blacksmith/deploys), which builds `main` for production and every pull request as a deploy preview.
