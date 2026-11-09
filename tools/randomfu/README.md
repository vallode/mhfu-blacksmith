# randomfu

A seeded randomizer for **Monster Hunter Freedom Unite / Monster Hunter
Portable 2nd G**. It reads your own disc image, shuffles game data, and
writes a new ISO plus a spoiler log. It never ships game data: like other
randomizers, it only edits a copy of a disc you supply.

Licensed **GPL-3.0-or-later** (see `LICENSE`), because it builds on
`tools/mhfu-extract`'s readers and ciphers, which are GPL.

**Never commit a disc image, a randomized image or a spoiler log.**

## Status

Early. Everything below is tested only against a synthetic disc built by
the tests (`test/fixtures.ts`), not a real one yet. Run `roundtrip` on your
disc first, then try a randomized image in PPSSPP.

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
  - `--spoiler <path>` writes the log somewhere else.
  - `--dry-run` reads the disc and prints the spoiler log without writing
    an image (`--out` isn't needed).
  - `--eboot <path>` / `--pspdecrypt-bin <name>`: how to decrypt the EBOOT
    for the `recipes` shuffle, as for `mhfu-extract unpack`.
  - `--force` overwrites an existing output file.

The same disc, seed and settings always give the same output. Each shuffle
draws from its own random stream, so turning one on or off doesn't change
what the others do. `LOGIC_VERSION` in `src/randomize.ts` is printed in the
spoiler log and must be bumped whenever a change alters a seed's output.

## Shuffles

All shuffles move things between existing slots: no list changes length,
so every edited file keeps its size.

| Shuffle           | Data                                                | What moves                                      |
| ----------------- | --------------------------------------------------- | ----------------------------------------------- |
| `quest-rewards`   | `RewardTBL` items in each quest `.mib`              | Item and amount; the chance stays with the slot |
| `monster-rewards` | Carve, capture and break lists in `game_sub.ovl`    | Item only; chance and amount stay with the slot |
| `recipes`         | `EquipmentCreate` / `EquipmentUpgrade` in the EBOOT | Item only; quantity stays with the slot         |

### Logic

Items only move within a **rank band** (Low, High or G Rank):

- A quest's band comes from its header rank. Only Village and Guild quests
  take part. Training School, Treasure Hunting, unused slots and the 90
  unused gathering copies are left alone, so no item is moved somewhere a
  player can't reach.
- A monster reward list takes part if it's used at exactly one band, by a
  monster that appears in a Village or Guild quest at that band.
- An item's band is the lowest band it's found at among those quest and
  monster rewards. A recipe slot is shuffled with other slots whose items
  have the same band.

Because both reward shuffles keep every band's items within that band,
every recipe material is still found at or below the rank it was before.
`checkRecipes` confirms this against the shuffled rewards; any failure is
printed and listed at the top of the spoiler log.

Not modelled yet: gathering points, shops and combining (items found only
there keep their recipe slots), and star levels within a rank.

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

- Whether PPSSPP (and a PSP with custom firmware) boots the decrypted EBOOT.
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
