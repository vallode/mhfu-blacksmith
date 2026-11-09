# randomfu

A seeded randomizer for **Monster Hunter Freedom Unite / Monster Hunter
Portable 2nd G**. It reads your own disc image, shuffles game data, and
writes a new ISO plus a spoiler log. It never ships game data: like other
randomizers, it only edits a copy of a disc you supply.

Licensed **GPL-3.0-or-later** (see `LICENSE`), because it builds on
`tools/mhfu-extract`'s readers and ciphers, which are GPL.

**Never commit a disc image, a randomized image or a spoiler log.**

## Status

Early. On the EU disc, PPSSPP boots a randomized image and the smithy shows
the shuffled recipe materials. Star-level tiers, gathering sources,
`recipe-amounts`, `costs` and `gathering` are so far tested only against the
synthetic disc the tests build (`test/fixtures.ts`). A PSP with custom
firmware isn't tested. Run `roundtrip` on a new disc first.

## Usage

### The settings page

```bash
# from tools/randomfu
pnpm gui
```

This starts a small server on your computer and opens a page in your
browser (or prints its address). On it you can:

- enter the paths to your disc, the output and the decrypted EBOOT, and
  check them;
- set every option, with its explanation, or start from a preset
  (Rewards only, Full, Chaos);
- copy the **settings string** (seed and settings in one line), load one,
  or save and load settings files;
- preview the spoiler log, randomize, watch the log and search the
  spoiler.

The page remembers your paths and settings in the browser. The server
only listens on 127.0.0.1, every request needs a token that only the
page has, and requests naming any other host are refused, so other
websites can't use it. Keep `pnpm gui` running while you use the page.
`--port <n>` picks the port; `--no-open` doesn't open a browser.

### The command line

```bash
pnpm roundtrip --iso /path/to/mhp2g.iso
pnpm randomize --iso /path/to/mhp2g.iso --out /path/to/random.iso --seed MYSEED
pnpm settings                       # list every setting with its values and help
pnpm settings --write my.json       # write every setting to a file to edit
```

- `roundtrip` re-encrypts every quest and both monster overlays without
  changing them and checks the result matches the disc byte for byte. If it
  passes, edited files are written the way the game expects to read them.
  It writes nothing.
- `randomize` copies the image (`.iso` or `.cso`; the output is always an
  `.iso`), shuffles, writes the changes in place, reads every changed file
  back to check it, and writes `random.spoiler.txt` next to the output.
  - `--dry-run` prints the spoiler log without writing an image.
  - `--spoiler <path>` writes the log somewhere else.
  - `--eboot <path>` / `--pspdecrypt-bin <name>`: how to decrypt the EBOOT
    for settings that edit it, as for `mhfu-extract unpack`. PPSSPP can
    dump it: turn on "Dump Decrypted Eboot.bin on game boot" and boot the
    game once.
  - `--force` overwrites an existing output file.

Settings come from these flags, later ones winning:

| Flag                                                          | What it sets                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--settings <file.json>`                                      | Any subset of settings, by name (`pnpm settings` lists them)                                                |
| `--settings-string <RF…>`                                     | A shared settings string, seed included                                                                     |
| `--shuffles <list>`                                           | Exactly these on: quest-rewards, monster-rewards, gathering, recipes, recipe-amounts, costs, weapons, shops |
| `--tiers`, `--amount-spread`, `--cost-spread`, `--weapon-mix` | Shorthand for single settings                                                                               |
| `--set key=value,key=value`                                   | Any setting by name                                                                                         |
| `--seed <seed>`                                               | The seed; without one, a random seed is chosen                                                              |

The same disc, seed and settings always give the same output. Each shuffle
draws from its own random stream, so turning one on or off doesn't change
what the others do. A settings string records the logic version
(`src/version.ts`); it must be bumped whenever a change alters a seed's
output, and loading a string made with another version warns that the
game will differ.

### Settings

All of them are defined once, in `src/settings.ts` (`OPTIONS`), which the
CLI, settings files, settings strings and the page all read: a new option
added there shows up everywhere.

| Setting                           | Default     | What it does                                                         |
| --------------------------------- | ----------- | -------------------------------------------------------------------- |
| `logic.tiers`                     | `star`      | How far items move: same star level, same rank, or anywhere (`none`) |
| `questRewards.enabled`            | on          | Shuffle quest rewards                                                |
| `monsterRewards.enabled`          | on          | Shuffle carves                                                       |
| `monsterRewards.captureAndBreaks` | on          | Include capture and break rewards                                    |
| `gathering.enabled`               | off         | Shuffle gathering points                                             |
| `recipes.materials`               | off         | Shuffle crafting and upgrade materials (EBOOT)                       |
| `recipes.amounts`                 | off         | Randomize material amounts (EBOOT)                                   |
| `recipes.amountSpread`            | 0.5         | How far amounts move (0.5 = 50% to 150%)                             |
| `recipes.maxQuantity`             | 99          | The most of one material a recipe can ask for                        |
| `costs.enabled`                   | off         | Randomize crafting costs (EBOOT)                                     |
| `costs.spread`                    | 0.5         | How far costs move                                                   |
| `weapons.enabled`                 | off         | Shuffle weapon progression (EBOOT)                                   |
| `weapons.mix`                     | `same-type` | Whether a place keeps its weapon type (`any-type` mixes the family)  |
| `shops.enabled`                   | off         | Randomize shops                                                      |
| `shops.pool`                      | `shop`      | What shops can sell: `shop` items, `low` / `high` rank items, `any`  |
| `shops.mix`                       | `each`      | Each shop has its own replacements, or `all` share them              |
| `shops.keepEssentials`            | on          | Keep Potion, Whetstone, pickaxes, bugnets, BBQ Spit, basic ammo      |
| `shops.special`                   | off         | Include the Armor Sphere, jewel and Pokke Ticket shop                |
| `shops.countSpread`               | 0           | How much more or fewer items each shop sells                         |
| `shops.prices`                    | off         | Randomize prices of what shops sell (EBOOT)                          |
| `shops.priceSpread`               | 0.5         | How far prices move                                                  |
| `shops.stacks`                    | off         | Randomize carry limits of what shops sell (EBOOT)                    |
| `shops.stackSpread`               | 0.5         | How far carry limits move                                            |

## Shuffles

No shuffle changes a list's length, so every edited file keeps its size.

| Shuffle           | Data                                                | What changes                                         |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `quest-rewards`   | `RewardTBL` items in each quest `.mib`              | Item and amount move; the chance stays with the slot |
| `monster-rewards` | Carve, capture and break lists in `game_sub.ovl`    | Item moves; chance and amount stay with the slot     |
| `gathering`       | Gathering item tables in each quest `.mib`          | Item moves; the value (weight) stays with the slot   |
| `recipes`         | `EquipmentCreate` / `EquipmentUpgrade` in the EBOOT | Material moves; quantity stays with the slot         |
| `recipe-amounts`  | The same recipe tables                              | Quantities, rescaled and varied (see below)          |
| `costs`           | Weapon, armor and decoration prices in the EBOOT    | Crafting and upgrade costs, varied in steps of 10z   |
| `weapons`         | Weapon create and upgrade entries in the EBOOT      | Which weapon each place makes (see below)            |
| `shops`           | Shop item lists in `lobby_task.ovl`                 | Which items each shop sells (see below)              |

### Logic

Items only move within a **tier**: a rank (Low, High or G) and a star level.
`logic.tiers` sets how strict that is: `star` (the default), `rank` (any
star level within Low, High or G Rank) or `none` (one pool: no logic, and
the recipe check below no longer means anything).

- A quest's tier is its header rank and star level. Only Village and Guild
  quests take part, on one star scale (Village 3★ and Guild 3★ are the same
  tier). Training School, Treasure Hunting, unused slots and the 90 unused
  gathering copies are left alone, so no item is moved somewhere a player
  can't reach, and they don't count as sources.
- A monster reward list takes part if it's used at exactly one rank, by a
  monster that appears in a Village or Guild quest at that rank. Its tier is
  the lowest star level of those quests.
- Gathering points count as sources. Only item tables a node uses count
  (`src/game/gathering.ts`), each `{ value, item }` pair once even when
  several nodes or table indices lead to it.
- An item's tier is the earliest one it's found at among those quest
  rewards, monster rewards and gathering points. A recipe slot is shuffled
  with other slots whose items have the same tier.

The reward and gathering shuffles keep every tier's items within that
tier, so every recipe material is still found at or before the star level
it was before. `checkRecipes` confirms this against the shuffled rewards
and gathering points; any failure is printed and listed at the top of the
spoiler log. The end of the log lists the tier found for every item, to
check against the game.

Items found only in shops, by combining or as tickets keep their recipe
slots.

`recipe-amounts` rescales each quantity to its material's usual amount:
the median quantity recipes ask for that item. A slot keeps its size
relative to that, so a slot that wanted 10 Iron Ore (usually 5) and now
takes a Tigrex Claw (usually 1) asks for 2. Then it's multiplied by a
random factor within `--amount-spread` and kept between 1 and 99.

`costs` multiplies each price by a random factor within `--cost-spread`. A
weapon's upgrade cost is its own price, so it changes too. A decoration's
price is also its sell price.

`weapons` gives each place in the smithy a different weapon of the same
rarity, and by default the same type. A place is a weapon's create entry
and its upgrade entry (the materials to make it by upgrading, and the
weapons it upgrades into). The place keeps its materials and links, so
every tree keeps its shape and pacing. The weapon keeps its own stats,
horn notes, shells, ammo and price. With `--weapon-mix any-type`, a place
can take any weapon of the same rarity in the same family (Blademaster or
Gunner). The game already upgrades across types within a family (Great
Sword to Long Sword, Lance to Gunlance and more), but never between bows
and bowguns, so that pairing is untested. Weapons from Ancient/Rusted
shards stay put. It runs before the recipe shuffles, which then shuffle
the tables it left.

`gathering` moves item IDs between the gathering item tables of Village
and Guild quests of the same tier, like the quest reward shuffle. A pair's
first field (taken to be the item's weight) stays with the pair, so a
node keeps its odds; tables keep their length and the quest file its
size. Only pairs in tables a node uses move: an unused table keeps its
items, and so do Training School, Treasure Hunting and the unused
gathering copies. A pair with item 0 is left as it is.

`shops` changes the shops. They live in `overlay/lobby_task.ovl`: each
shop's stock is a list of u16 item IDs ending in 0xFFFF, one list per stage
of the game, and the game picks one from a table of pointers per shop
(each ending in a 0 word). On the EU disc the tables are at 0xa7da8: the
village general store (8 stages), the peddling granny's pools (her table
also uses two Guild lists), the Guild Hall store (9 stages) and a shop of
Armor Spheres, jewels and Pokke Tickets. They're found by their shape, from
the table holding the general store's list (Herb, Potion, Antidote,
Whetstone), not by address; `shop-scan` and `shop-lists` are the research
commands that found them.

- **Stock**: each item a shop sells is replaced by one drawn from the pool
  (`shops.pool`: the shops' own items, items first found in Low or High
  Rank, or any item in the game), the same in every stage. Shops sharing a
  list share replacements (or all shops do, with `shops.mix all`).
- **How many**: with `shops.countSpread`, each shop's lists scale by one
  factor, so later stages still sell what earlier ones did (stages nest by
  construction: items are kept in an order of pinned items, then by the
  stage they first appear in, then extra pool items). No list grows past
  the longest one on the disc (83), since the shop screen's limit is
  unknown. Lists that change length are rewritten back to back in the
  space the lists use now and the pointer tables are updated; shops can
  only grow into space others free, so growth is scaled back until it
  fits. This refuses to run if that space holds anything but lists and
  padding. Without it, lists stay where they are.
- **Prices and carry limits** are the item's own (EBOOT item table), so
  they apply wherever the item is. The buy price field isn't documented:
  randomfu finds it on the disc as the one field holding the general
  store's prices (Herb 20z, Potion 66z, ...) and checks the carry limit
  byte (+3) against Potion 10 and Whetstone 20, refusing to edit if they
  don't match. Any item a shop now sells that has no price gets one from
  its rarity (100z × (rarity + 1)²), so nothing is free; that needs the
  EBOOT, so without it, wide pools may sell some items for free.

## How it writes the disc

- **DATA.BIN** files are encrypted with a key seeded from their start
  sector. An edited file that keeps its size is re-encrypted and written
  where it was; nothing else in DATA.BIN changes (`src/disc/databin.ts`).
- **Quests** are re-sealed with their original seeds and a new salted SHA1,
  sector padding included, so an unchanged quest re-seals byte for byte
  (`src/disc/quest-file.ts`).
- **EBOOT.BIN** is written back as the decrypted, unsigned ELF. It's
  replaced in place if it fits its old sectors; otherwise it's moved to the
  end of the image, and its directory record and the volume size are
  updated (`src/disc/image.ts`). PPSSPP is expected to run it; that isn't
  confirmed yet.

## Open questions

- Whether files inside DATA.BIN can grow. Needed for quest edits that add
  data, such as new monsters.
- Monster swaps in quests: each `LargeMonTable` also has a preload list
  (`emLoadTable`) that would need updating, and which monsters can share a
  quest is limited by overlay memory.

## Tests

```bash
pnpm test
node_modules/.bin/tsc --noEmit -p .
```

The tests build a small fake disc (ISO 9660, PARAM.SFO, an encrypted
DATA.BIN with quests and a reward overlay, an EBOOT with recipes) and run
the whole pipeline on it, including the CLI.
