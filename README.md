# MHFU - Blacksmith 

Weapon trees for Monster Hunter Freedom Unite in the style of the in-game UI.

TODO: Create image dump of all weapons in MHFU  
TODO: Create release file for all JSON crafting information

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
    "create-cost": weapon["Info"][15],
  })
  newWeapon["improve-mats"] = weapon["Improve"] || "N/A"
  newWeapon["create-mats"] = weapon["Create"] ? weapon["Create"].split("|") : "N/A"
  return newWeapon
})
```

## In-game image conversion

TODO: Clear this section up.

```bash
convert '*-white.png' -crop 608x406+40+305 +repage -trim -gravity Center -background White -extent 800x600 -set filename:fn '%[basename]' '%[filename:fn].png'
```

```bash
convert '*-black.png' -crop 608x406+40+305 +repage -trim -gravity Center -background Black -extent 800x600 -set filename:fn '%[basename]' '%[filename:fn].png'
```

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

The command above outputs a 512x384 (4:3) png image of the weapon.

## Development

Dependencies:

* [zola](https://github.com/getzola/zola/) 
* [Ruby](https://www.ruby-lang.org/)
* [ImageMagick](https://imagemagick.org/) (optional)

The makefile has everything covered: develop locally using `make`, test build output with `make build`, and deploy to netlify with `make deploy`.