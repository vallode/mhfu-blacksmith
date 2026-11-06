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

## Development

The site is a statically exported [Next.js](https://nextjs.org/) app.

Dependencies:

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (version pinned in `package.json`; `corepack enable` will pick it up)
- [Ruby](https://www.ruby-lang.org/) (optional, only for `make generate-maps`)
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
```

Source data lives in `data/` (items, validated by `data/schemas/`) and `content/` (crafting trees). Generated files under `public/data`, `public/*.json` and `out/` are git-ignored.

The crafting trees in `content/**/map.json` are generated from `data/` with `make generate-maps` (needs Ruby, standard library only). Rerun it after adding or re-parenting weapons, armor, or decorations.

The site is deployed by [Netlify](https://app.netlify.com/sites/mhfu-blacksmith/deploys), which builds `main` for production and every pull request as a deploy preview.
