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

**Update (executed against a real unpacked JP EBOOT):**

Approach 1 (hidden index field) is **disproven**. Dumped `unkn1`/`unkn2`/
`unkn3` for all 420 real `chestArmor` entries: `unkn1` and `unkn2` are `0`
for every single entry (not an index field at all); `unkn3` does have 420
distinct values across a 0-435 range, making it superficially plausible,
but testing it directly as the name-table index (both directly and
inverted) against real committed stats gave a **0% match rate** — worse
than the current raw-position baseline. `unkn3` is something else (possibly
a display-sort key or an unrelated table reference), not a name-table link.

Approach 2 (fingerprint matching) **partially works and is now wired in**
(`src/overlay/armor-index-corrections.{ts,json}`, consumed by
`emit/armor.ts`'s `emitSlot()`). Method: fingerprint every raw
`ArmorValueEntry` on `(defense, fireRes, waterRes, thunderRes, dragonRes,
rarity, slots, halvedPrice)` and match 1:1 against the same fingerprint
computed from each committed `data/armor/*.json` entry; a correction is
only recorded when *both* the raw fingerprint and the committed name are
unique within the slot (`scripts/generate-armor-corrections.ts`, a one-off
dev tool, not run at pipeline runtime). Critically, a raw position whose
*own* index was claimed as some other entry's correction target is
**suppressed** (emits nothing) rather than falling back to a now-known-wrong
name — an early version without this produced ~77 spurious duplicate names
per slot before this was added; confirmed fixed (down to the same 4
legitimate duplicate names already present in committed data).

**Coverage** (fingerprint-confirmed, i.e. correction + already-correct
combined, per slot / out of total raw entries): head 194/437 (44%), chest
117/420 (28%), arm 148/419 (35%), waist 231/419 (55%), leg 219/418 (52%).
The remainder (45-72% depending on slot) has an ambiguous or absent
fingerprint match (mostly low-rarity starter gear sharing near-identical
stats) and still falls back to unconfirmed raw-position naming — this is a
**partial fix**, not a complete one.

**Measured impact** (real JP `unpack`/`extract`/`diff`, this fix only,
holding all other fixes constant): armor `fieldMismatches` across all 5
files dropped from **13,463 to 5,958** (-55.7%); combined with
`itemsOnlyIn*`, total armor mismatches dropped from 13,991 to 6,685.
Per-field breakdown confirms the fix is real and targeted, not noise:
`defence` 1362→402, `fire_res` 1272→393, `water_res` 1294→399, `thunder_res`
1340→398, `dragon_res` 1084→344, `ice_res` 1301→401, `rarity` 700→208,
`rank` 371→109, `create_cost` 1320→391, `slots` 894→427 — every purely
stat-derived field dropped ~65-75%. `skills` dropped much less (1808→1501,
-17%) and `create_mats` actually rose slightly (717→985); see issue #2's
update below for why.

Confirmed with a hand-verified example (also now a regression test,
`test/armor-index-corrections.test.ts` + `emit-armor.test.ts`): raw
`head[12]`'s real bytes (defense 20, fire -6/water -5/thunder 2/dragon 2,
slots 1, price 2300) exactly match committed **"Vespoid Helm"** (name-table
index 11) — not "Vespoid Cap" (name-table index 12, what raw position would
naively suggest). Raw `head[11]`'s own bytes (defense 18) don't match
"Vespoid Cap" (defense 10) either, so it's correctly suppressed rather than
guessed.

**Update 2 (dedicated follow-up session — root-cause search + coverage
improvement):**

**No structural root cause was found.** Three concrete avenues were tried
against the real, unpacked JP EBOOT before falling back to improving the
fingerprint heuristic:

1. **Searched for a real in-binary index/permutation table.** No evidence
   of one was found near the `ArmorValue` arrays or the name-resolution
   path; `unkn1`/`unkn2`/`unkn3` were already ruled out in the prior
   session (see Update 1 above) and no other candidate field surfaced.
2. **Tested whether raw stat order and name order are simply sorted
   differently** (e.g. one by internal ID, the other by display/menu
   order). This is **partially true but not usably so**: computed every
   confidently fingerprint-matched `(rawIndex, nameIndex)` pair per slot,
   sorted by `rawIndex`, and checked how often `nameIndex` also increases
   for adjacent pairs — **97-99% of adjacent pairs increase** (191/193 for
   `head`, 226/230 for `waist`, etc.), i.e. the two lists are overwhelmingly
   the *same order* with only sparse local drift, not an independently-sorted
   or shuffled pair of lists. This looked like a strong lead — a classic
   "sequence alignment with local insertions/deletions" structure — but
   **directly interpolating** the name index for not-yet-matched raw
   entries using their position between two confirmed neighbors (either by
   linear offset across "same-length" gaps, or by forcing a 1:1 pairing in
   single-entry gaps) was tested and **failed validation** against
   committed data in the large majority of cases (e.g. only 14/134
   "same-length-gap" interpolated `head` entries actually matched committed
   stats; single-entry forced-position pairs matched close to 0% of the
   time). Conclusion: the *global* order is preserved, but *local* order
   within each small run between confirmed anchors is not simply positional
   — there's a local permutation (not a shift) at a finer grain than
   anchor-to-anchor interpolation can recover. This monotonicity property
   was still put to good use as a **safety filter** (see below), just not
   as a positive interpolation source.
3. **Re-examined per-entry raw fields as a possible join key** (`unkn1`,
   `unkn2`, `unkn3`, `maleId`, `femaleId`, `colorSeries`, `hunterType`)
   against the now-larger set of confidently-matched pairs: none showed
   any exact or near-exact correlation with `nameIndex` (checked exact
   match rate and most-common offset per field; all near 0%). This
   reconfirms Update 1's finding rather than finding a new candidate.
4. **Checked `tclamb/mhp2g-decomp`** (a real, in-progress, byte-matching
   MHP2G decompilation on GitHub, CC0) for a decompiled `equip_manager`/
   armor-table struct that might reveal the true internal ordering.
   `EquipManager` isn't decompiled yet (empty stub) as of this session, but
   the sibling `ItemManager`/`ItemDefinition` struct **is** decompiled and
   confirms the general pattern this pipeline already assumes: item structs
   are indexed directly by ID with **no embedded name pointer** — names
   live in a separate, identically-indexed table. This is consistent with
   armor working the same way *in the real game*; it implies the drift is
   most likely an artifact of the vendored `.enum` file's hand transcription
   order (see `src/strings/names.ts`'s doc comment — it's third-party,
   hand-transcribed, not disc-extracted) rather than a genuine dual-list
   design in the game itself. This doesn't yield a fix (we can't
   re-transcribe the vendor file), but it does rule out "the game engine
   itself uses two independently-ordered lists" as the explanation, and
   points at "the `.enum` author's transcription order doesn't match
   internal ID order" as the most likely real-world cause — worth
   revisiting if `EquipManager`/armor tables ever get decompiled upstream.

**Coverage improvement (shipped this session):** while investigating
avenue 2 above, a byproduct discovery drove a large, real coverage win.
Dropping `slots` from the required fingerprint (keeping defense + 4
resistances + rarity + halved price — still 7 independent, high-cardinality
fields) roughly **doubled** the number of unique fingerprint matches per
slot (e.g. `head` 194 -> 308 raw matches). Investigating *why* revealed a
clear, structured pattern: for a large number of male/female-paired armor
pieces (e.g. "Genprey Helm"/"Genprey Cap"), **raw `slots` is transposed
between the two variants relative to committed data** (`head[19]`
"Genprey Helm" reads raw `slots=0` while committed says `1`; its "Cap"
counterpart shows the opposite skew) while every other field — including
skill-adjacent high-cardinality fields — agrees exactly. Requiring an exact
`slots` match (the original fingerprint) silently rejected these as
"no match" and left them on unconfirmed, sometimes-wrong raw-position
naming. The revised generator (`scripts/generate-armor-corrections.ts`)
now matches in two tiers: (1) **`fingerprint-core`** — unique match on the
7-field core fingerprint alone (used regardless of whether `slots` agrees);
(2) **`fingerprint-slots-tiebreak`** — only when the core fingerprint alone
is ambiguous, narrow using an exact `slots` match too (recovers cases where
`slots` genuinely is the discriminating field). A **global monotonicity
cleanup pass** (longest-increasing-subsequence of `nameIndex` over raw-
sorted confirmed pairs — motivated directly by avenue 2's finding) then
drops any resolved pair that breaks the near-universal raw/name rank
correlation, catching coincidental fingerprint collisions (typically
all-zero-stat dummy entries) that the original per-slot uniqueness check
alone let through — several of the previous overlay's largest, most
implausible corrections (e.g. shifts of -187 to -248 or +193/+202) were
exactly this kind of false positive and are gone from the regenerated
table.

**New coverage** (fingerprint-confirmed / out of total raw entries): head
308/436 (71%), chest 307/420 (73%), arm 299/411 (73%), waist 297/409 (73%),
leg 285/420 (68%) — up from the prior 28-55%.

**New measured impact** (real JP `unpack`/`extract`/`diff`, holding all
other fixes constant): armor `fieldMismatches` across all 5 files dropped
from **5,958 to 4,441** (-25.5% further; **-67.0% from the original 13,463
baseline**). Per purely-stat-derived field, the improvement is stark:
`defence` 402→88, `dragon_res` 344→88, `fire_res` 393→94, `water_res`
399→99, `thunder_res` 398→89, `ice_res` 401→103, `rarity` 208→44, `rank`
109→30, `create_cost` 391→88 — all down ~75-80% *again* on top of the prior
fix's already-large drop. `itemsOnlyInExtracted`/`itemsOnlyInCommitted`
across the 5 armor files also both improved (174→104, 553→392) — more
entries are now correctly named instead of being silently suppressed.

**Verified zero regressions**: cross-checked every armor item's per-field
mismatch set before vs. after this change — **0 items** that were
previously fully correct (all fields matching) became mismatched. Every
newly-appearing mismatch belongs to an item that was previously entirely
unemitted (`itemsOnlyInCommitted`, i.e. suppressed under the old, stricter
overlay) and is now correctly named with correct core stats, just still
wrong on one of the fields this fix doesn't touch (see below).

**Known trade-off, not a regression:** `slots` (427→716), `skills`
(1501→1658), and `create_mats` (985→1344) field-mismatch counts went *up*.
This is the expected, verified-benign flip side of the coverage win above:
previously-suppressed entries are now correctly named (a strict
improvement — right item identified with right defense/resistances/rarity/
price), which *surfaces* pre-existing, separate bugs in those three fields
that were previously hidden by non-emission rather than fixed. `slots`
itself is the newly-discovered "transposed on male/female pairs" issue
described above (not fixed here — fixing the *value* would need reliably
identifying which raw entries are paired, which is a distinct problem from
naming them correctly, and is out of scope for the index-drift issue this
document tracks). `skills` is issue #2's already-documented gap (decode is
fine; entries needing this fix were exactly the ones previously suppressed
because the old fingerprint couldn't place them). `create_mats` mismatches
on newly-named entries reflect the equipment-recipe-matching pipeline
(`groupEquipCreateByEquipId`) applied to newly-visible items — not
investigated this session, out of scope, but worth a future look
specifically at recipe/name pairing.

**New leads for a future session:**
- The `slots`-transposition-on-gendered-pairs pattern is well-characterized
  (raw `1<->2` and `2<->3` swaps dominate, ~180-190 occurrences each just
  for `head`) and looks tractable: if male/female pairs can be reliably
  identified (candidates: adjacent post-correction name index with
  matching name minus "Helm"/"Cap" or similar suffix, or via `maleId`/
  `femaleId` cross-referencing), a targeted "detect + swap" fix is plausible
  as a follow-up, but is a distinct bug from index drift and was
  deliberately left out of scope here.
- ~27-32% of entries per slot remain unresolved (ambiguous core fingerprint
  even after the slots tiebreaker, mostly repeated/near-identical
  low-rarity starter pieces). A further pass restricting fingerprint
  matching to *local* candidate pools (only raw/name entries between two
  already-confirmed neighboring anchors, shrinking the collision space) was
  prototyped and found a small number of additional high-confidence matches
  (single digits per slot) with good validated accuracy where it did apply
  — a real but small further win, not pursued to completion this session
  given the much larger gain already banked; worth revisiting.
- `tclamb/mhp2g-decomp`'s `EquipManager`/`ItemManager` decompilation is
  active and incomplete — re-check it periodically; if armor-table-adjacent
  code ever gets decompiled, it could finally confirm (or refute) the "the
  `.enum` transcription order is simply wrong" hypothesis directly.

**Update 3 (`create_mats`/`create_cost` lookup-key fix):** Fixed the
`create_mats`-rose/`create_cost`-untouched trade-off flagged in Update 2
above. Root cause: `emit/armor.ts`'s `emitSlot()` resolved a piece's
*name* via the corrected `nameIndex` (this issue's overlay) but still
looked up its crafting recipe via the raw, uncorrected `armor.index` —
`createByEquipId.get(armor.index)` instead of `createByEquipId.get(nameIndex)`.
This was always wrong once `nameIndex !== armor.index`, since
`groupEquipCreateByEquipId` (`emit/common.ts`) keys strictly on
`EquipCreate.equipId`, which is documented and confirmed to be a
name-table-index-space key, not a raw-stat-array-position key. The fix is
a one-line change:

```diff
-    const [primaryRecipe] = createByEquipId.get(armor.index) ?? [];
+    const [primaryRecipe] = createByEquipId.get(nameIndex) ?? [];
```

**Measured impact** (real JP `unpack`/`extract`/`diff`, this fix only,
holding all other fixes constant, freshly re-run against the real ISO):
armor `create_mats` field mismatches dropped from **1,344 to 683**
(-49.2%); `create_cost` dropped from **88 to 77** (-12.5%). Every other
armor field (`defence`, `fire_res`/`water_res`/`thunder_res`/`dragon_res`/
`ice_res`, `rarity`, `rank`, `slots`, `skills`) was byte-for-byte unchanged,
as expected — this fix only touches the recipe lookup key. **Zero
regressions**: cross-checked every armor item's per-field mismatch set
before vs. after (restricted to items present, i.e. not only-in-one-side,
on both sides) — no field that previously matched became mismatched.
`itemsOnlyInExtracted`/`itemsOnlyInCommitted` were unaffected (104/392
both before and after), since this fix doesn't change which items are
emitted, only which recipe a given emitted item resolves. JP and EU armor
JSON output remain byte-identical after this fix (re-verified via a fresh
`unpack`/`extract` of both regions' real ISOs).

The residual 683 `create_mats` / 77 `create_cost` mismatches are a
separate, not-yet-investigated gap in `groupEquipCreateByEquipId`'s
recipe-matching itself (e.g. entries with no `EquipCreate` row at all for
their `equipId`, or genuine recipe-data disagreements) — out of scope for
this fix, which only addressed the wrong-lookup-key bug.

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

**Update (executed against real EBOOT bytes, after #1's fix landed):**
**Confirmed: this is #1's drift, not a separate bug** — for the exact
"Leather Armor"/`head[1]` case this issue was originally reported against,
#1's fingerprint correction found **no match** (ambiguous: too many
low-rarity starter helms share an identical `(defense, resistances, rarity,
slots, price)` fingerprint to disambiguate on stats alone), so `head[1]`
still falls back to unconfirmed raw-position naming post-fix, and its raw
skill bytes (`Gathering:3, Throw:2, Backpackng:2, Alchemy:2`) still don't
match committed "Leather Helm" (`Throw:2, Backpackng:1, Gathering:2,
ShotMix:2, Cooking:-2`) — despite `Throw:2` agreeing exactly, which rules
out a byte-offset/decode bug in the skill reader itself (a real decode bug
would corrupt every field, not leave one of five skill pairs exactly
correct). This is consistent with "wrong armor piece due to unresolved
index drift," not "skills field decoded wrong." Broader evidence: across
all 5 slots, `skills` mismatches dropped only 17% (1808→1501) post-#1-fix
versus ~65-75% for every purely-numeric stat field — skills weren't
included in the fingerprint (deliberately, per the investigation notes
below), so entries #1 couldn't disambiguate are exactly the entries still
showing wrong skills. **No separate skills-decode bug found or fixed**;
the residual is #1's known, documented coverage gap (see #1's update).
Including skills in the fingerprint was tried during the investigation but
made matching *worse*, not better (skill-ID resolution itself has enough
independent noise that it hurt rather than helped disambiguation) — not
pursued further given #1's fingerprint already achieves meaningful coverage
without it.

**Update 2 (after #1's coverage-improvement follow-up session):** consistent
with the above, `skills` mismatches went *up* slightly (1501→1658) when #1's
fingerprint coverage was later improved from ~28-55% to ~68-73% per slot —
this is the expected, verified-benign flip side of that fix, not a
regression: entries that used to be silently suppressed (no name emitted at
all, so no `skills` mismatch was even measurable) are now correctly named,
which surfaces this issue's already-known, already-documented skills gap on
exactly the entries #1 newly resolved. See issue #1's "Update 2" for the
full before/after breakdown and regression check (0 previously-fully-correct
items were affected). Still **no separate skills-decode bug found**; the
residual remains #1's coverage gap, just measured against a larger,
more-correctly-named denominator now.

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

**Update (executed against real EBOOT bytes + the real diff):** The cheap
triage step **overturns this issue's own "Low confidence" framing** — this
is very likely a real, systematic extraction bug, not stale committed data.
Of the 113 real (non-formatting) affinity disagreements, **108 (96%) have a
delta (`committed - extracted`) of exactly `+5` or `+10`** (37 at `+5`, 73 at
`+10`), with only 3 outliers (`Heartshot Bow III` at `-10` — matching the
original plan's own flagged suspicious case, `Bone Axe` at `-5`, `Blango
Destroyer G` at `+15`). A clean, bimodal "always exactly +5 or +10, never
+3 or +7 or +12" distribution across 108 independent weapons is not
consistent with wiki transcription noise (which would be scattered/random)
— it strongly implies extraction is systematically missing a real,
discrete affinity-modifying mechanic on a subset of weapons (roughly a
quarter of all blademaster weapons).

**What was ruled out:** tested every other unmapped/candidate field on
`BlademasterWeapon` for a single-field correlation with the delta (or
delta/5): `unkn1` (always 0 for every mismatched weapon — not it),
`unkn2` (0 or occasionally 2/7, but not consistently 1 for delta=5 and 2
for delta=10 — e.g. `Black Katana Mk.III` has `unkn2=0` but `delta=10`
while `Limb Cutter` has `unkn2=2` but `delta=5`), `unkn3`/`noteGlType`/
`sortOrder` (no pattern), `rarity`/`eleType`/`statusType`/`sharpnessId`/
`attack`/`slots` (no clean threshold or correlation), and upgrade-tree
depth via `invertUpgradeTree` (no correlation — same depth appears at both
delta=5 and delta=10). Anecdotally "G"-suffixed (upgraded) weapon variants
skew toward `delta=10` and their base variants toward `delta=5` (e.g.
`Limb Cutter`→5, `Limb Cutter G`→10; `Siegmund`→5, `Siegmund G`→10), which
hints this may correlate with something in the *upgrade relationship*
itself (a per-tier bonus not captured by simple graph depth) or a lookup
this pipeline doesn't have a table for at all — but this was not confirmed
before running out of time-boxed budget for this sub-investigation.

**Status: investigated, not fixed.** No code change made (a wrong guess at
the mechanism would be worse than the current honest gap). This is the
single most promising unexplored lead in this document for a future
session — unlike `bonus` (#5, no candidate field even close) or armor
index drift (#1, structurally different two-list problem), this looks like
a bounded, likely-discoverable single mechanic given the extremely clean
+5/+10 signal. No `diff`-level change was expected or observed
(`fieldMismatches` for `affinity` unchanged at 188 before/after this
session's other fixes, since none of them touch weapon stat decoding).

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
