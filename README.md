# MHFU - Blacksmith

[![Netlify Status](https://api.netlify.com/api/v1/badges/92498c7e-45eb-449e-861f-764c6e6cf57c/deploy-status)](https://app.netlify.com/sites/mhfu-blacksmith/deploys)

Weapon trees for Monster Hunter Freedom Unite in the style of the in-game UI.

![Screenshot of the website](/static/images/screenshot.png)

TODO: Create image dump of all weapons in MHFU  
TODO: Create release file for all JSON crafting information

## Credits

Thank you to all the people below, and anyone I missed, for the invaluable help with this project:

* Aino
* Arxx
* Assis
* Athena
* Danzell
* Darkcola
* Emanon
* Hunsterverse contributors
* Jely
* kpworthi
* kushala
* lirkas
* rafaellum
* Vid (Firaga)
* Yaas
* Zack

## Development

Dependencies:

* [zola](https://github.com/getzola/zola/) 
* [Ruby](https://www.ruby-lang.org/)
  * [toml](https://github.com/jm/toml)
* [ImageMagick](https://imagemagick.org/) (optional)

Before running the first build you need to run `make generate-maps` to generate weapons maps.

The makefile has everything covered: develop locally using `make`, test build output with `make build`, and deploy to netlify with `make deploy`.

## Hunstermonter weapon data scraping (WIP)

Going onto any weapon tree page on hunstermonter (i.e https://hunstermonter.net/fu/weapon2.php?w=gs) allows you to access `arrWeapons` on the browser console. Using the script below you can filter it into a mostly usable javascript object.

```javascript
arrWeapons.flatMap((weapon) => {
  newWeapon = {}
  Object.assign(newWeapon, {
    "name": weapon["Info"][1],
    "attack": weapon["Info"][2],
    "max-attack": weapon["Info"][3],
    "rapid-fire": weapon["Info"][10] === '-' ? "N/A" : weapon["Info"][10],
    "affinity": weapon["Info"][8],
    "slots": weapon["Info"][9],
    "defense": weapon["Info"][4] === '-' ? "N/A" : weapon["Info"][4],
    "rarity": weapon["Info"][7],
    "type": "lbg",
    "reload": weapon["Info"][5],
    "recoil": weapon["Info"][6],
    "ammo": weapon["Info"][11].split("|"),
    "status-ammo": weapon["Info"][12].split("|"),
    "element-ammo": weapon["Info"][13].split("|"),
    "misc-ammo": weapon["Info"][14].split("|"),
    "create_cost": weapon["Info"][15],
  })
  newWeapon["improve_mats"] = weapon["Improve"] || "N/A"
  newWeapon["create_mats"] = weapon["Create"] ? weapon["Create"].split("|") : "N/A"
  return newWeapon
})
```

## In-game image conversion

TODO: Clear this section up.
TODO: Figure out what to do about weapons larger than the blacksmith screen (splice images?)

In order to capture lossless images of weapons in the game (as they appear in the blacksmith menu), I created two texture replacements, one with the UI entirely black and the other entirely white. I capture two screenshots of each weapon as it appears (sometimes camera adjustment is necessary).

I then go in and rename each image following a pattern of `weapon_name-black.png/weapon_name-white.png`.

```bash
convert '*-white.png' -crop 856x571+55+429 +repage -trim -gravity Center -background White -extent 800x600 -set filename:fn '%[basename]' '%[filename:fn].png'
```

```bash
convert '*-black.png' -crop 856x571+55+429 +repage -trim -gravity Center -background Black -extent 800x600 -set filename:fn '%[basename]' '%[filename:fn].png'
```

The script below then iterates over the pairs of images and converts them into one, completely losslessly transparent, image for use on the site in a 4:3 ratio.

```
for weapon in $(find *.png | sed -E -e 's/-black.png|-white.png//g' | uniq)
do
  echo $weapon
  convert ${weapon}-black.png -gravity Center -background Black -extent 800x600 weapon_black.png
  convert ${weapon}-white.png -gravity Center -background White -extent 800x600 weapon_white.png
  convert weapon_black.png weapon_white.png -alpha off \
    \( -clone 0,1 -compose difference -composite -negate \) \
    \( -clone 0,2 +swap -compose divide -composite \) \
    -delete 0,1 +swap -compose Copy_Opacity -composite \
    output/${weapon}.png
done
```