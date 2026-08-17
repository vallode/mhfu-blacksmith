# mhfu-extract

Datamining pipeline that reads weapon, armor, item, decoration, crafting,
upgrade, hitzone, reward, and quest data directly out of a **Monster Hunter
Freedom Unite / Monster Hunter Portable 2nd G** PSP disc image, and emits it
in the JSON shape consumed by `data/` at the repository root.

This tool is licensed **GPL-3.0** (see `LICENSE`/`NOTICE.md`) — different
from the rest of the (MIT) repository — because it ports cipher and unpacking
code from GPL-3.0 prior art. It never ships in the website build; it is a
dev-time tool run manually (or in a data-refresh CI job) against a disc image
you supply yourself.

**Never commit a game ISO/CSO to this repository.** `.gitignore` at the repo
root excludes common disc image extensions; double check before committing.

## Why this works

Nearly all equipment data (weapons, armor, items, decorations, crafting
recipes, and the entire weapon upgrade tree) is stored as static, fixed-size
arrays inside the game's main executable (`EBOOT.BIN`). Monster hitzones and
carve/capture/break rewards live in two overlay files inside `DATA.BIN`
(`game_task.ovl`, `game_sub.ovl`). Quests are individual `.mib` files, also
inside `DATA.BIN`. See `NOTICE.md` for the reverse-engineering sources this
is built on, and the plan doc this shipped from for the full research
writeup.

**Not extractable this way:** monster HP/attack/defense (believed to live in
undocumented per-monster `emXX.ovl` overlays), flavor text, and a few
cosmetic groupings. These are supplied by hand-authored files under
`src/overlay/` and merged in at emit time — see "Overlay data" below.

## Usage

```bash
# from the repo root
pnpm --filter mhfu-extract unpack  --iso /path/to/mhfu.iso --out .cache/mhfu
pnpm --filter mhfu-extract extract --unpacked .cache/mhfu --out .cache/mhfu/extracted
pnpm --filter mhfu-extract diff    --extracted .cache/mhfu/extracted --data ../../data
```

- `unpack` reads the ISO (or `.cso`), decrypts `EBOOT.BIN` and `DATA.BIN`,
  and writes plain files to `--out` (an EBOOT dump, `data-bin/<index>` files
  named via `vendor/fuctool/filelist.csv`, and detected region info).
- `extract` reads the unpacked directory and produces `data/*.json`-shaped
  output plus `EXTRACTION.json` provenance manifest.
- `diff` compares extracted output against the repo's committed `data/`
  directory field-by-field and classifies mismatches.

### Region support: JP only, for now

`unpack`'s `DATA.BIN`/`PARAM.SFO` layer can detect all three known discs
(`jp` `ULJM05500`, `us` `ULUS10391`, `eu` `ULES01213`), but **`extract`'s
EBOOT table reader only supports the JP disc (MHP2G, `ULJM05500`)**.

We validated the JP and EU EBOOTs against real disc dumps and found that a
single constant "region rebase" (the originally planned design — one fixed
offset shift applied to every table for a given region) does not hold:
localized string data inserted at different points in the EU binary shifts
different tables by *different* amounts (confirmed by locating the same
region-independent weapon-stat bytes at different real shifts per table:
`0x2ab8` for `weaponClassMods` vs. `0x2b04` for `weaponsBlademaster`/
`weaponsGunner`/`decorationSkills` vs. `0x2f60` for `itemTable`, all in the
same EU EBOOT). Supporting US/EU properly needs per-table signature-based
address discovery instead of a static offset table — deferred until the JP
pipeline is fully working end-to-end. English names are bootstrapped from
the `mhp2g-patterns` enums (not disc strings), so this restriction doesn't
block English output later.

### EBOOT decryption

`EBOOT.BIN` on the disc is KIRK-encrypted. `unpack` tries, in order:

1. Passthrough, if the file already starts with the ELF magic (i.e. you
   already have a decrypted dump).
2. An external `pspdecrypt` binary on `PATH`, if present.
3. A `--eboot <path>` flag pointing at a pre-decrypted dump (e.g. from
   PPSSPP's `Debug → Dump Decrypted EBOOT.BIN`).

Native in-process KIRK decryption is not implemented yet — see the plan's
"Known unknowns". Path 2 (external `pspdecrypt`, GPL-3.0, built from
https://github.com/John-K/pspdecrypt) has been validated against both real
JP and EU EBOOTs: `pspdecrypt -o out.elf EBOOT.BIN` produces a valid ELF.

### `DATA.BIN`

`DATA.BIN` uses a documented substitution+XOR cipher (`src/container/databin.ts`,
ported from `mhef`) and is decrypted fully in-process; no external tool
needed.

## Overlay data

`src/overlay/*.json` holds the small set of fields that cannot be derived
from the disc: monster HP/attack/defense multipliers, monster flavor text,
the presentation-only monster category grouping (`bird-wyvern`, `pelagus`,
...), and hunting horn melody effect descriptions. `emit/` merges these in by
slug/name and records provenance (`"source": "overlay"` vs `"source":
"extracted"`) per field in `EXTRACTION.json` — extracted data always takes
priority when both exist.

## Tests

```bash
pnpm --filter mhfu-extract test
```

Tests exercise the binary readers, cipher, and struct decoders against
small hand-built fixture buffers (no game files needed/included).
