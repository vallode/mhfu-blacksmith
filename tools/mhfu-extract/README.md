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
arrays inside the game's main executable (`EBOOT.BIN`). Quests are
individual `.mib` files inside `DATA.BIN`. See `NOTICE.md` for the
reverse-engineering sources this is built on.

Monster hitzones, status tolerances and carve/capture/break rewards live in
the `game_task.ovl` and `game_sub.ovl` overlays, also in `DATA.BIN` (see
"Monster overlays" below).

**Not extractable this way:** flavor text and a few cosmetic groupings.
Which of three quest stat multiplier tables a quest uses isn't settled yet
(see "Monster overlays"). Equipment-side gaps of this kind
come from hand-authored files under `src/overlay/` — see "Overlay data".

## Usage

```bash
# from the repo root
pnpm --filter mhfu-extract unpack  --iso /path/to/mhfu.iso --out .cache/mhfu
pnpm --filter mhfu-extract extract --unpacked .cache/mhfu --out .cache/mhfu/extracted
pnpm --filter mhfu-extract diff    --extracted .cache/mhfu/extracted --data ../../data
pnpm --filter mhfu-extract compare --extracted .cache/mhfu/extracted --data ../../data
pnpm --filter mhfu-extract build-data --extracted .cache/mhfu/extracted --data ../../data --markdown .cache/mhfu/changes.md
```

- `unpack` reads the ISO (or `.cso`), decrypts `EBOOT.BIN` and `DATA.BIN`,
  and writes plain files to `--out` (an EBOOT dump, `data-bin/<index>` files
  named via `vendor/fuctool/filelist.csv`, and detected region info).
- `extract` reads the unpacked directory and produces `data/*.json`-shaped
  output plus `EXTRACTION.json` provenance manifest. `--raw` also writes
  numbers-only dumps to `raw/` (sharpness, weapons, gunner, armor, and
  `quests.json`: each quest's header words, raw `RewardTBL` entries and
  script packets). It also writes `melodies.json`: candidate hunting horn
  note-set tables, found by searching the EBOOT and both overlays for a
  table whose entry `NoteGLType` holds each horn's committed notes, plus
  the blocks densest in the committed melody note sequences and the bytes
  around both (`src/emit/melody-raw.ts`).
  And `attacks.json`: every monster attack table, found by their record
  layout and labelled with the Monster Hunter Wiki's numbers (see "Monster
  attacks").
- `diff` compares extracted output against the repo's committed `data/`
  directory field-by-field and classifies mismatches.
- `compare` reports per-file, per-field agreement between the two, pairing
  items by game ID and ignoring order and spelling. See "Building `data/`
  from the disc".
- `build-data` rewrites committed `data/` from the extracted output. See
  "Building `data/` from the disc".

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

1. Passthrough, if the file already starts with the ELF magic (i.e. you
   already have a decrypted dump).
2. An external `pspdecrypt` binary on `PATH`, if present.
3. A `--eboot <path>` flag pointing at a pre-decrypted dump (e.g. from
   PPSSPP's `Debug → Dump Decrypted EBOOT.BIN`).

If you only need `DATA.BIN`'s files (models, textures, quests), pass
`--skip-eboot` to skip this step entirely. The manifest then records
`"eboot": false`, and `extract` refuses to run on that output since it reads
equipment tables from the EBOOT.

Native in-process KIRK decryption is not implemented. Path 2 (external
`pspdecrypt`, GPL-3.0, built from https://github.com/John-K/pspdecrypt) has
been validated against both real JP and EU EBOOTs: `pspdecrypt -o out.elf
EBOOT.BIN` produces a valid ELF.

### `DATA.BIN`

`DATA.BIN` uses a documented substitution+XOR cipher (`src/container/databin.ts`,
ported from `mhef`) and is decrypted fully in-process; no external tool
needed.

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

Not implemented (out of scope for now): `QuestScript` (opcodes are marked
"TBD" even in the upstream pattern), gathering node locations/items, and
arena sets.

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
  4000, Lao-Shan Lung 26666). A quest's large-monster `power` byte (0-31)
  picks a row of four floats (HP, attack, defense, and a fourth that rises
  to 2.3-2.5 in G rank, probably status) in a 32-row table. The tables
  follow the hitzone pool in sets of three, reached from a master list of
  four sets (EU: master list at file offset `0x168c80`). Set 1's first row,
  HP 0.35 / attack 1.02, matches a published figure for the first Village
  Elder quest. A quest's header `rank` byte picks the set (0 → set 0, the
  1/2/5 low/high/G tiers of Village and Guild quests → set 1, 3 treasure →
  set 2, 4 subjugation training → set 3): sets 2 and 3 hold real values
  exactly on the rows those quests use, and set 1 is the harder set. Which of the set's three tables
  applies isn't stored in the quest (the large monsters' `attr1`/`attr2`
  are almost always 0), so it is probably chosen at run time; set 1's
  three differ mostly in HP. `extract --raw` writes the tables to
  `raw/monsters.json` and each quest's selector bytes to
  `raw/quest-monsters.json`; nothing is written to `data/` until the table
  choice is known.

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
`base_hp` is written to `data/monsters` and shown on the monster page; `tolerances` is extracted but has no committed field yet.

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
- `raw/emmodel.json`: each `emmodel/emNN.pac`'s entries (size, magic, first
  0x40 bytes) and its PMO header, mesh records and vertex-group records,
  with each group's vertex count, weights per vertex and position bounds.
- `raw/emmodel/emNN.<index>.bin`: package entries that are neither PMO nor
  TMH, whole: index 0 is the skeleton, index 3 (`d`) probably the motions.

These dumps come from the disc, so they stay in `.cache/` like the rest of
the extracted output.

### Monster attacks (in progress)

A monster attack is a 24-byte record with the same layout as the player's
`PlayerMotVal` (`src/monsters/attacks.ts`):

| Offset         | `PlayerMotVal` name | Monsters                                                                                                              |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `0x02`         | MotionValue         | damage                                                                                                                |
| `0x03`         | KnockbackStrength   | 2 or 1 in most records: probably the hunter's reaction                                                                |
| `0x07`         |                     | `0xE0` in nearly every record                                                                                         |
| `0x08`         |                     | guard knockback                                                                                                       |
| `0x09`         | DamageType          | element bits: `0x04` fire, `0x10` water, `0x20` dragon, `0x40` thunder, `0x80` ice; bit 0 is set in all but 3 records |
| `0x0A`         |                     | varies within a table (an index?)                                                                                     |
| `0x0C`, `0x0D` | EffectonHit1, 2     | status bits: `0x0C` 1 sleep, 2 poison, 4 paralysis; `0x0D` 2 snowman, 4 soiled, 16 defense down                       |
| `0x0E`         | StatusDuration      | the status's value (Rathian's Backflip: poison 25)                                                                    |
| `0x14`         | KO                  | stun                                                                                                                  |

It was found on the EU disc by searching every file for the Monster Hunter
Wiki's damage, stun and guard knockback per attack
(`src/overlay/attack-crib.json`: 283 attacks of 38 monsters, no
subspecies or variants; CC BY-SA 4.0, see `NOTICE.md`). With the numbers
as bytes, stun 18 bytes after damage and guard knockback 6 after, 27 of the
32 monsters found agree on a 24-byte stride.

The element and status bits are named by the wiki's elements and statuses
for the records whose numbers match one of its attacks.

On the EU disc there are 41 tables, 1,112 records, in `game_task.ovl` (23)
and 15 of the 17 `emNN.ovl` files (not `em01` or `em33`); none in the EBOOT, `game_sub.ovl` or
the model packages. Of the wiki's 259 attacks with damage and guard
knockback, 249 have a record with the same numbers. Nothing in the monster
chunks points at the tables. A table is not one monster's: monsters that
share a skeleton share one (Diablos and Monoblos in `em14.ovl`, Gravios
and Basarios in `em17.ovl`, Tigrex, Akantor and Ukanlos in `em75.ovl`),
and the tables in `game_task.ovl` mix small monsters with large ones
(Rathian's and Rathalos's attacks sit with 10-damage bites there; `em01.ovl`
has no table). So `findAttackTables` finds them by shape: runs
of at least four records whose bytes `0x04`, `0x11`, `0x13`, `0x15` and
`0x17` are zero (as in all 691 records the search saw), with the top two
bits of `0x07` set and `0x10` at most 5.

`extract --raw` writes `raw/attacks.json` (`src/emit/attacks-raw.ts`):
every table in `eboot.bin`, both main overlays, every `emNN.ovl` and the
monster packages' skeleton and motion entries, with each record whole and
decoded, the crib attacks with the same numbers, the 0x80 bytes before the
table (a pointer list precedes several), and the pointers to each record
from the same file or `game_task.ovl`.

Which monster uses which records is traced through the code
(`src/monsters/mips.ts`, `src/monsters/code-graph.ts`). `scanCode` reads
every overlay word as an Allegrex instruction and follows the constant
addresses that `lui` + `addiu`/`ori` pairs build, the loads and stores at
them, `jal` calls and function prologues. Each table's `code` in
`raw/attacks.json` lists the instructions that build or read an address
from 0x800 bytes before it to 0x100 after (with the 17 instruction words
around each), grouped by function with the records each touches, and the
nearest such addresses outside that window. `scan` gives the decoder's
counts per overlay.

On the EU disc no code builds an address inside a table. Every table sits
at the end of the same layout: a block of structs (often 0x50 bytes
apart), a list of pointers into them, zero padding to the table. In the
MHP2G decompilation's (`tclamb/mhp2g-decomp`) JP layout, the
`game_task.ovl` tables fall in the data of the `shell` units, its
attack-hit objects, and `em58.ovl`'s in `shell32`'s. Each shell's setup
code (the fourth EU run) reads byte `0x26` of the shell as an index into
that pointer list, stores the struct it picks at `+0x34`, and calls one
shared `game_task.ovl` function with the address just past the table. So
the records are reached from there, not by address.

For finding where, `raw/attacks.json` also carries probe output, to be
dropped once that is known: 0x800 bytes before each table and 0x200 after,
each user function's code (0x400 bytes), and the functions they call two
calls deep (`callees`, most widely called first). From each function
`CodeGraph` searches upward, through its callers, the pointer lists holding
its address and the code building that address, until a `MonChunk` slot
points at the chain. That slot names the monster, and the path is given.
`game_task.ovl` and `game_sub.ovl` are always loaded, so anything may point
into them; a per-monster overlay is only followed from itself and from the
chunk slots.

Still open: which records each monster uses, and what the remaining bytes
mean.

## 3D models (experimental)

```bash
# any .pac file or directory of them -> .glb files, for inspection
pnpm --filter mhfu-extract models --in .cache/mhfu/data-bin --out .cache/mhfu/glb

# the models the website shows -> ../../public/models/ + manifest.json
pnpm --filter mhfu-extract export-site --unpacked .cache/mhfu
```

`models` converts `.pac` model packages (a PMO 1.0 mesh plus a `.TMH`
texture set) into `.glb` files. The source lives in `src/models/`: `pac.ts`
is the container, `pmo.ts` the mesh tables, `ge.ts` the PSP GE display lists
that hold the geometry, `tmh.ts` the textures, `ahi.ts` the skeleton,
`attach.ts` puts severable tails together, `gltf.ts`/`texture.ts`/`png.ts`
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
- Output is the static bind pose: mesh pieces are already in model space, so
  no skeleton is needed to assemble them, but skinning weights are dropped
  and there's no animation (`motion/*.bin` and a monster package's entry 3,
  its motion bank, aren't decoded). The one exception is a severable tail,
  below.
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
  small monsters have none.
- A package's second PMO isn't converted: it's effect geometry (a shadow
  quad on the Raths, Cephalos's sand spray, Tigrex's roar ring, Lavasioth's
  lava).
- Names come from the region-aware file list (see "`DATA.BIN`"), so an EU
  dump unpacked before that existed has wrong names (e.g. its
  `weapon/we000.pac` is male waist armor); unpack it again.

`export-site` writes the models the site shows into `public/models/` and
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

Each run replaces the categories it could export and keeps the rest of the
previous manifest, so a run without `eboot.bin` keeps weapons and armor.

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
- Material `type`/`color` (e.g. "ore"/"gray") and decoration `category`
  aren't derivable from the disc at all — they're presentation metadata,
  supplied by the `src/overlay/materials.json` and
  `src/overlay/decoration-categories.json` overlays (generated once from the
  committed `data/` files; see git history).

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
excluding 13 `level*.mib` files confirmed to be a different, non-quest
format). `src/emit/quests.ts`'s `emitQuestsFile(parsedQuests)` then maps
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
range). `small_monsters` is deduplicated to one row per species with the
max quantity seen across every zone, since `SmallMonIndex` frequently
repeats an entire zone list verbatim (confirmed on real data); `large_monsters`
is deduplicated the same way for exact-duplicate `(monster, quantity, power)`
rows.

Not implemented (out of scope for now, same as the underlying parser —
see "Quests (.mib)" above): `QuestScript`, gathering node locations/items,
and arena sets.

## Building `data/` from the disc

`data/armor/*.json`, `data/weapons/*.json`, `data/decorations.json`,
`data/quests/*.json` and the hitzones and drops in `data/monsters/*.json`
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
(`src/build/categories.ts`), in the site's vocabulary: site item names,
the site's skill spelling (`Defence`, `Load`), and the site's spelling and
icon style for each material. Lists (skills, materials, elements,
upgrade-tree references) are written in the disc's order, even when they
already agree as a set; a scalar that agrees is left byte-identical. Item
order, key order and file layout don't change, and a second run is a no-op. Disc items the site doesn't list (the 10 unused
Piercings, Pink Metal Boots, Rookie Knife, Swordfish Bow G) aren't added.
`overlay/keep-site-values.json` lists reviewed disagreements where the site
is right, currently the 10 Ruststone weapons, which have no `EquipCreate`
recipe on the disc. Quests are copied through.

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

| category    | taken                                                                                                                                  | agreement                                                                             | not taken                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| armor       | rarity, rank, slots, defence, resistances, sex, hunter_type, max_defence, max_defence_pre_ukanlos, create_cost, skills, create_mats    | 97.5–100%                                                                             | `hr`, `elder` (not on the disc), `alternative_create_mats` (not emitted)                        |
| weapons     | attack, affinity, slots, rarity, elements, sharpness, sharpness_plus, create_cost, create_mats, improve_mats, improve_from, improve_to | 95.5–99.7% (sharpness 40–100%, affinity 99.5%, elements 100% outside bows, see below) | `improve_cost` (derivation unconfirmed), `alternative_create_mats` (ticket recipes missing)     |
| decorations | rarity, slots, create_cost, skills, create_mats, alternative_create_mats                                                               | 91.7–100%                                                                             | `color`, `category` (overlays)                                                                  |
| monsters    | base_hp, hitzones, drops (the parts and groups `overlay/monsters.json` maps)                                                           | base_hp new; per part 97.3%, per drop group 86.5% (see below)                         | `description`, `habitats`, `sizes`, `icon` (not on the disc), `tolerances` (no committed field) |

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
all. Currently: `materials.json` (crafting-material `type`/`color`, e.g.
"Iron Ore" -> `{ type: "ore", color: "gray" }`) and
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
