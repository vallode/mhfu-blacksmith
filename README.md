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

Dependencies:

- [Node.js](https://nodejs.org/) 22
- [pnpm](https://pnpm.io/) (version pinned in `packageManager` in `package.json`)
- [Ruby](https://www.ruby-lang.org/) (optional, only for regenerating crafting-tree maps)
- [ImageMagick](https://imagemagick.org/) (optional, for the image scripts in `scripts/`)

```sh
pnpm install
pnpm dev        # local dev server
pnpm build      # generate data + static export to out/
pnpm validate   # check data/ against the crafting-tree maps
```

Game data lives in `data/`. The crafting-tree maps in `content/**/map.json` are generated from it with `make generate-maps`; rerun that after adding or re-parenting weapons, armor, or decorations.

The site is deployed by [Netlify](https://app.netlify.com/sites/mhfu-blacksmith/deploys), which builds `main` for production and every pull request as a deploy preview.
