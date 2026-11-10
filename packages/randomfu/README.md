# randomfu

A seeded randomizer for **Monster Hunter Freedom Unite / Monster Hunter
Portable 2nd G**. It reads your own disc image, shuffles game data, and
writes a new ISO plus a spoiler log. It never ships game data: like other
randomizers, it only edits a copy of a disc you supply.

Licensed **GPL-3.0-or-later** (see `LICENSE`), because it builds on
`packages/mhfu-extract`'s readers and ciphers, which are GPL.

**Never commit a disc image, a randomized image or a spoiler log.**

## Status

Early. On the EU disc, PPSSPP boots a randomized image and the smithy shows
the shuffled recipe materials. `supplies`, `terms` and `deliveries` are
checked against the EU disc's quest files (every changed quest re-reads as
expected) but not yet played in game. Star-level tiers, gathering sources,
`recipe-amounts`, `costs`, `armor` and `gathering` are so far tested only
against the synthetic disc the tests build (`test/fixtures.ts`). `armor-skills`
has been written to the EU disc and read back, but not yet played. A PSP
with custom firmware isn't tested. Run `roundtrip` on a new disc first. In-process EBOOT
decryption is also tested only on synthetic EBOOTs so far; until it has run
on a real disc, a PPSSPP dump (`--eboot`) is the proven path.

## Usage

### The settings page

```bash
# from packages/randomfu
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

The same randomizer also runs entirely in the browser, as a static web app:
see `apps/randomfu` (its README covers how it works).

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

| Flag                                                          | What it sets                                                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--settings <file.json>`                                      | Any subset of settings, by name (`pnpm settings` lists them)                                                                                                                     |
| `--settings-string <RF…>`                                     | A shared settings string, seed included                                                                                                                                          |
| `--shuffles <list>`                                           | Exactly these on: quest-rewards, monster-rewards, gathering, recipes, recipe-amounts, costs, weapons, armor, armor-skills, shops, supplies, quest-money, time-limits, deliveries |
| `--tiers`, `--amount-spread`, `--cost-spread`, `--weapon-mix` | Shorthand for single settings                                                                                                                                                    |
| `--set key=value,key=value`                                   | Any setting by name                                                                                                                                                              |
| `--seed <seed>`                                               | The seed; without one, a random seed is chosen                                                                                                                                   |

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

| Setting                           | Default     | What it does                                                                      |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `logic.tiers`                     | `star`      | How far items move: same star level, same rank, or anywhere (`none`)              |
| `questRewards.enabled`            | on          | Shuffle quest rewards                                                             |
| `monsterRewards.enabled`          | on          | Shuffle carves                                                                    |
| `monsterRewards.captureAndBreaks` | on          | Include capture and break rewards                                                 |
| `gathering.enabled`               | off         | Shuffle gathering points                                                          |
| `gathering.pool`                  | `gathered`  | What spots give: items you could gather, any item of the same `rank`, or `any`    |
| `gathering.keepItems`             | on          | With a wider pool, every gatherable item stays findable at its point in the game  |
| `supplies.enabled`                | off         | Randomize supply boxes                                                            |
| `supplies.pool`                   | `supplies`  | Supply box items, any item of the same `rank`, or `add` random stacks to each box |
| `supplies.keepEssentials`         | on          | Keep Maps, ballista and cannon ammo and the other quest-only supplies             |
| `terms.money`                     | off         | Randomize quest fees, rewards and penalties                                       |
| `terms.moneySpread`               | 0.5         | How far they move                                                                 |
| `terms.time`                      | off         | Randomize time limits                                                             |
| `terms.timeSpread`                | 0.3         | How far they move (always within 20 to 50 minutes)                                |
| `deliveries.enabled`              | off         | Randomize what delivery quests ask for                                            |
| `recipes.materials`               | off         | Shuffle crafting and upgrade materials (EBOOT)                                    |
| `recipes.amounts`                 | off         | Randomize material amounts (EBOOT)                                                |
| `recipes.amountSpread`            | 0.5         | How far amounts move (0.5 = 50% to 150%)                                          |
| `recipes.maxQuantity`             | 99          | The most of one material a recipe can ask for                                     |
| `costs.enabled`                   | off         | Randomize crafting costs (EBOOT)                                                  |
| `costs.spread`                    | 0.5         | How far costs move                                                                |
| `weapons.enabled`                 | off         | Shuffle weapon progression (EBOOT)                                                |
| `weapons.mix`                     | `same-type` | Whether a place keeps its weapon type (`any-type` mixes the family)               |
| `armor.enabled`                   | off         | Shuffle armor progression (EBOOT)                                                 |
| `armorSkills.enabled`             | off         | Change armor skills (EBOOT)                                                       |
| `armorSkills.mode`                | `shuffle`   | Pieces trade their skill points, or `randomize`: new trees and points             |
| `armorSkills.keepArmorOnly`       | on          | Skill trees no decoration has stay on their pieces                                |
| `shops.enabled`                   | off         | Randomize shops                                                                   |
| `shops.pool`                      | `shop`      | What shops can sell: `shop` items, `low` / `high` rank items, `any`               |
| `shops.mix`                       | `each`      | Each shop has its own replacements, or `all` share them                           |
| `shops.keepEssentials`            | on          | Keep Potion, Whetstone, pickaxes, bugnets, BBQ Spit, basic ammo                   |
| `shops.special`                   | off         | Include the Armor Sphere, jewel and Pokke Ticket shop                             |
| `shops.countSpread`               | 0           | How much more or fewer items each shop sells                                      |
| `shops.prices`                    | off         | Randomize prices of what shops sell (EBOOT)                                       |
| `shops.priceSpread`               | 0.5         | How far prices move                                                               |
| `shops.stacks`                    | off         | Randomize carry limits of what shops sell (EBOOT)                                 |
| `shops.stackSpread`               | 0.5         | How far carry limits move                                                         |

## Shuffles

No shuffle changes a list's length, so every edited file keeps its size,
except `supplies.pool add`, which grows quests into their sector padding
(see below).

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
| `armor-skills`    | `ArmorValues` skill entries in the EBOOT            | Each piece's skill trees and points (see below)      |
| `shops`           | Shop item lists in `lobby_task.ovl`                 | Which items each shop sells (see below)              |
| `supplies`        | Supply box lists in each quest `.mib`               | Item and amount of each stack (see below)            |
| `terms`           | Quest header fee, reward, penalty, time limit       | The numbers, varied (see below)                      |
| `deliveries`      | Delivery quest header target and goal line          | Which item and how many (see below)                  |

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

`armor-skills` changes the skill points on each piece the smithy makes.
A piece's `ArmorValue` has five entries of a skill tree (u8) and points
(s8); tree 0 is empty. The game reads all five (108 EU pieces have an empty
entry between filled ones), so entries keep their positions and empty ones
stay empty. Every piece keeps how many skills it has and which are
negative, and no piece gets a tree it already lists.

- **shuffle** (`armorSkills.mode shuffle`): filled entries, tree and points
  together, trade places between pieces of the same rarity and hunter
  type (Blademaster only, Gunner only, or both), positive with positive
  and negative with negative. Each rarity keeps the same skill points, so
  Gunner skills stay on Gunner pieces as they were. If every attempt puts
  a tree twice on some piece, the groups with a repeat keep their skills
  where they were (the spoiler says how many).
- **randomize**: each filled entry gets a new tree, never one the piece
  already has, and new points of the same sign. The trees are the ones
  the disc's armor and decorations use, for the pieces the disc puts them
  on: a tree on both Blademaster-only and Gunner-only pieces (or only on
  decorations) suits anyone; one on Blademaster-only pieces but no
  Gunner-only ones (Sharpness, Guard) goes only to Blademaster-only
  pieces, and likewise for Gunner trees (Reload, Recoil); one only on
  pieces both can wear (Auto-Guard) goes only to those. Pieces both can
  wear get trees that suit anyone and those. The size of the points is
  drawn from the sizes of that sign at that rarity on the disc.

Torso Up entries (tree 1) and entries with 0 points never move, and Torso
Up is never drawn. With
`armorSkills.keepArmorOnly` (on by default), neither are trees no
decoration adds points to: armor is their only source, usually a set's
pieces together (seven trees on the EU disc, Edgemaster and Fury among
them). Shuffled, six of the seven fell below +10 from armor alone. The
spoiler lists, for each of these trees, the most points armor alone gives
one hunter: a piece per slot that one hunter type and sex can wear, with
Torso Up pieces adding the chest's points again. Skill activation thresholds aren't read:
mhfu-extract has no table for them, none was found in the EBOOT, and
neither mode needs them. Skills are a piece's own, so with `armor` they go
with the piece to its new place.

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

`supplies` changes what each quest's supply box holds. The box is a list
of `{ u16 item, u16 amount }` at the header's `SuppliesPTR`, ending at item
0 (whose amount field holds the quest ID). On the EU disc every quest has
exactly one such list; nothing else points into it, and the header's
`SupplyCond` (+70) is a flag, not a second list, so it's left alone and
each entry is rewritten in place. Guild quests list a stack once per
hunter (four Maps), so runs of identical entries change together. With
`supplies.pool supplies` (the default) item and amount move between
quests of the same tier; `rank` gives random items first found at the
quest's rank, in their usual amount (the median a supply box, else a quest
reward, gives of them). With `supplies.keepEssentials`, quest-only items
(Map, First-Aid Med, Ration, the supply-only tools, ballista and cannon
ammo) stay; `rank` never hands them out, nor carried objects.

`supplies.pool add` (the Chaos preset) keeps every box as it is and adds
up to 4 stacks of random items (any item but quest-only ones, none the box
already has), in their usual amount. The list can't grow where it is (the
gathering tables follow it), so the box, the new stacks and the same end
marker are copied to the end of the quest and `SuppliesPTR` points there;
the old list stays, unread. The quest grows into its DATA.BIN entry's
sector padding (the entry's size field says where the quest ends), so
DATA.BIN keeps its layout. No quest grows past the largest quest on the
disc (10,680 bytes on EU) and no box past the largest box (32 stacks),
sizes the game already handles; boxes without room get fewer stacks or
none. A quest's own delivery item (the
Paw Pass Ticket) always stays, and in every mode no delivery quest's box
gets the item it asks for (a permutation that would put it there swaps it
with another stack of the same tier). Quest-only items include the
monster Info items and the Steel, Silver and Golden Eggs (which may be
carried objects in Treasure Hunting). Supply items aren't item sources for the
tier logic: whether the game takes back what isn't used isn't known.

`terms` changes the quest board numbers in each Village and Guild quest's
header: fee (+80), reward (+84), penalty (+88) and time limit (+92, in
ticks of 1/1800 minute). Reward and penalty share one factor within
`terms.moneySpread` (on the disc the penalty is a fixed share of the
reward), the fee gets its own and never exceeds the reward; all in steps of
10z. Time limits change in whole minutes within `terms.timeSpread`, kept
between the shortest and longest on the disc (20 and 50 minutes), since
longer limits haven't been seen in game.

`deliveries` changes what Village and Guild delivery quests ask for. A
delivery quest has 2 in the quest type's first byte (+76); `TargetID`
(+112) is then the item and `TargetNum` (+114) the amount, and the quest
script doesn't name the item. The new item is one the quest's own
gathering points give (after the gathering shuffle), never a quest-only
item or carried object, and never in its supply box; fishing and carves
aren't read, so fishing and carving deliveries become gathering ones. Its
amount is the same share of what the quest's points give (each node's
fewest gathers × the item's chance) as the old amount was of the old
item's, or the median share for quests whose item wasn't gathered, and
never more than the points give; items at least half as plentiful as the
old one are preferred. The goal line ("Deliver Coal x15") is rewritten in
place, in English for every language (item names are English only); the
quest description still names the old item. "Survive until Time Over or
Deliver the Paw Pass Ticket" quests stay as they are.

The gathering shuffle never moves a delivery quest's own item away from
its gathering points, whether or not `deliveries` is on, so every delivery
quest can still be finished.

## How it writes the disc

- **DATA.BIN** files are encrypted with a key seeded from their start
  sector. An edited file that keeps its size is re-encrypted and written
  where it was; nothing else in DATA.BIN changes (`src/disc/databin.ts`).
- **Quests** are re-sealed with their original seeds and a new salted SHA1,
  sector padding included, so an unchanged quest re-seals byte for byte
  (`src/disc/quest-file.ts`). A quest can grow into its own sector
  padding: its size field and hash cover the longer payload, and the
  entry keeps its sectors.
- **EBOOT.BIN** is written back as the decrypted, unsigned ELF. It's
  replaced in place if it fits its old sectors; otherwise it's moved to the
  end of the image, and its directory record and the volume size are
  updated (`src/disc/image.ts`). PPSSPP is expected to run it; that isn't
  confirmed yet.

## Open questions

- Whether files inside DATA.BIN can grow past their sectors. Needed for
  quest edits that add more data than the padding holds, such as new
  monsters. Growing within the padding (`supplies.pool add`) isn't
  confirmed in game yet either.
- Monster swaps in quests: each `LargeMonTable` also has a preload list
  (`emLoadTable`) that would need updating, and which monsters can share a
  quest is limited by overlay memory.

## Tests

```bash
pnpm test
pnpm typecheck
```

The tests build a small fake disc (ISO 9660, PARAM.SFO, an encrypted
DATA.BIN with quests and a reward overlay, an EBOOT with recipes) and run
the whole pipeline on it, including the CLI.
