# Fix plan: `diff` mismatches between extracted and committed `data/`

Source: a background triage ran `unpack`/`extract`/`diff` against the real JP
ISO and found 17,201 field-level mismatches (+340 items only-in-extracted,
332 only-in-committed) across 17 shared equipment files. This document reads
the current source for each ranked issue and turns the triage findings into
a concrete, sequenced fix plan. **No fixes are implemented here — planning
only.**

Everything below was verified by reading the real, current source in this
worktree (`src/tables/armor.ts`, `src/emit/armor.ts`, `src/tables/weapons.ts`,
`src/emit/weapons.ts`, `src/tables/sharpness.ts`, `src/tables/recipes.ts`,
`src/emit/common.ts`, `src/strings/{names,enums}.ts`, the vendored
`eboot.hexpat`/`equip.enum`, and the committed `data/**/*.json` +
`data/schemas/*.json`), not just restated from the triage summary. Several
findings below **correct or sharpen** the triage's framing — see each
section's "what the code actually shows" for specifics.

---

## 1. Armor name↔stat index drift (13,423 mismatches — dominant issue)

**Problem:** `emit/armor.ts`'s `emitSlot()` resolves each armor piece's name
via `names.resolve(nameTable, armor.index)` where `armor.index` is simply
the raw stat array position (`src/tables/armor.ts:119`, `readArmorValueEntry`
called with `i` as `index`). For roughly 60-90% of entries per slot (worse
than the README's "60-75%" estimate, per the triage), the name at that array
position doesn't correspond to the stats at that array position.

**What the code actually shows (new angle):** `src/strings/names.ts`'s own
module doc states the armor/weapon **names come from nowhere in the
binary at all** — they're bootstrapped from a hand-transcribed third-party
`.enum` text file (`vendor/mhp2g-patterns/includes/equip.enum`), not
extracted from disc pointers. That means "the name-table order" and "the
stat-table order" are two *independently sourced* lists that this pipeline
is currently assuming line up 1:1 by raw position — there is no reason a
priori they must, and no in-binary field links them (unlike, say, an actual
name pointer inside `ArmorValue`). This reframes the bug: it's not
necessarily "we're reading the wrong byte for an index field," it's "we're
assuming two unrelated lists share an ordering we've never actually
verified beyond the first ~10 entries per slot."

Critically, **this exact class of bug already has a confirmed, solved
precedent elsewhere in this same binary**: `src/emit/common.ts:91-99`
(`groupEquipCreateByEquipId`'s doc comment) states plainly that
`EquipCreate`'s own array position does **not** line up with its
corresponding stat table's position — only an explicit `equipId` field
inside the `EquipCreate` struct (`src/tables/recipes.ts:47`,
`reader.u16(off + 2)`) reliably identifies which stat entry a recipe
belongs to. `ArmorValue` (`src/tables/armor.ts:72-108`) has three fields
never used for anything (`unkn1: u16 @ off+6`, `unkn2: u8 @ off+27`,
`unkn3: u16 @ off+28`) sitting in a structurally similar position (right
after the leading identity fields) to where `EquipCreate`'s `equipId` sits.
`unkn1` in particular is large enough (u16) to encode an absolute index
into a table of up to 436 entries — exactly what's needed.

**Proposed approach (two parallel workstreams, not mutually exclusive):**

1. **Test the "hidden index field" hypothesis directly against real
   disc bytes** (needs a real unpacked EBOOT, which this task doesn't have
   access to — flag as the literal next action for whoever has disc access):
   for every entry in one slot (e.g. `chestArmor`, 420 entries), dump
   `unkn1`/`unkn2`/`unkn3` and check (a) are they mostly unique per entry
   (a hallmark of a real ID field; a true "unknown" reserved byte would
   cluster on a few repeated values), and (b) does treating `unkn1` as the
   name-table index (instead of raw array position `i`) make defense/price/
   resistances/skills agree with the committed entry at that `unkn1`-th
   name. This is the single highest-leverage next step — if it works, the
   fix is a one-line change in `emit/armor.ts`'s `emitSlot()`
   (`names.resolve(nameTable, armor.unkn1)` instead of `armor.index`) plus
   exposing `unkn1` under a clearer name once confirmed.
2. **If no hidden index field exists, fall back to empirical
   reconciliation via fingerprint matching** — a genuinely new angle
   distinct from "re-check the by-index assumption": use the *other*
   high-entropy raw fields on each `ArmorValueEntry` (5 resistances + slots
   + 7 sphere-cap bytes + up to 5 skill pairs — collectively enough entropy
   that two different armor pieces sharing an identical fingerprint within
   one ~400-entry slot should be rare) as a search key. For each **committed**
   armor entry (already has a name + stats, and is presumably right most of
   the time — it's wiki-sourced, not derived from this same by-index
   assumption), compute the same fingerprint from its `defence`/resistances/
   `skills`, and search the raw stat array for the position whose fingerprint
   matches. This turns "guess the index relationship" into a constraint-
   satisfaction problem solvable with a one-off offline script (not
   shipped in `src/`), producing an empirically-derived index-correction
   table per slot. That table would ship as a new overlay file (matching
   the existing `src/overlay/*.json` pattern used for `materials.json`/
   `decoration-categories.json`) consumed by `emit/armor.ts`, rather than
   as a derived formula — consistent with the README's admission that no
   fixed-offset formula exists.
   - Secondary check worth running alongside this: read the vendored
     `eboot.hexpat`'s `ArmorValuePTR` comment (`vendor/mhp2g-patterns/
     patterns/eboot.hexpat:195-201`) and cross-reference against
     `amaillo/MH-Pointers-Tool` (mentioned in `src/strings/names.ts`'s doc
     comment as "the lead to follow" for a real name-pointer table) — if
     that tool documents the actual in-binary name pointer table, that
     would replace the enum-bootstrap entirely for armor and sidestep the
     ordering-mismatch question altogether.

**Effort:** Large. **Confidence:** Medium for approach 1 (a plausible,
concrete, previously-untested hypothesis with real precedent in this
codebase, but unverified against real bytes) — this is the "genuinely new
angle" the previous investigation didn't try (it checked the by-index
assumption, not whether a separate ID field exists). Low-medium for
approach 2 as a fallback (it will always produce *some* answer, but a
fingerprint collision or an armor piece absent from committed data could
produce a wrong mapping without careful validation).

**Verification:** Extend `test/armor.test.ts`/`test/emit-armor.test.ts`
with a fixture using two armor entries whose `unkn1` deliberately differs
from array position, asserting the resolved name follows `unkn1`. At the
`diff`-tool level: rerun `diff` per armor file and check
`fieldMismatches` count for `defence`/`fire_res`/`water_res`/`thunder_res`/
`dragon_res`/`ice_res`/`create_cost`/`rarity`/`slots` drops from the
current 50-93%-per-file range toward single digits; also expect
`itemsOnlyInExtracted`/`itemsOnlyInCommitted` for `data/armor/*.json` to
shrink sharply, since a many mis-set `armor.slots > 3` skip
(`emit/armor.ts:83`) or corrupted name lookup at wrong indices likely
double-counts as spurious only-in-one-side items today.

**Priority: do this dedicated investigation, but sequence it *after* every
quick win below** — it's the highest-impact item by far but is explicitly
higher-risk/exploratory (needs real disc-byte access this planning session
didn't have), so it shouldn't block shipping the confident, fast fixes
first.

---

## 2. Armor `skills` decode wrong even on stat-aligned entries (265/276)

**Problem:** Wiki-verified: for **"Leather Armor" (plate/chest, rarity 1)**
— a low-index entry where defense/price/resistances already agree with
committed data (i.e. *not* in the drifted zone from #1) — the committed
data lists exactly 5 real skills (`Throw+2, Backpackng+2, Gathering+2,
MixSucRate+2, Cooking-1`, confirmed at `data/armor/plate.json:48-83`, which
fills all 5 `ArmorSkills` slots with real, mostly-positive values), while
the triage found extraction invents a phantom pair and drops a real one.

**What the code actually shows:** The byte layout in `readArmorValueEntry`
(`src/tables/armor.ts:73-76`, 5×(`u8` skill id, `s8` amount) starting at
`off+30`) matches `eboot.hexpat`'s `ArmorSkills`/`ArmorValue` struct
(`vendor/mhp2g-patterns/patterns/eboot.hexpat:158-161,171-193`) field-for-
field and byte-count-for-byte-count (struct sums to exactly 40 bytes =
`ARMOR_ENTRY_SIZE`) — so this is **not** an off-by-N byte misalignment
bug in the obvious sense. Given issue #1's finding that name↔stat
alignment is unverified/broken beyond the first ~10 entries, and that
skills (5 independent, high-cardinality id+amount pairs) are a much more
sensitive signal for index misalignment than defense/price (low-
cardinality, frequently-repeated values that can spuriously "agree" by
coincidence even when misaligned) — **this may not be a separate bug at
all, but issue #1's drift surfacing *within* the supposedly-safe first-
~10-entries zone**, just detected here because skills have enough entropy
to catch it where defense/price didn't.

**Proposed approach:** Don't treat as independent from #1 until proven
otherwise. First step: once real EBOOT access is available, for "Leather
Armor" and 4-5 neighboring chest-armor indices, dump the *raw* skill quintuple
at each index ±2 around the currently-assumed index and check whether one of
the neighbors' raw bytes match committed "Leather Armor"'s skills exactly
(if so, this confirms it's issue #1's drift, just a smaller/earlier
manifestation than assumed, and the fix is the same one). If no neighboring
index matches either, treat as a genuinely separate decode bug and audit:
(a) whether `SkillID` enum resolution (`src/strings/names.ts`'s `"SkillID"`
table, sourced from `equip.enum`'s 101-entry `SkillID` array,
`vendor/mhp2g-patterns/includes/equip.enum:3644`) is pointing at the right
block — note the enum file also contains a **commented-out** "Skills 2"
220-entry table (`equip.enum:3747-3936` area) with much more granular
per-direction skill names; confirm nothing in `lookupName`/`loadEnums`
accidentally conflates the two tables; (b) re-verify the `off+30`..`off+39`
skill bytes aren't shadowed by a padding/alignment assumption ImHex applies
implicitly that this TypeScript port doesn't replicate.

**Effort:** Medium (contingent on #1's outcome — could collapse into a
one-line shared fix, or need its own investigation). **Confidence:**
Medium — the "it's actually #1" hypothesis is plausible and cheap to check
first, which is exactly why it should be checked before assuming a new
bug exists.

**Verification:** Add a `test/emit-armor.test.ts` fixture using the real
"Leather Armor" plate bytes (once obtained) asserting all 5 skills match
wiki-published values exactly (extending the existing "Leather Helm"
pattern at `test/emit-armor.test.ts:21-53`, which currently only asserts
against *raw* bytes, explicitly sidestepping the known skills disagreement
— see its docstring). At the `diff` level: track `fieldMismatches` for
`field === "skills"` across all 5 armor files; expect this count to drop
in lockstep with #1's fix if they're the same root cause, or independently
if not.

**Priority:** Investigate immediately alongside #1 (cheap: it's a data
question, not a design question) before assuming it needs its own fix.

---

## 3. `sharpness`/`sharpness_plus` far more divergent than documented (2,107)

**Problem:** README frames this as "only the last color's width is
approximate"; the triage found 57.4% of mismatches disagree from the very
first array entry (`red`), which is a much more fundamental disagreement
than a last-color rounding error.

**What the code actually shows:** `readSharpnessTable`
(`src/tables/sharpness.ts:25-37`) reads 7 cumulative `u16` thresholds per
entry, matching `eboot.hexpat`'s `WeaponSharpness`/`SharpnessTable`
byte-for-byte (14 bytes/entry × 40 entries, and `verifyOffsets()`
(`src/tables/offsets.ts:137-155`) already cross-validates every
blademaster weapon's `sharpnessId` is in-range `[0,40)` against a real
EBOOT — so the **weapon → sharpness-row** link is independently confirmed
correct, unlike armor's name↔stat link). The likely fault is therefore
isolated to `emit/weapons.ts`'s `emitSharpness()` (`emit/weapons.ts:78-84`):
it (a) divides cumulative-diff step widths by a flat `/10`
(`ELEMENT_VALUE_SCALE`, reused from the unrelated element-value scaling
with no independent confirmation this applies to sharpness), and (b) slices
`[0, sharpnessAmount + 3)` — an admitted, never-fully-reverse-engineered
heuristic (README + `emit/weapons.ts:64-77`'s own doc comment) for how many
of the 7 colors are "visible." Sample committed data (checked directly,
e.g. `data/weapons/great-sword.json`'s `Buster Sword`→`[5,3,7]`,
`Ravager Blade+`→`sharpness:[9,4,11,6]` vs `sharpness_plus:[9,4,11,7,4]`)
confirms array lengths *are* variable and start-from-red, consistent with
the current slicing *strategy*, but doesn't rule out the `+3` constant or
the `/10` divisor being wrong for a large subset of weapons.

**Proposed approach:** This needs a dedicated correlation pass against real
data (can't be fully resolved by static code reading alone) — but it's a
narrower, more mechanical investigation than #1: pull every weapon's raw
`cumulative` sharpness array plus `sharpnessAmount`, alongside its
committed `sharpness`/`sharpness_plus`, and test three concrete hypotheses
in order: (1) is the divisor exactly 10, by checking whether
`rawStepWidth / committedValue` is a stable constant across many weapons
(if it's consistently e.g. 5 instead of 10, that's a one-constant fix);
(2) is `sharpnessAmount + 3` the right visible-count formula, by checking
whether shifting it by ±1 makes first-entry values match far more often;
(3) for weapons where hypothesis 1-2 don't resolve it, check whether
leading near-zero-width colors are being dropped/kept inconsistently
compared to committed data (i.e., does committed data ever *trim* a
leading `red` entry when its width rounds to 0, which this code currently
never does).

**Effort:** Medium. **Confidence:** Medium — the weapon→row link is solid
(unlike armor), so this is a bounded, well-defined function-level bug, but
the exact correct formula isn't yet known and may need per-hypothesis
elimination against real data.

**Verification:** Extend `test/sharpness.test.ts` (currently only tests
the raw table reader and `sharpnessStepWidths` against synthetic cumulative
values, `test/sharpness.test.ts:1-49`) with fixtures built from real
weapons across a spread of `sharpnessAmount` values (0, 3, 6) cross-checked
against their committed `sharpness`/`sharpness_plus` arrays. At the `diff`
level: track `fieldMismatches` for `field ∈ {"sharpness","sharpness_plus"}`
across all blademaster weapon files (bows/bowguns don't have sharpness);
expect the 57.4%-zero-match-at-index-0 figure to drop to near zero once the
divisor/visible-count formula is corrected, even if some last-color
rounding imprecision remains (that residual matches the README's original,
narrower documented gap).

**Priority:** After the quick wins (#4-#7's easy parts), before or
alongside #1/#2 — self-contained, doesn't depend on other issues' outcomes,
but needs real-data correlation work so isn't a "confident one-line fix."

---

## 4. `improve_from` array-vs-string shape (731 mismatches) — not a real bug

**Problem:** `resolveImproveFrom` (`emit/weapons.ts:91-96`) always returns
`string[] | null`. Committed data uses a bare `string` when there's exactly
one upgrade source and an array only for 2+ (confirmed directly: e.g.
`data/weapons/great-sword.json`'s `"Buster Sword+"` → `improve_from:
"Buster Sword"`, a bare string; spot check found 4 bare-string vs 124
array entries in that one file alone). The schema's `oneOf` (`data/schemas/
weapon.schema.json:54-60`) explicitly permits both shapes, so this is
non-blocking noise, not incorrect data.

**Proposed approach (optional, low priority):** For consistency/reduced
diff noise only: in `resolveImproveFrom`, return `resolved[0]` directly
when `resolved.length === 1` instead of a 1-element array, matching the
committed convention exactly.

**Effort:** Small. **Confidence:** High (mechanical, well-understood).

**Verification:** Add a `test/emit-weapons.test.ts` case for a weapon with
exactly one upgrade source, asserting `improve_from` is a bare string.
`diff`'s `fieldMismatches` for `field === "improve_from"` should drop from
731 to ~0 (any residual would be genuine multi-source-vs-committed-data
ordering differences, worth a quick look but not expected to be large).

**Priority:** Do first if doing any code changes at all — it's the single
cheapest, most certain win in the whole list (small diff, zero risk,
trivially verifiable), even though its mismatch count is far from the
largest. Optional to skip entirely if the team decides format-only diffs
aren't worth the changelog noise.

---

## 5. `bonus` field always null for all 11 weapon types (269 mismatches)

**Problem:** `bonus: null` is hardcoded in all three emit call sites
(`emit/weapons.ts:112` interface default and the two literal `bonus: null`
at lines 176 and 237). README only documents this as a Hunting Horn/
Gunlance gap; checking committed data directly shows **every** weapon
class has real, non-null `bonus` values (spot-checked all 11
`data/weapons/*.json` files): blademaster types (`great-sword`,
`long-sword`, `sword-and-shield`, `dual-blades`, `hammer`, `hunting-horn`,
`lance`, `gunlance`, `bow`) show `"+N"`-formatted small integers (2-40);
bowgun types (`light-bowgun`, `heavy-bowgun`) show plain (no `+`) integers
in a similar range. The `+`-vs-plain split by weapon *category* (not
individual weapon) is a strong signal these are two structurally different
derivations, not one shared field.

**Proposed approach:** This needs the same kind of correlation analysis as
#3 — no vendored pattern field is confidently unassigned-and-labeled
"bonus" (`WepBMValue`'s only unlabeled bytes are `Unkn2` at `off+20` and
`Unkn3` at `off+23`, plus the never-independently-verified top/bottom byte
split of `Sort_Order`; `WepGunValue`'s are `Unkn1`, a whole `u32` at
`off+20`, comfortably large enough to encode a 2-40 range in a sub-byte).
Concretely: write a one-off correlation script that, for every already-
known committed non-null `bonus` value, checks each candidate raw field
(`unkn2`, `unkn3`, both bytes of `sortOrder` for blademaster; `unkn1`'s
bytes for gunner) for an exact-match rate, run separately per weapon
*category* since blademaster/gunner clearly differ. Whichever field wins
becomes the new read; wire it into `emitBlademasterWeapons`/
`emitGunnerWeapons` replacing the hardcoded `null`, formatting with `+`
prefix only for the blademaster case (reusing `formatSignedAmount()` from
`emit/common.ts:87-89`, already used elsewhere for skill amounts) and
plain numeric string for gunner.

**Effort:** Medium-large (needs real-data correlation across all 11 files
before the exact byte can be confirmed — this is the second-most
speculative item after #1, since literally no candidate field has been
independently validated yet, unlike sharpness where the weapon→row link is
already solid). **Confidence:** Low-medium — likely a real, discoverable
field (10 unmapped bytes total between the two structs is a small enough
search space that *something* should correlate), but nothing here has been
checked against real bytes yet.

**Verification:** New `test/emit-weapons.test.ts` fixtures per weapon
category once the field is identified, asserting `bonus` matches a known
committed value from raw bytes. At the `diff` level: `fieldMismatches` for
`field === "bonus"` should drop from 269 toward 0 across all 11 files
simultaneously if the hypothesis is right (a partial drop in only some
categories would indicate the correlation only holds for a subset and
needs further work).

**Priority:** Medium — real, broad impact (269 mismatches across every
single weapon type) but blocked on doing the correlation analysis first;
sequence after the sharpness investigation (#3) since it's a similar
"needs real-data correlation" shape and could reuse the same tooling/script
scaffolding.

---

## 6. `affinity` mixed: format quirk + real disagreements (188 mismatches)

**Problem:** Two sub-issues. (a) 75/188 are pure formatting: extracted
`"0%"` vs committed `"0"` (schema permits `["string","null"]` with no
format constraint, `data/schemas/weapon.schema.json:50`, so this is
committed-data inconsistency, not an extraction bug — some committed
entries apparently strip the `%` for exactly-zero affinity). (b) 113/188
are genuine numeric disagreements, e.g. committed `Heartshot Bow III` =
`20%` (confirmed directly, `data/weapons/bow.json`) vs extracted `30%`,
despite `attack` (240→264→336 across the I/II/III progression) being
correct on the same entries.

**What the code actually shows:** `affinity: reader.s8(off+13)` for both
blademaster and gunner structs — a plain, unscaled signed byte read, right
next to `defense` (which reads correctly) at `off+12`. Since `attack` (a
different offset in the same struct) is correct on the very same
mis-affinity entries, this rules out a whole-entry index-drift explanation
(unlike armor) — whatever's wrong is specific to byte `off+13` or to a
subset of entries independent of struct alignment. Notably,
`Heartshot Bow III`'s wrong value (30%) exactly equals a *different* real
affinity value that appears elsewhere in the committed bow data (30% is a
common bow affinity value) — worth checking whether this is a genuine
per-weapon-tier data pattern (e.g. some multi-tier weapon families keep
identical affinity across upgrade tiers in-game, and it's the *committed*
Heartshot Bow III entry that has a stale/copy-paste value from testing
Bow II, not the extraction) rather than assuming extraction is at fault by
default.

**Proposed approach:** (a) Format fix: normalize every committed-vs-schema
mismatch by always emitting `"N%"` (current code already does this
uniformly at `emit/weapons.ts:174,235` — no code change needed on our
side; this sub-issue is actually a **committed-data** inconsistency, only
fixable by normalizing `data/` itself, which is out of this tool's scope
per the constraints of this task). (b) For the 113 real disagreements:
before assuming the extraction is wrong, wiki-cross-check a random sample
of ~15-20 of the 113 flagged weapons (not just the one cited example)
against a published stat source to establish what fraction are genuine
extraction bugs vs. stale/incorrect committed entries. Only if a
meaningful fraction are confirmed extraction bugs should time be spent
auditing whether `s8` (signed byte, range -128..127) ever legitimately
needs reinterpretation — e.g. checking whether any of the 113 raw byte
values are suspiciously close to 128/256 boundaries (a sign/rollover bug
would cluster there) versus being spread across the whole range (which
would argue against a decode bug and for a data-source disagreement).

**Effort:** Small to audit which fraction is real; medium if a genuine
decode bug is found. **Confidence:** Low on there being a code bug at all
until the sampling step is done — this is the one ranked issue most likely
to resolve as "mostly not our bug."

**Verification:** No code test needed until the sampling step identifies
an actual bug pattern. At the `diff` level: filter `fieldMismatches` for
`field === "affinity"`, manually cross-reference a sample of ~20 against a
wiki, and report the confirmed-bug fraction back into this document before
committing to any code change.

**Priority:** Low — do the cheap sampling/triage step early (it's fast and
determines whether this needs any engineering time at all), but don't plan
real fix work until that returns a confirmed pattern.

---

## 7. Bow `coatings` misapplies bowgun ammo-flag semantics (106 mismatches, 100% of bows)

**Problem:** `emitGunnerWeapons` (`emit/weapons.ts:226-228,251`) calls
`decodeShotCoat(w.shotCoatings)` unconditionally for every gunner-category
weapon, including bows — but `decodeShotCoat`
(`src/tables/weapons.ts:138-144`, `SHOT_COAT_FIELDS` at lines 100-133)
decodes a 32-bit bowgun ammo-type bitfield (`norm1/pierce1/pellet1/crag1/
clust1/...`), which is semantically meaningless for bows. Confirmed
directly against committed data: `data/weapons/bow.json` entries use a
completely different, small vocabulary (`closerng`, `paralysis`, `poison`,
`sleep`, `power`, `paint` — checked across the first several `Hunter's
Bow`/`Hunter's Power Bow` entries), matching the task's description of
bow's real coating mechanic (close-range, power, paralysis, poison, sleep,
paint — 6 named coating types, not 32 ammo bits).

**What the code actually shows:** `eboot.hexpat`'s `WepGunValue` struct
(`vendor/mhp2g-patterns/patterns/eboot.hexpat:380-397`) is shared by both
bowguns and bows (confirmed by the struct's own comment on `Reload`:
"Bowgun only, unsure what it does for Bow... for Bow seems to always be
0x02" — i.e. the pattern author already knew fields in this shared struct
have different meaning per sub-type but didn't fully work out bow's
semantics). `ShotCoatings` is a raw `u32` at `off+24`; for a bow, this
32-bit field almost certainly encodes the 6 named coating flags (a much
smaller vocabulary than the 32-bit bowgun ammo bitfield) at different bit
positions than `SHOT_COAT_FIELDS` — bows likely only use a handful of the
32 bits, or use a different byte layout entirely for that region.

**Proposed approach:** Gate `decodeShotCoat` to bowgun types only in
`emitGunnerWeapons` (`type === "light-bowgun" || type === "heavy-bowgun"`),
returning `undefined`/omitting `coatings` for bows until decoded, **or**
better: add a small dedicated `decodeBowCoatings()` in
`src/tables/weapons.ts` with its own bit-position table, derived by
correlating `w.shotCoatings` raw bits against every real bow's known
committed coating list (6 booleans is a tiny, tractable search space —
much easier to nail down than #5's bonus field). Since every single bow
entry is wrong today (106/106), any bow with a distinctive single-coating
combination (e.g. one that has *only* `paint` set) is an easy anchor to
find the `paint` bit; repeat for the other 5 named coatings.

**Effort:** Small-medium (small bit-search space, decent number of real
bow samples to correlate against — likely the second-easiest real bug fix
after #4). **Confidence:** High that gating off `decodeShotCoat` for bows
is correct and immediately stops emitting wrong data; medium-high that the
correct 6-flag bow decoding can be found via correlation against the ~116
committed bow entries.

**Verification:** New `test/tables/weapons.test.ts` (or extend existing
`test/weapons.test.ts`) case for a bow-specific coating decoder, using a
handful of real bows' raw `shotCoatings` values and their committed
`coatings` arrays as fixtures. At the `diff` level: `fieldMismatches`/
`itemsOnlyIn*` for `field === "coatings"` in `data/weapons/bow.json`
should drop from 106/116 (~91%) toward 0; bowgun coatings (already
presumably working, since the triage didn't flag bowgun coatings
specifically) should be unaffected by the gating change — verify no
regression in `light-bowgun.json`/`heavy-bowgun.json` coating diffs.

**Priority:** High among the "confident, bounded" fixes — 100% failure
rate on an entire weapon category with a small, tractable fix scope. Do
this early, right after the #4 quick win.

---

## Name-formatting quirks (contributing to 340/332 only-in-one-side items)

**What the code actually shows — important correction to the initial
framing:** none of these are bugs in this pipeline's TypeScript. Names
never come from fixed-width binary string reads at all (per
`src/strings/names.ts`'s own doc comment — see issue #1) — they come
verbatim from the vendored `vendor/mhp2g-patterns/includes/equip.enum`
text file. Checked all three cited examples directly against that file's
raw bytes:

- `"Diablo Guards "` (trailing space) — literally present in the vendored
  file (`equip.enum:908`: `"Diablo Guards "` with a trailing space before
  the closing quote), while sibling variants (`"Diablo Guards U"`, etc.)
  are correctly spaced. **Not a fixed-width-string trim bug** — there's no
  fixed-width read in this pipeline for names; it's a transcription typo
  in the third-party source file.
- `"GenesisHeadpieceTen"` (missing internal spaces) — also present
  verbatim in the vendored file (`equip.enum:123`), inconsistent even
  within the same equipment family (`"Genesis Headpiece"` at line 71 has
  the space, `"GenesisHeadpieceHaku"`/`"GenesisHeadpieceGoku"` at lines
  181/348 don't). **However**, a blanket "insert a space at every
  lowercase→uppercase boundary" fix would be unsafe: the same file is full
  of names that are *intentionally* dense/abbreviated compound names
  without spaces (`"AkantorNoirGunlance"`, `"ChameleosDualBlades"`,
  `"DiablosKingHornBow"`, dozens more found via a quick scan) which look
  like faithful transcriptions of compressed in-game display strings, not
  typos — an automated regex would "fix" those into a different kind of
  wrong.
- Embedded quotes (`DragonSealer"Virtue"` in committed data) — the
  vendored enum has `"DragonSealer Virtue"` (`equip.enum:2912`) with no
  quote marks at all, not an escaped-quote parsing bug on our side (the
  enum parser, `src/strings/enums.ts:44-47`, already correctly unescapes
  `\"` sequences when present — there's just no escaped quote in the
  source to begin with).

**Proposed approach:** Since `vendor/mhp2g-patterns/` is vendored verbatim
(per `NOTICE.md`, for provenance/re-vendoring reasons) and shouldn't be
hand-edited, fix these downstream in the name-resolution layer, following
the existing `src/overlay/*.json` precedent used for other
non-disc-derivable data:
1. **Whitespace** (`"Diablo Guards "`): trim every resolved name in
   `lookupName()` (`src/strings/enums.ts:88-94`) unconditionally — safe,
   zero-risk, catches this class of typo wherever else it exists in the
   file without needing to enumerate every instance.
2. **Missing internal spaces / embedded quotes**: do **not** attempt an
   automated regex given the false-positive risk demonstrated above.
   Instead, run a one-off detector script (e.g. flag every enum entry
   containing a lowercase-then-uppercase transition, or every name that
   has no fuzzy match in the committed data's name set after whitespace
   normalization) and manually build a small, hand-curated correction map
   (a new `src/overlay/name-corrections.json`, same shape/spirit as
   `materials.json`) applied by exact-match override inside
   `lookupName()`. Treat this as a bounded, enumerable cleanup task, not
   an algorithmic one.
3. As a side effect, before building the correction map, re-run the 340/
   332 only-in-one-side diff with whitespace-trimming alone applied (fix
   #1) — likely resolves a meaningful chunk of the "noise" on its own,
   shrinking the list that needs manual curation for fix #2.

**Effort:** Small for whitespace trim; small-medium for the curated
correction map (bounded but manual). **Confidence:** High for both — these
are enumerable, low-risk, presentation-only changes.

**Verification:** Extend `test/enums.test.ts` with a case asserting
`lookupName()` trims whitespace. At the `diff` level: track
`itemsOnlyInExtracted`/`itemsOnlyInCommitted` counts across all equipment
files (currently 340/332); expect a measurable drop after the whitespace
trim alone, with the remainder addressed by the curated correction map.

**Priority:** Do the whitespace trim immediately (trivial, safe, likely
reduces diff noise for free); treat the curated correction map as low-
priority cleanup, since it's cosmetic and doesn't affect any numeric
gameplay data.

---

## Not planned (deliberately out of scope)

- **`improve_from` array-vs-string shape** (#4) — schema explicitly allows
  both shapes via `oneOf`; fixing it is optional polish, not a bug fix
  (see #4 above; the plan includes it as an optional quick win, but it's
  not "wrong" data today).
- **Committed-data-side issues**: the `dummy (...)` placeholder naming
  convention (confirmed present in committed data, e.g.
  `data/weapons/bow.json`'s `"dummy (Diasorute Arrow)"`,
  `data/weapons/dual-blades.json`'s `"dummy (Dual Tessen \"Gavas\")"`) and
  any pre-existing lowercase-typo entries in `data/` are **not**
  extraction bugs — they're artifacts of however the committed data was
  originally compiled, predating this pipeline. Not this tool's job to
  "fix" the committed files directly; if `diff` flags these as
  only-in-committed items, that's expected and correct behavior (the
  extraction pipeline shouldn't try to reverse-engineer or reproduce
  placeholder names).
- **`affinity`'s `"0%"` vs `"0"` formatting half** (part of #6) — this is
  a committed-data self-inconsistency (some committed entries strip `%` at
  exactly zero, others don't), not something to chase on the extraction
  side, since the extraction side is already uniform.
- **Rewriting/patching `vendor/mhp2g-patterns/` files directly** to fix
  the name-formatting quirks — vendored verbatim per `NOTICE.md` for
  provenance/re-vendoring reasons; corrections belong in a downstream
  overlay, not in the vendored source.
- **A blanket camelCase-boundary-insertion regex** for names — considered
  and rejected above (see name-formatting section) due to high false-
  positive risk against intentionally-dense vendored names.

---

## Overall sequencing

1. **Immediate, independent, high-confidence quick wins** (can be done in
   any order, in parallel, low risk): whitespace trim in `lookupName()`;
   bow `coatings` gating (#7) — stops 106 wrong emissions immediately even
   before the correct bow-coating bit layout is found; `improve_from`
   shape normalization (#4), optional.
2. **Cheap triage before engineering time**: sample ~20 of the 113 real
   `affinity` disagreements (#6) against a wiki to determine if there's a
   real decode bug worth chasing at all, before writing any fix code.
   Cheap, fast, and determines whether #6 needs further work.
3. **Bounded, self-contained investigations with real-data correlation**
   (needs a real unpacked EBOOT/disc access, medium effort each, can run
   in parallel with each other): sharpness formula correction (#3), bow
   coating bit-layout discovery (#7's harder half), weapon `bonus` field
   discovery (#5). These don't depend on #1's outcome.
4. **The armor skills question (#2)**: check whether it's actually #1's
   drift surfacing early, using neighboring-index raw-byte comparison —
   cheap to check, and its answer changes whether #2 needs independent
   engineering work at all.
5. **The armor index-drift investigation (#1)**: the highest-impact item
   by a wide margin (13,423 of 17,201 mismatches) but the most
   exploratory/highest-risk, and explicitly known to have resisted one
   prior investigation. Give it dedicated, unhurried investigation time
   *after* the above — both because the above are faster/more certain
   wins that shouldn't wait on a speculative investigation, and because a
   successful #1 fix might also silently resolve #2 for free, which is
   worth knowing before scoping #2's own work.

This ordering front-loads confident, cheap, verifiable wins (roughly 106 +
269-ish name-noise + 731 optional + a chunk of the 340/332 orphan items —
over a thousand mismatches) while giving the two genuinely hard,
speculative problems (#1's 13,423 and #5's 269) the dedicated
investigation time they need without blocking everything else on them.
