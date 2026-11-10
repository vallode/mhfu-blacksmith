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
`recipe-amounts`, `costs`, `armor` and `gathering` are so far tested only
against the synthetic disc the tests build (`test/fixtures.ts`). A PSP
with custom firmware isn't tested. Run `roundtrip` on a new disc first. In-process EBOOT
decryption is also tested only on synthetic EBOOTs so far; until it has run
on a real disc, a PPSSPP dump (`--eboot`) is the proven path.

## Usage

### The settings page

```bash
# from tools/randomfu
pnpm gui
```

This starts a small server on your computer and opens a page in your
browser (or prints its address). On it you can:

- enter the paths to your disc and the output (and a decrypted EBOOT, if
  the disc's can't be decrypted in-process), and check them;
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

### The web app

`web/` is the same randomizer as a static web app that runs entirely in the
browser. It's a step-by-step builder: pick your ISO, choose a seed and a
preset (or load a shared settings string), go through the options a group
at a time (Logic, Rewards, Gathering, Monsters, Smithy, Shops), review, and download
the randomized ISO and spoiler log. Nothing is uploaded. Settings that
change the EBOOT decrypt the disc's own in the browser; only if that fails
does the app ask for a PPSSPP EBOOT dump.

The steps for options come from `OPTIONS`' sections (`OPTION_STEPS` in
`web/app.ts`); a section no step lists gets a step of its own, so new
options always show up. The page is styled after the MHFU Blacksmith site:
`web/build.mjs` reads the site's design tokens and in-game frames from
`src/app/globals.css` and copies its font and sprites from `public/`, and
`web/style.css` uses them.

```bash
pnpm build:web      # builds web/dist: index.html, app.js, worker.js
pnpm test:web       # builds, then checks the app in Chromium against the CLI
```

`web/dist` is a plain static site: host it anywhere (GitHub Pages, Netlify,
any web server). How it works:

- The randomizer runs in a worker (`web/worker.ts`) and reads the ISO with
  `FileReaderSync`, so the shared code's synchronous reads work unchanged.
- Writes go to an `OverlaySource` (`src/disc/image.ts`): a 2 KB sector is
  copied into memory the first time it's written. The finished ISO is a
  Blob of slices of the user's own file plus the changed sectors, so the
  disc is never copied into memory (a few MB of changes for a full run).
- The Node-only modules the shared code imports are swapped for browser
  versions at build time (`web/shims`): SHA-1/SHA-256 (tested against
  Node's), the vendored file list and name tables (embedded), and
  `Buffer` (the `buffer` package).
- The EBOOT is decrypted in-process (`mhfu-extract/src/container/prx.ts`,
  see its README), which runs in the worker as it does in Node.
- `pnpm test:web` walks through every step with a fixture disc whose EBOOT
  is encrypted like a real one, randomizes with every shuffle on, and
  checks the downloaded ISO is byte for byte the CLI's for the same
  settings; then a disc whose EBOOT can't be decrypted, with a dump
  instead. It needs Playwright's Chromium.
- CSO images aren't read in the browser yet: decompress to ISO first.

It's licensed GPL-3.0-or-later like the rest of randomfu; the build ships
`LICENSE.txt`, and its source maps carry the full source.

### The command line

```bash
pnpm roundtrip --iso /path/to/mhp2g.iso
pnpm eboot-info --iso /path/to/mhp2g.iso [--eboot dump.bin]   # how the EBOOT decrypts
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
  - `--eboot <path>` / `--pspdecrypt-bin <name>`: only needed if the
    disc's EBOOT can't be decrypted in-process (see `mhfu-extract unpack`).
    PPSSPP can dump it: turn on "Dump Decrypted Eboot.bin on game boot" and
    boot the game once.
  - `--force` overwrites an existing output file.

Settings come from these flags, later ones winning:

| Flag                                                          | What it sets                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--settings <file.json>`                                      | Any subset of settings, by name (`pnpm settings` lists them)                                                       |
| `--settings-string <RF…>`                                     | A shared settings string, seed included                                                                            |
| `--shuffles <list>`                                           | Exactly these on: quest-rewards, monster-rewards, gathering, recipes, recipe-amounts, costs, weapons, armor, shops |
| `--tiers`, `--amount-spread`, `--cost-spread`, `--weapon-mix` | Shorthand for single settings                                                                                      |
| `--set key=value,key=value`                                   | Any setting by name                                                                                                |
| `--seed <seed>`                                               | The seed; without one, a random seed is chosen                                                                     |

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

| Setting                           | Default     | What it does                                                                     |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `logic.tiers`                     | `star`      | How far items move: same star level, same rank, or anywhere (`none`)             |
| `questRewards.enabled`            | on          | Shuffle quest rewards                                                            |
| `monsterRewards.enabled`          | on          | Shuffle carves                                                                   |
| `monsterRewards.captureAndBreaks` | on          | Include capture and break rewards                                                |
| `gathering.enabled`               | off         | Shuffle gathering points                                                         |
| `gathering.pool`                  | `gathered`  | What spots give: items you could gather, any item of the same `rank`, or `any`   |
| `gathering.keepItems`             | on          | With a wider pool, every gatherable item stays findable at its point in the game |
| `recipes.materials`               | off         | Shuffle crafting and upgrade materials (EBOOT)                                   |
| `recipes.amounts`                 | off         | Randomize material amounts (EBOOT)                                               |
| `recipes.amountSpread`            | 0.5         | How far amounts move (0.5 = 50% to 150%)                                         |
| `recipes.maxQuantity`             | 99          | The most of one material a recipe can ask for                                    |
| `costs.enabled`                   | off         | Randomize crafting costs (EBOOT)                                                 |
| `costs.spread`                    | 0.5         | How far costs move                                                               |
| `weapons.enabled`                 | off         | Shuffle weapon progression (EBOOT)                                               |
| `weapons.mix`                     | `same-type` | Whether a place keeps its weapon type (`any-type` mixes the family)              |
| `armor.enabled`                   | off         | Shuffle armor progression (EBOOT)                                                |
| `shops.enabled`                   | off         | Randomize shops                                                                  |
| `shops.pool`                      | `shop`      | What shops can sell: `shop` items, `low` / `high` rank items, `any`              |
| `shops.mix`                       | `each`      | Each shop has its own replacements, or `all` share them                          |
| `shops.keepEssentials`            | on          | Keep Potion, Whetstone, pickaxes, bugnets, BBQ Spit, basic ammo                  |
| `shops.special`                   | off         | Include the Armor Sphere, jewel and Pokke Ticket shop                            |
| `shops.countSpread`               | 0           | How much more or fewer items each shop sells                                     |
| `shops.prices`                    | off         | Randomize prices of what shops sell (EBOOT)                                      |
| `shops.priceSpread`               | 0.5         | How far prices move                                                              |
| `shops.stacks`                    | off         | Randomize carry limits of what shops sell (EBOOT)                                |
| `shops.stackSpread`               | 0.5         | How far carry limits move                                                        |
| `questMonsters.species`           | off         | Swap large monsters in quests                                                    |
| `questMonsters.speciesPool`       | `variants`  | Into one of their `variants`, any monster of the same `rank`, or `any`           |
| `questMonsters.text`              | on          | Rename swapped monsters in the quest's text                                      |
| `questMonsters.difficulty`        | off         | Randomize each large monster's difficulty level (`power`)                        |
| `questMonsters.difficultySpread`  | 4           | How many levels it can move                                                      |
| `questMonsters.difficultyRange`   | `rank`      | Levels quests of the same rank use, or `any` level quests use                    |
| `questMonsters.smallCounts`       | off         | Randomize small monster counts                                                   |
| `questMonsters.smallCountSpread`  | 0.5         | How far counts move                                                              |
| `monsterStats.hp`                 | off         | Randomize each monster's base HP                                                 |
| `monsterStats.hpSpread`           | 0.25        | How far HP moves                                                                 |
| `monsterStats.size`               | off         | Randomize each monster's base size                                               |
| `monsterStats.sizeSpread`         | 0.2         | How far size moves (at most 50%)                                                 |
| `monsterStats.status`             | off         | Randomize poison, paralysis, sleep and KO resistance                             |
| `monsterStats.statusSpread`       | 0.5         | How far resistances move                                                         |
| `weaknesses.elements`             | off         | Shuffle each monster's elemental weaknesses                                      |
| `weaknesses.parts`                | off         | Shuffle which body parts are weak                                                |

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
| `armor`           | Armor create entries in the EBOOT                   | Which piece each place makes (see below)             |
| `shops`           | Shop item lists in `lobby_task.ovl`                 | Which items each shop sells (see below)              |
| quest monsters    | Spawn records in each quest `.mib`                  | Which large monsters, their level, small counts      |
| monster stats     | Each monster's `emChunk` in `game_task.ovl`         | Base HP, size, status resistance                     |
| weaknesses        | Hitzone tables in `game_task.ovl`                   | Elemental weaknesses and weak spots                  |

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

`gathering.pool` widens what spots give. `rank`: any item first found at
the quest's rank (Low, High or G), monster parts included; `any`: any item
in the game. With `gathering.keepItems` (on by default), each item the
spots of a tier gave is first put back in one random spot of that tier,
so it's still found at the same point in the game and recipes stay
craftable; the other spots get random pool items (avoiding repeats within
a table). Off, items you could gather may be found nowhere, and the recipe
check reports any recipe that can't be made as early as before.

`armor` gives each armor place in the smithy (a create entry) a different
piece of the same slot and rarity, wearable by the same hunters. A piece's
`HunterType` is a bit field (1 male, 2 female, 4 Blademaster, 8 Gunner),
and pieces only trade with pieces of the same rarity and the same value,
so a place both sexes could use never gets a male- or female-only piece,
and a Gunner place never gets a Blademaster piece. One substitution per
slot is applied to every create entry, so where a piece had two recipes,
both now make the same new piece. The place keeps its materials and the
rest of its entry; the piece keeps its stats, skills, slots, sphere caps
and price. Piece 0 (unused entries), pieces no create entry makes and
pieces with no `HunterType` bits stay put. Blademaster and Gunner pieces
never mix: the permutation keeps every piece in the smithy either way,
but nothing has shown how the smithy treats a place whose piece is for
the other type, so there's no option for it. Like `weapons`, it runs
before the recipe shuffles, whose spoiler lines then name the new pieces.

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

### Monsters

None of the monster options have been tried on a real disc yet, so they're
in no preset. They're all in-place edits, so every file keeps its size.

**Quest monsters** (`src/shuffles/quest-monsters.ts`) edit the spawn
records of Village and Guild quests (`src/game/spawns.ts`): each
`LargeMonData` and `SmallMonData` record, and the large monsters' preload
list (`emLoadTable`).

- **Species.** A swap rewrites every data and preload entry for the
  monster, and the header's `TargetID` if it names it. A monster only goes
  to a map (day and night alike) where a Village or Guild quest already has
  it as a large monster: Lao-Shan Lung stays at the Fortress, and swimmers
  stay where there's water, lava or sand. Each species' code is in an
  `emNN.ovl`, and those share load addresses, so nothing shows which
  monsters can be loaded together. Variants use their base species'
  overlay, so `variants` (Rathian, Pink Rathian, Gold Rathian; Velocidrome,
  Gendrome, Iodrome, Giadrome; ... `MONSTER_FAMILIES`) changes every quest;
  `rank` and `any` only change quests with one kind of large monster. Any
  monster in the quest's script (not decoded, see below) is still the old
  one. Carves follow the monster: the reward shuffles and recipe check use
  the star levels monsters are met at after the swap.
- **Text** (`questMonsters.text`, `src/shuffles/quest-text.ts`,
  `src/game/quest-text.ts`). Swapped monsters are renamed in the quest's
  six strings (title, goal, fail, details, monster list, client) in every
  language slot. The slots follow the game's language IDs (Japanese,
  English, German, French, Spanish, Italian, Korean; the EU disc puts
  English in the Japanese and Korean slots).
  - Names aren't shipped: they're learned from the disc's own quests, per
    slot. The monster list is split into names; a monster's name is the
    piece most often in the list and goal of quests that have it, and least
    often in quests that don't. A piece two monsters share, or a tie, names
    neither. The tests check this only on invented text: how the real
    monster list is laid out (one name per line, or commas) hasn't been
    seen, and if it isn't split as expected, no names are learned and no
    text changes.
  - A name's article is the word most often just before it in goals ("the",
    "den", "l'"). A name is only replaced by one with the same article, so
    German, French, Spanish and Italian text keeps the old name when the
    new monster takes another article. Pronouns ("she", "sie") never
    change.
  - The text is wrapped by hand, so each field's longest line in that
    language is its width, and a rename that makes a line longer is
    skipped.
  - The quest keeps its size. A rename that isn't longer is written in
    place. Otherwise the quest's strings are repacked into the bytes they
    already take (runs of strings with at most 3 zero bytes between them),
    identical strings stored once (the JP disc shows the game reads shared
    strings) and the pointers updated. If strings overlap or a pointer
    table sits among them, nothing is moved. Room goes to the goal first,
    then the monster list, title, client, fail text and details.
  - A string that can't be renamed keeps its old text and is listed in the
    spoiler log with why: no learned name, another article, too wide, or no
    room.
- **Difficulty** is the `power` byte, the row of the quest's stat
  multiplier table (HP, attack, defense, status; mhfu-extract
  `monsters/multipliers.ts`). New levels stay within the levels Village and
  Guild quests using the same table set use (header rank 0 picks set 0,
  the rest set 1), and with `rank`, the same rank too: rows past those may
  be filler.
- **Small monster counts** are the records' quantity byte, scaled and kept
  between 1 and the most any quest has. Counts of 0 and 99 (which looks
  like "keeps coming") are left alone.

**Monster stats and weaknesses** (`src/shuffles/monster-stats.ts`) edit the
`emChunk` of every monster some quest spawns, in `game_task.ovl`
(mhfu-extract `monsters/hitzones.ts`), so they apply everywhere the
monster appears. Chunks for non-monsters are left alone, and so are
hitzone tables they share.

- **HP** is the u16 base HP (`+0x100`), **size** the f32 base scale
  (`+0x40`), **status resistance** the `initial` and `increase` fields of
  paralysis, KO, sleep and poison (`+0x110`); 0 and 0xFFFF stay.
- **Elements**: one random order of fire, water, ice, thunder and dragon
  per monster, applied to every row of every hitzone table.
- **Weak spots**: one random order of the monster's body-part rows, applied
  to each of its tables (normal, broken, enraged), moving the nine values
  and leaving each row's lead byte. Only rows the site names a part for
  (mhfu-extract `overlay/monsters.json`) take part, since the rest may be
  filler; small monsters (one row) don't change. Breaks and flinch
  thresholds belong to the body part, not the row, so they don't move.
  Variants that share their base species' tables change with it.

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
  data, such as new monsters. Other tools rebuild DATA.BIN with bigger
  files (IncognitoMan's `mhff`, which FUComplete uses, shifts every later
  file), but the game also loads files into fixed buffers (FUComplete's
  docs give per-file limits for player models), and nothing shows how big
  a quest buffer is. A quest's payload also states its own size, so growing
  it into its entry's sector padding is a change of size too. randomfu does
  neither: quest text is repacked within the quest's own bytes.
- Which monsters can share a quest. Swaps update the preload list
  (`emLoadTable`), but overlay memory limits which species load together,
  so wide swaps only touch quests with one kind of large monster.
- Whether a swapped monster can spawn in its predecessor's starting area
  (`LargeMonData.Stage`): swaps only check the map.
- Per-quest monster size. The header's `MonSizeModifier` and the large
  monsters' `attr1`/`attr2` bytes are undecoded, and no public source
  decodes them, so size changes are per species (the chunk's base scale),
  and whether the hitboxes scale with it is untested. mhfu-extract's
  README ("Monster size") has what's known and how to settle it with a
  disc; `extract --raw` dumps every candidate byte.
- The quest script. Packets are an opcode and three arguments. In MH1,
  opcode `02` sets a monster goal by monster ID; MHP2G's scripts look
  generic across quests and its header has `TargetID`/`TargetNum`
  (updated on a swap), so its goals probably come from the header, but
  that isn't confirmed (mhfu-extract README, "Quest script"). If a script
  does name the monster, a swapped quest would count the old one.
- Quest text on a real disc: the monster list's layout, whether the EU
  English slots share strings, and so how much room there is to rename.
- Large monster counts. What `quantity` means for a large monster, and how
  it relates to the header's `TargetNum` and the quest script, isn't known.
- Attack patterns and animations. Monster AI lives in code (`game_task.ovl`
  and each `emNN.ovl`) and the motion banks (each `emmodel/emNN.pac`'s entry 3) aren't decoded, so there's nothing to shuffle yet.

## Tests

```bash
pnpm test
node_modules/.bin/tsc --noEmit -p .
```

The tests build a small fake disc (ISO 9660, PARAM.SFO, an encrypted
DATA.BIN with quests and a reward overlay, an EBOOT with recipes) and run
the whole pipeline on it, including the CLI.
