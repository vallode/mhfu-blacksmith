# game-data

The one way into the game data in `data/`. The site (`apps/blacksmith`: its
pages, scripts and tests) and `packages/mhfu-extract` read every data file
with `readData`, and mhfu-extract's `build-data` writes with `writeData`.
Nothing parses the files itself.

```ts
import { readData } from "game-data";

const { weapons } = readData<{ weapons: Weapon[] }>(DATA_DIR, "mhfu", "weapons", "bow.json");
weapons[3].improve_from; // "Hunter's Bow III"
```

Each caller passes its own `data/` directory (the site's `DATA_DIR`,
mhfu-extract's `--data`), then the game, then the file's path in that
game's data.

## Games

Each game's data is in its own directory: `data/<game>/`, records and
`strings/` both (`gameDataDir(dataDir, game)`). The game codes are `mhf1`,
`mhf2` and `mhfu`; only `mhfu` has data so far. `data/schemas/` is shared
by every game (`schemasDir`).

`games.ts` (`game-data/games`, pure, so the site's client code imports it)
is each game's config: the facts about the game the site and the
extractor share.

| field               | MHFU                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `weaponClasses`     | the 11 weapon types in menu order, each with its table, class multiplier and motion file                             |
| `armorSlots`        | helmet, plate, gauntlets, waist, leggings                                                                            |
| `ranks`             | low, high and G rank                                                                                                 |
| `monsterCategories` | the 9 categories, in the site's order                                                                                |
| `questHubs`         | Village, the three Guild ranks, Training School, Treasure Hunting, then the downloaded Event and Challenge boards    |
| `sections`          | which parts of the site the game has: decorations, maps, Veggie Elder, Pokke Farm, damage, the hunter save import, … |
| `save`              | the save file (`MHP2NDG.BIN`) and which parser reads it                                                              |

A game lists only what it has, and turns off the sections it lacks (MHF1,
for one, is expected to have no G rank and no decorations). Labels, icons
and other display details stay in the site. `GAMES` holds the games with
data, `DATA_GAMES` their codes, and `GAME_CODES` every code a URL can name.

## The layout

**Records carry game IDs and refer to each other by ID.** Names live in
per-language string tables.

| kind                          | ID                                              | records                    |
| ----------------------------- | ----------------------------------------------- | -------------------------- |
| items                         | item ID (u16, as in a save's item box)          | `items.json`               |
| decorations                   | their item ID                                   | `decorations.json`         |
| blademaster weapons           | index into the game's melee table (`WepBMID`)   | `weapons/*.json`           |
| bows and bowguns              | index into the game's ranged table (`WepGunID`) | `weapons/*.json`           |
| armor                         | the slot's armor ID (`HeadArmorID`, ...)        | `armor/<slot>.json`        |
| skill trees                   | `SkillID`                                       | `skills.json`              |
| skills (a tree's activations) | `<SkillID>:<points>`                            | `skills.json`              |
| monsters                      | `emID`                                          | `monsters/*.json`          |
| maps                          | the quest header's map ID                       | named by quests, gathering |
| quests                        | quest ID                                        | `quests/*.json`            |
| Pokke Farm points             | the point's index in the game's farm table      | `farm.json`, in that order |
| Guild Card awards             | the award's index (its bit in the save's flags) | `awards.json`              |

The weapon and armor IDs are the ones a save's equipment box and the set
builder's share codes use. They used to be listed in
`data/equipment-ids.json`; now each record carries its own. `readData(dir, game,
"equipment-ids.json")` still returns that list, built from the records.

References:

- **Materials** (`create_mats`, `improve_mats`, `alternative_create_mats`):
  `{ "item": 202, "amount": 2, "type": "ore", "color": "gray" }` (202 is Iron Ore).
- **Upgrades:** `improve_from: 3` (or a list), `improve_to: [52, 275]`, in
  the weapon's own table.
- **Drops:** `{ "item": 523, "amount": 1, "chance": "4%" }`. `amount` is
  there where the site showed one ("Rathian Plate x1").
- **Skills** on armor (`{ "skill": 36, "amount": 3 }`) and decorations
  (`{ "skill": 36, "points": 1 }`).
- **Quests:** `map: 11`, items by ID, `{ "monster": 87, "quantity": 1 }`.
  A large or small monster's `spawns` are pixels on the quest's area map
  (160 across), shared with `data/mhfu/gathering.json`'s `positions`; `area` 0 is
  the Base Camp. A small monster's points also carry `quantity` and, for
  one that keeps coming, `endless`.
  A Training School quest's `arena_sets` name gear by slot and ID,
  `{ "slot": "helmet", "id": 241, "level": 0, "decorations": [989] }`, as
  a save's equipment box does. Gear with a record is named by it; the
  training-only pieces with none (Rookie Knife, the Piercings) are named in
  the string tables by the quest file. `writeData` checks the weapon and
  armor records (`equipmentRecordIds`): a quest file writes the name of a
  piece without a record, and never one with.
- **Gathering, shops, Veggie Elder trades, combinations, Pokke Farm:**
  items and maps by ID. A farm point's name ("Mining Point +2") is under
  `farm`, by its index.
- **Awards:** a record is only its `id`; the award's name and the game's
  description of it are under `award` and `award_description`.

**Names are in `data/<game>/strings/<lang>.json`** (MHFU's in
`data/mhfu/strings/`), by kind and ID:

```json
{
  "item": { "1": "Book of Combos 1" },
  "melee": { "3": "Buster Sword" },
  "skill": { "36": "Defense" },
  "skill_activation": { "36:20": "Defense +40" },
  "monster": { "1": "Rathian" },
  "monster_description": { "1": "…" },
  "quest": { "10101": "Gathering - Snowy Mountains" },
  "aliases": {
    "item": { "92": ["Jump Barrel Bmb", "JUMP Barrel Bomb"] },
    "skill": { "36": ["Defence"] }
  }
}
```

`strings.ts` lists every kind. English (`en.json`) is complete: names,
quest text (from the disc) and the site's hand-written monster
descriptions. Another language lists what it has and falls back to
English (`StringTable`). `ja.json` holds the Japanese item names so far.
`stringsPath(dataDir, game, lang)` is the one place the path is spelled out.

**Spellings.** Where a reference should show another English spelling
than the name, it carries `alias: n`: the n-th English alias. Monsters'
aliases are `monster.enum`'s spellings ("One-Ear Yian Garuga", "Terra
Shogun Ceanatur"), which an extract of a disc whose names aren't read
(JP) still uses; the EU disc's names are the names. Skill
references on armor and decorations carry none: they show the tree's name
from `skill`, as the set builder does. The old spellings ("Defence",
"Load") stay as aliases, which search and the set builder still match.
Other languages ignore `alias`. A decoration whose name isn't its item's ("Constitutn Jewel" vs
"ConstitutnJewel") has it under `decoration`.

## The named view

`readData` doesn't return the file as it is on disk. It returns the
**named view**: the records as they were before names moved out, with
English names wherever the file holds IDs, and the names and text put
back on the records. The site renders, slugs and bundles from that view,
so it looks exactly as it did. Slugs still come from the English names,
whatever language a page is in. `readRawData` returns the file as stored.

`writeData(dataDir, rel, named)` is the inverse. It looks every reference
up by name in the English strings (names, then aliases). A file's own
records keep the IDs they have, and armor pieces that share a name
(Guild Guard) are told apart by `sex`. It writes the record file and any
names or text that changed into the string tables, and returns what it
wrote; an unchanged view writes nothing. `test/model.test.ts` checks the
round trip on every committed file.

`importLegacy` converts a `data/` directory in the old named layout. It
did the migration, given the IDs the old layout didn't hold (see
mhfu-extract's `src/build/legacy-data.ts`). The extractor's tests use it to
write fixtures from named data.

The site imports this package's TypeScript source, so
`apps/blacksmith/next.config.mjs` lists it in `transpilePackages` and
resolves its `./x.js` imports to `.ts`.
