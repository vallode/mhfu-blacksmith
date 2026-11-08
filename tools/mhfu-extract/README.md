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

**Not extractable this way:** monster hitzones, carve/capture/break rewards
and HP/attack/defense multipliers (the data exists in the `.ovl` overlays but
isn't statically linked to monster IDs — see "Monster overlays" below),
flavor text, and a few cosmetic groupings. Equipment-side gaps of this kind
come from hand-authored files under `src/overlay/` — see "Overlay data".

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
- **EU quests**: 519 of 551 parse; 32 are skipped because EU's `DATA.BIN`
  layout differs from JP's ([#36](https://github.com/vallode/mhfu-blacksmith/issues/36)).
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

### Monster overlays: hitzones and rewards (parked)

`game_task.ovl`, `game_sub.ovl` and the per-monster `emXX.ovl` files share
the `MWo3` container format parsed by `src/container/ovl.ts` (header with
`loadBase`/`loadEnd` vaddrs, then the mapped image; `vaddrToOffset`
translates pointers). Real hitzone and reward bytes are confirmed inside them
and pinned as fixtures in `test/ovl.test.ts`, but no static monster ID →
data mapping exists, so nothing is emitted for monsters yet. Investigation
notes and options: [#35](https://github.com/vallode/mhfu-blacksmith/issues/35).

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

Known gaps and approximations, tracked in
[#38](https://github.com/vallode/mhfu-blacksmith/issues/38):

- **`sex`/`hunter_type`/`hr`/`elder`** armor fields are omitted: no raw field
  correlates with the first two, and the last two aren't in `ArmorValue`.
  All four are optional in the schema.
- **Sharpness** uses a reach-threshold model; about 10% of weapons are off by
  one unit between colors ([#31](https://github.com/vallode/mhfu-blacksmith/issues/31)).
- **Gunner ammo/coating details** and **Hunting Horn/Gunlance bonus** aren't
  emitted ([#32](https://github.com/vallode/mhfu-blacksmith/issues/32)).
- **Affinity** disagrees by exactly +5/+10 on 108 weapons ([#33](https://github.com/vallode/mhfu-blacksmith/issues/33)).

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

**Known gap: quest board text is Japanese-only.** The JP disc points every
language slot at the Japanese text, so `title`/`goal`/`fail`/`details`/
`client` are Japanese. Every other quest field is in English, resolved through
the same enums as equipment. See [#36](https://github.com/vallode/mhfu-blacksmith/issues/36).

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

`skill-name-aliases.json` is the one overlay that goes the other way: it
maps the committed site's legacy skill spellings (`"Defence"`, `"Load"`,
`"Fast Chrge"`, ...) to the extractor's `SkillID` names. Only `diff` uses
it, so the same skill under a different spelling isn't reported as a
mismatch. `extract` output is unchanged, because the extractor's names are
the canonical ones and `data/` is meant to be rebuilt from the disc. See
the module doc comment for how each entry was chosen.

Monster HP/attack/defense multipliers, flavor text and category grouping
will need the same treatment once monster output exists ([#35](https://github.com/vallode/mhfu-blacksmith/issues/35)).
English quest board text is another candidate ([#36](https://github.com/vallode/mhfu-blacksmith/issues/36)).

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
