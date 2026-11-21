# randomfu

A seeded randomizer for **Monster Hunter Freedom Unite / Monster Hunter
Portable 2nd G**. It reads your own disc image, shuffles game data, and
writes a new ISO plus a spoiler log. It never ships game data: like other
randomizers, it only edits a copy of a disc you supply.

This package is the randomizer itself. You use it through the web app,
`apps/randomfu` ([randomfu.vallode.com](https://randomfu.vallode.com)),
which runs it in your browser; its README covers how.

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
has been written to the EU disc and read back, but not yet played; so have
quest maps, monster starts, small monster species and the wider quest
reward pools, and `questGoals` (its goals and board copies re-read as written
over six seeds with every monster option on; no capture goal has been played
yet). Armor stats have been run over the EU disc's tables, and
defense played in PPSSPP past 127 and 255 (see "Armor stats"); the presets
turn them on, rarity included, though what the game reads armor rarity
for hasn't been checked. A PSP
with custom firmware isn't tested.

## Running it

`src/run.ts` (`runRandomizer`) runs it end to end over a disc image:
load, shuffle, write the changes, read every changed file back to check
it, and format the spoiler log. Writes are kept in memory over the image
(`OverlaySource`, `src/disc/image.ts`), and the result is the finished
image as ranges of the original plus the changed bytes, so the original is
never written to. A dry run returns the spoiler log only.

The same disc, seed and settings always give the same output. Each shuffle
draws from its own random stream, so turning one on or off doesn't change
what the others do. A settings string records the logic version
(`src/version.ts`); it must be bumped whenever a change alters a seed's
output, and loading a string made with another version warns that the
game will differ.

## Options

All of them are defined once, in `src/settings.ts` (`OPTIONS`), which the
web app's pages, settings files and settings strings all read: a new
option added there shows up everywhere.

Each option either **shuffles** or **randomizes** (its `action`, which the
web app shows as a tag):

- A shuffle moves what's already in the game to new places: quest rewards,
  carves, gathering points, supply boxes, recipe materials, the smithy's
  weapons and armor, armor skills (`armorSkills.mode shuffle`), shop stock,
  the large and small monsters in quests, quests' maps and where their
  monsters start, and monsters' weaknesses. Nothing new is
  made; a weapon keeps its own stats wherever it turns up (randomized or
  not).
- A randomizer rolls new values: material amounts, crafting costs, shop
  prices, carry limits and stock size, quest rewards (`questRewards.mode randomize`), quest money and time limits,
  delivery targets, monster difficulty, size, crown spread, small monster counts, base HP
  and status resistance, new armor skills (`armorSkills.mode` `randomize`),
  and weapons' attack, affinity and element or status values.

| Setting                           | Default     | What it does                                                                                           |
| --------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `questRewards.mode`               | `shuffle`   | `off`, `shuffle` reward slots between quests, or `randomize` them                                      |
| `questRewards.scope`              | `star`      | How far slots trade, or items are drawn from: `star`, `rank`, `adjacent` ranks or `any`                |
| `questRewards.slots`              | ±30%        | With `randomize`: how far a main reward list's number of slots can move                                |
| `questRewards.keepItems`          | on          | With `randomize`, every reward item stays a reward at its star level                                   |
| `questRewards.draws`              | 0%          | How far the number of times a main reward list is drawn (`Unkn2 >> 8`) can move; any mode              |
| `questRewards.chances`            | `rarity`    | With `randomize`: chances `rarity` (the list's own), `reasonable` (×0.5 to 2) or `any`                 |
| `monsterRewards.mode`             | `shuffle`   | `off`, `shuffle` carves and shiny drops between monsters, or `randomize` them                          |
| `monsterRewards.scope`            | `star`      | How far slots trade, or items are drawn from: `star`, `rank`, `adjacent` ranks or `any`                |
| `monsterRewards.chances`          | `rarity`    | With `randomize`: chances `rarity` (the list's own), `reasonable` (×0.5 to 2) or `any`                 |
| `monsterRewards.captureAndBreaks` | on          | Include capture and break rewards                                                                      |
| `carveCounts.mode`                | `off`       | `off`, `shuffle` body and tail carve counts between monsters, or `randomize` them                      |
| `carveCounts.max`                 | 4           | With `randomize`: the largest count rolled                                                             |
| `gathering.mode`                  | `off`       | `off`, `shuffle` gathering point pairs between quests, or `randomize` them                             |
| `gathering.scope`                 | `star`      | How far pairs trade, or items are drawn from: `star`, `rank`, `adjacent` ranks or `any`                |
| `gathering.chances`               | `rarity`    | With `randomize`: odds `rarity` (the table's own), `reasonable` (×0.5 to 2) or `any`                   |
| `gathering.keepItems`             | on          | With `randomize`, every gatherable item stays findable at its star level                               |
| `gathering.counts`                | off         | Randomize each point's `gathers` and `most_gathers` (see below)                                        |
| `gathering.countSpread`           | 50%         | With `counts`: how far a point's counts move from their value, up or down                              |
| `supplies.mode`                   | `off`       | `off`, `shuffle` supply box stacks between quests, or `randomize` them                                 |
| `supplies.scope`                  | `star`      | How far stacks trade, or items are drawn from: `star`, `rank`, `adjacent` ranks or `any`               |
| `supplies.slots`                  | ±30%        | With `randomize`: how far a box's number of stacks can move                                            |
| `supplies.keepEssentials`         | on          | Keep maps, ballista and cannon ammo and the other quest-only supplies                                  |
| `terms.money`                     | off         | Randomize quest money: fees, reward money and penalties                                                |
| `terms.moneySpread`               | 0.5         | How far they move                                                                                      |
| `terms.time`                      | off         | Randomize time limits                                                                                  |
| `terms.timeSpread`                | 0.3         | How far they move (always within 20 to 50 minutes)                                                     |
| `deliveries.enabled`              | off         | Randomize what delivery quests ask for                                                                 |
| `questGoals.enabled`              | off         | Randomize what hunting and slaying quests ask for (see "Quest goals")                                  |
| `questGoals.capture`              | on          | Goals can ask for a capture                                                                            |
| `questGoals.smallMonsters`        | on          | Slaying quests can ask for other small monsters, or a large one                                        |
| `trades.mode`                     | `off`       | `off`, `shuffle` what the Veggie Elder's trades give, or `randomize` it                                |
| `trades.mix`                      | `elder`     | Within each hunting ground's Elder, or between `all` of them                                           |
| `trades.scope`                    | `low`       | With `randomize`, the items trades can give besides their own: `low` / `high` rank, `any`              |
| `recipes.mode`                    | `off`       | `off`, `shuffle` crafting and upgrade materials between slots, or `randomize` them                     |
| `recipes.scope`                   | `star`      | How far materials move or are drawn from: `star`, `rank`, `adjacent` ranks or `any`                    |
| `recipes.amounts`                 | off         | Randomize material amounts                                                                             |
| `recipes.amountSpread`            | 0.5         | How far amounts move (0.5 = 50% to 150%)                                                               |
| `recipes.maxQuantity`             | 99          | The most of one material a recipe can ask for                                                          |
| `costs.enabled`                   | off         | Randomize crafting costs                                                                               |
| `costs.spread`                    | 0.5         | How far costs move                                                                                     |
| `weapons.enabled`                 | off         | Shuffle which weapons the smithy makes                                                                 |
| `weapons.mix`                     | `same-type` | Whether a spot keeps its weapon type (`any-type`: any Blademaster or Gunner type)                      |
| `weapons.attack`                  | off         | Randomize each weapon's attack                                                                         |
| `weapons.attackSpread`            | 0.2         | How far it moves                                                                                       |
| `weapons.affinity`                | off         | Randomize each weapon's affinity, in steps of 5%                                                       |
| `weapons.affinitySpread`          | 15          | How many points it can move                                                                            |
| `weapons.element`                 | off         | Randomize element and status values of weapons that have one                                           |
| `weapons.elementSpread`           | 0.3         | How far they move                                                                                      |
| `weapons.elementGain`             | 0           | Chance a Blademaster weapon or bow with no element or status gains one                                 |
| `weapons.elementKind`             | off         | A weapon's element or status can become any other (bows: elements only)                                |
| `weapons.slots`                   | off         | Randomize each weapon's decoration slots, 0 to 3                                                       |
| `weapons.slotSpread`              | 1           | How many slots it can gain or lose                                                                     |
| `weapons.statRange`               | `near`      | Rarities either side stats stay within (`near` 1, `wide` 3, `any`)                                     |
| `weapons.sharpness`               | off         | Blademaster weapons of a type and rarity trade sharpness                                               |
| `weapons.sharpnessMode`           | `shuffle`   | `new`: every bar the weapons use also gets new colors                                                  |
| `armor.enabled`                   | off         | Shuffle which armor the smithy makes                                                                   |
| `armor.scope`                     | `rarity`    | Which pieces a place can get: the same `rarity`, the same `rank` (Low, High or G), or `any`            |
| `armor.start`                     | `smithy`    | A new hunter's armor: what the smithy's spots make (`smithy`), any Low Rank piece (`rank`), or `any`   |
| `armorSkills.enabled`             | off         | Change armor skills                                                                                    |
| `armorSkills.mode`                | `shuffle`   | Pieces trade their skill points (`shuffle`), or get new trees and points (`randomize`)                 |
| `armorSkills.keepArmorOnly`       | on          | Skill trees no decoration has stay on their pieces                                                     |
| `armorStats.defense`              | `off`       | Each piece's defense: `off`, `shuffle` (trade, with sphere caps) or `randomize`                        |
| `armorStats.defenseSpread`        | 0.2         | How far defense moves, when randomized                                                                 |
| `armorStats.resistances`          | `off`       | Each piece's five resistances: `off`, `shuffle` (trade all five) or `randomize`                        |
| `armorStats.resistanceSpread`     | 2           | How many points each resistance can move, when randomized                                              |
| `armorStats.slots`                | `off`       | Each piece's decoration slots: `off`, `shuffle` or `randomize`                                         |
| `armorStats.rarity`               | `off`       | Each piece's rarity: `off`, `shuffle` (within its rank) or `randomize`                                 |
| `armorStats.raritySpread`         | 1           | How many levels rarity can move, when randomized                                                       |
| `shops.mode`                      | `off`       | `off`, `shuffle` the items shops sell between shops, or `randomize` them                               |
| `shops.scope`                     | `low`       | With `randomize`, the items shops can sell besides their own: `low` / `high` rank, `any`               |
| `shops.mix`                       | `each`      | Each shop has its own replacements, or `all` share them                                                |
| `shops.keepEssentials`            | on          | Keep Potion, Whetstone, pickaxes, bugnets, BBQ Spit, basic ammo                                        |
| `shops.special`                   | off         | Include the Point Exchange (Armor Spheres, jewels, Pokke Tickets)                                      |
| `shops.countSpread`               | 0           | With `randomize`: how much more or fewer items each shop sells                                         |
| `shops.prices`                    | off         | Randomize prices of what shops sell, with or without `shops.mode`                                      |
| `shops.priceSpread`               | 0.5         | How far prices move                                                                                    |
| `shops.stacks`                    | off         | Randomize carry limits of what shops sell, with or without `shops.mode`                                |
| `shops.stackSpread`               | 0.5         | How far carry limits move                                                                              |
| `questMaps.enabled`               | off         | Move quests to other maps                                                                              |
| `questMaps.pool`                  | `any`       | The other `time` of day only, or `any` map with all of the quest's large monsters                      |
| `questMaps.starts`                | off         | Shuffle where each large monster starts on its map                                                     |
| `questMonsters.mode`              | `off`       | `off`, `shuffle` large monsters into their variants, or `randomize` them                               |
| `questMonsters.scope`             | `rank`      | With `randomize`, any monster on the map found at the same `rank`, `adjacent` ranks, `any`             |
| `questMonsters.text`              | on          | Rename swapped monsters in the quest's text                                                            |
| `questMonsters.difficulty`        | off         | Randomize each large monster's difficulty level (`power`)                                              |
| `questMonsters.difficultySpread`  | 4           | How many levels it can move                                                                            |
| `questMonsters.difficultyRange`   | `rank`      | Levels quests of the same rank use, or `any` level quests use                                          |
| `questMonsters.size`              | off         | Randomize each quest's monster size (its size percentage)                                              |
| `questMonsters.sizeSpread`        | 0.2         | How far it moves (kept between 50% and 200%)                                                           |
| `questMonsters.crowns`            | off         | Change each quest's crown spread (the range its monsters' sizes roll in)                               |
| `questMonsters.crownSpread`       | `random`    | One of the four that vary size at `random`, the `wide`st (85-125%) everywhere, or `none`               |
| `questMonsters.smallSpecies`      | off         | Shuffle which small monsters each quest has                                                            |
| `questMonsters.smallCounts`       | off         | Randomize small monster counts                                                                         |
| `questMonsters.smallCountSpread`  | 0.5         | How far counts move                                                                                    |
| `monsterStats.hp`                 | off         | Randomize each monster's base HP                                                                       |
| `monsterStats.hpSpread`           | 0.25        | How far HP moves                                                                                       |
| `monsterStats.size`               | off         | Randomize each monster's base size                                                                     |
| `monsterStats.sizeSpread`         | 0.2         | How far size moves (at most 50%)                                                                       |
| `monsterStats.status`             | off         | Randomize poison, paralysis, sleep and KO resistance                                                   |
| `monsterStats.statusSpread`       | 0.5         | How far resistances move                                                                               |
| `monsterAi.branches`              | off         | Randomize the odds of each monster's AI choices                                                        |
| `monsterAi.branchSpread`          | 0.5         | How far each move's odds move                                                                          |
| `monsterAi.aggression`            | `off`       | `off`, `more` (attacks twice as likely against other moves) or `relentless` (four times)               |
| `weaknesses.elements`             | off         | Shuffle each monster's elemental weaknesses                                                            |
| `weaknesses.parts`                | off         | Shuffle which body parts are weak                                                                      |
| `hints.bookshelf`                 | on          | Rewrite the bookshelf's monster articles as a bestiary (EU disc only)                                  |
| `hints.almanac`                   | on          | Rewrite the bookshelf's map articles as an item almanac (EU disc only)                                 |
| `mods.nodeMap`                    | off         | Mark gathering, mining and bug nodes on the area map pictures (EU disc only)                           |
| `hud.monsterHp`                   | off         | Large monsters' health under your name plate: `painted` or `always` (caps Guild Cards)                 |
| `hud.attackHitboxes`              | off         | Outline every monster attack that can hit right now, over the scene (caps Guild Cards)                 |
| `poogie.enabled`                  | on          | A happy pet before a hunt makes its rewards rarer, more so as affection grows (caps Guild Cards)       |
| `pact.enabled`                    | off         | Hunter's Pact: penalties at each quest's start, each paying a reward (caps Guild Cards)                |
| `elites.enabled`                  | off         | Some large monsters are stronger elites, and their quests pay more (caps Guild Cards)                  |
| `elites.chance`                   | 12          | Each large monster's chance of being an elite, in percent                                              |
| `quests.unknown`                  | off         | "Unknown Monster?!" quests on Guild 8★ and G★3 that roll a new hunt on every accept (caps Guild Cards) |
| `quests.keyLabel`                 | off         | A yellow ★ in the quest counter's card's top right corner when it shows a key quest (caps Guild Cards) |

### Presets

Each preset replaces every option and keeps the seed. They're built on
the shuffle and randomize split, and a test (`test/settings.test.ts`) keeps
them to what's described here. Options not yet tried in game are in no
preset: quest maps, monster starts, small monster species and the Veggie
Elder's trades. Turn those on yourself once you've tried them on your disc.
Armor stats are the exception: the presets turn on all four, though only
defense has been played. Resistances, slots and rarity have only been run
over the EU disc's tables, and what the game reads armor rarity for hasn't
been checked. Monster health, attack hitboxes, elite monsters, the Unknown Monster quests and the key quest
label are off in every preset, since they cap Guild Cards.

| Preset       | Does                | What it turns on                                                                                                                                                                                                                                                                                                                   |
| ------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rewards only | Shuffle             | The defaults: quest rewards and carves (with capture and break rewards), at the same star level                                                                                                                                                                                                                                    |
| Shuffled     | Shuffle             | Every tried shuffle and nothing else: rewards, gathering, supply boxes, recipe materials, weapons, armor, armor skills and stats (by rarity; rarity within its rank), shop stock, large monsters (into variants), elemental weaknesses and weak spots                                                                              |
| Randomized   | Randomize           | Every tried randomizer that needs no shuffle on, and no shuffle: amounts, costs, shop prices and carry limits, quest money, time limits, deliveries, quest monster size, crown spread, difficulty and small monster counts, base HP, size and status resistance, weapon and armor stats, new armor skills, Low Rank starting armor |
| Full         | Shuffle + randomize | Both, at the same star level: gathering from the same rank, shops with Low Rank items and new prices and carry limits, armor skills shuffled, new armor stats, Low Rank starting armor, difficulty within its rank                                                                                                                 |
| Chaos        | Shuffle + randomize | As Full, with recipes and rewards from anywhere, any Blademaster or Gunner type, armor of any rarity in the smithy and the starting box, any monster, new armor skills (armor-only skill trees too), any item in shops, gathering points and supply boxes, any crown spread and difficulty, wide spreads (armor stats too)         |

## Shuffles

No shuffle changes a list's length, so every edited file keeps its size,
except `supplies.mode randomize`, which grows quests into their sector padding,
and the quest map options, which rebuild quests (see "Quest maps" below).

| Shuffle           | Data                                                                                   | What changes                                                  |
| ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `quest-rewards`   | `RewardTBL` items in each quest `.mib`                                                 | Item, amount and chance move together (see below)             |
| `monster-rewards` | Carve, capture and break lists in `game_sub.ovl`                                       | Item, chance and amount move together (see below)             |
| `gathering`       | Gathering item tables in each quest `.mib`                                             | Item and value (weight) move together (see below)             |
| `recipes`         | `EquipmentCreate` / `EquipmentUpgrade` in the EBOOT                                    | Material moves; quantity stays with the slot                  |
| `recipe-amounts`  | The same recipe tables                                                                 | Quantities, rescaled and varied (see below)                   |
| `costs`           | Weapon, armor and decoration prices in the EBOOT                                       | Crafting and upgrade costs, varied in steps of 10z            |
| `weapons`         | Weapon create and upgrade entries in the EBOOT, the smithy's store in `lobby_task.ovl` | Which weapon each place makes and the store sells (see below) |
| weapon stats      | `WepBMValues` / `WepGunValues` in the EBOOT                                            | Attack, affinity, element or status (see below)               |
| `armor`           | Armor create entries in the EBOOT                                                      | Which piece each place makes (see below)                      |
| `armor-skills`    | `ArmorValues` skill entries in the EBOOT                                               | Each piece's skill trees and points (see below)               |
| armor stats       | `ArmorValues` defense, resistances, slots, sphere caps and rarity in the EBOOT         | Each piece's numbers, kept, traded or varied (see below)      |
| `shops`           | Shop item lists in `lobby_task.ovl`                                                    | Which items each shop sells (see below)                       |
| `supplies`        | Supply box lists in each quest `.mib`                                                  | Item and amount of each stack (see below)                     |
| `terms`           | Quest header fee, reward, penalty, time limit                                          | The numbers, varied (see below)                               |
| `deliveries`      | Delivery quest header target and goal line                                             | Which item and how many (see below)                           |
| `quest-goals`     | The quest header's goal slots and type, the board's copy, the goal line                | Hunt, capture or slay, which monster, how many (see below)    |
| quest maps        | Each quest `.mib`, rebuilt; the board's map byte                                       | The map, its gathering and small monsters, starts             |
| `veggie-trades`   | The Veggie Elder's trade lists in `game_task.ovl`                                      | What each trade gives (see below)                             |
| quest monsters    | Spawn records in each quest `.mib`                                                     | Which large monsters, their level, small counts               |
| monster stats     | Each monster's `emChunk` in `game_task.ovl`                                            | Base HP, size, status resistance                              |
| weaknesses        | Hitzone tables in `game_task.ovl`                                                      | Elemental weaknesses and weak spots                           |

### Quest rewards

Each quest has a `RewardTBL[]`; every table points at a list of
`RewardItem`s (chance, item, amount, 6 bytes each, ended by `0xFFFF`), and a
list's chances add up to 100. The main list (`Unkn1 0x8000`) is the quest's
reward pool, `0x8001` lists are fixed extras, and the rest are conditional
(Slay, Paw Pass, Training, Treasure Hunting). Only Village and Guild quests
take part (see Tiers). `questRewards.scope` is how far they reach: `star` (the default), `rank`,
`adjacent` (the same or the next rank: Low with High, High with G) or `any`.

- **Shuffle** moves whole slots (item, amount and chance) between lists of
  the same kind, within the scope. Each list keeps its number of slots. A
  list that gets slots from elsewhere has its chances scaled (largest
  remainder, each at least 1) back to the total it had.
- **Randomize** rolls each main list's slot count within `questRewards.slots`
  of its own, to no more than the longest main list on the disc has and as
  many as the quest has room for. A longer list moves to the end of the
  quest, into its sector padding, as supply boxes do. Each slot gets an item
  first found within the scope (never a quest-only item or other
  never-drawn item, never one twice in
  a list), an amount a quest gives of that item (rewards or supply boxes),
  and a chance: `rarity` deals out the chances the list had, `reasonable`
  scales each by 0.5 to 2, `any` rolls 1 to 100. The chances are then scaled
  to the list's total. Extra and conditional lists keep their length.
- Lists with empty (item 0) entries are shuffled but not randomized.
- **Draws** (`questRewards.draws`, independent of the mode) moves each main
  table's draw count, the high byte of `Unkn2`, up or down by that fraction
  of itself (rounded), never below 1 or above the most any quest has.

### Monster rewards

Carve, capture and break lists in `game_sub.ovl` are fixed in size and
shared between monsters, so unlike quest rewards no list changes length. A
list's tier is its rank and the earliest star level of a quest its monster
is in. `monsterRewards.scope` works as `questRewards.scope` does (`star`,
`rank`, `adjacent`, `any`), and `monsterRewards.captureAndBreaks` decides
whether capture and break lists take part with carves.

Most lists are reached through the carve and cap/break index tables, one
pointer per rank slot. A few carves are picked by code instead (mhfu-extract
`CODE_CARVES`, carve pointers 1001 to 1087): the elder dragons' body carves
(Fatalis, Crimson and White Fatalis, Lao-Shan Lung and Ashen, Shen Gaoren,
Yama Tsukami), Lao-Shan Lung's, Ashen's, Yama Tsukami's and both Gypceros'
live carves, Shen Gaoren's second carve, Yama Tsukami's shiny drop and
Congalala's and Emerald Congalala's tail-stagger drops (one list each for
bone, mushroom and mineral stone). They take part like the rest, with
every rank slot the code reads them in. The code mostly picks one list
for G or high rank and another for every other slot, unranked, treasure
and misc included, so on the EU disc 24 of the 79 take part: the G rank
lists, Shen Gaoren's high rank ones and Congalala's low and high rank
ones. Fatalis's, Crimson and White Fatalis's high rank carves, Lao-Shan
Lung's, the Gypceros' high rank live carves and Yama Tsukami's carves
stay, as other lists used at several ranks do. The FUC disc has the same
lists at the same pointers.

- **Shuffle** moves whole slots (item, chance and amount) between lists
  within the scope; carves only trade with carves. A list's chances are
  scaled back to the total it had.
- **Randomize** gives every slot an item first found within the scope
  (never a quest-only item or other never-drawn item, never one twice in a list), a chance as
  `monsterRewards.chances` says (the same choices as quest rewards) scaled to
  the list's total, and, for captures and breaks, an amount quests give of
  that item.

### Carve counts

How many times a monster can be carved ("body carves (x3)") is two bytes
per monster in `game_sub.ovl`'s carve index (body, then tail), separate from
the item lists above. Zeros (no tail, the elder dragons' body carves, live
carving) are never touched. **Shuffle** moves counts between the monsters
that have one of that kind; **randomize** rolls each from 1 to
`carveCounts.max`. Capture rewards have no count on the disc's reward
tables, so none is changed.

### Tiers

Items are placed by **tier**: a rank (Low, High or G) and a star level.
Every item shuffled or randomized has a `scope` that says how far from its
own tier it may reach: `star` (the same rank and star level), `rank`,
`adjacent` (the same or the next rank: Low with High, High with G) or `any`.
Each feature has its own: `questRewards.scope`, `monsterRewards.scope`,
`gathering.scope`, `supplies.scope`, `recipes.scope`. Shops, trades and
quest monsters have no tier of their own, so theirs is a ceiling on which
ranks' items can turn up.

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
  with other slots whose items are within `recipes.scope`.

The shuffles at `star` scope (and gathering with `keepItems`) keep every tier's items within that
tier, so every recipe material is still found at or before the star level
it was before. `checkRecipes` confirms this against the shuffled rewards
and gathering points (at `star` scope by star level, at `rank` scope by
rank, and for wider scopes only that the item still has a source); any failure is printed and listed at the top of the
spoiler log. The end of the log lists the tier found for every item, to
check against the game.

Items found only in shops, by combining or as tickets keep their recipe
slots.

`recipe-amounts` rescales each quantity to its material's usual amount:
the median quantity recipes ask for that item. A slot keeps its size
relative to that, so a slot that wanted 10 Iron Ore (usually 5) and now
takes a Tigrex Claw (usually 1) asks for 2. Then it's multiplied by a
random factor within `recipes.amountSpread` and kept between 1 and 99.

`costs` multiplies each price by a random factor within `costs.spread`. A
weapon's upgrade cost is its own price, so it changes too. A decoration's
price is also its sell price.

`weapons` gives each place in the smithy a different weapon of the same
rarity, and by default the same type. A place is a weapon's create entry
and its upgrade entry (the materials to make it by upgrading, and the
weapons it upgrades into). The place keeps its materials and links, so
every tree keeps its shape and pacing. The weapon keeps its own stats,
horn notes, shells, ammo and price. With `weapons.mix any-type`, a place
can take any weapon of the same rarity in the same family (Blademaster or
Gunner). The game already upgrades across types within a family (Great
Sword to Long Sword, Lance to Gunlance and more), but never between bows
and bowguns, so that pairing is untested. It runs before the recipe
shuffles, which then shuffle the tables it left.

Weapons from Ancient/Rusted shards stay put, and so do their polished
forms: Rusted and Worn weapons, and the Tarnished and Weathered ones they
polish into. Polishing a shard makes them, not a create entry (the shard
sections make placeholder IDs past the weapon table), so the shuffle finds
them by shape: a tree root no create entry makes, with exactly one
upgrade, of the same type and rarity. On the EU disc that's exactly
those 8. Moving them would let an ordinary place make a Rusted
weapon, or a rarity-1 Tarnished weapon show up as a starter or in the
store. What a polished weapon upgrades into (Ancient Blade, Teostra
Blade, ...) is shuffled as usual, and so are the G Rank Tarnished and
Worn weapons, which have ordinary recipes.

The smithy's store (the weapons it sells outright; on the EU disc 15
rarity-1 weapons, the same at every stage) follows the shuffle: where it
sold a weapon, it sells the weapon now in that weapon's place. That's the
same rarity (and type, unless `any-type`) and starts the same tree, so
what you can buy fits the shuffled smithy. It costs the new weapon's own
price. Its armor follows `armor` the same way (see below). The spoiler
lists the store in a "Smithy store" section of its own.

A new hunter's equipment box follows the shuffle too. Character creation
(`overlay/edit_task.ovl`) isn't a table: it calls the EBOOT's
add-to-the-equipment-box routine once per piece, with the category and ID
as `addiu` constants (`mhfu-extract/src/shops/starter.ts`), and randomfu
rewrites those constants. On the EU and JP (FUC) discs a new hunter gets
Bone Kris (worn), Bone Blade, Bone, Longhorn, Bone Gunlance, Bone Scythe,
Bone Club, Ivory Horn, Shooter's Barrel, Bone Shooter and Hunter's Bow I:
the weapons the smithy's first create entries make. With the shuffle the
box holds what those entries make now, so the starting weapons match the
first craftables, worn weapon included. The Mafumofu set (the hood in
the box, the other pieces worn) follows `armor` the same way. A hunter
made on the randomized image starts with it. One run of these calls
gives the four Mafumofu pieces again, not worn, to a save without a flag
it then sets; whether that runs for an existing save isn't known, so one
might get the shuffled pieces. The spoiler lists it all under "Starting
equipment", marking what's worn.

The smithy lists a weapon under its own type's tab, whichever section its
create entry is in: in PPSSPP on the JP disc, an `any-type` image's Great
Sword / Long Sword tab showed weapons whose entries are in the Lance and
Sword and Shield sections. A Great Sword entry that now makes a Hammer
should likewise show under Hammers, but no one has checked that tab.

Weapon stats (`weapons.attack`, `weapons.affinity`, `weapons.element`,
`weapons.slots`) change values in each weapon's own record (`src/shuffles/weapon-stats.ts`),
which the `weapons` shuffle never touches, so stats go with the weapon
wherever it ends up, and the two can run in either order. Attack (the raw
value; the game shows it times its type's class modifier) and element or
status values are multiplied by a random factor within their spread;
affinity moves by up to `weapons.affinitySpread` points, in steps of 5.
Each value is then kept between the lowest and highest that weapons of the
same type have, from `weapons.statRange` rarities below to as many above
(one, three, or any), read from your disc; a weapon with no other of its
type (or, for elements, of its element or status) in that window is limited
by the spread alone. The dual-element weapons (listed in `WepDualAttr`) are
skipped. With `weapons.elementGain`, a Blademaster weapon or bow with no
element or status gains one by that chance: an element (or, for
Blademaster weapons, a status) some weapon of its type has, at a value
between the lowest and highest of that kind its type has in the window (or
at any rarity, if none in the window does). With `weapons.elementKind`, a
weapon's element or status becomes any one of those; a switch between an
element and a status takes a new value that way and clears the other's
bytes, and a switch within elements (or statuses) keeps the value. Bowguns
never get an element: the game has none on a bowgun, and whether one would
work isn't known. Bows' elements are only Fire, Water, Thunder, Dragon and
Ice. Slots (Blademaster +18, Gunner +12) move by up to
`weapons.slotSpread`, from 0 to 3. Each of these draws from its own random
stream, every weapon drawing whether or not it can change, so turning one
on leaves the others' rolls as they were. Gained and changed elements, and
slots, are so far tested only against the synthetic disc: none have been
seen in game.
Defense bonus, horn notes, shelling, ammo, rarity and price never change. Records with no attack (unused entries) are skipped.
Affinity's spread and bounds apply to the affinity as shown, including the
up to 10 points the Blacksmith site adds to positive Blademaster affinity
for long sharpness, so a weapon crossing to positive affinity can't jump
further than the spread. Weapon
stats are so far tested only against the synthetic disc.

`weapons.sharpness` (`src/shuffles/sharpness.ts`) changes Blademaster
sharpness. A weapon's bar comes from two bytes in its record:
`SharpnessID` (+8) picks one of its type's run of curves in
`SharpnessTable`, and `SharpnessAmount` (+9) how much of that curve shows,
`50 * (amount + 3)` raw units (mhfu-extract's `emitSharpness`). Each curve
is seven cumulative thresholds, red to purple, all ending at 450 on the EU
and JP discs. Types share runs (Great Sword with Long Sword, Hammer with
Hunting Horn, Lance with Gunlance), and every Blademaster type uses IDs 0
to 7. Weapons of the same type and rarity trade (ID, amount) pairs, so each
gets a bar a weapon of its kind and rarity had, and bar lengths per rarity
stay as they were. With `weapons.sharpnessMode new`, every curve a weapon
uses is also rewritten: six random cuts in steps of 10 along the curve's
own length, so any weapon can have any color, purple included, though its
bar stays as long as before. The spoiler lists each changed bar as color
widths (`R8 O3 Y11 ...`), as the Blacksmith site shows them. It runs before
the weapon stats, which read the new amounts for the site's affinity
bonus. Neither mode has been seen in game yet.

`gathering` changes the pairs (value, item) in the gathering item tables of
Village and Guild quests. Tables keep their length and the quest file its
size. Only pairs in tables a node uses change: an unused table keeps its
items, and so do Training School, Treasure Hunting and the unused
gathering copies. A pair with item 0 is left as it is, and a delivery
quest's own item stays where it is.

- **Shuffle** moves whole pairs (item and value, taken to be the item's
  weight) between quests within `gathering.scope` (`star`, `rank`,
  `adjacent` or `any`). A table's values are scaled back to the total it
  had.
- **Randomize** gives every pair an item first found within the scope
  (monster parts included, avoiding repeats within a table) and a value as
  `gathering.chances` says, scaled to the table's total. With
  `gathering.keepItems` (on by default), each item the spots of a star
  level gave is first put back in one random spot of that star level, so
  it's still found at the same point in the game and recipes stay
  craftable; the other spots get pool items. Off, items you could gather
  may be found nowhere, and the recipe check reports any recipe that can't
  be made as early as before.

`gathering.counts` rewrites each node's two gather counts (the fewest, +22,
and the most, +18; see `src/quests/gathering.ts` in mhfu-extract), scaling both
by one random factor within `gathering.countSpread`. Counts stay at least 1 and
the most never falls below the fewest. Nodes that never run out (255), nodes
whose table gives a delivery quest's item, and quests the player can't take are
unchanged. It is independent of `gathering.mode`; `deliveries` reads the
counts as they end up.

`armor` gives each armor place in the smithy (a create entry) a different
piece of the same slot, wearable by the same hunters, of the same rarity
(`armor.scope rarity`), the same rank (`rank`: Low Rank is rarity 1 to 5,
High 6 to 8, G 9 and up) or any rarity (`any`). A spoiler line names the
new piece's rarity when it differs from the place's. A piece's
`HunterType` is a bit field (1 male, 2 female, 4 Blademaster, 8 Gunner),
and pieces only trade with pieces of the same value (and rarity or rank),
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
The smithy's store follows it: where it sold a piece, it sells the piece
now in that piece's places, at the new piece's own price. The store's
categories 0-4 are leg, head, chest, arm and waist.

A new hunter's Mafumofu set follows `armor` too, unless `armor.start`
says otherwise. Its body pieces are rarity 1 and for anyone, and on the EU
disc only three pieces per slot are (Mafumofu, Leather, Chain), so at one
rarity a hunter nearly always starts in Leather or Chain. With
`armor.start rank` or `any`, each piece in the box is instead drawn from
every piece the smithy makes for its slot that a new hunter can wear: for
Blademasters (the box's worn weapon is one, whatever the weapon shuffle
does) and both sexes, Low Rank only with `rank`. It draws from its own
random stream, so the smithy shuffles the same with it on, and doesn't need
`armor` on. The box's second run of Mafumofu pieces gets the same pieces.
Pieces are drawn by their rarity and wearers on the disc. Not yet tried in
game.

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

Armor stats (`armorStats.defense`, `armorStats.resistances`,
`armorStats.slots`, `armorStats.rarity`; `src/shuffles/armor-stats.ts`)
change each piece's own `ArmorValue`, so like skills they go with the piece
wherever `armor` puts it. Each is left alone (`off`), shuffled or randomized on its own,
for the same pieces as `armor-skills`. Shuffled, values trade between
pieces of the same rarity and hunter type (Blademaster only, Gunner only, or
both), so each rarity keeps the same values:

- **defense** (u8 at +12, the level 1 value) trades with the piece's seven
  sphere caps (+20 to +26), so a piece gets another's defense at every
  level. Randomized, it's multiplied by a factor within
  `armorStats.defenseSpread` and kept within what pieces of the same
  hunter type have from one rarity below to one above, as weapon stats
  are, and the caps stay. In game, a level 1 defense of 254 shows as 254
  and upgrades past 256, and the total adds up past 255.
- **resistances** (five s8 at +13: fire, water, thunder, dragon, ice) trade
  as a set. Randomized, each moves by up to `armorStats.resistanceSpread`
  points within the same kind of bounds, else within the disc's range for
  that element.
- **slots** (u8 at +18) trade, or are drawn from the slot counts pieces of
  that rarity have on the disc, so a rarity keeps about as many.
- **rarity** (u8 at +5) trades between pieces of the same rank (Low, High or
  G, as the Blacksmith site ranks rarities) and hunter type, or moves by up
  to `armorStats.raritySpread` within the rarities its rank has. What the
  game reads armor rarity for hasn't been checked in game. The other
  shuffles group pieces by the disc's rarities, before this changes them.

Every piece draws from each stat's stream whether or not its value moves,
so a piece's rolls depend only on the seed and its place in the list. On
the EU disc, shuffled and randomized, every value stays in the disc's own
ranges; nothing has been played yet.

`shops` changes the shops. They live in `overlay/lobby_task.ovl`: each
shop's stock is a list of u16 item IDs ending in 0xFFFF, one list per stage
of the game, and the game picks one from a table of pointers per shop
(each ending in a 0 word). On the EU disc the tables are at 0xa7da8: the
village general store (8 stages), the peddling granny's pools (her table
also uses two Guild lists), the Guild Hall store (9 stages) and the Point
Exchange (Armor Spheres, jewels and Pokke Tickets, bought with Pokke
Points). They're found by their shape, from
the table holding the general store's list (Herb, Potion, Antidote,
Whetstone), not by address.

- **Stock**: each item a shop sells is replaced by one other item, the same
  in every stage. `shops.mode shuffle` draws from the items shops sell
  anyway, so no shop changes length but for the Info items below; `randomize` also draws from items first
  found in Low or High Rank, or any item in the game (`shops.scope`; shops
  have no rank of their own, so it is a ceiling). Shops sharing a list
  share replacements (or all shops do, with `shops.mix all`). The monster
  Info items (Lynian Info to Fatalis Info, 831-859) only unlock bookshelf
  pages, so they're dropped, not replaced: the Village general store, Guild
  Hall store and Peddler sell up to 28 fewer items. Shorter lists end early
  where they are. The Organizer and Backpacker Guides (more item box space)
  always stay on sale where they are, with or without
  `shops.keepEssentials`.
- **Never drawn**: no pool (shops, gathering, quest and monster rewards,
  supplies, trades, recipe materials, Hunter's Pact rewards) adds quest
  items (the Info items among them), the placeholders No Coating and Dummy,
  Wyvern Droppings (junk), or the Alchemy, Organizer and Backpacker Guides
  (`isNeverDrawn` in `game/quest-fields.ts`). One already in a list can
  stay there.
- **How many** (`randomize` only): with `shops.countSpread`, each shop's lists scale by one
  factor, so later stages still sell what earlier ones did (stages nest by
  construction: items are kept in an order of pinned items, then by the
  stage they first appear in, then extra pool items). No list grows past
  the longest one on the disc (83), since the shop screen's limit is
  unknown. When a list grows, the lists are rewritten back to back in the
  space the lists use now and the pointer tables are updated; shops can
  only grow into space others free, so growth is scaled back until it
  fits. This refuses to run if that space holds anything but lists and
  padding. Otherwise, lists stay where they are.
- **Prices and carry limits** (`shops.prices`, `shops.stacks`) are the
  item's own (EBOOT item table), so they apply wherever the item is, and
  they don't need the stock to change: they change for everything the shops
  sell, which is what they sell now with `shops.mode` and their own
  stock without it (the Point Exchange, bought with Pokke Points, only with
  `shops.special`). The buy price field isn't documented:
  randomfu finds it on the disc as the one field holding the general
  store's prices (Herb 20z, Potion 66z, ...) and checks the carry limit
  byte (+3) against Potion 10 and Whetstone 20, refusing to edit if they
  don't match. Any item a shop now sells that has no price gets one from
  its rarity (100z × (rarity + 1)²), so nothing is free; that needs the
  EBOOT, so without it, wide pools may sell some items for free.

### Quest maps

`questMaps.enabled`, `questMaps.starts` and `questMonsters.smallSpecies`
(`src/shuffles/quest-maps.ts`, `src/shuffles/small-monsters.ts`) work on
whole quest documents (mhfu-extract `quests/document.ts`, shared with the
quest editor), which are then rebuilt (`src/game/rebuild.ts`): a moved
quest's lists change length. They run first, and every later shuffle works
on the rebuilt quests. On the EU disc all 551 quests rebuild byte for
byte, and a randomized image with all three on (and the large monster,
reward, gathering, supply and delivery shuffles) writes and reads back,
every quest still parsing. **None has been played in game yet**, so none
is in a preset. A quest that doesn't survive a rebuild is left alone and
named in the spoiler log. No rebuilt quest grows past its sectors or past
the largest quest on the disc, a size the game is known to load.

Item tiers hold through all three (`src/game/first-tiers.ts`): after them,
each item's first tier (quest rewards, carves by where monsters now are,
gathering) is checked against the disc's, and a quest whose changes took
an item's earliest source away (its gathering point, or a monster that
carries it) is put back as on the disc and named in the spoiler log. On
the EU disc no quest has needed it: moves and swaps make some items
earlier, none later.

What belongs to a map, from the EU disc: stage (area) IDs, numbered across
the game and different for a map's day and night versions; the gathering
nodes (one layout per map, two on some) and the item tables they index;
the position sets at `UnknPTR2` (only the Jungle by day has any); the
small monster areas; and each large monster's starting stage, rotation and
position. The header's unknown bytes and the quest script vary within a
map and name no stage.

- **Moving** (`questMaps.enabled`): a quest goes to another map where every
  one of its large monsters is a large monster in some Village or Guild
  quest (`any`), or to its map at the other time of day (`time`). It takes
  the gathering points, item tables, position sets and small monsters of a
  quest already there (the donor, of its own rank where there is one; one
  whose parts don't fit is passed over), and each large monster starts at
  a point the disc's quests start its family at on that map, none shared
  by two of them. A map without one such point for each of its monsters
  isn't offered (another monster's start may be ground it can't stand on). Its `spawn` byte stays unless
  no quest on the new map uses that value (the Fortress and Castle
  Schrade all use 2). Board records get the new map (`+0x1c`). Delivery
  quests, quests with an item objective, and quests whose goal names a
  small monster stay. The quest's text isn't changed, so it may still
  name the old map.
- **Starts** (`questMaps.starts`): each large monster of a quest that
  didn't move starts at another of its family's points on its own map,
  none shared by two of them; a quest without enough keeps its starts.
- **Small monster species** (`questMonsters.smallSpecies`): one mapping per
  quest from old species to new, applied to every spawn and preload entry,
  so each area's group loads as many species as before and no two species
  merge. A species only becomes one some quest has in every stage it's in.
  Rocks and Great Thunderbugs (spawned as small monsters, but part of the
  area), the goal's monsters and delivery quests' small monsters stay.

### Monsters

Every monster option has been tried on the EU disc in PPSSPP, and the
presets use them. They're all in-place edits, so every file keeps its size.

**Quest monsters** (`src/shuffles/quest-monsters.ts`) edit the spawn
records of Village and Guild quests (`src/game/spawns.ts`): each
`LargeMonData` and `SmallMonData` record, and the large monsters' preload
list (`emLoadTable`).

- **Species.** A swap rewrites every data and preload entry for the
  monster, and the header's `TargetID` and two objective slots (`+0x28`
  and `+0x30`) if they name it. A monster only goes
  to a map (day and night alike) where a Village or Guild quest already has
  it as a large monster: Lao-Shan Lung stays at the Fortress, and swimmers
  stay where there's water, lava or sand. Each species' code is in an
  `emNN.ovl`, and those share load addresses, so nothing shows which
  monsters can be loaded together. Variants use their base species'
  overlay, so `variants` (Rathian, Pink Rathian, Gold Rathian; Velocidrome,
  Gendrome, Iodrome, Giadrome; ... `MONSTER_FAMILIES`) can change quests
  with several kinds of large monster, but only where another member of the
  family is on the map: about a third of Village and Guild quests (164 of 486 in `data/quests`)
  have one, and Velocidrome, alone among the dromes in the Jungle and
  Forest and Hills, never changes. A quest that has a choice keeps its own
  monster when the draw picks it. The spoiler's notes count both and list
  the monsters a pool never changes;
  `rank` and `any` only change quests with one kind of large monster.
  A monster also only goes to a quest whose map (by day or by night: their
  stages differ) has enough points where the disc starts its kind, and it
  starts at one of them: if the old monster's point isn't one, it moves to
  one of its kind's starting points there (stage, rotation and position)
  that no other monster of the quest starts at, as `questMaps.starts`
  does. `variants` never needs to: a family shares its starts. On the EU disc, about 70% of `any` swaps would
  otherwise start a monster in a stage its kind never starts in (a
  Plesioth on dry ground, a Cephadrome off the sand).
  Quest scripts name no monsters on the EU disc (mhfu-extract README,
  "Quest script"), so `TargetID` and the objective slots are all a quest's
  goal needs. The quest's text is renamed for every swapped monster,
  whichever of them names it (`questMonsters.text`, below).
  Carves follow the monster: the reward shuffles and recipe check use
  the star levels monsters are met at after the swap. A swapped monster
  whose HP at its level would pass 32767 takes a lower level.
- **Text** (`questMonsters.text`, `src/shuffles/quest-text.ts`,
  `src/game/quest-text.ts`). Swapped monsters are renamed in the quest's
  six strings (title, goal, fail, details, monster list, client) in every
  language slot. The slots follow the game's language IDs (Japanese,
  English, German, French, Spanish, Italian, Korean; the EU disc puts
  English in the Japanese and Korean slots).
  - **The board has its own copy.** The board and the Quest Details screen
    read each quest's text from `mission_jpn/level*.mib`, not the quest
    file (`src/game/board.ts`; found with mhfu-extract `quest-text-scan`):
    renaming only the quest file left the screen unchanged on the EU disc,
    and renaming the board changed it (seen in PPSSPP).
    Each quest's board records get the same renaming, and their
    `TargetID` follows a swap. The spoiler lists "Board text (levelN.mib)"
    lines next to the quest file's "Text" lines.
  - Names aren't shipped: they're learned from the disc's own quests, per
    slot. The monster list is split into names; a monster's name is the
    piece most often in the list and goal of quests that have it, and least
    often in quests that don't. A piece two monsters share, or a tie, names
    neither. Goals are matched ignoring case, since a goal can write a name
    in lower case ("la reine Vespoid") that the list capitalises.
  - **On the EU disc** (a dry run, seed `TEST`, `variants` swaps): it
    learned 49 names in the English slots, French and Italian, 47 in
    Spanish and 36 in German. German misses most variants: their
    adjectives decline ("den Schwarzen Diablos"), so the list's form isn't
    found in goals, and those quests keep their German text. Renaming
    changed text in 82 quests; strings kept their old text for want of a
    name (82), room (77), the same article (46) or width (39).
  - A string that names an old monster in a form the rename doesn't read
    (another case, a declined adjective) keeps its text whole rather than
    being half renamed.
  - Articles are checked where each name is replaced. The words seen just
    before a monster's name in goals ("the", "den", "l'") are its articles,
    and all of them together are the language's. If the word in front of
    the old name is one of the language's articles, the new monster must
    have been seen after it too. So "den Rathalos" never becomes "den
    Rathian", while "the Velocidrome" becomes "the Gendrome" and a bare
    name in a list is always replaced. Pronouns ("she", "sie") never
    change.
  - An earlier version compared each monster's single most common article.
    On the EU disc that blocked every Velocidrome swap, because its goals
    put two words before its name equally often ("article unclear").
  - The text is wrapped by hand, so each field's longest line in that
    language is its width, and a rename that makes a line longer is
    skipped.
  - The quest keeps its size. A rename that isn't longer is written in
    place. Otherwise the quest's strings are repacked into the bytes they
    already take: runs of strings with at most 4 zero bytes between them,
    one per language on the EU disc. The disc's layout is kept: each string
    starts on a 4-byte boundary and takes its length plus two, rounded up
    to 4. Identical strings are stored once (the JP disc shows the game
    reads shared strings), and the pointers are updated.
    - First each language's strings stay in its own run.
    - If that run is too small, every distinct string is placed, largest
      first, in the first run with room. English can then use bytes freed
      in German's run when German's monster list matches English's.
    - If strings overlap or a pointer table sits among them, nothing is
      moved.
    - Room goes to the goal first, then the monster list, title, client,
      fail text and details.
  - On the EU disc (a `rank` run, seed `TEST`, before strings could move
    between runs), 57 goals and 80 monster lists had no room.
  - A string that can't be renamed keeps its old text and is listed in the
    spoiler log with why: no learned name, another article, too wide, or no
    room.
- **Difficulty** is the `power` byte, the row of the quest's stat
  multiplier table (HP, attack, defense, status; mhfu-extract
  `monsters/multipliers.ts`). New levels stay within the levels Village and
  Guild quests using the same table set use (header rank 0 picks set 0,
  the rest set 1), and with `rank`, the same rank too: rows past those may
  be filler. A level whose HP multiplier would take the monster's base HP
  past 32767 isn't used; it moves back towards the monster's own.
- **Small monster counts** are the records' quantity byte, scaled and kept
  between 1 and the most any quest has. Counts of 0 and 99 (which looks
  like "keeps coming") are left alone. A quest never has fewer of a small
  monster than its goal asks to slay (the header's target, or an
  objective), nor fewer than it had of one its delivery is carved from:
  where the new counts would fall short, that species keeps its own.
- **Quest size** (`questMonsters.size`) is the header's `MonSizeModifier`
  (u32 at `0x38`), the size in percent of every large monster in the
  quest. On the EU disc it's 100 in half the quests and 50-174 in the rest
  (mhfu-extract README, "Monster size"). It's confirmed to set the size in
  game: a Giadrome quest from a 50% spread came out with a tiny Giadrome
  in PPSSPP. It's scaled by a random factor within
  `questMonsters.sizeSpread` and kept between 50% and 200%. It's a
  separate setting from `monsterStats.size` (each species' base scale);
  both apply.
- **Crown spread** (`questMonsters.crowns`) is the header's u8 at `0x4a`
  (`Unkn7`, mhfu-extract's `sizeVariation`). Each crowned monster rolls
  75-125 percent of the quest size, clamped by one of five ranges this
  picks: 0 none, 1 100-105%, 2 100-115%, 3 95-114%, 4 85-125%
  (mhfu-extract README, "Monster size"). `crownSpread` gives each Village
  and Guild quest with large monsters one of 1-4 at `random`, 4 (`wide`)
  or 0 (`none`). Monsters without crowns stay at 100%, and so do the story
  quests the EBOOT holds at 100% until a flag is set. Worked out from the
  game's code and tried in game.

**Monster stats and weaknesses** (`src/shuffles/monster-stats.ts`) edit the
`emChunk` of every monster some quest spawns, in `game_task.ovl`
(mhfu-extract `monsters/hitzones.ts`), so they apply everywhere the
monster appears. Chunks for non-monsters are left alone, and so are
hitzone tables they share.

- **HP** is the u16 base HP (`+0x100`), held at or below 32767 over the
  highest HP multiplier any quest a player can take (Training and
  Treasure ones too, not unused slots) gives a monster of its set, as the quests end up (so the Unknown Monster quests, which give a
  monster its set's levels, fit too). In a quest the game keeps HP as a
  signed 16-bit value (`+0x2E4`), so more wraps negative: Lao-Shan Lung,
  Fatalis and Yama Tsukami have 26666 at ×1.0, and +25% took them to 33332. **Size** is the f32 base scale
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

**Monster behaviour** (`monsterAi.branches`, `src/shuffles/monster-ai.ts`)
rerolls the weights of the monsters' AI choices. Monster AI is bytecode in
`game_task.ovl`; `docs/monster-ai.md` has what's known about it.

- An `emChunk`'s `+0x158` pointers 3 to 19 are AI script roots, in
  `game_task.ovl` or the family's `emNN.ovl`. The emNN overlays share one
  load address, so a root goes to the monster's own overlay if it reads
  there, or else the one overlay where all its roots read. Basarios and
  Black Gravios read in em17 and em83; their class code and roots are
  Gravios's, so they take em17 and change with Gravios.
- A root is table pointers to script entry points, usually 20 (fewer, or up
  to 25 for monsters that use `82 a n` above `a` 4; the scripts behind the
  extra ones sit among the others', so reading 20 finds every choice). `80 00 N` is a
  weighted choice: N entries `80 k w <body>`, then `80 FF`; the game rolls
  0 to 31 and walks the weights, which add up to 32.
- Each weight is multiplied by a factor within the spread and the choice is
  scaled back to 32 (largest remainder). An entry above 0 keeps at least 1,
  an entry at 0 stays 0.
- The scripts are read by pattern, not with the game's instruction lengths:
  a choice changes only if its entries come in order, its weights add up to
  32 and it holds no other choice. That's 3,355 choices in 18 files on the
  EU and FUC discs. Species that share scripts change together.

Not yet tried in game.

**Monster aggression** (`monsterAi.aggression`, `makeMonstersAggressive` in
`src/shuffles/monster-ai.ts`) leans the same choices towards attacks.

- Which entries lead to attacks can't be read without a disassembler, so it
  is data (`src/shuffles/monster-attacks.ts`), worked out from the EU disc
  as `docs/monster-ai.md` describes: for each script file, the choices that
  mix attacks with other moves (2,156 in 17 files), by their index in
  `findChoices`, with one letter per entry.
- An attack spawns a hit that knocks the hunter back or stuns; walking
  contact (no knockback, no stun) doesn't count, and em54's aura object
  (Kushala Daora, Teostra, Lunastra) does. Choices with an entry nobody
  could classify are left alone (38, mostly Great Thunderbug, Fatalis, the
  Vespoids and Bulldrome), as are the 2 that Hermitaur and Ceanataur share
  but disagree on.
- Attack entries' weights are multiplied by 2 (`more`) or 4 (`relentless`)
  and the choice is scaled back to 32, every possible entry keeping at
  least 1. It runs after `monsterAi.branches`, on the rerolled weights.
- A file is changed only if its choices and their vanilla weights hash to
  what the data was made from; the EU and FUC discs both match.

Tried in game on the EU disc at four times: Giadrome was clearly more
aggressive. Species with walking contact and the elder dragons haven't been
played.

**The bookshelf guides** rewrite runs of the house bookshelf's articles
(Open Bookshelf, Info Magazine) and make them readable from the start
(`src/hints/bookshelf.ts`; the Text, Style and Unlocking notes below cover
both). `src/hints/guides.ts` writes whichever are on in one go, after every
shuffle, reading the seed back from the edited files.

**The Bestiary** (`hints.bookshelf`, `src/hints/bestiary.ts`)
turns the house bookshelf's thirteen Practical Hunting monster articles
(Fallen Objects, About Wyverns 1-3, the Pelagus, Carapaceon and Elder
Dragon info, and the Tigrex, Lao-Shan Lung, Akantor, Nargacuga, Yama
Tsukami and Ukanlos pages; 107 pages) into the RandomFU Bestiary, titled
by the letters each covers ("RandomFU Bestiary A-C"): an intro, then one
page per large monster, by name. Monster names, here, in the Almanac and
in the spoiler log, are the game's own from the EU disc (English message
file 19's table 0, read as mhfu-extract's `strings/monster-names.ts` does,
"Plum D.Hermitaur" included), with its overlay's names for the subspecies
the game calls by their base monster's name (Crimson and White Fatalis);
a JP disc, or one whose name table doesn't read, names them from
`monster.enum`. Pages rate rather than give numbers:

- **Health**: Frail, Sturdy, Tough, Mighty or Colossal, by fifths of base
  HP among the guide's monsters. It says where a monster stands among the
  others, not how this seed changed it: it isn't compared with the
  monster's unrandomized HP, so a Velocidrome is Frail and Lao-Shan Lung
  Colossal whatever the seed. Base HP is before each quest's own
  multiplier.
- **Weak to**: elements by their best part, ★★★ from 25, ★★ from 15, ★
  from 10, each in its colour; weaker ones aren't listed.
- **Parts**: the four softest, Cut, Blunt and Shot each ★★★ from 45, ★★
  from 30, ★ from 20, else -. Left white: coloured too, the page was
  busy.
- **Status**: poison, sleep, paralysis and KO by thirds of the first dose
  among the guide's monsters (★★★ the quickest), - when immune.
- **Quests**: the earliest star level per rank at which the monster is a
  large monster in a quest the player can take ("LR★2 HR★6", as the game
  shows tiers), or that it's in none. What it drops is in the Almanac (a
  per-rank drop line was tried and made the page too busy).

Lines are checked against the page (8 lines of 46 characters, symbols
counting double); a line that would run long leaves out its last items.
Monsters are spread evenly over the articles, so each has some, and spare
pages are blank; a monster that doesn't fit is named in the spoiler (none
on the EU disc, which has 60). The Bestiary's size hardly changes by seed,
so it doesn't shrink; the Almanac makes room.

**The Almanac** (`hints.almanac`, `src/hints/almanac.ts`) turns the fifteen
Lay of the Land articles (strings 107-230, 109 pages) into the RandomFU
Almanac: an intro, then a line per crafting material, A to Z, eight a page,
spread evenly over the articles and titled by letter like the Bestiary.
Materials are the items any crafting or upgrade recipe uses, read from the
EBOOT as the recipe shuffles left it (about 640 of 796 items). Each material's sources (`src/hints/sources.ts`, shared
with the Bestiary), each kind in its colour:

- **Shops**: the Village and Guild stores and the Peddler, from
  `lobby_task.ovl`'s shop lists (not the Point Exchange).
- **Gathering**: the maps of quests the player can take (`questTier`),
  without day and night ("Forest", "Snowy Mtns").
- **Monsters**: carve, tail, shiny, capture and break lists of monsters that
  appear in those quests, at the rank and lowest star level they appear,
  with the lists code picks (live carves count as carves).
- **Rewards**: quest reward boxes.

Each source is kept once, at its earliest tier, and listed shops first, then
earliest first. Within a tier, maps share a label and so do a monster's
ways ("Desert/Jungle LR★1", "Rathalos carve/break LR★2"), past two of
either with a "+". Tiers read as the game shows them: LR★1-5, HR★6-9,
G★1-3 (stored as 9-11). A line shows as many labels as fit; when the books
won't fit their bytes, lines drop their latest label, the fullest lines
first, and the spoiler says how many.

- **Text**: table 3 of the EU message files 4781-4785 (English, French,
  German, Italian, Spanish). An article is a title string and its pages,
  each up to 8 lines of 46 characters, UTF-8 (★ is 3 bytes). The whole
  table is one contiguous run of strings, so both books (strings 107-230
  and 679-798) are repacked together, with the original strings between
  them copied back as they were: the books share the bytes their articles
  used (about 63 KB in English, the tightest language; vanilla needs about
  57). The Bestiary takes what it needs first, leaving the Almanac at
  least its smallest, then the Almanac the rest (`writeShelf`,
  `writeGuides`). The guides are English in every language. If any file
  has no room, nothing is written. A run written before also gets back the
  zeros it left, so it can be rewritten.
- **Style**: the colour codes, symbols and button icons that render on the
  shelf (seen in PPSSPP with a probe article), and what each colour means in
  the guides, are in `src/hints/style.ts`: build pages from its `STYLE`
  roles and `paint`, then `compact` each page so it carries no code it
  doesn't need. In short: `~Cnn` colours what follows until the next code,
  `~C00` back to white. `~C01` and `~C25` black, `02` soft red, `03`
  green, `04` cyan, `05` yellow (the game's highlight), `06` peach, `07`
  light pink, `08` salmon, `09` light grey, `10` grey, `11` orange, `12`
  taupe, `13` crimson, `14` periwinkle, `15` pink, `16` magenta, `17`
  blue, `18` yellow, `19` red, `20` green, `21` beige, `22` light blue,
  `23` lavender, `24` amber; `~C30` is black on a white box, a box per
  word. Symbols all render two columns wide: the game's own (♪ → ★ ◇ ◆ ●
  ○ ∞ ※ ①-⑤) and ☆ ■ □ ▲ ▼ △ ▽ ◎ ← ↑ ↓ × ÷ ♂ ♀ ♦ ♥ ± √ ∴. `~B00`-`~B09`
  are button icons (○ × △ □ L R START SELECT, analog stick, d-pad); a
  page drew only the first ten icons, so `~B10`-`~B12` and any after were
  blank. `~A00`/`~A01` stand for numbers. Whether a colour carries over a
  line break isn't known, so `compact` restates it on the next line.
- **Unlocking**: `lobby_task.ovl` lists the articles as 16-byte records
  (title row pointer, page rows pointer, u16 issue, u16 ID, u32 page count
  << 8 plus a low bit), over rows of four u16 string IDs. Articles a new
  game can read have issue 0 and the low bit clear; the guides' records
  get the same. Seen working in PPSSPP: the articles show on the shelf.
- The JP disc's bookshelf text hasn't been located, so there the guides
  are skipped and the spoiler says so.

**Nodes on the map** (`mods.nodeMap`, `src/patches/node-map.ts`) draws a
3x3 marker for every gathering (green), mining (orange) and bug catching
(yellow) node onto the map screen's textures (`cockpit/map<N>.tmh`, 160x160,
8-bit swizzled, RGBA8888 palette). Positions come from the quests' node
tables through the map screen's own formula (mhfu-extract README, "Area
maps"), so they are EU-only and need the EBOOT. A texture is shared by every
quest on the map, and nodes sit in the same places in all of them, so a
texture gets the union. The markers use palette entries the art leaves
unused (every map has over 200), so nothing else recolours and file sizes
are unchanged. Checked in PPSSPP on the Snowy Mountains map.

`supplies` changes what each quest's supply box holds. The box is a list
of `{ u16 item, u16 amount }` at the header's `SuppliesPTR`, ending at item
0 (whose amount field holds the quest ID). On the EU disc every quest has
exactly one such list; nothing else points into it, and the header's
`SupplyCond` (+70) is a flag, not a second list, so it's left alone. Guild
quests list a stack once per hunter (four Maps), so runs of identical
entries change together. With `supplies.keepEssentials`, quest-only items
(Map, First-Aid Med, Ration, the supply-only tools, ballista and cannon
ammo) stay where they are; randomizing never hands them out, nor carried
objects. `supplies.scope` is `star`, `rank`, `adjacent` or `any`.

- **Shuffle** moves whole stacks (item and amount) between boxes within the
  scope, in place: each box keeps its length.
- **Randomize** gives each box a new number of stacks (within
  `supplies.slots` of its own) and every stack an item first found within
  the scope or held by a supply box there (supply items aren't item
  sources, so they have no tier of their own), in an amount quests give of
  it (rewards or supply boxes). New stacks take a width the box already
  had, kept stacks stay where they are, and a box never has the same item
  twice. A list can't grow where it is (the gathering tables follow it), so
  a longer box and the same end marker are copied to the end of the quest
  and `SuppliesPTR` points there; the old list stays, unread. The quest
  grows into its DATA.BIN entry's sector padding (the entry's size field
  says where the quest ends), so DATA.BIN keeps its layout. No quest grows
  past the largest quest on the disc (10,680 bytes on EU) and no box past
  the largest box (32 entries), sizes the game already handles; boxes
  without room get fewer stacks.

A quest's own delivery item (the
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
longer limits haven't been seen in game. Each of the quest's records on the
quest board (`level*.mib`, which copy header 0x4c-0x7f) gets the same
numbers; a quest with a record whose copy doesn't match its own keeps its
terms, so the two never disagree, and is listed.

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
quest description still names the old item. The quest's board records
get the same `TargetID`, `TargetNum` and goal line, the goal by the same
rules as the quest file's; an item whose goal line doesn't fit a record
isn't used, and a quest whose record can't be changed safely (its copy of
the target differs, or its strings share bytes with another quest's) keeps
its item. The spoiler counts the quests the board held back. No write to a
board file touches another record's header, pointer tables or strings. "Survive until Time Over or
Deliver the Paw Pass Ticket" quests stay as they are.

The gathering shuffle never moves a delivery quest's own item away from
its gathering points, whether or not `deliveries` is on, and the monster
reward shuffle never moves it off the carves of a monster in that quest at
its rank: Anteka Antlers, Popo Tongues and Piscine Livers are carved, not
gathered, on the EU disc. So every delivery quest can still be finished.

### Quest goals

What clears a quest, found in the EU EBOOT (`src/game/goals.ts`): the
quest manager sets up two goals from the header, the slots at `+0x6c` and
`+0x74`, each `{ u32 flags, u16 id, u16 count }` (the first's id and count
are `TargetID` and `TargetNum`), and the byte at `+0x6a` says how many must
be met (1, the first; 2, both). The two "objective" slots at `+0x28` and
`+0x30` aren't read by that setup (a quest to slay 15 Blangos has
`{ 1, Blango, 9 }` there). A kill counts down a goal with flag 1 for that
monster, and fails the quest if the goal also has 0x100; a capture counts
down any monster goal. On the disc's Village and Guild quests:

| Flags     | Goal line                 | Given to                                                                   |
| --------- | ------------------------- | -------------------------------------------------------------------------- |
| `1`       | Hunt (kill or capture)    | Large monsters that can be captured, only                                  |
| `0x201`   | Slay                      | Small monsters, and the large ones that can't be captured (Kirin, Akantor) |
| `0x101`   | Capture (a kill fails it) | No quest                                                                   |
| `0x18004` | Slay or repel             | Elder dragons                                                              |
| `2`       | Deliver                   | Deliveries                                                                 |

Nothing was found that reads 0x200. The quest type's first byte (+76) is
1 for a single Slay goal and 4 for a hunt, two-goal ones included.

`questGoals` gives each Village and Guild hunting or slaying quest a goal
its own monsters allow (a hunt stays a large monster's), after every shuffle that changes them (map moves,
small monster species, large monster swaps) and before small monster
counts, which then keep enough for a new Slay goal:

- Hunt one of its large monsters, Slay it where it can't be captured, or
  (`questGoals.capture`) capture one that can. A monster can be captured
  if some Village or Guild quest on the disc hunts it with flag 1 (43 on
  the EU disc).
- (`questGoals.smallMonsters`) A slaying quest (a goal of small monsters)
  can instead ask for a third to a half of another of its small monsters
  (5 at least, never more than 55% of them, in fives from 10 up; an
  endless spawn counts as 60), or for one of its large monsters as above.
  The disc asks for 15 of 31 Blangos and 20 of 52 Genprey. Off, slaying
  quests keep their goals.

A hunt never becomes a small monster goal: tried in game, a Bulldrome hunt
that became "Slay 15 Vespoids" was no hunt at all. No new goal asks for
Vespoids (a quest that asked for them can keep them), nor Rocks or Great
Thunderbugs: Vespoids keep coming in most quests, so they were often the
only small monster with enough of them, and made 41 of one seed's 83 small
goals. A goal kind is drawn first, then a goal of it; drawing the quest's
own goal leaves it as it was. Which large monsters a goal can name: in a
quest with one group of them, each that's there from the start (no flag
or timer in its record, quantity 1), as many as it has records; in a quest
whose monsters come in waves (more than one group: the Tigrex quests that
send a Khezu, then a Giadrome), only the goal's own. A quest with two goals
("Hunt the Rathalos and Rathian") keeps both monsters, each hunted or
captured. The goal slots, `+0x6a` and the type byte are written to the
quest and to its board records, which must carry the same goals as the
quest (one that doesn't keeps its goals, and is listed).

The goal line is written in English for every language, in the disc's
style ("Hunt the Rathalos", "Capture the Rathian", "Slay 20 Genprey",
"Hunt the Rathalos and capture the Rathian"), wrapped at 28 columns over
at most two lines as the EU disc's are. Plurals are the disc's own where
its goals count the monster ("Blangos", 32 of them), else the name for
the Raptors and herbivores ("Velociprey", "Aptonoth") and an s for the
rest. The line is repacked with the quest's other strings
(`writeQuestText`), so it has room; a goal whose line wouldn't fit in the
quest or a board record is passed over. The title and description aren't
changed: a quest called "Slay the Great Kut-Ku!" can ask for a capture.

Left alone: deliveries, gathering and Paw Pass Ticket quests; Treasure
Hunting, fortress and "Survive until Time Over" quests (their scripts end
them another way: opcodes 42, 44, 53, 57); elder dragons' slay-or-repel
goals; and any quest whose goals aren't one or two plain hunts or slays of
monsters it has. Over six EU seeds, with and without every monster option
on, 149 to 176 of the 291 eligible quests change (most of them to captures,
about ten to other small monsters), and every goal re-read from the
written disc names a monster the quest has, as many as it has, a capture
only of a capturable one, and the same goals and line on the board.

Large monster swaps now move the second goal with its monster too (they
moved only `TargetID` before, so a swapped "Rathalos and Rathian" quest
still asked for the old second monster), and the Unknown Monster quests
only take a quest as a template while its goal is a plain hunt or slay of
its one monster.

### Veggie Elder trades

The Veggie Elder trades on seven hunting grounds, each with its own list in
`game_task.ovl` (mhfu-extract `tables/veggie-trades.ts`): Forest and Hills,
Desert, Swamp, Jungle and Snowy Mountains (Day and Night share one), Old
Jungle and Old Swamp. A list's rows are (item he takes, common trade, rare
trade), 109 on the EU and JP discs, ending in 0xFFFF. He takes the first
row's item that the hunter carries and gives the rare trade one time in
five, or always with the Felyne Negotiations kitchen skill.

`veggie-trades` moves each row's common and rare trade, as a pair, to
another row: of the same Elder (`trades.mix elder`), or of any Elder
(`all`). With `trades.mode randomize` each row instead gets a new common
and rare item from those the Elders give (of that Elder, or all) and, with
`trades.scope`, items first found in Low or High Rank, or any item; a row
that gave one item keeps giving one. Rows keep the item he takes and their place in the list, so which
of the hunter's items he picks doesn't change. No tier logic applies: a trade
isn't counted as an item source, so the recipe check ignores it. Not yet
played in game.

## Monster health

`hud.monsterHp` (`painted` or `always`) draws a short gauge for
each large monster in the hunter's area, on the left edge under the name
plate: up to three, stacked. It's drawn by the HUD's own routines, so it
looks like the stamina gauge: the same frame, its end cap on both ends (the
left one mirrored), a 2-pixel fill in the hunter's health red, and
a yellow trail that drains a pixel a frame after a hit, as the hunter's
red recoverable health does. It runs as blob code on the code loader
(below), so it caps Guild Cards at 3.

- **`painted`** shows a monster's gauge while the map shows its icon: the
  game's own test, so from a Paintball hit until the mark wears off (18000
  frames).
- **`always`** shows every large monster in the area.

What it found (EU and JP; `src/patches/monster-hp.ts` has the details):

- A monster is an entity like the hunter: species `+0x1E8`, HP `+0x2E4`
  (s16), max HP `+0x41E`, area `+0x29A`, and bit 0 of `+4` set while it's
  active in the hunter's area. A Paintball sets `+0x3D0` and a timer at
  `+0x3D2`.
- `game_task` keeps every monster of the quest, large and small, in a
  manager behind a global (20 pointers at `+0x1220`). One that leaves the
  area stays in it, so the gauge checks the active bit and the area; a
  dead one's HP is 0.
- A species is large when its multiplier set in `game_task`'s monster
  table (`+0x14F`) isn't 0.
- The HUD draws the hunter's gauges in one EBOOT function, only when they
  show (not in cutscenes, nor with the HUD hidden). The monster gauges are
  drawn right after it, from a hook on that call, so they show and hide
  with it.

Tried in PPSSPP on EU: the gauge tracks damage, goes when the monster
dies or leaves the area, and `painted` shows it once a Paintball hits. Not
yet tried: JP in game, captures, and two large monsters in one area.

## Attack hitboxes

`hud.attackHitboxes` outlines, in red, every monster attack that can hit
the hunter right now: a circle for each sphere, and for each capsule a
circle at both ends and the two lines joining them, drawn over the scene
with the HUD's line routine. It shows exactly what the game tests against
the hunter, frame by frame, so an attack's outline appears when it becomes
able to hit and goes when it stops. It runs as blob code on the code
loader's HUD hook (below), so it caps Guild Cards at 3, and hides with the
hunter's gauges.

What it found (EU and JP; `src/patches/hitboxes.ts` has the details):

- Attacks are attack objects in a list behind a `game_task` global. Each
  frame `game_sub` tests those whose `+0x14` is 2 against the hunters, one
  shape at a time: the hurtboxes' 0x28-byte records, placed on the owning
  monster's joint matrices (`*(m + 0x190) + joint × 0x250 + 0xD0`) and
  scaled by its model scale. Projectiles carry their own two points
  instead.
- The camera's view matrix and the 3D projection sit in the renderer, at
  `+0xB80` and `+0xC00`. The GE itself never sees the view: the game
  multiplies it into every model's matrix.
- The HUD has a line routine next to the gauges' fill.

Projected from savestates of a Yian Kut-Ku fight, the fireball's outline
sits on the fireball and the monsters' hurtboxes on their bodies. Not
drawn: shapes the monster's own code places (joint 0x7D), and hunters'
attacks. Played on the EU disc in PPSSPP and working; JP not yet tried in game.

## Poogie's luck

`poogie.enabled` (Modifications → Poogie in the web app, on by default).
Pet Poogie at home before a hunt: if it lies down happily, every carve,
capture, break and quest reward in that hunt rolls twice and keeps the
rarer entry. Poogie remembers how often it's been happy: after 50 happy
hunts on a save it rolls three times, after 200 four. A tumble gives
nothing.

What the game does (EU and JP):

- Petting Poogie (`lobby_task`) sets save event flag 0x1AC when it lies
  down happily and 0x1AB when it knocks the hunter over; the hunt's return
  to the village clears both. The flags are a bit array at save `+0x508`.
- Carves, captures and breaks all draw from one weighted picker in the
  EBOOT (`(chance, item[, quantity])` entries, ending at 0xFFFF). The quest
  rewards roll the same way, inline, in the reward roll.

How randomfu does it (`src/patches/poogie-luck.ts`, `blob/poogie.c`):

- It's blob code on the code loader, so it caps received Guild Cards at 3
  like the other Modifications. The picker's first two words jump to a
  stub (game hook 5) that calls the blob's `rf_hook5` once the blob is
  loaded, and the game's own picker otherwise (the title screen). The
  quest rewards' inline walk is replaced with a call to the picker, keeping
  a list's forced first entry, so they get the luck too.
- The blob counts each happy pet and each tumble once, on the frame its
  flag goes from clear to set, in randomfu's save data: the last Guild Card
  slot, which every loader build keeps out of the blob's room at the same
  save offset, so the count carries over to discs from other seeds and
  settings (`RF_SAVE_DATA`, `blob/rf.h`). Its first word stays 0, so a disc
  without the loader sees an empty Guild Card slot there; that game can
  still write a 96th card over it or clear it when it compacts the cards.
- `?poogie-test` in the web app's address builds a test disc where a happy
  pick rolls 1025 times, all but guaranteeing the rarest entry.

The luck was confirmed in game on carves and quest rewards when it was
patched EBOOT code. Not yet tried in game since it moved into the blob,
nor the counting.

## Hunter's Pact

`pact.enabled` (Modifications → Hunter's Pact in the web app) offers pacts at the
start of every quest, as Hades' Pact of Punishment does: penalties taken
for rewards. In base camp the screen darkens and a window, in the frame of
the game's "item received" card and above the rest of the HUD, lists three
pacts drawn at random, each a penalty and, below it, the reward it pays (an
item or piece of equipment with its icon, as the pouch and equipment box
show it, the rest with a ★), and a way out. Up
and down (or the stick) move a highlight, Circle (or Cross) takes a pact,
and on the last row seals them. While the window is open the
clock stands still and the hunter doesn't move: the pact holds the game's
input lock, as shops and dialogues do. The window waits about half a
second into the quest, until the quest file is loaded. Penalties last the
quest; the next one draws again. Once sealed, the pacts taken (each
penalty, then its reward after a ★, as the window showed them; text can't
show the item icons) take the place of the quest's description, in every language, so the quest's info (Start, View
Quest Details, page 4, "Quest Details:") shows them for the rest of the
quest. Page 3's fail conditions have room for one more line only.

| Penalty                              | Weight |
| ------------------------------------ | ------ |
| Monsters' health +30% / +60% / +100% | 1/2/3  |
| Monsters' attack +30% / +60% / +100% | 1/2/3  |
| Half the time                        | 2      |
| One cart: a faint fails              | 3      |
| No supply box                        | 1      |
| Frail: health capped at 50           | 2      |
| Weary: stamina capped at half        | 1      |
| Deliver 50% more / twice as many     | 2/3    |

Two of the same kind (health +30% and +60%) are never offered together,
and only penalties that mean something for the quest are, read from the
loaded quest file: monster penalties need a large monster in the quest,
delivery ones a delivery whose item isn't in the supply box (they raise
the delivery's target and its item objective, rounding up; the goal line
still shows the old number), and half the time isn't offered on the
gathering quests, which time over wins. So a gathering quest draws from
one cart, no supply box (which holds its Paw Pass Ticket), frail and
weary. Each penalty's weight picks its reward:

| Weight | Rewards                                                                         |
| ------ | ------------------------------------------------------------------------------- |
| 1      | zenny (half), quest rewards +1, 3 to 10 of a common item                        |
| 2      | zenny (as much), quest rewards +2, 2 to 5 of an uncommon item                   |
| 3      | zenny (twice), quest rewards +3, 1 to 3 of a rare item, a weapon or armor piece |

Zenny is a share of what the quest pays, but at least a set amount for its
rank, so quests that pay little are still worth a pact. The window shows
the amount:

| Rank | Zenny at least (weight 1/2/3) |
| ---- | ----------------------------- |
| Low  | 600 / 1200 / 2400             |
| High | 2000 / 4000 / 8000            |
| G    | 4000 / 8000 / 15000           |

Items and equipment come up twice as often as the rest. No two pacts in a
window pay zenny or quest rewards alike, or give the same item or piece. Rewards
are paid only for a completed quest:

- zenny added to the quest's own (a faint costs the same share of the new
  reward as of the old);
- quest rewards as more draws from the quest's main reward table: the
  reward screen lists that many more of the quest's own rewards. The game
  draws at most 9 times, so quest rewards +N is offered only where all N
  fit (+3 on a quest that draws 6 times or fewer);
- items in the reward box, after the quest's own, on the reward screen;
- equipment in the equipment box's first free slot.

The items and equipment come from the quest's rank (Low, High or G), drawn
per seed: items first found at that rank (after the shuffles), and weapons
and armor of that rank's rarities (armor both sexes can wear). Up to 16
items a grade and 32 pieces a rank.

An item's grade is what it's worth, by the item table's price (the
general store's for what it sells, and on the same scale for materials:
Iron Ore 600, Rathalos Plate 48500). Each grade aims at a value per rank,
and an item is in it if some amount within the grade's range comes within
60% to 160% of that value. So a hard penalty never pays a pile of
something cheap, and a light one never a plate. An item can be in more
than one grade, in different amounts. Items with no price (supplies,
Commendations) or that don't stack (eggs) are never rewards.

| Rank | Value (grade 1/2/3)     | For example                                               |
| ---- | ----------------------- | --------------------------------------------------------- |
| Low  | 3000 / 10000 / 35000    | Iron Ore ×5, Rathian Scale ×2, Rathalos Plate ×1          |
| High | 12000 / 40000 / 120000  | Carbalite Ore ×2, Rathian Carapace ×2, Rathian Ruby ×1    |
| G    | 40000 / 120000 / 360000 | Eltalite Ore ×3, Hvy Rathalos Shl ×2, Fatalis Evil Eye ×1 |

Sealing with nothing taken ("Hunt without a pact") changes nothing at
all. It runs as blob code on the code loader, so it caps Guild Cards at 3,
and it works alongside Monster health. The shade, window, text and item
icons are drawn with the game's own routines.

What it found (EU and JP; `src/patches/pact.ts` and `docs/code-loader.md`
have the details):

- The quest object (the HUD object `+0x1220`) holds the clock (ticks left),
  the reward zenny and a faint's penalty (a third of the reward on every
  disc quest), and the loaded quest file, whose supplies and delivery
  target the pact edits in place, and whose large monster tables and
  delivery say which penalties fit. The quest loader keeps the file when the
  same quest is taken again, so the pact clears its cache to have it read
  afresh.
- The quest's text stays as offsets from the file's start in the loaded
  file (`header +0x60`, `src/game/quest-text.ts`), which the game adds to
  the file's address when it shows them (the info screen reads them each
  time it's drawn). The pact points each language block's details at its
  list in the blob. The info's four pages: reward, contract, time and zone;
  main monsters and special conditions; level, goal and fail conditions;
  client and details.
- The reward roll is handed the quest object and reads its reward tables
  through the pointer at its `+0x5C` (the elites' quest state is the same
  object), drawing the main table as many times as its byte `+3` says. It's
  called once, when a quest is completed, and fills the save's reward box
  (16 slots), which the reward screen shows; the pact adds its items after
  it (a new game hook). The equipment box is the save's `+0x548`, 12 bytes
  a slot.
- The HUD draws in layers 9 to 14, in order: its shapes in the layer in
  the HUD object's `+0x534`, the printer's text in 9 plus its `+0x12F`.
  The pact draws in 14, over the map and item bar. A second fill routine
  takes an alpha, which shades the screen. The print the card's window
  uses reads `~C` colours and `~B` button icons; the plain one doesn't.
- The pouch and item box draw an item's icon with one routine (EU
  0x0882E2C0) that takes the item and a size: its shape and colour come
  from the item table, the 16x16 sprite below 21 pixels wide and the 24x24
  one from there. A flag adds their overlays (ammo the gun can't load); the
  pact leaves it off. Another routine (EU 0x08831338) draws a piece of
  equipment's from its equipment box type and ID: the shape for its slot or
  weapon class, in its rarity's colour.
- Monster attack and defense are float multipliers (`+0x380`, `+0x384`)
  that the game sets again at spawn and when rage starts and ends; the
  shared `blob/monsters.c` scales them each time, and health once.

Tried in game (EU): the window, its shade, layers and text, its controls
and the input lock. Not yet: the rewards, the delivery penalties, and JP.
The pacts in the quest's info were tried in their first place, the fail
conditions, where they ran out of the box; not yet in the details.
Some quest starts crashed on the EU disc before the window showed (cause
not found yet); the pact now waits for the quest to settle and checks the
game's pointers before it reads or writes through them. Open: whether a faint takes the
quest's penalty off the reward and fails at 0 (one cart relies on it),
when the supply box reads its list, and which of the two stamina fields is
the current one (Weary caps both).

## Elite monsters

`elites.enabled` makes some large monsters elites, in the spirit of
World's Tempered and Sunbreak's Afflicted monsters. Each large monster
rolls once, when it shows up in a quest, at `elites.chance` percent (12 by
default), so the quest board never tells and a retried quest rolls again.
It runs as blob code on the code loader, so it caps Guild Cards at 3. An
elite:

- has half again its health (at most 32767), and hits 30% harder;
- moves 10% faster: its animations run 10% faster, except during moves
  that set their own speed;
- enrages after 60% of the damage it would otherwise take, and stays
  enraged half again as long (monsters that don't enrage skip this);
- is 15% bigger than the quest made it (at most 250%), which the Guild
  Card doesn't record: its size records stay what the quest rolled;
- has a faint crimson pulse: its hide turns a little redder and darker
  every five seconds or so, and back. Other monsters of its species keep
  their colours.

Each elite in a quest adds a draw to the main reward (on top of what's
there, so a Hunter's Pact's extra draws stay: the pact offers only draws
that fit in the game's 9, so where both don't, it's the elite's that's
lost) and half the quest's zenny and points again; the first also makes
the main reward's rarer items (those below the average chance) half again
as likely. The rewards
grow when the elite shows up, so they're paid on completing the quest
whether or not the elite was the target.

Health and attack go through the monster boosts the Hunter's Pact shares
(`blob/monsters.c`), so the two compose, and all of it multiplies whatever
the quest ends up with, so it stacks on `monsterStats` and
`questMonsters`.

What it found (EU, and the same code on JP; `src/patches/elite.ts` and
`docs/code-loader.md` have the details):

- The attack multiplier a monster's hits use is cached at `+0x380` (f32):
  the quest's stat row times its rage multiplier, written at spawn and when
  rage starts and ends.
- Rage: a species' parameters hang off its `game_task` table entry
  (`+0x1AC`): the meter's threshold, the rage's length, its speed, attack
  and defense multipliers, and the meter's gain by health left. A monster
  copies the threshold to `+0x570`, fills its meter at `+0x56E`, and when
  it's full enrages: bit `0x20` of `+0x638`, with `+0x56C` frames left.
- A monster's animations run at `2 × +0x4B0 × (100 + +0x769) / 100` each
  frame: `+0x4B0` is the move's speed (rage sets it too) and `+0x769` a
  bonus in percent some moves set and a change of move clears.
- Size is `+0x274` (percent), turned into the model's scale by a
  `game_task` function the game itself calls when a monster grows.
- Each monster has its own copy of its model's materials (`+0x58`), which
  the renderer reads every frame: diffuse, alpha and ambient colours per
  mesh.
- The reward screen draws the main reward table (kind `0x8000`) as many
  times as its byte `+3` (the quest file's "draws"), plus Luck skills', and
  picks each item by weight. It reads the quest file in memory, so the
  blob changes it there, and puts it back if the next quest finds it
  unread.

Not yet tried in game.

## Unknown Monster quests

`quests.unknown` adds an "Unknown Monster?!"
investigation quest to two boards: Guild 8★ (quest 2237, high rank) and
Guild G★3 (3234, G rank). Low rank gets none, so it stays the place to get
used to the randomizer before quests stop telling you what you'll meet. (The
game also keeps an unused clear flag for Village 10512, at 6★, if a low rank
one is ever wanted.) Every time it's accepted, it rolls:

- a **template**: one of the rank's plain hunts of a single large monster,
  which gives the map, the layout and the time limit;
- a **monster**: any large monster met on that map in any Village or Guild
  quest, of any rank, as long as it uses the same stat multiplier set as
  the template's (so no Lao-Shan Lung in a field quest) and the disc
  starts its kind somewhere on the template's map. Where the template's
  monster starts at a point its kind doesn't, the choice carries one of
  its kind's points (stage, rotation, position), which the blob writes
  with the species;
- its **difficulty**, from the levels the rank's quests near that star give
  monsters of that set, up to the highest at which the monster's HP (as
  `monsterStats.hp` left it) stays within 32767 (Yama Tsukami at G★3
  would otherwise reach 39999), **size** (the rank's 10th to 90th percentile) and
  **crowns** (any size spread up to the widest the rank uses);
- **where the hunter starts**: base camp or a random area, whichever the
  quests on the template's map use (the header's `spawn` byte, 0x45: 0 is
  base camp and 1 a random area, the game's own pick by its per-map
  chances in `game_sub`; 2, seen only on the Fortress, Castle Schrade,
  Battleground, Tower 1 and Snowy Mountains Peak, isn't understood, so it's
  never rolled: a template with 2 keeps it);
- its **rewards**: those of a quest of that rank that's only that monster,
  else a lower rank's, else a quest that has it alongside others; a
  monster no quest of that rank or below has keeps the template's
  rewards.

The fee, reward and penalty are the median of the rank's hunts near that
star. The board shows the first template's map and time limit; the
rolled quest keeps its own. The board says only "Hunt the ???", and so does the quest once it's
accepted; departing names the monster in the quest's goal. Clearing it
sets a clear flag the game keeps for that ID, unused on the disc.

It runs as blob code on the code loader (below), so it caps Guild Cards
at 3. Only the hunter who accepts rolls, so in ad-hoc play the others get a
different quest: **solo only** for now. How it works:

- Each board star has a 0-terminated list of quest IDs in the EBOOT,
  reached through one pointer table. After every load the blob copies the
  star's list with the new ID added and points the table's entry at the
  copy (the lists are packed, with no room to grow). The quest's board
  record goes into the star's `levelN.mib` (`src/game/board-add.ts`).
- Quests are read by one loader (`(quest, id, buf)`), from two places:
  accepting in town and departing. A game hook wraps both
  (`docs/code-loader.md`): before the call the blob swaps the new ID for
  the template's and makes the loader read the file again, and after it
  rewrites the decrypted quest in place, adding the new rewards and text
  after its end, inside the loader's 0x6800-byte buffer.
- The tables the blob rolls from (templates, choices, reward sets, names;
  about 40 KB) are built from the quests as the other shuffles left them
  and linked after the blob's code (`src/patches/unknown-quests.ts`).

Tried in PPSSPP with the quest moved to the Village 2★ board for an early
save: it shows on the board, loads a rolled hunt and plays through. Not yet
tried: the 8★ and G★3 boards themselves, rolled starts, ad-hoc play, and each region
separately.

## Key quests

`quests.keyLabel` marks key quests where you pick them: when the quest
counter's card (the Village Chief's, and likely the Guild's, which share
the code) shows a key quest, a yellow star (★) shows in the card's top right
corner, drawn as the card draws "CLEAR!!" in its top left. Key quests are
the ones a star needs cleared before its Urgent Quest shows. The quests
themselves and their titles aren't changed. It runs as blob code on the
code loader (below), so it caps Guild Cards at 3.

What it found (EU and JP (FUC), in `lobby_task.ovl`; `src/patches/key-quests.ts`
has the details):

- The card is drawn by one function (EU 0x09A8CA40), called from one place
  in the counter's draw step every frame it shows. It reads the shown
  quest from a copy of its board record at a fixed address (EU
  0x09B03F40), which a getter returns. Bit 26 of the record's quest type
  marks a key quest (77 records on the EU boards), bit 25 an Urgent Quest.
- It draws its lines with a print routine that draws text over a drop
  shadow, after setting the printer's glyph size. "CLEAR!!" is glyph size
  14, yellow over shadow colour 1, 8 pixels in from the card's left (the
  card's place and size and "CLEAR!!"'s are in a layout table). The star, the
  font's own ★ (the quest details show levels as "LV★★★"), is drawn the
  same way just after the card, 8 pixels in from its right, clear of the
  quest type centred on the same row.
- The two discs' card functions are the same words but for immediates, so
  it's found by its masked first words, and the routines, globals and
  layout by what it does with them. Both discs' text is UTF-8 (the quest
  details' "LV★" on FUC too), so the star is the same bytes on both.

Tried in PPSSPP on EU at the Village Chief with "Key Quest!" in the same
corner; the star itself hasn't been seen in game yet. Not yet tried: the
Guild's counters, and JP.

## Code loader (prototype)

`?loader-demo` in the web app's address (see `apps/randomfu`) caps received
Guild Cards at 3 and turns the 93 freed slots (392,088 bytes of the save
struct) into room for randomfu's own code and data. Its demo blob adds 1000
zenny on every save load, so it's seen to run; it does in PPSSPP on EU and
JP (FUC). It's not for play. `docs/code-loader.md` has the design: the
address, when it loads, the blob format, game hooks, the C toolchain and
the PRX alternative. Poogie's luck, monster health, the Hunter's Pact and the key quest label are built on it.

- **Room.** The save struct is static (an arena in the EBOOT's BSS), so the
  freed slots are at a fixed address per region: EU `0x099A1820`, JP
  `0x0999D560`. `src/patches/guild-card-space.ts` caps the cards and
  rewrites the game's card compaction in 75 of its 351 words; the rest is a
  code cave that patches share (`allocateCave`, `allocateSlots`).
- **Loading.** Loading a save or making a new character overwrites the
  slots. The EBOOT's two save-load copies and the new character's card
  clear call a loader in the cave instead; it makes the game's call, then
  reads `/PSP_GAME/USRDIR/RANDOMFU.BIN` over the slots with `sceIoOpen` and
  `sceIoRead`, checks its header, syncs the caches and calls the blob's
  `rf_init`.
- **Game hooks.** Game calls go through stubs in the cave that make the
  call, then run the blob's `rf_hookN` if a blob is loaded: once a frame in
  a quest, after the HUD draws the hunter's gauges, after the pad read gets
  the controller, around the quest loader's calls, and after a completed
  quest's reward roll (`src/patches/game-hooks.ts`). Blob features register for them with
  `rf_on` (`blob/runtime.c`). One more replaces the game's weighted
  picker with the blob's `rf_hook5` (Poogie's luck).
- **Save data.** The last freed slot is randomfu's own save data, kept out
  of the blob's room in every build so features can remember things across
  saves and discs (`RF_SAVE_DATA`, `blob/rf.h`).
- **Blob code** is C in `blob/`, compiled by clang to MIPS objects
  (`node blob/build.mjs`, Homebrew `llvm`) and committed as base64
  (`src/blob/demo-object.ts`). randomfu links them per disc at the
  region's address (`src/blob/link.ts`), so no compiler is needed to
  randomize.

Not yet tried: receiving Guild Cards with the cap, and a save from a
patched game on an unpatched one (its card slots 4–96 hold the blob).

## Quests that can't be finished

A quest the player can't finish blocks the story when it's a key or urgent
quest. These are the ways a shuffle could make one, and what keeps each
from happening. Run over the EU disc (the Chaos preset with deliveries
off and every monster option on at wide spreads, six seeds), the shuffles
before these guards left every seed with some: 180 to 210 monsters
starting in a stage their kind never starts in, four or five carved
deliveries with nothing to carve, up to three slay goals short of
monsters, and one or two monsters past 32767 HP. With them, none.

| Risk                                                            | Kept from happening by                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A delivery's item is found nowhere in the quest                 | Gathering and carves keep it (gathering points, carves of the quest's monsters)       |
| Too few carves for a delivery                                   | Small monster counts never lower the monsters it's carved from                        |
| A "Slay N" goal asks for more small monsters than the quest has | Small monster counts keep the goal's species at least at its count                    |
| A goal's small monster is swapped or moved away                 | Small monster species and quest maps leave the goal's monsters and quest              |
| A swap leaves a goal naming a monster the quest no longer has   | Swaps move both goals and the board's copy with the monster                           |
| A goal asks to capture a monster that can't be captured         | Capture goals only name monsters some quest on the disc hunts with flag 1             |
| A new goal asks for more monsters than the quest has            | Quest goals count the quest's own records; small monster counts keep the goal's count |
| A goal names a monster that arrives late, or in a later wave    | Quest goals only name monsters there from the start, in quests with one group         |
| A monster starts where it can't stand (water, sand, a nest)     | Swaps and Unknown Monster quests only start monsters where the disc starts their kind |
| A monster's HP wraps past 32767                                 | Base HP, swaps and difficulty stay where HP fits; the pact and elites cap their own   |
| The Paw Pass Ticket goes missing on a gathering quest           | Its supply box stack always stays                                                     |

Not covered: what a player chooses (a Hunter's Pact penalty, turning
`supplies.keepEssentials` or `shops.keepEssentials` off), and odds (a
randomized delivery asks for no more than its points give on average, so
an unlucky run can fall short; retrying the quest rolls again). The disc
has no capture-only quests ("Hunt" takes a kill or a capture); with
`questGoals.capture`, killing a capture goal's monster fails the quest, as
the player is told by the goal line.

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
- **New files** (the code loader's blob) go at the end of the image, with a
  record added to their directory, kept in name order and shaped like the
  directory's other records (UMD names have no `;1`); the directory must
  have room in its sectors (`PatchableImage.writeFile`).

## Open questions

- Whether files inside DATA.BIN can grow past their sectors. Needed for
  quest edits that add more data than the padding holds, such as new
  monsters. Growing within the padding (`supplies.mode randomize`) isn't
  confirmed in game yet either. Other tools rebuild DATA.BIN with bigger
  files (IncognitoMan's `mhff`, which FUComplete uses, shifts every later
  file), but the game also loads files into fixed buffers (FUComplete's
  docs give per-file limits for player models). Quest text renaming
  doesn't grow anything: it repacks within the bytes the strings use.
- Which monsters can share a quest. Swaps update the preload list
  (`emLoadTable`), but overlay memory limits which species load together,
  so wide swaps only touch quests with one kind of large monster.
- Whether a monster can start at a point the disc never starts its kind
  at. Swaps and the Unknown Monster quests don't find out: they only start
  monsters where their kind starts (see "Quests that can't be finished").
- Whether hitboxes scale with either size option.
- Quest text in game. Renaming the board files (`level*.mib`) shows on the
  EU Quest Details screen: a quest swapped from Velocidrome to Daimyo
  Hermitaur showed the new monster in game. Where the game shows the quest
  file's own copy of the text, if anywhere, isn't known. Whether the game
  pays out, times or checks a delivery from the board's copy of the header
  or the quest file's isn't known either: both get the same values.
- Capture goals in game. The kill check fails a goal with 0x100 and the
  capture check counts any monster goal (`src/game/goals.ts`), but no
  quest on the disc has one, so whether the quest clears on a capture,
  fails on a kill, and what the end screen says, hasn't been played.
- What reads the goal flag 0x200 and the "objective" slots at `+0x28` and
  `+0x30`, if anything does; the goal shuffle leaves the objectives as
  they were. Whether the game reads the board record's copy of the goals
  at all, or only the quest file's: both get the same.
- What the quest type's first byte does beyond the kind: the goal shuffle
  keeps the disc's pairing (1 for one Slay goal, 4 otherwise).
- Large monster counts. What `quantity` means for a large monster (it's 1
  in 536 of 554 records, 10 or 5 in a few), and how it relates to the
  header's `TargetNum`, isn't known.
- Which AI choices are attacks. The scripts' weights are data (Monster
  behaviour), but what each action group does is species code, mapped for
  the dromes only (`docs/monster-ai.md`), and the motion banks (each
  `emmodel/emNN.pac`'s entry 3) aren't decoded.

## Tests

```bash
pnpm test
pnpm typecheck
```

The tests build a small fake disc (ISO 9660, PARAM.SFO, an encrypted
DATA.BIN with quests and a reward overlay, an EBOOT with recipes) and run
the whole pipeline on it, `runRandomizer` included. The web app's
`pnpm test:e2e` checks the browser build gives the same image.
