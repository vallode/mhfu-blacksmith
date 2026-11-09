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
`recipe-amounts` and `costs` are so far tested only against the synthetic
disc the tests build (`test/fixtures.ts`). A PSP with custom firmware isn't
tested. Run `roundtrip` on a new disc first.

## Usage

```bash
# from tools/randomfu
pnpm roundtrip --iso /path/to/mhp2g.iso
pnpm randomize --iso /path/to/mhp2g.iso --out /path/to/random.iso --seed MYSEED
```

- `roundtrip` re-encrypts every quest and both monster overlays without
  changing them and checks the result matches the disc byte for byte. If it
  passes, edited files are written the way the game expects to read them.
  It writes nothing.
- `randomize` copies the image (`.iso` or `.cso`; the output is always an
  `.iso`), shuffles, writes the changes in place, reads every changed file
  back to check it, and writes `random.spoiler.txt` next to the output.
  - `--seed` picks the seed; without it a random one is chosen and printed.
  - `--shuffles` is a comma-separated list. The default is
    `quest-rewards,monster-rewards`.
  - `--amount-spread` / `--cost-spread` (0 up to 1, default 0.5): how far
    `recipe-amounts` and `costs` may move a value, e.g. 0.5 means 50% to
    150%.
  - `--spoiler <path>` writes the log somewhere else.
  - `--dry-run` reads the disc and prints the spoiler log without writing
    an image (`--out` isn't needed).
  - `--eboot <path>` / `--pspdecrypt-bin <name>`: how to decrypt the EBOOT
    for the EBOOT shuffles (`recipes`, `recipe-amounts`, `costs`), as for
    `mhfu-extract unpack`. PPSSPP can dump it: turn on "Dump Decrypted
    Eboot.bin on game boot" and boot the game once.
  - `--force` overwrites an existing output file.

The same disc, seed and settings always give the same output. Each shuffle
draws from its own random stream, so turning one on or off doesn't change
what the others do. `LOGIC_VERSION` in `src/randomize.ts` is printed in the
spoiler log and must be bumped whenever a change alters a seed's output.

## Shuffles

No shuffle changes a list's length, so every edited file keeps its size.

| Shuffle           | Data                                                | What changes                                         |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `quest-rewards`   | `RewardTBL` items in each quest `.mib`              | Item and amount move; the chance stays with the slot |
| `monster-rewards` | Carve, capture and break lists in `game_sub.ovl`    | Item moves; chance and amount stay with the slot     |
| `recipes`         | `EquipmentCreate` / `EquipmentUpgrade` in the EBOOT | Material moves; quantity stays with the slot         |
| `recipe-amounts`  | The same recipe tables                              | Quantities, rescaled and varied (see below)          |
| `costs`           | Weapon, armor and decoration prices in the EBOOT    | Crafting and upgrade costs, varied in steps of 10z   |

### Logic

Items only move within a **tier**: a rank (Low, High or G) and a star level.

- A quest's tier is its header rank and star level. Only Village and Guild
  quests take part, on one star scale (Village 3★ and Guild 3★ are the same
  tier). Training School, Treasure Hunting, unused slots and the 90 unused
  gathering copies are left alone, so no item is moved somewhere a player
  can't reach, and they don't count as sources.
- A monster reward list takes part if it's used at exactly one rank, by a
  monster that appears in a Village or Guild quest at that rank. Its tier is
  the lowest star level of those quests.
- Gathering points count as sources but aren't shuffled. Only item tables a
  node uses count (`src/game/gathering.ts`).
- An item's tier is the earliest one it's found at among those quest
  rewards, monster rewards and gathering points. A recipe slot is shuffled
  with other slots whose items have the same tier.

The reward shuffles keep every tier's items within that tier, so every
recipe material is still found at or before the star level it was before.
`checkRecipes` confirms this against the shuffled rewards; any failure is
printed and listed at the top of the spoiler log. The end of the log lists
the tier found for every item, to check against the game.

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
