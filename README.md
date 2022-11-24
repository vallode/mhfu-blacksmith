![Monster hunter freedom unite blacksmith](/static/images/blacksmith-scaled.png)

# MHFU - Blacksmith

[![Netlify Status](https://api.netlify.com/api/v1/badges/92498c7e-45eb-449e-861f-764c6e6cf57c/deploy-status)](https://app.netlify.com/sites/mhfu-blacksmith/deploys)

Detailed weapon trees, armor lists, and monster information for Monster Hunter Freedom Unite / P2G in the style of the in-game UI!

![Screenshot of the website](/static/images/screenshot.png)

## Credits

Thank you to all the people below, and anyone I missed, for the invaluable help with this project:

- Aino
- Arxx
- Assis
- Athena
- Danzell
- Darkcola
- Emanon
- Hunsterverse contributors
- Ice Cream
- Jely
- kpworthi
- kushala
- lirkas
- rafaellum
- Shiro
- Vid (Firaga)
- WillTheHunter
- Yaas
- Zack

## Development

Dependencies:

- [zola](https://github.com/getzola/zola/)
- [Ruby](https://www.ruby-lang.org/)
  - [toml](https://github.com/jm/toml)
- [ImageMagick](https://imagemagick.org/) (optional)

Before running the first build you need to run `make generate-maps` to generate weapons maps.

The makefile has everything covered: develop locally using `make`, test build output with `make build`, and deploy to netlify with `make deploy`.
