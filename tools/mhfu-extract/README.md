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
arrays inside the game's main executable (`EBOOT.BIN`). Monster hitzone and
carve/capture/break reward *data* does exist, verbatim, inside two overlay
files in `DATA.BIN` (`game_task.ovl`, `game_sub.ovl`) — but the monster-ID →
data-block *linkage* for both could not be recovered by static byte
scanning; see "Monster overlays: hitzones and rewards" below. Quests are
individual `.mib` files, also inside `DATA.BIN`. See `NOTICE.md` for the
reverse-engineering sources this is built on, and the plan doc this shipped
from for the full research writeup.

**Not extractable this way:** monster hitzones, carve/capture/break rewards,
and HP/attack/defense multipliers (real per-monster data confirmed to exist
in `game_task.ovl`/`game_sub.ovl`/per-monster `emXX.ovl` overlays, but not
statically linkable to a monster ID — see below), flavor text, and a few
cosmetic groupings. Equipment-side gaps of this kind are supplied by
hand-authored files under `src/overlay/` and merged in at emit time — see
"Overlay data" below; no such overlay exists yet for monster data since none
of it is emitted at all currently.

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
different tables by *different* amounts (confirmed by locating the same
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
    (see "What was validated" below).
  - **`SignatureResolver`** — the new mechanism, for regions where addresses
    shift unpredictably per table. Given a `table -> { signature bytes,
    signatureOffset }` map, it searches the target buffer for each table's
    signature and requires *exactly one* match (zero or multiple matches
    both fail loudly, naming the table, rather than silently resolving to a
    wrong address). A signature's bytes must be region-independent — i.e.
    raw gameplay values (stats, prices, item IDs), never pointers or
    localized strings, since those are exactly the things that *do* change
    between regions/localizations.
  - **`extractSignature()`** is a small dev-tool helper for deriving a new
    `TableSignature` from a known-good buffer via an existing resolver
    (typically JP's `StaticOffsetResolver`) — this is how
    `eu-signatures.ts`'s two entries were produced, and is the reusable
    building block for extending EU coverage table-by-table (see TODO list
    below) instead of hand-rolling `buf.subarray()` in a throwaway script
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
  without needing `resolver.ts` or `profile.ts` to change shape — see "What
  a future MH1/MHF1 profile would need" below.

#### What's validated and wired into `extract` for EU today

**Every table `emit/*.ts` needs for equipment output** (weapons, armor,
decorations, crafting/upgrade recipes) is validated and wired — `extract`
runs the exact same emit pipeline for EU as for JP, just through
`MHP2G_EU_RESOLVER` instead of JP's static table:

- `weaponClassModifiers`, `itemTable` (validated first, as the original
  proof of concept), `weaponsBlademaster`, `weaponsGunner`,
  `modelToWeaponType`, `sharpnessTable`, `equipmentCreate`,
  `equipmentUpgrade`, `decorationValues`, `decorationSkills` — each
  validated by taking a whole number of real entries' worth of bytes from
  JP's known-good static offset, confirming the exact same bytes occur
  **exactly once** in the real decrypted EU EBOOT, *and* (new rigor beyond
  the original 2-table proof of concept) diffing each table's **entire**
  real content — not just the signature bytes — between JP and the resolved
  EU offset. Every single one came back byte-for-byte identical across the
  whole table, in every table checked, which is strong independent
  confirmation both that the resolved offset is exactly right and that JP
  and EU share identical equipment stat data (as expected: two
  localizations of the same game). See `eu-signatures.ts`'s module doc
  comment for the full methodology and every table's exact real offset/shift.
- `armorValuePointers` — genuinely harder than the rest, and **solved**:
  its own bytes are 5 *pointers* (absolute vaddrs), not raw values, so
  unlike everything else they are NOT region-independent (confirmed: a
  literal-content search found 0 EU matches). The fix: skip resolving the
  pointer table itself for EU, and instead resolve each slot's *target*
  `ArmorValue` array directly — real per-slot addresses were found by
  dereferencing JP's own pointer table once to get each slot's known-good
  JP array address, then applying the exact same signature-and-full-diff
  process as every other table. Wired via `tables/armor.ts`'s
  `ARMOR_SLOT_TABLE_NAMES` (`armorValuesHead`/`armorValuesChest`/
  `armorValuesArm`/`armorValuesWaist`/`armorValuesLeg`), which
  `readArmorValues(reader, resolver)` resolves directly instead of
  dereferencing a pointer table when a `resolver` is passed — see that
  module's doc comment for the full writeup. All 5 slots' entire real
  arrays diffed byte-for-byte identical between JP and EU too.
- `bowgunModTable` — same underlying problem as `armorValuePointers` (its
  declared address is also a table of pointers — `BGModLevel *ModType1[5] :
  u32`, confirmed against real JP bytes: the first 4 values are plausible
  nearby vaddrs, not gameplay data — which is exactly why the original 0
  EU matches happened), and **solved the same way**: signature-match the
  pointed-to `BGModLevel` data pool directly instead of the pointer table's
  own address. No reader/consumer exists for this table in `tables/*.ts`
  today, so this is a validated reference example (proving the technique
  generalizes), not something `MHP2G_EMIT_TABLES`/`extract` depends on.
- `bowgunShotTable`, `bowChargeTable`, `dualAttributeWeapons` — validated
  the same way as the main batch above (real bytes, confirmed unique in
  EU). Also have no reader/consumer in `tables/*.ts` today (see
  `emit/weapons.ts`'s doc comment on what's out of scope), so — like
  `itemTable` — these are validated reference examples ready for whenever a
  reader is written, not currently exercised by `extract`.

All of the above were derived and confirmed using real disc images
(`Monster Hunter Freedom Unite (Europe)`/`Monster Hunter Portable 2nd G
(Japan)`) decrypted via `pspdecrypt` (see "EBOOT decryption" below) — not
fabricated or assumed. Every signature and its resulting offset is locked
in as a regression test (`test/game-profile.test.ts`, plus a
resolver-based `readArmorValues` test in `test/armor.test.ts`), following
the same pattern as `test/ovl.test.ts`'s "known real hitzone/reward bytes"
tests: the real bytes are embedded in a small synthetic buffer at the real
file offset, so tests exercise genuine validated data without needing the
actual (much larger, disc-specific, un-committable) EBOOT dump.

**What's still not covered**: only 2 tables from the original 15-table
`JP_TABLE_ADDRESSES` list have no EU resolution at all — neither is needed
by `emit/*.ts` (see above): none, actually — every declared table now has
*either* a direct signature *or* (for the two pointer tables) an indirect
one. What's genuinely still missing is **US** (`null` — no US disc
available to derive anything from at all) and, within EU itself, **quest
extraction is not the same kind of "solved"**: it runs (see next section)
but with real, DATA.BIN-layout-driven gaps, not table-address gaps.

#### Real end-to-end `extract` run against the EU disc

Ran `unpack` (reusing a cached decrypted EU EBOOT + the real EU ISO) then
`extract` against the real EU disc. Both completed successfully:

```
Detected region: eu (ULES01213)
...
Table resolution passed (14 checks) for region "eu".
Reading and parsing quest files...
Parsed 519 quests, skipped 32.
Wrote 21 data file(s) + EXTRACTION.json
```

- **Equipment**: identical set of 21 `data/*.json`-shaped files as JP
  (5 armor slots, 11 weapon types, decorations). Diffed the **entire**
  output, every field, of every one of those 21 files against a fresh real
  JP `extract` run (equal entry counts too, e.g. 176 great swords both
  sides) — **byte-for-byte identical, zero divergences**, exactly as
  expected for two localizations sharing the same underlying stat data
  (e.g. "Carbalite Sword" attack 912/rarity 6/same crafting recipe on both
  sides). No JP/EU balance differences or resolver bugs surfaced by this
  comparison; nothing to flag.
- **Quests**: not blocked by table-address resolution at all (a completely
  separate `DataCipher`/`QuestCipher` path, already region-aware from
  before this task) — 519 of 551 real quest files parsed successfully, 32
  skipped. This is *better* than the "very likely still fail/need skipping
  entirely" expectation, but genuinely incomplete: the skips are real
  `DATA.BIN` file-index/layout differences between JP and EU (some quest
  files land at a shifted index the JP-derived `listQuestFiles()` doesn't
  account for — see `EXTRACTION.json`'s `questsSkipped` reasons, e.g. "quest
  header declares size 2834403050, but only 2016 bytes follow"), not a
  table-address problem this task's scope covers. Left as-is per this
  task's explicit scope (region/table-address plumbing only, not
  DATA.BIN-layout/quest-index fixes) — a real gap, honestly reported rather
  than silently ignored or hidden by a blanket "quests unsupported for EU"
  claim.
- `cli/extract.ts` no longer hardcodes "JP only": it now asks
  `MHP2G_PROFILE.resolverForRegion(region)` for any region and fails fast
  with a clear error only if that returns `null` (today: only `us`). A
  region whose resolver exists but doesn't cover a required table (checked
  via `verifyResolverCoverage(resolver, MHP2G_EMIT_TABLES, buf)`, the
  region-agnostic analog of JP's `verifyOffsets()`) also fails fast, naming
  exactly which table's resolution failed, rather than emitting partial or
  garbage equipment data silently. **Design choice**: extraction either
  runs in full for a region's equipment or refuses outright — no
  degrade-some-fields-and-omit-others middle ground — because every table
  above is needed by every equipment file (e.g. `equipmentCreate` feeds
  crafting costs on weapons *and* armor *and* decorations), so a
  half-covered resolver would mean partially-wrong-looking output across
  nearly every file rather than one cleanly-omitted field; today this is
  moot in practice since EU's resolver already covers everything required.

#### TODO

1. **US**: no US disc is available to derive anything from — `us` is
   `null` in `MHP2G_PROFILE.resolverForRegion()` today. If a US disc ever
   becomes available, the workflow is identical to EU's: decrypt a real US
   EBOOT, derive signatures the same way, confirm uniqueness, diff full
   table content against JP, add to a new `us-signatures.ts`, wire into
   `mhp2g.ts`.
2. **EU quest extraction's 32 skipped files**: needs its own
   DATA.BIN-layout investigation (why do these specific ~32 real quest
   files, across village/guild/training hubs, land at a shifted or
   differently-sized location in EU's `DATA.BIN` vs. JP's) — out of scope
   for this task (table-address/region plumbing only), but a clear next
   step for whoever picks up quest-side EU work.
3. **`diff`'s English-name caveat still applies to EU** the same way it
   already applied to JP: names are bootstrapped from the `mhp2g-patterns`
   enums (English), not disc strings, so `diff` output should be read as a
   *stat*-mismatch tool, not a text/translation one, for either region.

#### What a future MH1/MHF1 game profile would need

Nothing in `resolver.ts`/`profile.ts` is MHP2G-specific — a hypothetical
`src/games/mh1.ts` profile would need to supply:

- Its own `TableDescriptor[]` (which tables exist, entry sizes/counts where
  applicable) — MH1/MHF1 has a different EBOOT layout entirely, so none of
  `JP_TABLE_ADDRESSES` or the entry-size constants in `offsets.ts` transfer.
- Its own struct-decoding readers (the equivalent of `tables/weapons.ts`,
  `tables/armor.ts`, etc.) — these would most naturally live under a
  game-specific path (e.g. `src/games/mh1/tables/*.ts`) rather than
  `src/tables/`, to keep MHP2G's and MH1's struct knowledge from being
  interleaved in the same directory.
- Region resolvers built the same two ways: a `StaticOffsetResolver` for
  whichever region's addresses get fully transcribed first (likely from a
  vendored pattern file, the same MHP2G bootstrap source), and
  `SignatureResolver`s for any other region, derived via `extractSignature()`
  from that first known-good region — the exact same process used for EU
  here, just starting from a different base game.
- No MH1/MHF1 disc image is available in this environment, so none of this
  can be built or validated yet — this is scaffolding guidance for whoever
  picks it up with an actual disc in hand, not a claim that it's started.

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

### Quests (`.mib`)

Every quest file under `mission_jpn/*.mib` needs a **second** decryption
pass after `DataCipher`: mhef's `QuestCipher` (`src/quests/mib.ts`), which
mhef documents as being for DLC-downloaded quests only. Empirically, on-disc
retail quests are wrapped in it too — confirmed against a real JP disc quest
(filelist.csv index 4759, `mission_jpn/m00001.mib`): after `DataCipher`
alone the bytes are indistinguishable from noise, but decrypting with
`QuestCipher` (JP salt) yields a matching SHA1 header, the exact
`quest.hexpat` magic, and a plausible `questHeader` (rank 0, 1-star, fee
100z, reward 1200z, quest ID 1 — sensible for the very first quest).

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

### Monster overlays: hitzones and rewards (parked, not implemented)

`game_task.ovl` and `game_sub.ovl` (and 17 per-monster `emXX.ovl` files —
`em01.ovl`..`em17.ovl`, one per "flagship"-tier monster, e.g. `em01.ovl` is
Rathian) all use a shared container format, `src/container/ovl.ts`'s `MWo3`
wrapper: a fixed header (magic, `loadBase`/`loadEnd` virtual addresses, a
name field) followed by the mapped data image, with `OvlFile.vaddrToOffset`
translating an in-file pointer/`@`-address to a byte offset the same way
`BinaryReader`'s EBOOT helpers do. This part is solid — validated against
real JP disc bytes by resolving self-contained fixed-layout tables
(`game_task.ovl`'s `VeggieTradeTable`, `game_sub.ovl`'s `FishCasterTable`)
to real item names, and by locating real, hand-verified per-monster data
(next paragraph) at their expected virtual addresses.

**The data is genuinely there.** Both hitzones and rewards were confirmed
present, byte-for-byte, by searching the decrypted overlay for a monster's
real values (sourced from published guides) and finding a match:

- **Hitzones** — `game_task.ovl` has a fixed 464-byte-stride array of
  `EnemyData` structs (one per monster ID, per the `tclamb/mhp2g-decomp`
  ground-truth struct), each with a `hitPtr` field at `+0x10C`. But
  `hitPtr` doesn't point at the actual per-part cut/impact/shot/element
  damage table — searching for Felyne's (monster ID 9) and Mosswine's
  (ID 4) documented hitzone bytes found them at fixed offsets in a
  separate flat data pool (file offsets `0x165f19` and `0x165d89`,
  vaddrs `0x9bc0419`/`0x9bc0289`), unrelated to `hitPtr`'s value for
  those IDs. Additionally, `hitPtr` only resolves into `game_task.ovl`'s
  own address range for 43 of the 90 monster IDs — the other 47 resolve
  into whichever `emXX.ovl` happens to be loaded into a shared VRAM slot at
  runtime, which a static file can't disambiguate.
- **Rewards** — `game_sub.ovl` has a documented `bodytailshiny`/
  `capbreakindex` (carve/capture/break) layout in the vendored
  `game_sub.hexpat`. Giaprey's (monster ID 35) real, published low-rank
  body carve table (52% Giaprey Scale / `ItemID` 340, 30% Giaprey Hide /
  342, 18% Sm Monster Bone / 281, `0xffff` terminator) was found intact at
  file offset `0xbb458` (vaddr `0x9ccf658`), immediately followed by what
  looks like the next monster's table in the same pool.

**What's blocking extraction:** in both cases, exhaustively scanning the
*entire* overlay file for a raw little-endian pointer or index-table entry
referencing the confirmed data's address turned up nothing. There's no
static structure mapping "monster ID N" → "byte offset of N's hitzone/
reward block" for this pipeline to follow — the linkage is almost certainly
computed by the game's MIPS code itself (e.g. an immediate `base + id *
stride` computation, or a jump table living in `EBOOT.BIN`'s code segment,
which this pipeline never disassembles). Recovering it would require MIPS
disassembly of the relevant EBOOT functions or dynamic/emulator memory
tracing — a different skillset than the static byte/structure reverse
engineering this pipeline otherwise relies on.

**Status:** parked here. `data/monsters/*.json` hitzone and reward fields
are not populated by this pipeline. The confirmed byte-exact evidence above
is locked in as regression fixtures in `test/ovl.test.ts` (`known real
hitzone/reward bytes` tests) so future work has verified ground truth to
resume from without repeating this investigation. Options for whoever picks
this up next: MIPS disassembly of the address-computation code, dynamic
tracing under an emulator, or (as a stopgap, equivalent to the existing
`src/overlay/*.json` mechanism) hand-transcribing hitzone/reward data from
community wikis into a new overlay file.

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
- Material `type`/`color` (e.g. "ore"/"gray") and decoration `category`
  aren't derivable from the disc at all — they're presentation metadata,
  supplied by the `src/overlay/materials.json` and
  `src/overlay/decoration-categories.json` overlays (generated once from the
  committed `data/` files; see git history).

Known gaps/approximations, deliberately deferred rather than guessed at:

- **Armor name alignment drifts** beyond the first ~10 entries per slot:
  direct array-index-into-enum (what `eboot.hexpat` documents) matches the
  committed `data/armor/*.json` closely for early entries, but diverges for
  roughly 60-75% of entries further into each slot's table, and the drift
  isn't a fixed offset we could find and correct for. We emit strictly
  by-index and rely on a future `diff` tool to surface disagreements for
  manual review. A handful of tail entries in `headArmor` specifically (5 of
  436) read obviously-corrupt slot counts (10-65, schema max is 3) and are
  skipped outright rather than emitted as garbage.
- **`sex`/`hunter_type`/`hr`/`elder`** armor fields are omitted entirely: no
  raw field was found to correlate with the committed data's values for the
  first two, and the latter two (quest-unlock requirements) aren't present in
  `ArmorValue` at all. All four are optional in the schema.
- **Weapon `sharpness`/`sharpness_plus`** bar lengths are an approximation
  (`sharpnessAmount + 3` visible steps) — the exact formula for the last
  visible color's partial width wasn't fully reverse-engineered.
- **Gunner ammo/coating details** (rapid fire, clip size, recoil/reload
  tiers) and **Hunting Horn/Gunlance bonus fields** are not emitted — the
  `NoteGLType` byte's dual purpose for these two weapon classes needs more
  reverse-engineering than we've done so far.

## Quests

`src/quests/discovery.ts`'s `readAllQuests(dataBinFiles, region)` decrypts
and parses every real quest file (`listQuestFiles()` filters `DATA.BIN`'s
564 `mission_jpn/*.mib` entries down to the 551 real `m#####.mib` quests,
excluding 13 `level*.mib` files confirmed to be a different, non-quest
format). `src/emit/quests.ts`'s `emitQuestsFile(parsedQuests)` then maps
them onto `data/quests/{village,guild,training-school,treasure-hunting}.json`
(schema: `data/schemas/quest.schema.json`) — the first `data/` category this
pipeline designed from scratch, since (unlike weapons/armor/monsters/
decorations) no such schema existed before this. Verified end-to-end against
every real quest on the JP disc: 551 parse cleanly, 3 are unused/disabled
slots (`m50001`-`m50003`: 0 zenny fee, 1 zenny reward, every text field the
literal string `"**********"`) and are dropped, leaving 548 emitted across
village (39) / guild (473) / training-school (29) / treasure-hunting (7).

**The `hub`/`rank` split** comes from `questHeader.Rank` (0-5), confirmed
against real data rather than assumed: rank 3's `client` string is always
"トレジィ" ("Treshi", the real Treasure Hunting NPC per community guides)
and rank 4's is always "教官" ("Instructor", the Training School NPC) with
every title ending in "討伐訓練" ("... Subjugation Training"); ranks 0/1/2/5's
star ranges (1-5,8,10 / 1-6 / mostly 6-9 / 9-11) line up with
community-documented Village / Guild-Low-Rank / Guild-High-Rank /
Guild-G-Rank star bands. `map` is resolved through a small hand-transcribed
table (`src/tables/quest-maps.ts`) sourced from `quest.hexpat`'s own inline
comments — the only place any vendored source names these IDs.

**Known gap: quest board text is Japanese-only.** `title`/`goal`/`fail`/
`details`/`client` are extracted verbatim from the disc, but every
`LangPTRs` slot on the JP disc aliases the same Japanese-text pointer — the
JP disc never populated distinct English strings for retail quests. This
isn't a simple "read the EU disc instead" fix, either: real EU disc
(`Monster Hunter Freedom Unite (Europe)`) `mission_jpn/*.mib` files don't
decrypt at the JP disc's filelist.csv indices at all (`QuestCipher` SHA1
mismatches / garbage declared sizes), meaning the EU `DATA.BIN`'s file
count/order genuinely differs from JP's, not just its content — the same
class of per-region structural difference already documented for EBOOT
tables above. Every other quest field (rewards, supplies, monsters, target,
map, fee/reward/penalty zenny, time limit) is fully in English already,
resolved through the same ItemID/emID enum bootstrap the equipment emit
modules use, so this only affects the five free-text fields.

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

## Overlay data

`src/overlay/*.json` holds fields that cannot be derived from the disc at
all. Currently: `materials.json` (crafting-material `type`/`color`, e.g.
"Iron Ore" -> `{ type: "ore", color: "gray" }`) and
`decoration-categories.json` (the presentation-only decoration grouping,
e.g. "Attack Jewel" -> "Attack up"), both generated once from the committed
`data/` files (see git history) and consumed by `src/emit/*.ts`.

Monster HP/attack/defense multipliers, monster flavor text, and the monster
category grouping will need the same treatment once monster emit is
implemented (not done yet — blocked on the hitzone/reward addressing gap,
see "Monster overlays" above). Quest board text (title/goal/client/etc,
see "Quests" above) is a good candidate for this same treatment too — an
English translation overlay, keyed by quest ID, would be a reasonable
follow-up once someone wants to translate the 548 emitted quests' Japanese
text. Hunting horn melody effect descriptions are a separate, still-open
gap not yet investigated at all.

## Tests

```bash
pnpm --filter mhfu-extract test
```

Tests exercise the binary readers, cipher, EBOOT decryption strategy chain,
struct decoders, and the `emit/` layer against small hand-built fixture
buffers (no game files needed/included) — the `emit/*.test.ts` fixtures in
particular reproduce exact real byte values from a decrypted JP EBOOT
(e.g. the real "Carbalite Sword"/"Leather Helm"/"Paralysis Jewel" entries),
so they double as a regression check that those disc values keep producing
the same output. Every table reader's byte offsets have additionally been
validated by hand against a real decrypted JP EBOOT (not part of this repo,
not automated in CI) — see git history for the specific findings, notably:

- `ArmorValuePTR` is five *single* pointers to per-slot arrays, not one
  pointer per armor piece as the ImHex syntax might suggest at a glance.
- `EquipmentCreateTable`/`EquipUpgradeTable`'s section counts (transcribed
  from `eboot.hexpat`) are correct: the computed end-of-table byte offset for
  each matches the real gap to the next declared table's address exactly.
- The vendored `.enum` files' declared `str Name[N]` header counts are
  unreliable (off from the actual parsed string count for *every* table, not
  just an isolated one-off) — `src/strings/enums.ts` trusts the parsed count,
  which matches real stat-table lengths exactly, including `ChestArmorID`
  (420 names, 420 stat entries) once you stop trusting its header's claimed
  435.

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
