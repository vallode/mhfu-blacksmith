# Notice

`mhfu-extract` is licensed under the GNU General Public License v3.0 (see
`LICENSE`), which differs from the MIT license used by the rest of this
repository. It is a standalone, dev-time-only tool: its output (JSON game
data) is not a derivative work, but the extraction code itself builds on
GPL-3.0 and MIT prior art from the Monster Hunter modding community, credited
below.

## Vendored / ported material

- **`vendor/mhp2g-patterns/`** — [IncognitoMan/mhp2g-patterns](https://github.com/IncognitoMan/mhp2g-patterns)
  (MIT). ImHex binary pattern definitions and name enums for MHP2G/MHFU's
  EBOOT.BIN, quest, and overlay formats. Vendored verbatim under
  `vendor/mhp2g-patterns/LICENSE`. This is the primary source for every
  struct layout and memory address used in `src/tables/`, `src/monsters/`,
  and `src/quests/`.
- **`vendor/fuctool/filelist.csv`** — [FUComplete/FUCTool](https://github.com/FUComplete/FUCTool)
  (GPL-3.0). Maps all 6,602 `DATA.BIN` file indices to their original
  Capcom paths. Vendored verbatim under `vendor/fuctool/LICENSE`.
- **`src/container/databin.ts`** — the `DataCipher` substitution/XOR
  algorithm and TOC layout are ported from [svanheulen/mhef](https://github.com/svanheulen/mhef)
  (`mhef/psp.py`, GPL-3.0) and [svanheulen/mhff](https://github.com/svanheulen/mhff)
  (`psp/data.py`, GPL-3.0).
- **`src/quests/mib.ts`** — the `QuestCipher` constants are likewise ported
  from `svanheulen/mhef`. mhef documents this cipher as being for quests
  downloaded from Capcom's (now-defunct) DLC websites, but every on-disc
  retail quest under `mission_jpn/*.mib` is wrapped in it too, on top of the
  disc-wide `DataCipher` — confirmed against a real JP disc quest (SHA1
  header match + correct `quest.hexpat` magic after both cipher layers).
- **Region rebase constants** (`US = JP + 0x2C24`, `EU = JP + 0x2B04`) were
  cross-derived against [GReinoso96/MHEdit](https://github.com/GReinoso96/MHEdit)
  and independently verified against the structural invariants in
  `src/tables/offsets.ts`.
- **Overlay format** (`MWo3` header, base-address rebasing) documented by
  [SiD3W4y/mhfu-re](https://github.com/SiD3W4y/mhfu-re).

None of the above vendors game assets, copyrighted Capcom text, or ROM data —
only third-party reverse-engineering documentation and code. The game disc
itself is never committed to this repository; see `README.md`.
