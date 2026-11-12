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
recipes, the entire weapon upgrade tree, and item combinations) is stored as static, fixed-size
arrays inside the game's main executable (`EBOOT.BIN`). Quests are
individual `.mib` files inside `DATA.BIN`. See `NOTICE.md` for the
reverse-engineering sources this is built on.

Monster hitzones, status tolerances and carve/capture/break rewards live in
the `game_task.ovl` and `game_sub.ovl` overlays, also in `DATA.BIN` (see
"Monster overlays" below).

**Not extractable this way:** flavor text and a few cosmetic groupings.
Equipment-side gaps of this kind
come from hand-authored files under `src/overlay/` — see "Overlay data".

## Usage

```bash
# from the repo root
pnpm --filter mhfu-extract unpack  --iso /path/to/mhfu.iso --out .cache/mhfu
pnpm --filter mhfu-extract extract --unpacked .cache/mhfu --out .cache/mhfu/extracted
pnpm --filter mhfu-extract diff    --extracted .cache/mhfu/extracted --data ../../data
pnpm --filter mhfu-extract compare --extracted .cache/mhfu/extracted --data ../../data
pnpm --filter mhfu-extract build-data --extracted .cache/mhfu/extracted --data ../../data --markdown .cache/mhfu/changes.md
pnpm --filter mhfu-extract item-icons --unpacked .cache/mhfu
pnpm --filter mhfu-extract area-maps --unpacked .cache/mhfu
pnpm --filter mhfu-extract quest-flags --unpacked .cache/mhfu
pnpm --filter mhfu-extract quest-probe --quests .cache/mhfu/extracted/raw/quests.json --tsv .cache/mhfu/quest-size.tsv
pnpm --filter mhfu-extract quest-text-scan --unpacked .cache/mhfu --quest 10109
pnpm --filter mhfu-extract messages --unpacked .cache/mhfu --file 4781 --grep Velocidrome
```

- `unpack` reads the ISO (or `.cso`), decrypts `EBOOT.BIN` and `DATA.BIN`,
  and writes plain files to `--out` (an EBOOT dump, `data-bin/<index>` files
  named via `vendor/fuctool/filelist.csv`, and detected region info).
- `extract` reads the unpacked directory and produces `data/*.json`-shaped
  output plus `EXTRACTION.json` provenance manifest. `--raw` also writes
  numbers-only dumps to `raw/` (sharpness, weapons, gunner, armor, and
  `quests.json`: each quest's header words, raw `RewardTBL` entries,
  script packets, whole monster records, and its text layout as offsets
  and lengths). It also writes `melodies.json`: candidate hunting horn
  note-set tables, found by searching the EBOOT and both overlays for a
  table whose entry `NoteGLType` holds each horn's committed notes, plus
  the blocks densest in the committed melody note sequences and the bytes
  around both (`src/emit/melody-raw.ts`).
- `diff` compares extracted output against the repo's committed `data/`
  directory field-by-field and classifies mismatches.
- `compare` reports per-file, per-field agreement between the two, pairing
  items by game ID and ignoring order and spelling. See "Building `data/`
  from the disc".
- `build-data` rewrites committed `data/` from the extracted output. See
  "Building `data/` from the disc".
- `item-icons` slices the item icons out of the UI atlas into the site's
  `public/images/`. See "Items".
- `area-maps` writes the area map textures `data/gathering.json` uses to
  the site's `public/images/area-maps/`. See "Area maps".
- `quest-probe` summarises `extract --raw`'s `raw/quests.json` for the
  open quest questions (`src/emit/quest-probe.ts`): the values the monster
  size candidates take, the header's two objective slots, each script
  opcode and how often its arguments equal the quest's `TargetID` or a
  large monster, and how quest text is
  laid out. `--tsv` also writes every large monster record's candidate
  bytes, one row per record. Numbers only. See "Monster size", "Quest
  text" and "Quest script".
- `quest-text-scan` searches every unpacked file but the quests for one
  quest's own strings, and reports where they're found, the `.pac` entry,
  and the pointers to them, plus the headers of the likely message files
  (`src/quests/text-scan.ts`). It also counts single words of the quest's
  text (monster names and the like) in every file as UTF-8 and UTF-16LE,
  and shows 64 bytes of each likely message file's string data. The
  report names whole strings only by language and field. See "Quest
  text".
- `messages` reads one message file (`src/strings/messages.ts`) and prints
  its tables, the strings containing `--grep`, or a run of strings
  (`--table`, `--from`, `--count`), with control bytes as `\xNN`. It prints
  game text, so keep the output out of the repository.
- `quest-flags` searches the unpacked EBOOT and overlays for the table
  that maps quest IDs to their "cleared" bit in a save, and writes
  `quest-flags.json` (or `--out`). See "Save quest flags".

### Region support: JP and EU equipment both fully wired into `extract`

`unpack`'s `DATA.BIN`/`PARAM.SFO` layer can detect all three known discs
(`jp` `ULJM05500`, `us` `ULUS10391`, `eu` `ULES01213`), and **`extract` now
runs its full equipment pipeline (weapons/armor/decorations/recipes) for
both JP and EU** — the table-address lookup underneath it is no longer a
JP-only hardcoded assumption. It goes through a pluggable
**table address resolution strategy** (`src/tables/resolver.ts`) and a
**game profile** (`src/tables/profile.ts` + `src/games/mhp2g.ts`), so a
region/game can supply either a static offset table (the JP fast path) or a
signature-based resolver (the mechanism EU needs), and a future game could
supply its own profile entirely. This section describes that architecture,
exactly what's validated and wired for EU today, and what's left.

#### Why a static offset table doesn't work for EU

We validated the JP and EU EBOOTs against real disc dumps and found that a
single constant "region rebase" (the originally planned design — one fixed
offset shift applied to every table for a given region) does not hold:
localized string data inserted at different points in the EU binary shifts
different tables by _different_ amounts (confirmed by locating the same
region-independent weapon-stat bytes at different real shifts per table:
`0x2ab8` for `weaponClassModifiers` vs. `0x2b04` for `weaponsBlademaster`/
`weaponsGunner`/`decorationSkills`/`sharpnessTable`/`bowgunShotTable`/
`bowChargeTable`/`dualAttributeWeapons`/`equipmentCreate`/
`equipmentUpgrade`/`modelToWeaponType` vs. `0x2f60` for `itemTable`/
`decorationValues`, all in the same EU EBOOT). English names are
bootstrapped from the `mhp2g-patterns` enums (not disc strings), so table
coverage for a region doesn't block English output either way.

#### Architecture: `TableAddressResolver` + `GameProfile`

- **`TableAddressResolver`** (`src/tables/resolver.ts`) is the abstraction a
  table reader ultimately resolves an address through: `resolve(table, buf?)
-> fileOffset`. Two implementations exist:
  - **`StaticOffsetResolver`** — the pre-existing JP mechanism, generalized:
    a fixed `baseAddress` plus a `table -> virtual address` map, computed
    without needing the buffer at all. `offsets.ts`'s `JP_BASE_ADDRESS`/
    `JP_TABLE_ADDRESSES` are unchanged data; `tableOffset()` (still the
    function every `tables/*.ts` reader calls, with its original zero-buffer
    signature) now internally builds a `StaticOffsetResolver` and delegates
    to it — confirmed byte-for-byte identical before/after this refactor
    (pinned in `test/game-profile.test.ts`).
  - **`SignatureResolver`** — the new mechanism, for regions where addresses
    shift unpredictably per table. Given a `table -> { signature bytes,
signatureOffset }` map, it searches the target buffer for each table's
    signature and requires _exactly one_ match (zero or multiple matches
    both fail loudly, naming the table, rather than silently resolving to a
    wrong address). A signature's bytes must be region-independent — i.e.
    raw gameplay values (stats, prices, item IDs), never pointers or
    localized strings, since those are exactly the things that _do_ change
    between regions/localizations.
  - **`extractSignature()`** is a small dev-tool helper for deriving a new
    `TableSignature` from a known-good buffer via an existing resolver
    (typically JP's `StaticOffsetResolver`) — this is how
    `eu-signatures.ts`'s entries were produced, and is the reusable
    building block for adding a region table-by-table instead of hand-rolling `buf.subarray()` in a throwaway script
    each time.
- **`GameProfile`** (`src/tables/profile.ts`) bundles one game's table
  knowledge — a declarative `tables: TableDescriptor[]` list (entry
  size/count, where known) plus `resolverForRegion(region) ->
TableAddressResolver | null`. `null` means "no support at all for this
  region yet" (e.g. MHP2G + `us`, since no US disc is available to derive
  anything from); a non-null resolver that throws per-table (like
  `SignatureResolver` does for anything outside `EU_ALL_SIGNATURES`) means
  "partial support — some tables work, ask for one you haven't validated
  and you'll get a clear error, not a wrong answer."
- **`src/games/mhp2g.ts`** is the one real profile today: `MHP2G_PROFILE`.
  `resolverForRegion("jp")` returns a `StaticOffsetResolver` built from
  `JP_BASE_ADDRESS`/`JP_TABLE_ADDRESSES` (identical behavior to before this
  work); `resolverForRegion("eu")` returns a `SignatureResolver` built from
  `src/tables/eu-signatures.ts`'s `EU_ALL_SIGNATURES`; `resolverForRegion("us")`
  returns `null`. `MHP2G_EMIT_TABLES` lists exactly the tables `emit/*.ts`
  needs — `cli/extract.ts` checks a region's resolver covers all of them
  (`verifyResolverCoverage()`, `resolver.ts`) before trusting it for real
  output.
- This intentionally mirrors the existing "region-aware but game-agnostic"
  pattern already proven by `DataCipher`/`QuestCipher`
  (`container/databin.ts`, `quests/mib.ts`): a plain `Region` parameter into
  otherwise-stateless logic, not a heavier class hierarchy or plugin
  registry.
- **Directory layout**: existing `src/tables/*.ts` struct readers
  (`weapons.ts`, `armor.ts`, `sharpness.ts`, `decorations.ts`, `items.ts`,
  `recipes.ts`) each take an optional trailing `resolver?: TableAddressResolver`
  parameter now. Omitted (the default everywhere in the codebase that
  doesn't explicitly pass one, e.g. every existing test), a reader
  reproduces its exact original JP-only behavior byte-for-byte (still via
  `tableOffset()`); passed (e.g. `MHP2G_EU_RESOLVER`), it reads the same
  struct layout from wherever that resolver locates the table instead. This
  is MHP2G's struct-reading code, just not namespaced as such yet (there's
  only ever been one game). The `src/games/` directory is where a second
  game's profile would live (e.g. a hypothetical `src/games/mh1.ts`)
  without needing `resolver.ts` or `profile.ts` to change shape.

#### EU status

Every table `emit/*.ts` needs resolves for EU, either by a direct signature
or, for the two pointer tables (`armorValuePointers`, `bowgunModTable`), by
signature-matching the pointed-to data directly. Each table's full contents
were diffed against JP and came back byte-identical, and a real EU `extract`
run produces equipment output identical to JP's. `eu-signatures.ts`'s module
comment has the methodology and per-table offsets; every signature is pinned
in `test/game-profile.test.ts`.

Open:

- **US**: `resolverForRegion("us")` is `null` — no US disc to derive
  signatures from ([#37](https://github.com/vallode/mhfu-blacksmith/issues/37), which also covers other games such as
  MH1/MHF1).
- **EU quests**: all 551 parse
  ([#36](https://github.com/vallode/mhfu-blacksmith/issues/36)). An earlier run
  skipped 32 because its unpack named EU files with JP indices: EU quest
  files sit 32 entries later, so 32 non-quest entries were named
  `m00001`-`m01013` and the last 32 real quests (`m30070` onwards) got
  non-quest names. A region-aware unpack (see "`DATA.BIN`") fixes it.
- `diff` compares stats, not text: names come from the English
  `mhp2g-patterns` enums for every region. Committed skill names are
  rewritten to the extractor's spelling before comparing (see "Overlay
  data").

### EBOOT decryption

`EBOOT.BIN` on the disc is KIRK-encrypted. `unpack` tries, in order:

1. A `--eboot <path>` flag pointing at a pre-decrypted dump (e.g. from
   PPSSPP's `Debug → Dump Decrypted EBOOT.BIN`).
2. Passthrough, if the file already starts with the ELF magic (i.e. you
   already have a decrypted dump).
3. In-process decryption (`src/container/prx.ts`, below).
4. An external `pspdecrypt` binary on `PATH`, if present.

If you only need `DATA.BIN`'s files (models, textures, quests), pass
`--skip-eboot` to skip this step entirely. The manifest then records
`"eboot": false`, and `extract` refuses to run on that output since it reads
equipment tables from the EBOOT.

In-process decryption (`src/container/prx.ts`, with AES in `aes.ts`) is a
port of the schemes game EBOOTs use, PPSSPP's PRX decryption
(Core/ELF/PrxDecrypter.cpp and libkirk, GPL-2.0+), with the keys published
there: "type 0" and "type 1" for tag `0xC0CB167C` (firmware 2.xx EBOOTs,
which is what a real MHFU/MHP2G disc's EBOOT turned out to use), and
"type 2" for the later game tags (`0xD916xxF0`, `0x8004FD03`). It's pure
TypeScript, so it also runs in randomfu's web app; a compressed EBOOT is
unzipped after. KIRK 1's CMAC isn't checked, but the header's SHA-1, the
ELF magic and the table signatures `extract` resolves all are. It's tested
against Node's AES and FIPS-197, and on EBOOTs built by running its steps
backwards (`test/prx-fixture.ts`); **it hasn't yet been run on a real
disc's EBOOT.** A module it can't open falls through to path 4.

Path 4 (external `pspdecrypt`, GPL-3.0, built from
https://github.com/John-K/pspdecrypt) has been validated against both real
JP and EU EBOOTs: `pspdecrypt -o out.elf EBOOT.BIN` produces a valid ELF.

### `DATA.BIN`

`DATA.BIN` uses a documented substitution+XOR cipher (`src/container/databin.ts`,
ported from `mhef`) and is decrypted fully in-process; no external tool
needed.

FUComplete (a patched JP disc, still `ULJM05500`) stores `DATA.BIN` without
the cipher. `unpack` reads the table of contents both ways and uses the one
that is valid, so it takes either disc; `manifest.json` records which in
`dataBinEncrypted`, and the disc's `TITLE`. FUComplete's `EBOOT.BIN` is
already decrypted and keeps every equipment table at its JP address, and its
overlays keep the monster tables at theirs. A v1.4.0 disc extracts in full
(6,602 entries, all 551 quests).

`unpack` names each entry from `vendor/fuctool/filelist.csv`, which indexes
the **JP** disc's 6,602 entries. The EU disc has 6,657: 57 EU-only entries
(mostly localized text and UI) and two JP modules it lacks, which shift
everything after them by up to 55. `src/container/filelist-eu.json` maps EU
indices back to JP ones. It was derived by aligning a real EU dump against
`filelist.csv` by file type (model/texture/container magics and the
`.phd`/`.bd` sound-bank pairing), with every mapped entry's type matching.
EU-only entries keep the `_unindexed/<index>.bin` name. US has no alignment
yet and falls back to JP indices.

### Quests (`.mib`)

Every quest file under `mission_jpn/*.mib` needs a **second** decryption
pass after `DataCipher`: mhef's `QuestCipher` (`src/quests/mib.ts`), which
mhef documents as being for DLC-downloaded quests only. Empirically, on-disc
retail quests are wrapped in it too — confirmed against a real JP disc quest
(filelist.csv index 4759, `mission_jpn/m00001.mib`): after `DataCipher`
alone the bytes are indistinguishable from noise, but decrypting with
`QuestCipher` (JP salt) yields a matching SHA1 header, the exact
`quest.hexpat` magic, and a plausible `questHeader` (rank 0, 1-star, fee
100z, reward 1200z, quest ID 1 — sensible for the first quest file).

Once decrypted, `src/quests/parser.ts` reads the struct layout itself
(header, supplies, rewards, large/small monster spawn tables, and quest
text). Two things worth flagging for anyone extending it:

- Every pointer field in a `.mib` is **file-relative**, unlike EBOOT.BIN/
  `.ovl` virtual addresses — no base-address rebase needed.
- Quest text is **UTF-8**, even on the JP disc — not Shift-JIS, which would
  have been the safer assumption. Confirmed by decoding a real quest's
  strings into coherent Japanese (title "強敵、ドスギアノス現る！",
  goal "Hunt 1 Giadrome", client "An energetic young boy"), which also
  cross-validates against the same quest's monster/reward/supply data (all
  about hunting a Giadrome and its Giaprey pack).

Gathering points are read too (see "Gathering points" below). Not
implemented (out of scope for now): `QuestScript` (opcodes are marked
"TBD" even in the upstream pattern; see "Quest script" below) and arena
sets. The quest-wide monster size is decoded; its spread isn't
(see "Monster size" below).

### Monster overlays: hitzones, tolerances and rewards

`game_task.ovl` and `game_sub.ovl` use the `MWo3` container
(`src/container/ovl.ts`): a 0x80-byte header (magic, `loadBase`/`loadEnd`,
name), then the image. The header is loaded too, so `loadBase` is the vaddr
of file offset 0. (An earlier version mapped it to offset 0x80, which put
every pointer 0x80 bytes past its target; that is why the first
investigation, [#35](https://github.com/vallode/mhfu-blacksmith/issues/35),
found no pointer to the rows it located.) With that fixed, the vendored
`game_task.hexpat`/`game_sub.hexpat` layouts hold, with the corrections in
the module comments:

- **Chunks** (`src/monsters/hitzones.ts`): `MonChunk[90]`, 0x1D0 bytes each,
  indexed by emID. `+0x10C` is one pointer to a `HitzoneTbl` list (u32
  pointers up to the first non-pointer), each to 10-byte rows ending in a
  zero u16: a lead byte (100, 90, 80, …; meaning unknown), then cut, bash,
  shot, fire, water, **ice, thunder**, dragon, KO. Every table has 7 rows;
  small monsters use row 0. Gravios, Basarios, Congalala, the elder dragons
  and others have a second table for a broken or enraged state, the
  Hermitaurs a third. `+0x110` holds the tolerances: paralysis, KO, sleep,
  an unknown status (5 u16: initial, recovery time, recovery, duration,
  increase) and poison (7 u16).
- **Rewards** (`src/monsters/rewards.ts`): `bodytailshiny[89]` (entry `i`
  is emID `i + 1`) and `capbreakindex[]` (carrying its own emID and a type,
  128 = capture, else a break part number). Each holds a u16 index per rank
  slot (unranked, low, high, treasure, training, G, misc) into a pointer
  table directly before it, leading to `{chance, item}` (carves) or
  `{chance, item, amount}` (captures, breaks) lists ending in `0xFFFF`.
  `locateRewardTables` finds the pointer tables as runs of exactly 1088 and
  924 pointers (the JP counts).
- **EU** (ULES01213): the overlays load at other bases
  (`0x09a5f200`/`0x09c19000`), the chunk array sits 0x110 bytes past its JP
  file offset and both reward table pairs 0x310 past theirs. The chunk
  array is found by scoring shifts (`locateMonsterChunks`), the reward
  tables by their pointer runs.

- **Base HP and quest multipliers** (`src/monsters/multipliers.ts`): the
  chunk's `+0x100` is the base HP (Felyne 40, Yian Kut-Ku 1600, Rathian
  4000, Lao-Shan Lung 26666). Quests scale it, and attack, defense and
  flinch thresholds, by a row of four floats in a 32-row table. The tables
  follow the hitzone pool in sets of three, reached from a master list of
  four sets (EU: master list at file offset `0x168c80`). `game_task` picks
  the row as `master[set][table][power]` (EU `0x09AC9020` HP,
  `0x09AC9180` attack, `0x09AC9218` defense):
  - the set is the monster's own, the s8 at its chunk's `+0x14F`: 0 small
    monsters, 1 large monsters, 2 the Fatalis trio, 3 Lao-Shan Lung,
    Ashen Lao-Shan Lung, Shen Gaoren, Yama Tsukami, Akantor and Ukanlos.
    Sets 2 and 3 repeat one table three times.
  - the table is the quest header's u8 at `0x49` (`Unkn6` in the hexpat,
    `statTable` here), which the EBOOT's quest loader (EU `0x08869DEC`)
    copies into the quest state. 0 is the usual table, 1 one with lower
    HP, 2 one with hand-set rows (Training School, Treasure Hunting and a
    few Guild quests).
  - the row is the large monster's `power` byte (0-31).

  HP is `trunc(base HP * hp)`. Furious Rajang's attack and defense are
  multiplied again by a value set at run time. `extract` writes each
  large monster's row to `data/quests` as `multipliers`, and with `--raw`
  the tables to `raw/monsters.json`.

The per-monster `emXX.ovl` files aren't needed: every chunk's hitzones are
in `game_task.ovl`.

`extract` emits `monsters/<type>.json` from these (`src/emit/monsters.ts`)
and, with `--raw`, the decoded tables as `raw/monsters.json`. The disc has
part and break numbers, not names, and no drop-group labels, so
`src/overlay/monsters.json` maps each committed hitzone part to a (table,
row) and each committed drop group to a slot (`"body/low"`,
`"break:2/high"`), plus the site name and file. It was generated by
matching the committed data against the EU disc, then reviewed:

- **Hitzone parts:** by value, one row per part within each monster. 389
  of 400 parts match a row exactly; the other 11 take the one row left over
  (1–4 values off, listed in the PR) and are site errors.
- **Drop groups:** by label. A "1-2 star…" rank is the unranked slot,
  "low"/"high"/"g" ranks their slots, and the group's first word its kind.
  Break part numbers come from votes of exact list matches across ranks.
  695 of 730 groups are mapped. The other 35 stay as committed: 6 "live
  carving" groups (no disc kind), 10 with no disc slot (the elder dragons'
  and Lao-Shan Lung's "body carves (x9)", Nargacuga's high-rank body
  carves, two Yama Tsukami G-rank groups), 13 Congalala shiny drops the
  site splits into several groups for one disc slot, and the 6 groups of 5
  break parts whose number only elimination would give (Terra Shogun
  Ceanataur "shell", Lao-Shan Lung "right shoulder", Fatalis "2nd horn",
  Akantor "chest", Ukanlos "claws").

Monsters pair with the site by emID through the same overlay (the enum
spells two differently: "One-Ear Yian Garuga", "Terra Shogun Ceanatur").
`base_hp` is written to `data/monsters` and shown on the monster page.
`tolerances` is written to `data/monsters` too (`siteTolerances`):
paralysis, sleep, KO and poison in snake_case keys, `null` where `initial`
is 0xFFFF (immune). The fourth status is left out until it is identified
(`initial` 100 or 160 or immune, the rest the same on every monster), and
poison's `damagePerSecond` is written as `damage_interval`: it is 150 on
every monster, so it is likely the ticks between hits.

### Monster hitboxes

Each monster's hitboxes are capsules on its skeleton joints, and each
capsule takes its values from one hitzone row. Worked out on Rathian and
Kelbi (EU disc) by drawing them over the models: the wing capsules trace
the membranes, the legs the legs, and the rows match the parts
`overlay/monsters.json` maps them to.

- **Collision table** (`src/monsters/collision.ts`): the chunk's
  `CollisionPTR` (`+0x50`) points into `game_task.ovl` (Kelbi) or the
  monster's own `overlay/emNN.ovl` (Rathian). Monsters without an overlay
  of their own (variants such as Pink Rathian, and species such as
  Rathalos) point into another monster's: the overlays share load
  addresses, so `export-site` tries those of monsters with the same pointer
  first, then all of them, and takes the one table that fits the monster's
  skeleton (every joint exists, sane sizes). It logs where each borrowed
  table came from, and gives up when several different tables fit.
  0x28-byte records, ending at
  joint 0xFFFF: u16 joint, u16 unknown flag, u16 hitzone row, u16 body part
  (left and right separate), u32 flags, f32 radius, f32[3] start and end
  relative to the joint.
- **Skeleton**: the `.ahi` before the model's PMO (`src/models/ahi.ts`, see
  "Severable tails"), in the same space as the converted mesh. Each bone's
  translation is in its parent's frame, so it is scaled by the parent's
  scale, and scales multiply down the chain; a capsule's offsets are scaled
  by its joint's (its radius isn't). Gravios's and Basarios's neck base
  scales to 0.77 along z: only with the scale carried down do the eye and
  jaw joints land inside the head (ignored, they'd sit past the snout).
  Rotations aren't handled, so capsules below a rotated bone are skipped
  and logged; on the EU disc no capsule is (Yama Tsukami's bones that
  first looked rotated are only scaled). Joints of a detached severed-tail
  chain move with the tail tip.
- **Site file** (`src/monsters/hitboxes.ts`): `export-site` writes
  `public/models/monsters/emNN.hitboxes.json` next to each monster's model:
  each capsule's ends and radius in model space, its row, and the site's
  hitzone parts on that row. The monster page draws them over the 3D model.

Open questions:

- Every monster exported has one or two spheres on its root joint (flags 5
  and 0x300, on joint 1 or 2) around the body's centre, on a row that
  doesn't fit the place (Rathian's on her head's row). They are probably
  body collision, so `hitboxes.ts` skips records with bit 0x4 or 0x200, and
  logs each skip; no other record seen has either bit. The other flag bits
  (0x1, 0x2, 0x100, 0x20000, 0x40000, 0x8000000, ...) appear on whole bodies.
- The second u16 (0 or 1) and the rest of the flags are unknown.
- The `.ahi` rotation format, which capsules on rotated chains would need,
  and whether the game scales a capsule's radius with its joint.

`extract --raw` still dumps the bytes these came from
(`src/emit/collision-raw.ts`), for checking the format on more monsters:

- `raw/collision.json`: each `MonChunk` as hex, every u32 in it that holds a
  user-memory address (and whether it points into `game_task.ovl`, the
  monster's own `overlay/emNN.ovl` or elsewhere), and the target of
  `CollisionPTR`: 0x800 bytes as hex and f32s, plus 0x200 bytes at each
  pointer if the target starts with a pointer list.
- `raw/parts.json`: for working out breakable parts, each `MonChunk`'s
  `emPTRChunk` (the 28 u32s at `+0x158`; the hexpat names the 24th, `+0x1B4`,
  `PartDurabilityPTR`) and 0x200 bytes at each pointer's target, plus
  0x100 bytes at each pointer if the target starts with a pointer list.
  The 24th leads to one 0x18-byte record per monster: nine u16 values,
  one per body part as the hitbox capsules number them (`0xFFFF` unused),
  a u16 part count and a zero u32. Every part has one, unbreakable ones
  too, so they look like flinch damage rather than break data.
- `raw/break-code.json`: every MIPS `lui` + low-half pair in the EBOOT and
  each overlay that builds an address inside `game_sub.ovl`'s reward tables
  (`capbreakindex`, the cap/break pointers, `bodytailshiny`, the carve
  pointers), with 0x200 bytes of code either side, for finding the code
  that links break numbers to body parts. `raw/overlays/` has every overlay
  from `data-bin/overlay/`, copied as is.
- `raw/emmodel.json`: each `emmodel/emNN.pac`'s entries (size, magic, first
  0x40 bytes) and its PMO header, mesh records and vertex-group records,
  with each group's vertex count, weights per vertex and position bounds.
- `raw/emmodel/emNN.<index>.bin`: package entries that are neither PMO nor
  TMH, whole: index 0 is the skeleton, index 3 the motion bank (`motion.ts`).

These dumps come from the disc, so they stay in `.cache/` like the rest of
the extracted output.

### Monster breaks

Each monster's `breaks` (`data/monsters/*.json`) lists the body parts
behind each of its break rewards. A body part is a hitbox capsule's `part`
number, and each has a flinch counter (`monster + 0x582 + part * 8`).
Worked out on the EU disc (vallode/mhfu-blacksmith#121) from the code that
gives break rewards:

- The EBOOT's reward code gives a `capbreakindex` reward for each bit set
  in the quest's per-monster byte (`+0x5C2 + emID`). One function in
  `game_task.ovl` sets those bits (EU `0x09AD7F48`, `setBroken(monster,
type)`).
- **The break table** (`monsters/breaks.ts`), in `game_task.ovl` right after
  the part durability records (`emChunk` `+0x1B4`), has 0x20-byte records:
  emID, body part, flinch count, a broken-hitzones flag, the effect's
  joint, and the break type (0xFFFF for a visual break with no reward). A
  routine (EU `0x09AD4940`) calls `setBroken` for each record whose part
  has just reached its flinch count. It covers 21 species on the EU disc.
- **Species**: the record's emID is compared to the monster's through an
  EBOOT table of 90 pointers to records whose first byte is the species,
  so subspecies use their base species' records. `readSpeciesTable` finds
  the table by its shape.
- **Code-set breaks** (`overlay/breaks.json`): the rest call `setBroken`,
  or queue a break in `+0x776`, from each species' own code in
  `game_task.ovl` or its `emNN.ovl`. Some of these also need HP under a
  fraction of the maximum, or a damage type on the part (`+0x3B0 + part`:
  2 cut, 4 fire, 0x20 dragon). They were read by hand, and each entry
  cites its call.

Each monster's `flinch_thresholds` are the part durability records
themselves (`hitzones.ts` `readFlinchThresholds`): per body part, the damage
it takes before the monster flinches. On a flinch the game refills the
part's counter (`+0x580 + part * 8`) from the record (EU `0x09AD3B10`),
in some cases multiplied by the fourth float of the quest's stat
multiplier row (EU `0x09AD3B88`, `multipliers.ts`: 1.0 to 2.5).

### Combinations

The Combination List is in `EBOOT.BIN` too, as four tables that
`eboot.hexpat` doesn't describe. They were decoded from the EU disc by
following the game's combine code (EBOOT `0x59b6c`-`0x5a6ec` there), and
`src/tables/combinations.ts` finds them by their shape, not an address.
EU file offsets:

| Offset     | Table                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0x1a2d84` | 172 recipes of 10 bytes, sorted by lower-ID ingredient: `u16` other ingredient, `u16` result, `u8` rate class, `u8` quantity class, `u8` own index, `u8` flags, `u8` an older list number (255 on most G-rank-only recipes), `u8` 0 |
| `0x1a343c` | Per item ID, `u8` count and `u8` first recipe of the recipes whose lower-ID ingredient it is: how the game looks a pair up                                                                                                          |
| `0x1a3e18` | The Combination List: both ingredients of each recipe as `u16` pairs in the in-game order (Potion first), ended by `0xffffffff`                                                                                                     |
| `0x1a40cc` | The tables below, one after another                                                                                                                                                                                                 |

After the list: one quantity roll per quantity class (a `u8` first amount,
then the percent chance of that amount and each one after it, summing to
100), pointers to the 7 rolls, the largest amount per class, the success
rate per rate class (100, 95, 90, 85, 75, 65, 55), the Books of Combos
1-5's item IDs, and the rate bonus for owning the first 0-5 of them (0, 5,
10, 20, 30, 50).

The game's success rate is the rate class's, plus the bonus for the books
owned in order from Book 1, plus Combination's 15, 25 or 45 (or minus 5,
10 or 15), at most 100. Flag `0x02` recipes (bombs) always succeed with
Bomber, flag `0x10` recipes (traps and drugged meats) with Trap Master.
Flag `0x01` recipes need the Alchemy skill or the Alchemy Guide. The
Bullet Limit skill makes every combine give the largest amount. Flags
`0x04` and `0x08` are only read by the combine menu's drawing code. The
skill numbers are the `Skills 2` list in `equip.enum`: 69 Bomber,
153-158 Combine Success, 159 Bullet Limit, 160 Alchemy, 194 Trap Master.

`extract` writes `combinations.json` in list order, and `build-data`
(target `combinations`) writes `data/combinations.json` with each item
under its `data/items.json` name. `success_rate` is the rate class's,
before books and skills.

## 3D models (experimental)

```bash
# any .pac file or directory of them -> .glb files, for inspection
pnpm --filter mhfu-extract models --in .cache/mhfu/data-bin --out .cache/mhfu/glb

# the models the website shows -> ../../apps/blacksmith/public/models/ + manifest.json
pnpm --filter mhfu-extract export-site --unpacked .cache/mhfu
```

`models` converts `.pac` model packages (a PMO 1.0 mesh plus a `.TMH`
texture set) into `.glb` files. The source lives in `src/models/`: `pac.ts`
is the container, `pmo.ts` the mesh tables, `ge.ts` the PSP GE display lists
that hold the geometry, `tmh.ts` the textures, `ahi.ts` the skeleton,
`attach.ts` puts severable tails together, `motion.ts` reads monster motions and `animation.ts` makes clips of them, `rig.ts` puts a monster together, `hunter.ts` an armor set on the player's skeleton, `gltf.ts`/`texture.ts`/`png.ts`
the output. Two corrections to mhff's description of PMO 1.0, both
confirmed on real files: mesh records are 0x18 bytes, and materials go
through a per-slot byte map at header offset 0x28.

### Output size

`gltf.ts` makes the files as small as it can (measured on the 567 weapon,
monster and armor models converted so far: 15.56 MB as plain float glTF
with RGBA PNGs):

| Step                                                                                                                  | Total    | Kind                      |
| --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------- |
| Source integers instead of floats (`KHR_mesh_quantization`, `KHR_texture_transform` for the UV scale)                 | 10.35 MB | lossless                  |
| One interleaved vertex buffer and one index buffer per model, duplicate vertices merged, primitives merged by texture | 9.26 MB  | lossless                  |
| meshopt compression (`EXT_meshopt_compression`) after reordering for the vertex cache                                 | 7.21 MB  | lossless                  |
| Lossless WebP (`EXT_texture_webp`) or palette PNG, whichever is smaller                                               | 6.80 MB  | lossless (visible pixels) |
| `export-site` defaults: textures re-quantized to libimagequant quality 80, 12-bit positions, 11-bit UVs               | 6.56 MB  | lossy, visually identical |

Notes:

- The model's per-axis scale moves onto the glTF node, so normals are
  stored pre-multiplied by it (renderers undo it with the inverse-transpose).
  That re-rounds them to 8 bits, within 0.8 degrees of the source.
- Lossless WebP via sharp doesn't keep the colour under fully transparent
  pixels. That removes the purple fringe the source palettes put around
  alpha cut-outs under texture filtering.
- Re-quantizing at quality 80 stays above 40 dB PSNR on every texture;
  12-bit positions move a vertex by at most 1/4096 of the model's extent;
  11-bit UVs move texture coordinates by at most 1/32 of a 64px texel.
- `export-site --lossless` skips the lossy step; `models` is lossless.
- Loaders need the meshopt decoder: three.js's `GLTFLoader` with
  `setMeshoptDecoder(MeshoptDecoder)` (`three/examples/jsm/libs/`), as
  `src/components/ModelViewer.tsx` does.

Status:

- On an EU disc, all 553 `weapon/*.pac` and every `emmodel/*.pac` tried so
  far (em01-em05: Rathian, Fatalis, Kelbi, Mosswine, Bullfango) convert, and
  renders of a spread of them are correct: textured, assembled, right UVs.
  Armor pieces (`player/**`) convert the same way.
- Weapons and armor are the static bind pose: mesh pieces are already in
  model space, so no skeleton is needed to assemble them. Monsters are
  skinned (`src/models/rig.ts` gathers the skeleton, mesh and motions of a
  package): bone nodes `bone_<id>`, four weights a vertex (u8, summing to
  255), the model's scale in the inverse bind matrices instead of on the
  mesh node. `models` writes their clips into the `.glb` (below).
- **Severable tails.** A monster package is `[.ahi skeleton, PMO, .TMH,
motion bank, .ahi, PMO, .TMH]`. In the first skeleton each bone has a part
  byte (0x50 in its record): 1 the head chain, 2 the tail chain, 3 a
  parentless copy of the tail's last bones. Where the tail can be cut, the
  body's tail ends at the cut (closed by a flesh cap), and the tail tip is
  skinned to that copy and modelled around the origin, i.e. inside the
  body, so the game can drop it once cut. `attach.ts` moves the copy onto
  the bones it copies (matched by the leaf's offset from its parent, e.g.
  Cephalos's 46 -> 47 and 43 -> 44 are both +73.07 along z) and the tip's
  vertices with it, through each vertex group's bone palette (`pmo.ts`).
  Only the bones the offset sums need to be unrotated and unscaled (within
  0.01 rad / 1%): Yian Garuga's crest and Basarios's neck don't count, and
  Gravios's ~0.001 rad of authoring noise is ignored. Renders checked for
  all 32 monsters it changes; Lavasioth's copy is already in place, and
  small monsters have none. Skinned, the tip's vertices move from the copy
  to the main bones it lands on (`detachedBoneCounterparts`: 45 and 46 ->
  43, 47 -> 44 on every severable tail), so the tip follows the tail when
  the monster moves, as in the game while the tail is on.
- **Motions.** Entry 3 of a monster package is its motion bank
  (`src/models/motion.ts` has the byte layout). It holds two tables of
  motions per skeleton part: tables 2p and 2p + 1 animate the bones of part
  p, numbered 0-99 and 100 on, and each motion has one record per bone of
  that part, in skeleton order. So a body motion (part 0) plays together
  with the head (1) and tail (2) motions in the same slot, which last as
  long; the tail-tip copy (part 3) has no motions. A bone record holds up to
  nine channels (scale, rotation, translation x/y/z; a missing one keeps the
  bind value) of cubic Hermite keys: s16 value, u16 frame, s16 tangents in
  and out. Scale and translation are 1/16 fixed point, rotation 0x2000 = pi (0x2000 keeps a stance's feet level and Kelbi's lowest bone at exactly 0).
  On an EU disc all 89 banks (em01-em89) parse, 9,995 motions, and in all
  but 3 (em82's, which split its body and head 32/8 bones, not 29/11) every
  motion's bone count is its part's. Driving skinned meshes with them in a
  three.js probe, Kelbi stands with its hooves on the ground at frame 0
  (hip 1411/16 = 88 units up), and Rathian and Cephalos hold natural poses
  mid-motion (Rathian rearing, Cephalos lunging). Open: the Euler order (no order distorts the meshes less
  than another: most vertices follow a single bone), which tangent is which
  (they're equal on most keys). The player's motions are under "Hunter" below. Frames are 1/60 s: the game runs at 30 fps and
  steps motions two frames at a time, so 9,972 of the 9,995 motions last an
  even number of frames (played at 30 a second, they look half speed).
- **Clips.** `animation.ts` turns each slot into one clip over the whole
  skeleton: it samples every frame, converts rotations to quaternions, and
  keeps only the keys glTF interpolation (slerp for rotations) needs within a tolerance (by
  default 0.002 rad, 0.02 units, 0.001 scale); a track that never leaves
  the bind pose is dropped. A part's motion whose bone count isn't the
  part's is left out of its clip. Clips can carry the monster far from the
  origin (Rathian's charge goes ~1,800 units forward).
- A package's second PMO isn't converted: it's effect geometry (a shadow
  quad on the Raths, Cephalos's sand spray, Tigrex's roar ring, Lavasioth's
  lava).
- Names come from the region-aware file list (see "`DATA.BIN`"), so an EU
  dump unpacked before that existed has wrong names (e.g. its
  `weapon/we000.pac` is male waist armor); unpack it again.

`export-site` writes the models the site shows into `apps/blacksmith/public/models/` and
lists them in a manifest split by category, so a page fetches only its own
list (at most ~4 KB): `public/models/manifest/monsters.json`,
`.../weapons/<type>.json` and `.../armor/<slot>.json`. Keys are the site's
own names; values are model IDs, from which `src/lib/models.ts` rebuilds the
file paths:

- **Monsters** map by game ID: `emmodel/emNN.pac` is `emID[NN]` in the
  vendored `monster.enum`, matched to `data/monsters/*.json` by name (with
  aliases for the two names that differ). IDs without a monster page
  (Veggie Elder, Poogie, ...) are skipped. Each monster also gets
  `monsters/emNN.hitboxes.json` (see "Monster hitboxes"), which needs
  `overlay/game_task.ovl` and the `emNN.ovl` files in the unpacked
  directory; the log names any monster without one, and why.
- **Weapons** need `eboot.bin`: each blademaster/gunner table entry, indexed
  by the equipment ID that `data/equipment-ids.json` names, holds the model
  ID of its `weapon/weNNN.pac`. Verified on an EU EBOOT: all 1,500 weapons
  with a page get a model whose `modelToWeaponType` matches the page's type,
  and renders match the site's weapon images.
- **Armor** needs `eboot.bin` too: each armor entry holds a male and a female
  model ID into `player/{m,f}/<folder>/`, read from the same per-slot
  arrays as `src/tables/armor.ts` (see `src/tables/armor-models.ts`). Each
  slot's highest model IDs are exactly the last files in its folder.

Monster motions go next to the models as `monsters/emNN.motions.bin`
(`src/models/motion-pack.ts` has the layout): gzip of the clips as
delta-coded s16 keys, at a looser tolerance (0.5 degrees, 0.1 units), since
glTF's per-track JSON outweighed the key data (about five times the size as
glTF animations; 22.7 MB for all monsters like this). Monsters that share a bank share a
file: the `.glb` names its own in `asset.extras.motions`. Skinning grew the
83 monster models from 6.0 to 7.0 MB. The site's viewer
(`apps/blacksmith/src/lib/motions.ts`, `ModelViewer.tsx`) plays them in
place (the hips keep their horizontal bind position), loops a looping
motion from its loop start as the game does (1,847 of the 3,334 looping
motions have a lead-in before it), and holds the bind pose while hitboxes
show, since those are placed in bind-pose space. A model waits up to 1.5 s
for its motions so it first shows posed, and shows still if they're slower.

Each run replaces the categories it could export and keeps the rest of the
previous manifest, so a run without `eboot.bin` keeps weapons and armor.

### Hunter

`export-site` writes a hunter for the weapon pages' viewer to
`public/models/hunter/` (1.4 MB in all, 245 two-piece weapon models grew by
63 KB). Needs only `player/` and `motion/` from the
unpacked directory; the log says `no hunter: ...` if it can't.

| File                 | Size      | Holds                                                 |
| -------------------- | --------- | ----------------------------------------------------- |
| `hunter.glb`         | 50 KB     | Male Battle armor set, skinned to the player skeleton |
| `common.motions.bin` | 0.9 KB    | The sheathed standing motion, from `plcom_tbl.bin`    |
| `wNN.motions.bin`    | 92-196 KB | Every motion of weapon class NN                       |

- **Skeleton.** 21 bones (`src/models/hunter.ts` lists them), T-pose, origin
  at the hips, left +X, facing +Z. Bones 0-8 are part 0 and 9-20 part 1.
- **Motions.** `motion/plcom_tbl.bin` and `motion/wNN_tbl.bin` are the same
  bank format as a monster's (`motion.ts`), but their tables pair by motion
  group: table 2g moves the 9 lower bones and 2g + 1 the 12 upper bones of
  group g. Weapon files have 3 groups, `plcom` 5. `buildPlayerClips` numbers a
  clip's slot group x 1000 + slot, in the same `MHM1` pack as monsters. Files
  run in the game's weapon class order: 00 great sword, 01 heavy bowgun, 02
  hammer, 03 lance, 04 sword and shield, 05 light bowgun, 06 dual blades, 07
  long sword, 08 hunting horn, 09 gunlance, 10 bow. Slot 1 of group 0 is the
  drawn stance in a weapon file and standing with the weapon away in `plcom`.
  The disc has no names for the rest: the site calls groups 0-1 "Move" and the
  others "Attack", which is a guess from what they look like.
- **Armor.** Each piece has a partial skeleton and sits in that skeleton's
  bind pose; helmets are in `player/<m|f>/hair/`, then `body`, `arm`, `wst`,
  `reg`. `composeHunter` moves each vertex by the distance between its bones'
  places in the piece and in the player, and remaps the palette to player
  joints through `ARMOR_JOINT_MAPS`, copied from `MODEL_JOINT_MAP` in
  tclamb/mhp2g-decomp (`player_manager.joint_map.cpp`).
- **Weapons.** A weapon's `.ahi` has one root per piece the game moves apart:
  the main weapon, then a shield, second blade, quiver or scabbard. `export-site`
  groups the mesh by root, and a weapon with more than one gets a `part_<n>`
  node per piece.
- **Open.** Where the game puts a weapon isn't decoded. In hand, weapons sit in the fist (the middle of the gauntlets' hand vertices), gripped along the wrist joint's Z axis. The great sword, long sword, hammer and hunting horn are the right hand's (it draws and sheathes them alone), but while both hands hold one the right fist stays on the left fist's Z axis at a set distance (53, 62, 79 and 42) in most frames, turning about it, while the left fist wanders in the right's frame. So the viewer moves these to the left fist, along that axis, whenever the right fist is on it, and back to the right fist (in the place they share in the drawn stance) when it isn't. The fists don't say how far round its length a weapon is turned: these take the roll the right fist's own frame gives them, as one-handed weapons do, which matches the game for the Ravager Blade. Bowguns are in the right fist, turned so the stock reaches the left fist in most frames. All of this is a fit to the motions, not read from the game; at the end of a sheathe the weapon is still in the hand, since when the game moves it to the back isn't known. On the
  back they're placed by eye (`WEAPON_MOUNTS` in the site's `src/lib/hunter.ts`),
  so a sheathed weapon is only roughly where the game has it. Only the male
  Battle set is exported.
- **Posed weapon bones** (`models/weapon-pose.ts`). Some weapons skin
  pieces to extra bones that the game moves at run time, and no motion file
  animates them: the Ravager Blade's (`we012`) claws are weighted 0.87/0.13
  to bones 1 and 3 and lie inside the blade in the bind pose. Skinning
  (EU 0x088641C0, 0x08860648, drawWeight 0x088646F0) is chain · inverse of
  the AHI bind, so a bone left alone skins to the identity; the player's
  per-frame code sets some binds by weapon class first. The eboot's copy
  (vtable slot 8, 0x088D3F68) runs in town, where weapons are always away:
  great swords and long swords get bone 2 = diag(1, 1, 0.73) and bone 3 at
  rest. The quest copy is in `game_task.ovl` (EU 0x9A932C0, great sword and
  long sword case 0x9A93F0C) and reads whether the weapon is drawn (player
  flag 0x410 bit 3): drawn, bone 2 is at rest and bone 3 = diag(2.6, 1, 2.5)
  at its own translation, which throws the claws out of the spine. Draw and
  sheathe motions animate between the two with keyframe tracks in the
  eboot's data (bone 3's x goes 1, 3.15, 2.6 while drawing). A JP save state
  with the Ravager Blade drawn has exactly that bind on bone 3 and bone 2 at
  rest. The export bakes the drawn pose into great swords' and long swords'
  meshes (11 great sword models have pieces on bone 3: the Ravager,
  Lacerator and Tactical Blades' claws, the Serpentblades' fins, the Tigrex
  swords' spikes, the Ceanataur blades' claw) and writes the sheathed pose
  as a morph target named `sheathed` (float offsets, `extras.targetNames`),
  unrotated bones only. The site's hunter viewer turns the target on for
  sheathed motions; a weapon shown alone stays drawn. Other classes
  aren't posed: the lance's drawn bone 2 and the hammer's bone 3 (outside a
  charge) are at rest, while the gunlance, bow and bowguns turn bones in
  ways not decoded yet. The per-model joint interpreter (0x088CF2C8, records
  keyed by model id at 0x089B07B4) animates other models and isn't applied.

## Emit layer

`src/emit/*.ts` maps the raw structs from `src/tables/` onto the exact
`data/*.json` schema shapes (`data/schemas/*.json`). `emit/index.ts`'s
`emitAll(reader)` runs every module and returns a `{ "<path relative to
data/>": <schema-shaped content> }` map; `writeEmitOutput(outDir, output)`
persists that to disk. `src/cli.ts`'s `extract` subcommand runs this (plus
`emit/quests.ts`, see "Quests" above) end-to-end — see "Usage".

Derived-value rules confirmed against a real decrypted JP EBOOT + the
committed `data/` files (see `src/emit/common.ts` and each module's own
derivation notes for specifics):

- Display rarity = raw rarity + 1; low/high/g-rank buckets at rarity 5/8.
- Create/improve cost = raw sell price ÷ 2 (rounded), only set when a real
  `EquipCreate`/`EquipUpgrade` recipe exists for that item.
- `EquipCreate.equipId` (not the entry's own array position) is the item's
  true index — recipes are grouped by `equipId` before lookup; a second entry
  for the same `equipId` is an alternative recipe.
- Weapon attack = raw attack × that weapon class's modifier ÷ 100; element/
  status values are raw × 10.
- The 15 dual-element dual blades (Twin Nails, Ultimus Celestials, …) have
  no element in their own struct. Both elements come from `WepDualAttr`
  (`src/tables/dual-attributes.ts`), keyed by `WepBMID`. Its element type
  is the `EleBitFlag` bit flag (Fire `0x10`, Ice `0x80`, Poison `0x02`, …),
  not the struct's single-element enum. Elements are emitted in stored
  order. All 15 match the site's values; the site listed 5 of them the
  other way round (Firestorm, Volcanic Storm, Twin Nails, Twin Nails+, Fire
  and Ice), and `build-data` now writes the disc's order.
- Material `type`/`color` (e.g. "ore"/"gray") aren't derivable from the
  disc at all — they're presentation metadata, supplied by the
  `src/overlay/materials.json` overlay (generated once from the committed
  `data/` files; see git history).
- Decorations are emitted in the game's crafting list order: the order of
  their first recipe in the `EquipmentCreate` decoration section.

Known gaps and approximations, tracked in
[#38](https://github.com/vallode/mhfu-blacksmith/issues/38):

- **Armor `sex`/`hunter_type`** come from `ArmorValue.HunterType`, a bit
  field (1 male, 2 female, 4 Blademaster, 8 Gunner). Matched by game ID on
  the EU disc, it agrees with all 2080 committed values of each. An earlier
  check that found no correlation predates
  [#61](https://github.com/vallode/mhfu-blacksmith/pull/61), when every slot
  read the next slot's array.
- **Armor max defence** (`max_defence`, `max_defence_pre_ukanlos`,
  [#10](https://github.com/vallode/mhfu-blacksmith/issues/10)):
  `ArmorSphereCaps` is seven cumulative max levels, one per upgrade tier
  (Armor Sphere, +, Hard, Heavy, Royal, True, True after Ukanlos; the
  armor sphere `EquipUpgrade` entries use the True Armor Sphere for the
  last two). Defence = base + 2 per level above 1. The +2 isn't in a table
  near the armor or upgrade tables; it's the community figure, checked
  against the Hunter's S (Blademaster) set (190 → 540), the Ukanlos
  Blademaster series (LV2 102 → LV9 116) and the Kirin (Blade) set (LV12
  66). See `src/emit/armor.ts`. `extract --raw` writes every armor struct
  (bytes and decoded fields) to `raw/armor.json`.
- **`hr`/`elder`** armor unlock requirements aren't in `ArmorValue` and no
  unlock table was found; both stay as committed and are optional in the
  schema.
- **Sharpness** uses a reach-threshold model over `SharpnessTable`. Each
  weapon class has its own run of 8 entries, found through the table's
  `PTR[11]` (one pointer per `WepTypeID`): great sword and long sword start
  at entry 0, hammer and hunting horn at 8, lance and gunlance at 16, sword
  and shield at 24, dual blades at 32. `sharpnessId` indexes from there
  ([#31](https://github.com/vallode/mhfu-blacksmith/issues/31)). `extract
--raw` writes the table, pointers and per-weapon sharpness fields to
  `raw/sharpness.json` (numbers only).
  It also writes every weapon value struct (bytes and decoded fields, with
  the weapon's name and type) to `raw/weapons.json`.
- **Gunner details** ([#32](https://github.com/vallode/mhfu-blacksmith/issues/32),
  `src/emit/gunner.ts`, `src/tables/gunner.ts`):
  - Bowgun ammo: `BulletCharge` picks the `BGShotTable` row, whose 32
    capacities follow `ShotCoat` bit order. An ammo type whose
    `ShotCoatings` bit is clear shows 0.
  - `Reload` 0–4 is VerySlow, Slow, Normal, Fast, VeryFast. On bowguns
    `RecoilCharge` 2–5 is Moderate, Light, Weak, VeryWeak (only these
    occur).
  - `max_attack` adds the gun's last power barrel level
    (`BGModLevel.Attack_Inc` of mod type `RangedPhysxTbl`, 50 for all four
    types) before the class modifier. `BGModTable` is four pointers to
    five levels each, not the 4 × 5 pointers the vendored pattern declares.
  - Rapid fire is a table the vendored pattern doesn't have:
    `{ u32 WepGunID, u32 flags }` pairs ending at 999, 0x40 bytes after
    `BGModTable`. Its 22 flag bits have their own layout
    (`RAPID_FIRE_BITS`). Four pairs of bits are variants of the same ammo
    that the site doesn't distinguish.
  - Bows: `BulletCharge` picks the `BowChargeTable` row and
    `RecoilCharge + 1` (at most 4) is the number of charges shown.
    `ShotCoatings` bits 1–6 are the coatings and bits 7–9 the poison,
    paralysis and sleep coating bonuses, which the site writes as
    `elements` (`{ "name": "Poison", "attack": "Add" }`).
  - Bowguns get no `coatings` field. The ammo lists already show which ammo
    a gun can load.
  - `extract --raw` writes these tables and every `WepGunValue` field to
    `raw/gunner.json`.
- **`bonus`** on every weapon is the struct's `Defense` byte (the defense it
  adds), written `"+N"`, or `"N"` for bowguns as the committed files do
  ([#32](https://github.com/vallode/mhfu-blacksmith/issues/32)).
- **Gunlance `shelling`** is `NoteGLType`: type `n % 3` (Normal, Spread,
  Long) and level `n / 3 + 1`.
- **Hunting horn `notes`** are `NoteGLType` as an index into a 20-entry
  table of three-note sets in the EBOOT. Each byte is a note colour:
  1 `w`, 2 `p`, 3 `b`, 4 `y`, 5 `r`, 6 `g`, 7 `a`. The table isn't in the
  hexpats. It was found with `extract --raw`'s `raw/melodies.json` (EU file
  offset `0x1b63cc`) and is located by its shape (`src/tables/horn.ts`).
- **Hunting horn `melodies`** come from a song table in `game_task.ovl` (EU
  file offset `0x1aca38`, also located by shape): 4 bytes per song, notes
  last-played first and zero-padded, then one effect ID byte per song. A
  horn's melodies are the songs that use only its three colours, in table
  order. Three songs (w-w, p-p, y-y-y) store one extra note flagged `0x80`.
  It is dropped, which gives the site's combo for all three. **Effect
  names, descriptions and durations are not read from the disc.** They are
  a hand-made overlay keyed by effect ID (`src/overlay/melody-effects.json`),
  carried over from the old site's melody file, whose source wasn't
  recorded. Each of the 42 effect IDs matched exactly one site effect name.
- **Affinity** for blademaster weapons is `WepBMValues.Affinity` plus a
  bonus for sharpness: +5 when `sharpnessAmount` is 4 and +10 when it is 5
  or 6, on positive affinity only (`blademasterAffinity()` in
  `src/emit/weapons.ts`, [#33](https://github.com/vallode/mhfu-blacksmith/issues/33)).
  The rule comes from correlating every raw struct with the committed
  values, not from the game's code. Gunner affinity is the raw value.

## Quests

`src/quests/discovery.ts`'s `readAllQuests(dataBinFiles, region)` decrypts
and parses every real quest file (`listQuestFiles()` filters `DATA.BIN`'s
564 `mission_jpn/*.mib` entries down to the 551 real `m#####.mib` quests,
excluding the 13 `level*.mib` files, which are the quest board, not
quests: see "Quest text"). `src/emit/quests.ts`'s `emitQuestsFile(parsedQuests)` then maps
them onto `data/quests/{village,guild,training-school,treasure-hunting}.json`
(schema: `data/schemas/quest.schema.json`) — the first `data/` category this
pipeline designed from scratch, since (unlike weapons/armor/monsters/
decorations) no such schema existed before this. All 551 real quests parse
on both the JP and EU discs. Unused slots, whose every text field is one
placeholder literal, are dropped: `"**********"` on JP (`m50001`-`m50003`,
0 zenny fee, 1 zenny reward) and `"none"` on EU (those 3, plus
`m40001`-`m40008`: 0 zenny fee with real monsters and rewards, but no text
in any language). The EU disc leaves 540 emitted: village 148, guild 338,
training-school 47, treasure-hunting 7.

**The `hub` comes from the quest ID** (`questHub`). The disc numbers quests
in blocks, one per board and star level: `1`-`10` and `101`-`109` Guild Low
Rank ★1 and ★2, `1xxx`/`2xxx`/`3xxx` Guild Low (★3-★5) / High (★6-★8) / G
Rank, `4xxx` Treasure Hunting (client always "Treshi"), `10xxx`/`11xxx`
Village (★1-★6, then ★7-★9; many from the "Pokke Village Chief"),
`20xxx`-`22xxx` Training School (client always "Instructor": Basic
Training, weapon Mastery, then Subjugation Training), and `30001`-`30090`
the 90 identical "Gathering - Snowy Mountains" copies, kept on Guild Low
Rank. The Monster Hunter Wiki's Guild Hall list has all 19 of the Guild's
★1/★2 quests with the disc's fee, reward, locale and client. Many share a
title and client with a Village quest (`2` and `10105` are both "Reckless
Bulldrome Hunter" for the "Troubled Father"), but pay 12x their fee like
every Guild quest, where the Village pays 6x. Their header rank is 0, so
they are emitted as `low-rank`, the board they're on. Some appear once a
prerequisite is cleared (`109` "Attack of the Rathian", 250z / 3000z in the
Jungle (Day), after `10203` "Shadow in the Snow"). The disc doesn't say
what unlocks a quest, so the prerequisites we know are hand-entered in
`src/tables/quest-prerequisites.ts` and emitted as `requires` (the quest ID
to clear first, else null).

**`urgent`** marks the 22 Urgent Quests, which unlock the next star level.
Their flag on the disc isn't decoded, so they are hand-entered in
`src/tables/urgent-quests.ts` from the Monster Hunter Wiki's "MHFU Urgent
Quests" category, matched to quest IDs by title, fee and reward.

**The `rank` is `questHeader.Rank`'s tier**: 1/2/5 are low/high/G rank,
and 0, 3 and 4 have none (except the Guild's rank-0 ★1/★2 quests, emitted
as low rank). It is not the board: an earlier version read the hub from it
and filed the Village's `10xxx`/`11xxx` quests (rank 1/2, like the Guild's)
under Guild, and `1`-`109` plus the Basic Training and Mastery quests
(rank 0) under Village. `map` is resolved through a small hand-transcribed
table (`src/tables/quest-maps.ts`) sourced from `quest.hexpat`'s own inline
comments — the only place any vendored source names these IDs.

**Quest board text follows the disc.** The JP disc points every language
slot at the Japanese text, so a JP run gives Japanese `title`/`goal`/
`fail`/`details`/`client`. The committed `data/quests/` comes from the EU
disc, whose text is English. Every other quest field is in English,
resolved through the same enums as equipment.

### Reward tables

Each quest has a `RewardTBL[]`: 8-byte entries of `Unkn1` (u16), `Unkn2`
(u16) and a pointer to that table's items. Every table's chances sum to
100%. `emit/quests.ts`'s `classifyRewardTable()` turns the two raw fields
into `kind`, `draws` and `condition`. The evidence is all 837 tables of the
551 EU quests, from `extract --raw`'s `raw/quests.json`:

| `Unkn1`         | Tables | Where                                                                                                                                                 | Emitted as                                |
| --------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `0x8000`        |    544 | Once per quest and always first, on every quest except Treasure Hunting                                                                               | `kind: "main"`, `draws: Unkn2 >> 8`       |
| `0x8001`        |    101 | After the main table: one per large monster on multi-monster hunts, holding that monster's material ×2-3; Commendations on Fortress and Rajang quests | `kind: "extra"`, `draws: 1`               |
| `1`             |     38 | Elder dragon "Slay" quests (Kushala Daora, Teostra, Chameleos, Fatalis, …)                                                                            | `kind: "conditional"`, `condition: 1`     |
| `0x28`-`0x32`   |      6 | Training School "Exercises" quests (40/43/45/50, rising with stars)                                                                                   | `kind: "conditional"`, `condition: <raw>` |
| `0xf9`-`0x101`  |     50 | "Survive until Time Over or Deliver the Paw Pass Ticket" quests, 5 tables each (`0x101`, `0xff`, `0xfd`, `0xfb`, `0xf9`)                              | `kind: "conditional"`, `condition: <raw>` |
| `0x10c`-`0x119` |     98 | Treasure Hunting, 14 tables each (`0x119` down to `0x10c`), in place of a main table                                                                  | `kind: "conditional"`, `condition: <raw>` |

What's known and what isn't:

- `Unkn2` is 0 on every table except main tables, where it is `N << 8` with
  N = 4 (187 tables), 5 (253), 6 (89), 7 (3), or 0 (one, Hypnocatrice
  Training). N tends to rise with the quest's stars. It's emitted as the
  main pool's `draws`, read as the base number of draws before Luck skills
  add more. That reading comes from the data, not from an in-game check or a
  community source.
- `draws: 1` for extra tables follows from each one being a single
  100% pool tied to one monster (or one Commendation reward).
- What triggers a conditional table isn't in the quest file: these quests'
  scripts are the same generic packets as everywhere else. Plausible guesses,
  unconfirmed: slaying rather than repelling the elder dragon, a Training
  School clear time, how many monsters a Paw Pass quest's hunter killed, and
  Treasure Hunting point tiers. The value is kept raw in `condition` and
  `draws` is null.
- MHFU has no subquests, and the header has no subquest fields. No
  community documentation of this layout was found (`quest.hexpat` names
  the fields `Unkn1`/`Unkn2`).

**Other derivations:** `time_limit_minutes = timeLimit / 1800` (confirmed
exact — no remainder — against every real sample checked, e.g. quest ID 1's
raw `90000` -> 50 minutes). `target` is null when there's no single hunt/
capture objective (`targetNum === 0`, or `targetId` doesn't resolve to a
real monster — e.g. Treasure Hunting quests reuse this field for something
else entirely, with real values like 928 far outside `emID`'s 90-entry
range). `small_monsters` is one row per species: `max_quantity` is the most in any
single zone, `total_quantity` the sum over the quest's zones. `SmallMonIndex`
frequently points several entries at the same records (confirmed on real
data), so a table at an address already seen for that zone is counted once. A spawn with quantity 99 (554 records; the rest top out at 20) is not counted and sets `endless`; `large_monsters`
is deduplicated the same way for exact-duplicate `(monster, quantity, power)`
rows. Each large monster's `multipliers` are its stat multiplier row (see
"Monster overlays").

Not implemented (out of scope for now, same as the underlying parser —
see "Quests (.mib)" above): `QuestScript` and arena sets.

### Gathering points

`src/quests/gathering.ts` reads a quest's mining, gathering and bug
catching points, and `src/emit/gathering.ts` writes them to
`data/gathering.json` (schema: `data/schemas/gathering.schema.json`).
randomfu's `gathering` shuffle edits the same tables.

- **Layout** (`quest.hexpat`): the header's `GatheringLocTblPTR` (`+28`)
  points at one u32 per area of the map (the count depends on the map,
  `MAP_AREAS`), each to that area's 24-byte nodes (`f32 x, y, z, f32;
u16 table, u16 most gathers, u16 type, u16 fewest gathers`), ending at
  an x of -1.0f. `GatheringItemsPTR` (`+36`) points at the item tables:
  `{ u16 chance, u16 item }` pairs ending at `0xFFFF`. Every used table's
  chances add up to 100; item 0 is a draw that gives nothing, and isn't
  written.
- **Node type** (`+20`), from the items each type gives on the EU disc: 3
  holds the ores (mining), 4 the bugs, and 0 everything else (plants,
  mushrooms, bones, honey, eggs, ammo and barrel piles). No other value
  occurs.
- **Gather counts**: on all 19,130 EU nodes the u16 at `+18` is at least
  the one at `+22`, and both are 255 on the points that never run out, so
  they're read as the most and fewest gathers. Written as `most_gathers`
  and `gathers`, null for 255.
- **Areas**: index 0 is the Base Camp, then the map's numbered areas. Index
  0 has no points on most maps, and the numbered areas match the maps'
  (Forest and Hills has 12, its list 13). Some lists have a spare slot
  after the last area (Snowy Mountains, Desert).
- **Shared sets**: quests on one map and rank almost always have the same
  points, so `data/gathering.json` holds each distinct set once with the
  quests that use it: 87 sets for the 540 emitted EU quests. Most maps
  have one per rank, plus one for each Treasure Hunting or Training School
  quest there and a few gathering quests' own (Great Ore Discovery, A
  Mushroom Goldrush!, Mountain Herb Picking). Within an area, identical
  points are one entry with a `count`.

### Area maps

`src/tables/map-layout.ts` works out where a gathering point sits on the
map, and `emit/gathering.ts` writes it as `positions` (one pixel per point)
and the layout's `texture`. The formula is the one the map screen draws the
player's arrow with (EU EBOOT, around `0x8843358`), for x and z separately:

```
pixel = (local + stageOrigin) * zoom / size * 150 + (1 - zoom) * 76
```

| Table                                     | Where    | Address      | Layout                                  |
| ----------------------------------------- | -------- | ------------ | --------------------------------------- |
| Map size, by quest map ID                 | EBOOT    | `0x0893887c` | `{ f32 width, f32 depth }`              |
| Zoom (1.0 or 0.9), by quest map ID        | EBOOT    | `0x08938a7c` | `f32`                                   |
| Stages, by quest map ID                   | game_sub | `0x09ce4708` | `{ u32 count, u32 pointer to u16 IDs }` |
| `Gamestage::stage_world_tbl`, by stage ID | game_sub | `0x09cdef40` | 32 bytes, starting `f32 x, f32 z`       |

- **Areas**: a gathering point's area index is its place in the map's stage
  list, so index 0 is the Base Camp. Stage IDs aren't in area order.
- **Textures**: `data-bin/cockpit/map<N>.tmh`, 160x160, named by quest map
  ID. Night maps reuse the day map's (16 uses 2, 18 uses 4, 21 uses 11, 31
  uses 30). `area-maps` writes the ones `data/gathering.json` uses to
  `public/images/area-maps/`, so run it after `build-data`.
- **Not placed**: the Tower's maps (14 and 15) draw their floors on separate
  pages this formula doesn't reach. A few areas aren't drawn on their map
  at all (the Desert's 11th), so an area with no point on opaque art loses
  its `positions`.
- **Regions**: the addresses are the EU disc's, so `extract` only places
  points for EU. On an EU disc it stops if the tables aren't where they
  should be or a texture can't be read, rather than write data without
  positions.

### Items

`src/emit/items.ts` writes each item's rarity, carry limit, price, icon and
colour from the EBOOT's item table (`src/tables/items.ts`) to `items.json`,
and `build-data` writes them into `data/items.json` by ID
(`src/build/items.ts`), keeping the names, aliases and regions as committed.
`item-icons` writes the icons themselves (see below).

- **Layout**: 24 bytes per ItemID, the same layout as the decorations'
  table, which is entries 948–1116 of this one. The table runs on through
  the last ItemID, 1260 (treasure, Felyne and arena items); entry 1261 is
  unrelated data.
- **Rarity** (`+2`, u8) is 0-based like the equipment tables'. Before the
  disc, `data/items.json` had rarity from community lists on 1017 items: the
  disc agrees on 1016. The other is DragonslyrJewel (lists 5, disc 4, as in
  `data/decorations.json`).
- **Carry limit** (`+3`, u8): Potion 10, Whetstone 20, Pierce S Lv1 60, most
  materials 99. Normal S Lv1, which is unlimited, has 255.
- **Price** (`+12`, u32): the shops' buy price (see "Shops"). The u32 at
  `+16` is a tenth of it on items that can be sold (Herb 2z, Rathalos Ruby
  9700z) and 0 on the rest, likely the sell price; not checked on screen, so
  not written.
- **Icon** (`+5`, u8) is the item's shape: potions and drinks are 24,
  ores 27, jewels 43, shots 26. **Colour** (`+6`, u8) is its tint: Dragonite
  Ore is 2 (green), Eltalite Ore 1 (red). The byte at `+4` has flags (cooked
  meat and fish 1, charms 32) with no known meaning, so isn't written. Weapon
  records have no icon or colour field, and armor's `colorSeries` (0–3) is
  not this palette, so equipment keeps the site's own icons.
- **Palette**: 11 u32s (R, G, B, 1) by colour index: white, red, green, blue,
  yellow, purple, cyan, orange, pink, an empty slot no item uses, gray.
  Written as `colors` in `data/items.json`, and kept as the site's
  `--color-item-*` tokens (`scripts/validate.ts` checks they match).
- **Sprites**: the game looks an icon up in two u16 lists of 56 (24x24, then
  16x16; game code at vaddr `0x088303b8`), which index the UI sprite table
  (12 bytes: u16 x, y, width, height, two flags). The atlas is
  `cockpit/cock.tmh`'s first image, in grays the game tints with the colour.
  Shapes 0–38 are consecutive; 39 and up jump around, and shapes no item uses
  point at shape 33's "?". The addresses are EU's; `src/tables/item-icons.ts`
  has them, and JP's aren't known.
- `item-icons` writes each shape's 16x16 icon to
  `apps/blacksmith/public/images/item-<icon>.png`, skipping the shapes that
  fall back to the "?". The site draws them like its other sprites, tinted
  with the item's colour.
- The three placeholder IDs (`placeholder` in `data/items.json`) get no
  stats.

### Shops

`src/shops/shops.ts` finds the shops' stock in `overlay/lobby_task.ovl`,
and `src/emit/shops.ts` writes it to `data/shops.json` (schema:
`data/schemas/shop.schema.json`). randomfu's `shop-scan` and
`shop-lists` research commands found the layout, and its `shops` shuffle
edits it.

- **Layout**: each shop has a table of u32 pointers (ending in a 0 word),
  one per stage of the game, each to a list of u16 item IDs ending in
  `0xFFFF` or 0. Tables can share lists. `findShops` finds the table
  whose first list starts with the general store's opening items (Herb,
  Potion, Antidote, Whetstone), then the tables right before and after it.
- **Names**: the disc doesn't name the shops, so each table is named from
  what it sells: the village general store (opens with Herb), the Guild
  Hall store (opens with Potion), the Point Exchange (Armor Spheres,
  jewels and Pokke Tickets, bought with Pokke Points) and the peddler,
  whose lists are smaller pools of plants, bugs, fish and monster parts.
  On the EU disc each has 9 lists. The general store's and the Point
  Exchange's last lists are empty;
  the peddler's 6th and 7th are empty and its 8th and 9th are the Guild
  Hall store's last two.
- **Stages**: written as each item's list numbers (1-based, in disc
  order). The general store, Guild Hall store and Point Exchange only add
  items from one list to the next. What moves a shop to its next list
  isn't on the disc that we know of; it's presumably story progress.
- **Prices**: the item table's u32 at `+12` (`tables/items.ts`), which
  holds the general store's prices as the game's shop screen shows them
  (Herb 20z, Potion 66z, Whetstone 80z; randomfu's `KNOWN_PRICES`). Only
  those were checked on screen. The Point Exchange's Pokke Point prices
  haven't been found, so its prices are null.

### Monster size

**`MonSizeModifier` (u32 at `0x38`) is the quest's monster size in
percent.** Its values suggested it (`quest-probe` over all 551 EU
quests), and an in-game test confirmed that it sets the size: a randomfu
image with `questMonsters.size` (spread 50%) gave a Giadrome quest a visibly
tiny Giadrome in PPSSPP. The size code (below) confirms it's a percent.
The evidence:

- Only its low byte is ever set (the game reads it as an s16). It's 100
  in 273 quests and 50-174 in the rest (31 values; 105, 110, 102 and 104
  most often after 100).
- Training and other rank 0, 3 and 4 quests are almost all 100. High Rank
  (2) and G Rank (5) quests use the wider spread, and fewer than half of
  them are 100.
- Monster Hunter Frontier's quest editor (`Paxlord/PaxMHFZQuestEditor`,
  `src/Utils/QuestParams/monsters_utils.js`) reads the same kind of field
  from its own header: a u16 labelled "Size (in %)" at `0x44`, then an
  unlabelled u16 and a difficulty. Its 60-byte large monster record has no
  size field. Frontier's layout isn't MHP2G's, so this supports the reading
  rather than proving it.

It applies to the whole quest. randomfu's `questMonsters.size` edits it.

**Each monster rolls its size around it** (`monsters/sizes.ts`; EU EBOOT
addresses). When a quest sets up its large monsters (`0x0886DB0C`), each
one that can vary calls `0x0886D524`:

```
tier = TIER_PICK[rand() & 31]          // u8[32] at 0x089A8164, tiers 0-6
roll = TIERS[tier][rand() & 31]        // u8*[7] at 0x089A8148, 75-125
roll = clamp(roll, VARIATION[v])       // v: the header's u8 at 0x4a (Unkn7)
size = MonSizeModifier * roll / 100    // integer divide
```

- `TIER_PICK` is weighted toward tier 3 (95-105, 19 of 32 slots). Tiers 0
  and 6 (75-79 and 121-125) take one slot each, so a roll of 121+ or 79-
  is 1 in 32.
- `VARIATION` (`{u8 min, u8 max}[5]` at `0x089A7EA4`, copied to
  `0x08A62C80` at boot) is 0: [100, 100], 1: [100, 105], 2: [100, 115],
  3: [95, 114], 4: [85, 125]. So `Unkn7` is the quest's size variation:
  0 fixes every monster at `MonSizeModifier`, 1 and 2 only grow them, 4
  allows the whole range. EU quests: 0 in 191, 1 in 38, 2 in 71, 3 in 134,
  4 in 117. The parser calls it `sizeVariation`.
- The size is kept in the monster's quest record (`+0x30`) and is what
  the Guild Card records.
- A monster is fixed at 100 (and `MonSizeModifier` is ignored) when:
  - its emID isn't in the switch at `0x0886D644`. The list is exactly the
    49 monsters with crowns.
  - bit `0x10` of a global flag word (`+0x7af14`) is set. What sets it is
    unknown.
  - the quest is in the table at `0x089A8624` (`{u16 flag, u16 index,
u16 questId}[38]`, read at `0x08874124`) and save flag `flag`
    (bitfield at save `+0x508`) isn't set. Likely the quest's first
    clear; not confirmed. Flag 356 (quest 3106) is treated as always set.

**Crowns** come from the Guild Card's check at `0x08853F84`, which compares
a record with its monster's entry in the crown table (`0x08930BDC`, 62
entries of 14 bytes: `u8` index, two `u8`s, `u8` emID, then `s16` silver,
gold and mini, in percent). A record at most `mini` is a mini crown, at
least `gold` a gold crown, at least `silver` a silver one. 31 entries have
thresholds; the rest are zero.

- Subspecies share their base monster's entry: `u8*` by emID at
  `0x0899BF40` lists the emIDs (ending `0xff`) whose records count
  together, and the card takes the largest and smallest across them.
- The card shows centimetres: the percent times the monster's base size
  (`f32` by emID at `0x0899C760`), over 100. Monsters without crowns have
  a base size of 0, except Akantor and Ukanlos (3049.97) and Shen Gaoren
  (1000).
- Records are u16 percents in the save, at the character's `+0x40e0`
  (largest) and `+0x4194` (smallest).

`extract` writes `base_size` and `crowns` into `data/monsters/`, and each
quest's roll range as `monster_size` (`modifier`, `min`, `max`, and
`fixed_until_flag` for the story quests above).

Checked against what players report:

- mhp2ndgwiki's silver and gold sizes match 26 of 27 monsters. The odd
  one, Yian Garuga's gold at 1351.5, is likely a typo.
- mhcrown's MHP2G largest and smallest possible sizes match 57 of 62.
  The five that don't (larger Diablos, Tigrex, Kushala Daora and Teostra,
  smaller Rajang, and larger "規格外" Lavasioth and Bulldrome) likely come
  from download or event quests, which aren't on the disc.
- mhcrown's Rajang mini crowns (912, 960 and 1008 cm) are all at most
  105 percent.

Before this, randomfu could only scale size per species
(`emChunk +0x40`); that option stays.

Other sources checked:

- MHFU-ModKit's `MHFU_ENT_SIZE_SCALE` is the live entity's scale, not a
  quest field.
- The MHP2G decomp (`tclamb/mhp2g-decomp`) has no quest loader yet. Its
  `Quest` singleton keeps a pointer at `+0x4c` to what looks like the
  quest header: `Evdemo::map_demo_chk` reads the s8 at `+0x45` (the
  hexpat's `Spawn`) and skips the map intro when it's non-zero.

### Quest text

- **Language slots.** `LangPTRs`' seven slots follow the game's
  `LanguageId` (decomp `include/data_manager.hpp`: Japanese, English,
  German, French, Spanish, Italian, Korean), so the hexpat's "Eng1", "Eng2"
  and "Eng3" are the Japanese, English and Korean slots. The EU disc fills
  Japanese and Korean with English text; the JP disc points all seven at
  one Japanese block.
- **Layout.** `readStringLayout` (`src/quests/parser.ts`) gives each
  block's six string offsets and lengths, and `raw/quests.json` has it
  per quest (`strings`), with `entrySize`, the DATA.BIN entry including its
  sector padding.
- **On the EU disc** (`quest-probe`, 551 quests):
  - In every quest, the Japanese, English and Korean slots point at one
    block, and the other four languages each have their own.
  - No two pointers share a string, and no strings overlap.
  - Each language's strings are packed back to back, each starting on a
    4-byte boundary and followed by 1-4 zero bytes after its NUL (never
    0, about evenly), so each takes its length plus two, rounded up to 4.
  - Each language's pointer block follows its strings (the 25-28 byte
    gaps).
  - Each language's monster list splits into names with randomfu's
    `splitNames`.
  - Sector padding after the payload is 0-2044 bytes.
- **The game shows other text.** On the EU disc, rewriting a quest's own
  strings doesn't change its Quest Details screen. randomfu renamed 13 of
  quest 10109's strings, among them the English monster list and goal, and
  the screen still showed "Main Monsters: Velocidrome" (its title was
  left alone as too wide).
  The quest file's own text was rewritten and read back, and the swapped
  monster was in the quest, so the screen reads its text from somewhere
  else. `quest-text-scan --quest <id>` finds where a quest's strings are
  stored on the disc and which table points at them.
- **The quest board: `mission_jpn/level*.mib`.**
  - These 13 files aren't quest-encrypted (which is why they fail the quest
    cipher's checks) and hold the board. Quest 10109's title and goal are
    in `level2.mib` and `level3.mib`, with pointers to them.
  - Layout: u32 record offsets (as many as the first offset / 4). Each
    record starts with a 0x34-byte copy of the quest header's display
    section (quest file `0x4c`-`0x7f`), for example in `level1.mib`'s first
    record quest type 4, fee 100, reward 1200, quest 1, map 11 and
    `TargetID` 77 (Giadrome). Its `+0x14` is a file offset to its own
    `LangPTRs`. Then come the record's strings, `StringPTRs` blocks and
    `LangPTRs`, laid out as in a quest file, with offsets from the start of
    the board file.
  - randomfu reads them in `src/game/board.ts`.
- **EU message files** (`quest-text-scan`, quest 10109).
  - None of the quest's whole strings is stored anywhere else as UTF-8.
  - The likely message files come in groups of five, one per language, with
    the same layout:
    - 19-23: 23 tables, about 445 KB each (`str_tbl`);
    - 4776-4780: 2 tables, about 85 KB each;
    - 4781-4785: 4 tables, about 300 KB each;
    - 4786-4790: 1 table, about 38 KB each.
  - The file list's names for 4788-4790 (`quest_str`, `lobby_str`,
    `arcade_str`) come from matching JP indexes, so by content they're
    three languages of one kind.
  - Each file starts with a table count, then increasing offsets, and none
    is a `.pac`.
  - **Layout** (`src/strings/messages.ts`): u32 table count, u32 8, a u32
    file offset per table, then each table's u32 string offsets (from the
    table's start) ending in `0xFFFFFFFF`, then NUL-terminated UTF-8
    strings.
  - **Languages:** each group is English, French, German, Italian,
    Spanish, from the training text that starts 4786-4790. The file list's
    JP names for 4788-4790 therefore don't match their content on EU.
  - **Not the quest board:** 4781's tables are in-game messages (table 0,
    "%d Velocidrome hunted down."), two small tables, and tips (table 3).
    No quest goal is in it. The board is in `mission_jpn/level*.mib`
    (above).
- **Where else names live.** FUComplete's English text for the P2G disc
  (`FUComplete/Patch`, `data/str_tbl/`) has the monster names in
  `str_tbl.pac`'s first string table, and the JP file list has
  `message_jpn/str_tbl.pac` (file 15) plus `quest_str.pac`, `lobby_str.pac`
  and `arcade_str.pac` (4756-4758). The EU disc has 20 more files than the
  JP one, several of them just before those (`filelist-eu.json`'s
  unmatched entries), which fits one set of message files per language,
  but which EU file is which language isn't known. randomfu doesn't read
  them: it learns names from the quests' own text instead.

### Quest script

`QuestScript` packets are an s16 opcode and three s16 arguments, from
`header.questScriptPtr` up to the supplies. Nothing public decodes them for
MHP2G. For MH1/MHG, a community write-up (gist
`2Tie/15606613e5a5e6036a93858c297b6523`, `g1scripting.txt`) has the same
8-byte packet shape and lists `02` "Sets the goal for Monster arg1 to
arg2" (a monster ID and a count; up to two), `01` waits for those goals,
`24` waits for a monster goal to drop below arg2, and captures as a
delivery goal (`04`) for a "wyvern" item.

**MHP2G's scripts don't name monsters.** On the EU disc (`quest-probe`)
the 551 quests have only 6 distinct scripts. No argument of any packet
equals the quest's `TargetID` or one of its large monsters. Packets
seen:

- `-2`, `-1`, `3`, `10`, `27`, `30`, `31`, `37` and `45` always have zero
  arguments.
- `9` always has 150.
- `26` has 0, or 1 in 10 quests.
- `11` has 13-15, in 10 quests, together with `42`-`44` and `55`-`57`.
- `53` has 2000 and `54`, in 7 quests (probably Treasure Hunting's
  points).

The goals live in the header instead:

- `TargetID`/`TargetNum` (u16 at `0x70`/`0x72`).
- **Two objective slots** at `0x28` and `0x30`, each
  `{ u32 kind, u16 id, u8 count, u8 slot }`. These are the hexpat's
  unnamed `UnknPTR3`, `Unkn1`, `Unkn2` and `Unkn3`, worked out on the EU
  disc by comparing quests (randomfu `OBJECTIVE_OFFSETS`):
  - `kind` 1 means `id` is a monster (emID);
  - `kind` 2 means `id` is an item, as in a delivery quest;
  - `kind` 0 means the slot is unused.

  `raw/quests.json` decodes them as `objectives`, and `quest-probe` tabulates
  their kinds and whether a monster objective is the quest's `TargetID` or
  one of its large monsters.

These fit the decomp's two `QuestTarget`s (an `emId` and a count each,
`include/quest.hpp`). randomfu's swaps update `TargetID` and every
monster-kind objective, and need nothing in the script.

### Save quest flags

A hunter's cleared quests are a 512-bit field (64 bytes) at offset `0x3f88`
of each hunter's block in the decrypted `MHP2NDG.BIN`, between the item
pouch and the play time (`0x3fc8`). Bit `n` is byte `n >> 3`, mask
`1 << (n & 7)`. The location is confirmed three ways: the EU "All quests
clear" CWCheat writes the first 14 u32 words (its address sits at the same
distance from the Zenny, Guild Points and Pokke Points codes as `0x3f88`
does from their save offsets); a fresh hunter's only cleared quest set one
bit; and clearing one more quest set one more. The cheat's 448 bits stop
short of the Training School, which starts at bit 450.

**The game's table** is an array with one u16 quest ID per bit: on the EU
disc it is at EBOOT `0x19a65c` (bit 0 = quest 1), 504 entries followed by
the value 60000. In bit order it holds quests 1-10 and 101-109, the Guild
(1001-3233), Treasure Hunting (4001-4007, bits 272-278), the Village
(10001-11226, from bit 279) and the Training School (20001 from bit 450,
21001 from 468, the Exercises 22001-22006 at 498-503). Each star level has
a fixed number of slots, filled after its last quest with reserved IDs no
quest uses (2014-2015, 2128-2130, 2237-2240, …). `src/tables/quest-flags.ts`
holds it as 24 runs of consecutive IDs (`QUEST_FLAG_RUNS`): a quest's bit
is its position.

Saves agree with every bit of it:

- **Anchors** (quests cleared on purpose in an unedited save): `10001`
  Mountain Herb Picking is bit 279, `1001` Gathering - Snowy Mountains is
  bit 19, and a third hunter's three bits are `1004`, `1005` and `1020`.
  The scan uses these to find the table.
- **A heavily played (possibly edited) hunter**: its cleared bits are runs
  exactly as long as each star level, every Urgent Quest is set, and its
  Treasure Hunting and Training School bits fall on those quests.

The hidden Guild quests (30001-30090) and 40001-40008 / 50001-50003 have
no bit.

`quest-flags` searches the EBOOT and every `*_task.ovl`/`*_sub.ovl`
overlay (`src/quests/flag-scan.ts`) for it:

- **Quest ID lists**: u16/u32 arrays of disc quest IDs (one field every
  2-32 bytes), with 0 or all-ones entries allowed for unused slots. Each
  list is placed by the anchors (`bitOfFirstEntry` = anchor bit minus its
  index) and compared with `QUEST_FLAG_RUNS` (`vsSaves`).
- **The table** (`table` in the report): the lists are pieces of one table
  split up by the entries that aren't quest IDs, so the bit-0 position most
  lists point to is read whole. `bits` maps every quest ID to its bit,
  `otherEntries` keeps the values between groups, and `entries` has all
  512 raw values.
- **Ordered values**: strided runs, in order, of each star level's first
  quest ID, first bit, quest count or slot count, as u8/u16/u32, in case a
  disc keeps the layout as a table of ranges instead.

Neither search reads MIPS code, so a mapping computed only in code
(e.g. `base + id - first` with immediates) wouldn't be found.

## Building `data/` from the disc

`data/armor/*.json`, `data/weapons/*.json`, `data/decorations.json`,
the rarity, carry limit and price in `data/items.json`, `data/quests/*.json`, `data/gathering.json`, `data/shops.json`,
`data/combinations.json` and the hitzones and drops in `data/monsters/*.json`
are generated from an EU (ULES01213) disc with `build-data`. The disc is the source of truth for every field it holds.
Every field it doesn't hold is kept from the committed files.

**Matching (`src/build/ids.ts`).** Items are paired by game ID, not by
name: an extracted item's ID is its position in the enum table its name
came from, and a site item's ID comes from `data/equipment-ids.json`
(armor, weapons) or `data/items.json` (decorations, materials). Renames
like "Hornet Helm" vs "Hornetaur Helm" therefore still pair. On the EU
disc every committed armor piece, weapon and decoration pairs.

**Comparing (`src/build/fields.ts`).** Each field has a kind. Skills are
compared as sets after `overlay/skill-name-aliases.json`; materials as
multisets of (item ID, amount); upgrade-tree references as sets of game
IDs. Run `compare` to see the agreement tables; `--out` writes every
disagreement as JSON.

**Merging (`src/build/merge.ts`).** For each paired item, `build-data`
writes the disc value of each field in that category's `take` list
(`src/build/categories.ts`), in the site's vocabulary: site equipment
names, the site's skill spelling (`Defence`, `Load`) and the site's icon
style for each material. Lists (skills, materials, elements,
upgrade-tree references) are written in the disc's order, even when they
already agree as a set; a scalar that agrees is left byte-identical. Item
order, key order and file layout don't change, and a second run is a no-op. Disc items the site doesn't list (the 10 unused
Piercings, Pink Metal Boots, Rookie Knife, Swordfish Bow G) aren't added.
`overlay/keep-site-values.json` lists reviewed disagreements where the site
is right, currently the 10 Ruststone weapons, which have no `EquipCreate`
recipe on the disc. Quests, gathering points and shops are copied
through (see "Material names").

**Material names.** Materials, drops and quest supply and reward items are
always written with the game's own item name (`data/items.json` `name`, the same string as the
`ItemID` enum), never the spelling the committed files used: "Fire Stone"
is written "Firestone", "Elder Drgn Bone" "Eldr Dragon Bone". The game
caps item names at 16 characters, so many are abbreviated, and the site
pads them to that width when it renders them. `build-data` renames every
material in the files it writes, including fields it doesn't take (weapon
`alternative_create_mats`) and items with no disc match. Quests, gathering
points and shops are copied through with each item under its game name (the `ItemID` enum
differs from `items.json` only on a few Japanese promo tickets). `pnpm
validate` fails on a recipe material, drop or quest item that isn't spelled
like its item. Old site spellings stay in `data/items.json` as `aliases`, so they
still resolve to an item. This replaced an earlier table that respelled
the disc's names to match the committed files, which spelled about 240
items differently in armor and weapon recipes.

**Material icon styles (`src/build/material-styles.ts`).** `type`/`color`
aren't on the disc's recipes, and the committed files gave the same item
different styles, mostly a placeholder `bone`/`white` (in armor recipes for
210 items that weapon/decoration recipes style properly). `build-data`
writes one style per item ID to every material: a hand-picked style from
`overlay/material-styles.json` if there is one, else the most common style
in weapon/decoration recipes, then armor recipes, ignoring `bone`/`white`
whenever the item has any other style. The overlay covers the items whose
only committed style was the placeholder (tickets, potions, herbs; `ukwn`
for tools, ammo and books, which have no icon mask) and the Lobstershells.

**Taken fields**, decided from `compare` against the committed data
(agreement before the first build):

| category    | taken                                                                                                                                  | agreement                                                                             | not taken                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| armor       | rarity, rank, slots, defence, resistances, sex, hunter_type, max_defence, max_defence_pre_ukanlos, create_cost, skills, create_mats    | 97.5–100%                                                                             | `hr`, `elder` (not on the disc), `alternative_create_mats` (not emitted)                    |
| weapons     | attack, affinity, slots, rarity, elements, sharpness, sharpness_plus, create_cost, create_mats, improve_mats, improve_from, improve_to | 95.5–99.7% (sharpness 40–100%, affinity 99.5%, elements 100% outside bows, see below) | `improve_cost` (derivation unconfirmed), `alternative_create_mats` (ticket recipes missing) |
| decorations | rarity, slots, create_cost, skills, create_mats, alternative_create_mats                                                               | 91.7–100%                                                                             | `color`, `category` (overlays)                                                              |
| monsters    | base_hp, tolerances, hitzones, drops (the parts and groups `overlay/monsters.json` maps)                                               | base_hp, tolerances new; per part 97.3%, per drop group 86.5% (see below)             | `description`, `habitats`, `sizes`, `icon` (not on the disc)                                |

Affinity was taken later (#33). Before, it agreed on 86.8% (198
disagreements): heavy bowgun wrote zero as `"0"` (82, now compared by
number and written `"0%"` like every other file), 114 blademaster
weapons (108 of them positive-affinity weapons showing the sharpness bonus
the emitter didn't add) and 2 bows. With both fixed it agrees on 99.5%;
the 8 left are single values in both directions (e.g. Bone Axe `0%` vs the
disc's `5%`), taken from the disc.

Elements were taken later, once the dual-element dual blades were read
from `WepDualAttr`. Before, those 15 had no elements on the disc side. Now
`elements` agrees on 100% of every melee and bowgun file, and on 101 of 116
bows (87.1%). Bow `elements` was at first kept as committed: the 15 bow
disagreements are mostly coating bonuses the site lists as elements
("Sleep/Poison/Paralysis Add"). Taking it changed no values, only the
order of the 5 dual-element weapons above.

Lists were later written in the disc's order rather than the site's. That
reordered 1,911 lists that already agreed as sets: armor skills 1,879,
weapon `improve_mats` 10, `improve_to` 9, `improve_from` 7, `elements` 5
and decoration `create_mats` 1. Rewriting agreeing lists also put them in
the site's own conventions: 172 single-source `improve_from` lists became
bare strings, like the other 750, and 4 malformed decoration skill strings
were fixed (`NormalS Up+1` → `NormalS Up +1`, and an empty `""` entry on
StrongShot Jewel+ and Pierce Jewel+).

Gunner fields were taken later (#32). Agreement before the build:

| field                             | light bowgun | heavy bowgun | bow       |
| --------------------------------- | ------------ | ------------ | --------- |
| `ammo`                            | 99.2% (1)    | 98.1% (2)    | –         |
| `status_ammo`                     | 98.5% (2)    | 100%         | –         |
| `element_ammo`                    | 97.0% (4)    | 100%         | –         |
| `misc_ammo`                       | 94.0% (8)    | 98.1% (2)    | –         |
| `reload`                          | 97.0% (4)    | 100%         | –         |
| `recoil`, `max_attack`            | 100%         | 100%         | –         |
| `rapid_fire`                      | 94.7% (7)    | 100%         | –         |
| `shots`                           | –            | –            | 98.3% (2) |
| `coatings`                        | –            | –            | 92.2% (9) |
| `elements` (with coating bonuses) | –            | –            | 96.6% (4) |

The ammo disagreements are single capacities (Felyne Ragdoll `Flame S` 5 vs
the disc's 6) except Black Belt Bowgun, whose whole site list differs from
the disc. `reload` is trailing spaces (`"Normal "`). `rapid_fire` is
spelling (`Posion S`, `Flaming`, `Flame S`) and Maelstrom/Maelstrom+, which
the site lists without rapid fire. The coatings are whole bow families
(Blue Blade Bow, Dragonhead Harp) with one raw value each. Once the gunner
emitter added the coating bonuses, bow `elements` was taken too. It adds
Poison Add to Wolf Bow and Crow Bow, which have the same bonus bit as
Queen Blaster. It also fixes Abominable Bow II (Ice 140 → 200) and Kut-Ku
Stave G (`fire` → `Fire`).

`bonus`, `notes`, `shelling` and `melodies` were taken last (#32, #14).
Agreement before the build: `notes` 100% (95 horns); `bonus` 99.8% of
1,500 weapons, all 3 disagreements weapons the site lists without one
(Crater Maker +14, Sanctioned Gunlance and Sanctioned Gunlance G +20);
`shelling` 97.7% of 87 gunlances, with Scissor Gunlance (site Normal 3,
disc Normal 2) and Scissor Cannon G (Normal 4, disc Normal 3) the 2 left.
`melodies` had no committed field. Against the old site melody file, the
lists of all 20 note sets agree except one song each in two sets: Attack Up
[Hi] on p-b-r (site p-p-r, disc p-r-r, as on every other purple/red horn)
and Hear Protect [Hi] on p-g-a (site a-a-g-a, disc a-a-g-p).

Sharpness was taken later (#31), after reading it per weapon class.
`sharpness` agreement with the site was then: great sword 97.7%, long sword
93.4%, hammer 97.4%, hunting horn and lance 100%, sword and shield 79.5%,
dual blades 77.9%, gunlance 40.2%. These are not offset errors. Lance shares
gunlance's 8 entries and agrees 100%. Of the 133 site bars that disagree, 85
can't be produced by any table entry at any length, and 23 are the disc's
bar with a trailing `0`. Most of the remaining 25 are a block of G-rank
sword-and-shield rows whose bars are shuffled between weapons on the site.

The disagreements behind each decision were isolated, single-value
differences on items that otherwise matched exactly (a duplicated skill
row, `-2` vs `-3`, a recipe amount, `Commendation G` vs `S`), which is what
site transcription errors look like, rather than a pattern that points at
a wrong offset or derivation. Two exceptions were fixed elsewhere instead:
skill spellings missing from the alias overlay, and the Guild Knight
Coat/Kilt waist IDs, which the MHP2G enum swaps
(`scripts/equipment-id-aliases.json`).

Monsters were added later (#35). `compare` counts them per monster: of
83, hitzones agreed on 73 and drops on 30 of the 75 with mapped drops.
Per part, 389 of 400 mapped hitzone parts agreed. The 11 that didn't (10
monsters, 18 values) are one-to-one row matches 1–4 values off, e.g.
Fatalis chest cut 30 vs 10; the site's Bullfango row is the disc's
Bulldrome row. Per group, 601 of 695 mapped drop groups agreed. Of the 94
that didn't, 7 differ only in an amount, 24 only in chances and 63 in
items. On the disc every mapped list sums to 100; 26 of the 94 site lists
don't, others miss an entry (Hypnocatrice's high-rank capture lacks its 6%
Hypno Bezoar) or carry 0% placeholders (Hermitaur G-rank carves), and 10
are another rank's disc list pasted in (Black Diablos's high-rank groups
are its low-rank ones). All 94 are taken. A changed group keeps its
committed entry order and spellings; new items are appended.

To refresh after an extractor fix: rerun `extract`, `compare`, then
`build-data`, and review its `--markdown` change list. Add a field to
`take` only after reviewing its disagreements. Rerun
`pnpm generate-equipment-ids` if item names change.

## Overlay data

`src/overlay/*.json` holds fields that cannot be derived from the disc at
all. Currently: `materials.json` (crafting-material `type`/`color` by game
item name, e.g. "Iron Ore" -> `{ type: "ore", color: "gray" }`) and
`decoration-categories.json` (the presentation-only decoration grouping,
e.g. "Attack Jewel" -> "Attack up"), both generated once from the committed
`data/` files (see git history) and consumed by `src/emit/*.ts`.

`skill-name-aliases.json` is the one overlay that goes the other way: it
maps the committed site's skill spellings (`"Defence"`, `"Load"`,
`"Fast Chrge"`, ...) to the extractor's `SkillID` names. `diff` and
`compare` use it so the same skill under a different spelling isn't
reported as a mismatch, and `build-data` uses it to write disc skills back
in the site's spelling. `extract` output is unchanged. See the module doc
comment for how each entry was chosen.

`material-styles.json` holds hand-picked material icon styles by item ID
(see "Building `data/` from the disc").

`keep-site-values.json` lists reviewed disagreements where the committed
value is right and the disc reading is wrong; `build-data` keeps those
values (see "Building `data/` from the disc").

`monsters.json` holds the presentation for disc monsters: site name, file,
and the disc slot behind each committed hitzone part and drop group (see
"Monster overlays"). Flavor text and category grouping stay as
committed.

## Tests

```bash
pnpm --filter mhfu-extract test
```

Tests exercise the binary readers, cipher, EBOOT decryption strategy chain,
struct decoders, and the `emit/` layer against small hand-built fixture
buffers (no game files needed/included) — the `emit/*.test.ts` fixtures in
particular reproduce exact real byte values from a decrypted JP EBOOT
(e.g. the real "Carbalite Sword"/"Leather Helm"/"Paralysis Jewel" entries;
`test/emit-armor.test.ts` checks the first real piece of every armor slot
against `data/armor/` through both the JP and EU paths),
so they double as a regression check that those disc values keep producing
the same output. Every table reader's byte offsets have additionally been
validated by hand against a real decrypted JP EBOOT (not part of this repo,
not automated in CI) — see git history for the specific findings, notably:

- `ArmorValuePTR` is five _single_ pointers to per-slot arrays, not one
  pointer per armor piece as the ImHex syntax might suggest at a glance.
- Those five pointers are in leg, head, chest, arm, waist order, not the
  head, chest, arm, waist, leg that `eboot.hexpat` declares: each one holds
  the next slot's armor (`ARMOR_POINTER_INDEX` in `src/tables/armor.ts`).
  The arrays sit back to back in true slot order, 436/420/411/409 entries
  apart, and entry 1 of each is that slot's starter piece with the site's
  exact stats. Reading them in the declared order was the "armor name
  alignment" drift of [#30](https://github.com/vallode/mhfu-blacksmith/issues/30): a helmet name on a leggings stat block,
  hidden by set pieces sharing defense, resistances and price. With the
  right order, plain index naming is correct and the fingerprint-derived
  armor index/slots correction overlays are gone.
- `EquipmentCreateTable`/`EquipUpgradeTable`'s section counts (transcribed
  from `eboot.hexpat`) are correct: the computed end-of-table byte offset for
  each matches the real gap to the next declared table's address exactly.
- The vendored `.enum` files' declared `str Name[N]` header counts are
  unreliable (off from the actual parsed string count for _every_ table, not
  just an isolated one-off) — `src/strings/enums.ts` trusts the parsed count,
  which matches real stat-table lengths exactly, including `ChestArmorID`
  (420 names, 420 stat entries) once you stop trusting its header's claimed 435.

`test/resolver.test.ts` and `test/game-profile.test.ts` cover the table
address resolution architecture (see "Region support" above):
`StaticOffsetResolver`/`SignatureResolver`/`verifyResolverCoverage()`
behavior against synthetic fixtures, and `MHP2G_PROFILE`'s JP path staying
identical to the pre-existing `tableOffset()` plus its EU path resolving
every one of `EU_ALL_SIGNATURES`' real, disc-validated signatures at their
real found offsets — same "embed the real bytes in a small synthetic
buffer" pattern as `test/ovl.test.ts`'s known-real-bytes tests, so no real
EBOOT dump needs to ship with the repo. `test/armor.test.ts` additionally
covers `readArmorValues(reader, resolver)`'s direct-array EU path (bypassing
`armorValuePointers`' pointer indirection entirely) against a synthetic
fixture.
