# game-data

The one way into the game data in `data/`. The site (`apps/blacksmith`: its
pages, scripts and tests) and `packages/mhfu-extract` read every data file
with `readData`, and mhfu-extract's `build-data` writes with `writeData`.
Nothing parses the files itself.

```ts
import { readData } from "game-data";

const { weapons } = readData<{ weapons: Weapon[] }>(DATA_DIR, "weapons", "bow.json");
weapons[3].improve_from; // "Hunter's Bow III"
```

Each caller passes its own `data/` directory (the site's `DATA_DIR`,
mhfu-extract's `--data`).

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

The weapon and armor IDs are the ones a save's equipment box and the set
builder's share codes use. They used to be listed in
`data/equipment-ids.json`; now each record carries its own. `readData(dir,
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
- **Gathering, shops, Veggie Elder trades, combinations:** items and maps
  by ID.

**Names are in `data/strings/<lang>.json`**, by kind and ID:

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
`stringsPath(dataDir, lang)` is the one place the path is spelled out.

**Spellings.** Where the site spelled a skill tree or monster otherwise
than its English name, a reference carries `alias: n`: the n-th English
alias of it. Armor shows "Defence" for the Defense tree, and a quest names
"Terra Shogun Ceanatur", the game's own spelling. Other languages ignore
`alias`. A decoration whose name isn't its item's ("Constitutn Jewel" vs
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
