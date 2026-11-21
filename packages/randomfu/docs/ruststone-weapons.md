# Ruststone weapons: a design storyboard

A design storyboard, with an MVP now built as `relics.*` (see "MVP and
later" and the README's Relic weapons section). It describes **relic weapons**: rare
"relic stones" that drop from quests and carves, which the smithy polishes
into a brand-new weapon with a rolled look and rolled stats. No existing
weapon is ever replaced. Each relic is a new weapon ID.

There are two framings. One is inside the randomizer, as part of a seeded
run. The other is a standalone mod you can play on a vanilla save. Both use
the same machinery, and most of this note covers both.

Feasibility tags, against what has been built or probed so far:

- **[known]**: built, or probed in PPSSPP, or something the game already
  does.
- **[probably]**: the same technique as something already built, but
  untested for this use.
- **[research]**: an open question that needs reading the game or a probe
  first.

## Decided

The first draft asked six questions of taste. The answers shape this
version:

| Question          | Answer                                                      | Where it lands                                                   |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Power ceiling     | Relics go past the rank's best monster weapons, by a margin | [Past the best](#past-the-best-and-why-the-smithy-still-matters) |
| Choice or gamble  | Pick one of three at the polish                             | [The smithy flow](#the-smithy-flow)                              |
| Who picks a class | The stone rolls it                                          | [The stone's shape](#the-stones-shape)                           |
| Quirks            | Real downsides, each paired with a major upside             | [Quirks](#quirks-a-real-cost-for-a-major-gain)                   |
| Presets           | Relics in Full and Chaos                                    | [Presets and Guild Cards](#presets-and-guild-cards)              |
| Standalone rolls  | From the clock; seeded inside randomizer runs, as before    | [Rolls: a seed for every stone](#rolls-a-seed-for-every-stone)   |

## The pitch, in six frames

1. **The drop.** A Kut-Ku hunt ends and the reward screen shows a
   _Worn Relic Stone_ among the scales. It's rare enough to notice and
   common enough to expect a few each rank.
2. **The smith reads the stone.** At the smithy's Create list, the stone
   has already taken a shape: one entry, _Unpolished Relic Lance_. The
   stone chose the class, so a Hammer main sometimes polishes a Bow.
3. **The polish.** On the Upgrade screen, the Unpolished Relic branches
   into **three rolled candidates**. Each one shows its own name, attack,
   element, affinity, sharpness and slots, and one of them may carry a
   quirk: a real cost for a big gain. You take one, or walk away and decide
   later.
4. **The reveal.** The next time you leave the house, the weapon has a
   look stitched for it alone. It stays yours and doesn't change.
5. **The bond.** Every hunt with it equipped counts. At 10 hunts it can be
   **tempered**: one of its Upgrade targets becomes "itself, one notch
   better".
6. **The climb.** At high and G rank, a higher-rank stone **ascends** it:
   new stats for the new rank, with its look and character kept. The
   best relics hit 15-20% harder than anything the smithy sells at that
   rank. The chase at the end is an **Heirloom**: a named relic with a
   quirk that changes how you hunt.

The design rests on four pillars, each taken from the precedents below:

- **A decision at every step**: which of three, quirk or clean, ascend a
  favourite or polish a new stone, temper or reforge, keep or salvage.
- **Attachment**: the look is yours alone, the weapon grows with use, and
  it can follow you up the ranks.
- **A chase**: rarity tiers, relics past the best monster weapons, perfect
  rolls and Heirlooms.
- **No dead time**: stat floors, pity, guarantees and salvage.

## What the precedents teach

From memory of how these games play, not from new research. Each row says
what made the mechanic fun, what made it tedious, and what this design
takes from it.

| Source                                 | Fun                                                                                      | Tedious                                                                                                   | Take                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| MHFU ruststones                        | A mystery item; the polish is a small slot-machine moment                                | Fixed 5 / 25 / 70% odds, no choice, and the 70% outcome dominates                                         | Keep the mystery (the stone picks the class) and the polish moment, but make the polish a choice       |
| MH4U relic weapons (closest precedent) | Any hunt might drop a god roll; old looks come back; it adds endgame variety             | Random on random (rarity, then stats, then sharpness); leveling Guild Quests to 140; most drops are trash | Budgeted rolls with no trash; drop quality follows the quest, not a level grind                        |
| Rise: Qurious crafting, Anomalies      | Weapon augments are a readable **budget**: attack vs affinity vs element vs slots        | Armor rerolls: random skill losses and heavy material sinks; investigations as checklists                 | A point budget the player can read, plus investigations (the Unknown Monster quests) as a stone source |
| World: Kjárki and Safi'jiiva           | Siege events made loot exciting; awakened abilities let you build a weapon               | Random element and ability rolls when you needed one specific; long farms for one bit of a roll           | Soften the class roll (no long streaks, an optional lean), and curate the three candidates             |
| Frontier: G-rank and HC weapons        | A weapon that levels with you builds attachment; HC weapons out-class the rest           | Huge material walls for each level                                                                        | Growth by **use** (hunts), not by material walls; relics that out-class, by a bounded margin           |
| Hades                                  | Choose 1 of 3 boons; rarity tiers; keepsakes level with use; scarce rerolls              | Little; rerolls are rare by design                                                                        | 1 of 3 at the smithy, tempering with use, rerolls as a scarce resource                                 |
| Slay the Spire                         | Card rewards of three with a valid skip; the rare chance climbs after commons (pity)     | Little                                                                                                    | Skipping is free; a pity counter on rarity                                                             |
| Dead Cells                             | Quality tiers plus affixes; cursed chests trade risk for reward                          | Affix noise on low tiers                                                                                  | Few, legible affixes; quirks as opt-in risk                                                            |
| Risk of Rain (lunar items)             | A big upside with a real downside makes builds                                           | Some downsides just make an item unusable                                                                 | Quirks pair a cost you feel with a gain bigger than a tier                                             |
| Diablo / Path of Exile                 | The item **base** limits the affix pool; crafting currency; locking a mod                | PoE crafting is opaque; Diablo 4 masterworking has diminishing tries                                      | The frame (class) limits affixes; a reforge locks the look and archetype                               |
| Balatro                                | Editions (foil, holo, polychrome) are a second rarity layer; rerolls cost more each time | Little                                                                                                    | Look rarity (glow, cross-class parts) on top of stat rarity; reforge cost climbs                       |

The common lesson: random rolls are fun when the player has **agency
over the outcome** (choice, budget, lock) and every roll is **usable**.
They are tedious when RNG stacks on RNG behind a grind. The stone rolling
the class is one more layer of RNG, so the layers after it (the triple,
the budget, the floors) carry the agency.

## The technical ground

What exists now (see `weapon-table-expansion.md` on the
`monster-motion-banks-8a81f6` worktree, `src/forge/relics.ts`,
`docs/code-loader.md`):

- **New weapon IDs** **[known]**: a second `PT_LOAD` with copies of the six
  per-ID tables, and 64 `lui` sites repointed at build time. A probe with
  melee ID 1150 sold, showed in the box, built, went on a quest and survived
  a save in PPSSPP. The room is 351 melee IDs (1150-1500, under the
  ruststone threshold of 1501) and 1,147 ranged. The upgrade screen and a
  real PSP are untested.
- **Names for new IDs** **[known]**: message tables 3 and 5, rebuilt to
  store each string once, have room for hundreds of names at the same
  file size (EU; JP's file is unchecked).
- **A look from a seed** **[known]**: the stitcher's relic mode
  (`mods.weaponRelics`) rolls a look from a seed and keeps it across saves
  (PPSSPP, EU).
- **Blob code in game** **[known]**: the code loader runs C at save load
  (`rf_init`), in quests (per frame, the HUD, the pad, the quest loader,
  after the reward roll) and at the weapon build (hook 6).
- **Save room** **[known]**: `RF_SAVE_DATA` is 4,216 bytes (one freed
  Guild Card slot), of which a header and Poogie use 13. The code loader
  frees 93 slots, so more room is one `allocateSlots` call away.
- **Branching upgrades** **[known]**: each weapon's upgrade entry lists
  up to 5 targets (`EquipUpgradeEntry.upgradeTargets`).
- **Health and stamina caps** **[known]**: the Hunter's Pact already caps
  health at 50 (Frail) and stamina at half (Weary) for a quest. Two quirks
  below reuse them.

### The key choice: how a relic holds per-instance stats

A weapon's stats come from its table entry, by ID, and box slots hold
only an ID and a 16-bit spare. There are two ways to give each relic its
own stats.

- **A. A pre-rolled pool.** At randomize time, roll N relic weapons into
  new IDs, each with fixed stats and a seed for its look. The polish draws
  one from the pool. It's simple, needs no in-game stat code, and the
  spoiler log can list every relic. But the rolls are fixed per disc, so
  it's a deck, not a roll, and it can't draw from the clock, which the
  standalone mod now needs. **[known]** to build, all offline.
- **B. Instance IDs (recommended).** Reserve a block of new IDs as
  **instance handles**. A relic's rolled values (a compact record, below)
  live in `RF_SAVE_DATA`, and at every save load `rf_init` writes each
  live relic's full table entry (stats, upgrade entry, description index)
  into the extension tables in RAM. The game then reads them like any
  weapon, so the box, the equip screen, the upgrade preview and the
  damage all see the rolled stats with no further hooks. **[probably]**:
  the extension tables are plain RAM and the blob already writes game
  RAM, but no blob has written weapon tables yet.

With B, a relic in the save is 12 bytes (92 of 96 bits used):

| Field         | Bits | Notes                                                                              |
| ------------- | ---- | ---------------------------------------------------------------------------------- |
| instance ID   | 10   | which handle it occupies                                                           |
| class, frame  | 4+8  | weapon class (from the stone), and which of the class's models is the frame        |
| look seed     | 16   | the stitcher's seed                                                                |
| grade, tier   | 2+2  | rank (low, high, G) and quality (Worn, Fine, Masterwork, Heirloom)                 |
| archetype     | 3    | Brute, Edge, Elemental, Jeweled, Balanced, Trait                                   |
| notches       | 6×4  | attack, affinity, element/status, sharpness, slots, class trait: 0-12 each (below) |
| element kind  | 4    | none, fire, water, thunder, dragon, ice, poison, paralysis, sleep                  |
| quirk         | 5    | 0 for none                                                                         |
| hunts, temper | 8+3  | hunts since the last temper; tempers done                                          |
| reforges      | 3    | climbs the reforge cost                                                            |

The record stores **rolled notches, not just a seed**, so a later blob
can't change an old relic's stats. The table entry is derived from the
notches and the disc's own stat bands (below), so a relic stays
consistent with its disc.

Each stone held also has a 20-bit entry (its class and its seed) in a
queue per rank, up to 16 a rank (below). With 128 relics that's about
1.7 KB in all, beside Poogie, the Pact and the rest.

ID budget (melee, 351 IDs): 11 Unpolished Relics × 3 ranks = 33 fixed IDs
(24 melee, 9 ranged), then 4 IDs per live relic (the relic and its three
Upgrade candidates). That's about 80 melee relics and more than 250
ranged. A cap of **64 melee and 64 ranged relics** leaves room to spare.
At the cap, the smithy can't polish (the stone stays) and the description
says so.

## The shared core

### Stones and where they drop

There are three stones, one per rank: **Worn**, **Weathered** and
**Ancient Relic Stone**. Each is an item (not equipment), so a stone in
the box is harmless on any disc.

- **Item IDs** **[probably]** on EU: there are 9 unused "dummy" items (91,
  92, 465, 518, 519, 929-932). **[research]** on FUC, where those IDs are
  real collab items: it needs the item table expanded, about twice the
  work of the weapon tables (134 sites), or vanilla items reused.
- **Placement** **[known]**: randomfu already writes quest reward tables,
  carves, break and capture rewards. A stone is one more item in them.

Sources, by how they feel:

| Source                        | Feel                                       | Rate (starting point)                          |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Quest main reward             | The common source, mostly from hunts       | 3-6% of a hunt's draws at the rank's top stars |
| Carves (large monsters)       | A thrill on the carve                      | 1-2%, body only                                |
| Breaks and captures           | Rewards good play                          | 3-4%                                           |
| First clear of each key quest | **Guaranteed**, so a rank never starts dry | 1 stone, once                                  |
| Elite monsters (`elites`)     | The roguelike "elite room"                 | +1 draw that is a stone half the time          |
| Hunter's Pact (weight 3)      | Pay with pain                              | a stone in the weight-3 reward pool            |
| Unknown Monster quests        | Rise's anomaly investigations              | Guaranteed stone, a quality tier up            |

### The stone's shape

The stone decides the class. Three item IDs can't carry 11 classes (EU
has 9 free items, and 33 would be needed), so the class lives in the save,
not in the item.

- **When it's rolled.** As the stone enters your box, at the reward hook
  **[probably]**, the blob gives it a seed (see
  [Rolls](#rolls-a-seed-for-every-stone)) and a class drawn from that
  seed, and appends both to the rank's stone queue in `RF_SAVE_DATA`.
  Everything that stone later becomes, its class and its three
  candidates, follows from that one seed.
- **How it's drawn.** `relics.classes`:
  - `any` (default): each of the 11 classes alike, but never the same
    class three stones in a row.
  - `lean`: one stone in three takes the class you had equipped when it
    dropped (the reward hook can read the equipped weapon **[probably]**),
    the rest are `any`. For players who want the surprise without going a
    rank without their main.
- **How it's shown.** The reveal is at the smithy, as the smith reading the
  stone, not on the reward screen (the stone's name there is shared by
  every stone of its rank):
  - The Create list has one relic entry per rank, already named for the
    class at the head of the queue: _Unpolished Relic Lance_. The blob
    points that entry at the class's Unpolished Relic **[probably]**: the
    create table is plain RAM once moved, but whether one create entry can
    switch between a melee and a ranged weapon is **[research]** (the
    fallback is two entries a rank, one blademaster and one gunner, with
    the one that doesn't match hidden).
  - The stone's own description says the next shape too ("It's shaped like
    a lance haft"), rewritten by the blob **[probably]**, so you can check
    from the item box.
- **Holding several stones.** They come out in the order they dropped. Make
  the first into an Unpolished Relic (cheap, and it waits in the box), and
  the next stone's shape shows. Selling or using stones outside the smithy
  trims the queue at the next load; the queue holds 16 a rank, and stones
  past that get their class when they move up.
- **A shape you don't want.** Make it anyway and keep it: Unpolished
  Relics cost a box slot, not a stone of your class. Or polish it and
  salvage the result for Relic Dust, which feeds reforges of the relics you
  do use.

### The smithy flow

```
Relic Stone (item)                         the class is rolled at the drop
  └─ Create ▸ Unpolished Relic <class>     (one entry per rank: the next stone's class)
       └─ Upgrade ▸ [Candidate A] [Candidate B] [Candidate C]   (1 of 3, with stats shown)
            └─ Relic weapon
                 ├─ Upgrade ▸ [Tempered: itself +1]   (after 10 hunts)
                 ├─ Upgrade ▸ [Reforge A] [Reforge B]  (look kept; costs climb)
                 └─ Upgrade ▸ [Ascend]                  (next rank's stone; new grade)
```

- **Create** **[probably]**: the create table's weapon section has no room,
  so it moves (10 references). The 33 Unpolished Relics are ordinary new
  IDs with modest stats and a stock model of their class, so you can hunt
  with one.
- **The polish is the Upgrade screen** **[research]**. An upgrade entry
  lists up to 5 targets, so the Unpolished Relic's entry lists three
  instance IDs whose entries the blob filled with rolled candidates. Taking
  one is a vanilla upgrade: the slot's ID becomes the candidate's. At the
  next hook (save, load or build), the blob marks it live and frees the
  other two. To check in PPSSPP: whether the screen shows each target's
  stats, which hook sees the upgrade soonest, and whether a target ID the
  blob rewrites while the screen is open confuses it.
- **Same three every time**: the candidates come from the stone's seed,
  so leaving and re-entering the screen, or reloading the save, shows the
  same three, in both seeded and clock modes. **[known]**: the blob's RNG
  is seedable.
- **The look appears on the next build.** The smithy doesn't rebuild the
  model, so a new look shows after the next stage load (seen with
  relics). The menu previews show the frame's stock look.

The old ruststone route (polish rows of 5 / 25 / 70%) is the fallback if
the Upgrade screen can't host candidates: one roll, no choice, and it
still needs a hook to allocate the instance **[probably]**. It would lose
the answer to "choice or gamble", so it's a fallback only.

### What gets rolled

A relic is a **frame**, an **archetype** and a **budget**:

- **Frame**: the class (from the stone) and one of the class's models as
  the skeleton. The frame decides which class traits and quirks can roll,
  as an item base does in Diablo or Path of Exile.
- **Archetype**: a weighted bias on where the budget goes, so rolls read
  as builds, not noise. It also gives the relic its name.
- **Budget**: points by quality tier, spent in notches. Every stat starts
  at the rank's floor for the class, so no roll is useless.

**The notch scale.** "The rank's band" means what the disc's own weapons
of that class have at that rank, as `RarityBounds` reads it. Notch 0 is
about the band's 25th percentile, and **notch 6 is the band's top: the
rank's best monster weapon** on that axis. Notches 7-9 go **past** it.
Notches 1-6 cost 1 point each, and the overdrive notches 7-9 cost 2 each,
so going past the best takes a real share of a budget.

| Axis           | Notches 1-6 (to the best)                                    | Overdrive 7-9 (past it)         | Feasibility                               |
| -------------- | ------------------------------------------------------------ | ------------------------------- | ----------------------------------------- |
| Attack         | 1/6 of the way from the floor to the band's top              | +5% of the top each: up to +15% | [known] record field                      |
| Affinity       | +5% a notch from the archetype's start (−20%, 0% or +10%)    | +5% each                        | [known]                                   |
| Element/status | from the band's p25 to its top; gaining one costs 2          | +8% of the top each: up to +24% | [known]                                   |
| Sharpness      | a longer bar, then the best curve the class has at this rank | none                            | [known] curves; [research] new curves     |
| Slots          | 2 points a slot, at most 3                                   | none                            | [known]                                   |
| Class trait    | shelling type and level, horn notes, bow charges, reload     | none                            | [probably] fields; [research] bowgun ammo |
| Defense bonus  | small filler, so leftover points never vanish                | none                            | [known]                                   |
| Look           | seed, plus mode by tier (class, any, wild) and glow          |                                 | [known] seed; [probably] mode per relic   |
| Quirk          | one pair (below)                                             |                                 | per quirk                                 |
| Armor skills   | MHFU tallies skills from armor and decorations only          |                                 | [research]                                |

Tempering adds one notch past these caps, to notch 10 (+20% attack) at
most. With `relics.power` at `wild`, the caps are 12 (+30%).

**Tiers and budgets**, retuned for the new ceiling:

| Tier       | Budget | What it buys, typically                                     | Quirk  | Look                        | Share of candidates |
| ---------- | ------ | ----------------------------------------------------------- | ------ | --------------------------- | ------------------- |
| Worn       | 9      | the rank's best on one axis, the floor elsewhere            | none   | within its class            | 60%                 |
| Fine       | 12     | one axis just past the best (+5%), a second near its top    | none   | within class, borrowed trim | 28%                 |
| Masterwork | 16     | one axis +15%, or two at the rank's best                    | 1 in 3 | cross-class head, trim      | 10%                 |
| Heirloom   | 20     | +15% on its main axis **and** the best sharpness or element | always | "wild", always a glow       | 2% (pity raises it) |

For example, a Masterwork Brute Great Sword spends 12 points to take
attack to notch 9 (+15% over the rank's best Great Sword) and has 4 left
for affinity (−20% to 0%) or a slot. A Masterwork Edge spends 6 on
sharpness (the best curve), 8 on attack (notch 7, +5%) and 2 on affinity.

Archetypes (weights per tier; the name word comes from the archetype):

| Archetype | Leans to                          | Example name                |
| --------- | --------------------------------- | --------------------------- |
| Brute     | attack, negative affinity         | _Heavy Wyrmbone Cleaver_    |
| Edge      | sharpness, affinity               | _Keen Silverfang Blade_     |
| Elemental | element or status, sharpness      | _Emberwake Glaive_          |
| Jeweled   | slots, defense bonus              | _Studded Relic Lance_       |
| Balanced  | spread evenly                     | _Old Hunter's Hammer_       |
| Trait     | class trait (shells, notes, ammo) | _Thundering Siege Gunlance_ |

**Curated triples, not three independent rolls** (Slay the Spire,
Hades). The three candidates all take the stone's class, and are drawn so
they differ: at most one candidate per archetype, at least one raw (no
element) and one with an element or status when the class allows it, and
**at most one with a quirk**, so a clean option is always there. Their
tiers are drawn separately, so a triple can hold a Fine next to two Worns.
Skipping costs nothing: the Unpolished Relic waits.

### Past the best, and why the smithy still matters

Relics are the strongest weapons a rank has. The margin is clear but
bounded, so it's a chase and not a replacement:

| What you're holding                       | Main axis, against the rank's best monster weapon |
| ----------------------------------------- | ------------------------------------------------- |
| The smithy's weapons through the rank     | 70-100%                                           |
| A Worn relic                              | up to 100%, on one axis                           |
| A Fine relic                              | up to 105%                                        |
| A Masterwork                              | up to 115%                                        |
| An Heirloom                               | 115%, with a second axis at the best              |
| Tempered three times                      | up to 120%                                        |
| With a quirk's upside (Brittle, Glass, …) | another 15-40% on one axis, for its cost          |

Why the rest of the smithy keeps its place:

- **The stone picks the class.** A stone of your main class comes about
  one time in 11 (one in 4 with `lean`). Until it does, and in every class
  you haven't drawn, the smithy is the only sure weapon.
- **The margin is on one or two axes.** Sharpness and slots can't go past
  the best, and a relic's element is its own, not the one this monster
  hates. A monster weapon with the right element or white sharpness still
  wins its matchup against an off-element relic.
- **Timing.** Stones come mostly from a rank's upper stars, and about one
  polish in three offers a Masterwork or better. For most of a rank you
  hunt with smithy weapons, and relics are the payoff at its end.
- **Ascending costs a stone.** Lifting a favourite to the next rank uses
  that rank's stone, the same one that could polish something new. A fresh
  rank's monster weapons carry you until you have one.
- **Armor is untouched.** Tempers and reforges spend the rank's monster
  materials, so hunting for the smithy and hunting for relics are the same
  hunts.
- **The biggest gains come with a cost.** The quirked relics are the
  strongest, and a clean monster weapon is the safe pick against them.

Margins to check against the discs' bands **[research]**: whether the
best high rank relic (+15-20%) outclasses early G rank weapons by too much,
and whether +15% on a Great Sword reads the same as on a Dual Blades. Both
are numbers, not structure, and `relics.power` exists to turn them.

### Quirks: a real cost for a major gain

Each quirk pairs a downside you feel every hunt with an upside bigger than
a whole tier's worth of budget (4 points or more), or one no budget can
buy. Quirks appear on one Masterwork in 3 and on every Heirloom (whose
named quirks are the strongest), never more than one in a triple, and the
candidate shows both halves before you take it.

| Quirk          | Major upside                                                     | Real downside                                               | Classes          | Needs                                                   |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| Glass          | +40% affinity, past any weapon                                   | health capped at 50                                         | all              | affinity field, the Pact's Frail cap: **[known]** parts |
| Hungry         | +3 overdrive notches on attack (+15% more)                       | stamina capped at half                                      | all              | the Pact's Weary cap: **[known]** parts                 |
| Momentum       | +5% attack per quest cleared in a row with it, up to +30%        | starts at −15%; a faint or a failed quest resets the streak | all              | reward hook, rewrite at quest load **[probably]**       |
| Fickle         | affinity rolled each quest from −30% to +80% (+25% on average)   | some quests you're stuck at −30%; the box shows "?"         | all              | rewrite at quest load **[probably]**                    |
| Wyvern-touched | its element is always the target's weakness, at notch 9          | attack fixed at the rank's floor                            | blademaster, bow | quest loader knows the monster **[probably]**           |
| Covetous       | stones drop twice as often; each quest pays one more reward draw | attack at the floor and no element                          | all              | reward hook **[probably]**                              |
| Echoing        | Pact rewards one weight higher                                   | the Pact window always holds one penalty you must take      | all, with `pact` | Pact code **[probably]**                                |
| Brittle        | +4 overdrive notches on attack (+20% more)                       | sharpness falls twice as fast                               | blademaster      | the sharpness decrement **[research]**                  |
| Bloodthirsty   | each hit heals 1 health                                          | health items heal half; red health never comes back         | all              | a hit hook, item heals **[research]**                   |

The first three tags decide the order: Glass and Hungry are built from
parts that exist, the quest-load rewrites come next, and the hit hooks
last.

### How it reads in game

- **Names** **[probably]**: generated from short word lists
  (tier adjective, archetype or element word, frame noun), written by the
  blob into a fixed-width name slot for each instance ID in the loaded
  message file. The rebuilt tables can reserve the slots. Heirlooms have
  fixed names. Only the loaded language's file is in RAM, so the word
  lists need one set per language (5 on EU), or names in English
  everywhere.
- **Rarity colour** **[known]**: the record's rarity byte colours the icon
  as for any weapon. Since relics now pass the rank's best, the top tiers
  show one rarity above it: low rank 2 / 3 / 4 / 5, high 5 / 6 / 7 / 8,
  G 8 / 9 / 10 / 10. G rank Heirlooms share the top colour, so their name
  carries a mark. A ★ in a name is 3 bytes, and whether it renders there
  is **[research]**.
- **Description** **[probably]**: per instance, via the description index:
  tier and archetype, the quirk's two halves, and "Hunts 7/10 to temper".
- **The box** **[known]**: a relic sorts beside its frame's source weapon
  (its class and sort byte), so relics mix in with the class. A distinct
  sort byte could group them at the end **[research]**.

### Growth: temper, reforge, ascend

- **Temper** (Hades keepsakes, Frontier's weapon levels, by use rather
  than by material). The reward hook counts each completed quest with the
  relic equipped **[probably]**. At 10 / 15 / 20 hunts, the relic's
  Upgrade list gains "itself +1 notch" (the player chooses which axis by
  choosing among up to 3 tempered targets). A temper can take an axis one
  notch past its cap, to notch 10. Costs a few of the rank's common
  monster materials. At most 3 tempers a grade.
- **Reforge** (Balatro's rerolls, Path of Exile's locks). Two Upgrade
  targets that keep the frame, the look and the archetype and roll the
  rest again, quirk included. Cost: zenny and Relic Dust, doubling with
  each reforge. Tempers carry over.
- **Ascend** (the fix for MH4U's dead early relics). A higher-rank stone
  lifts a relic to the next grade: the notches are kept, the bands become
  the new rank's, and the tier can rise by one. The stone's own class is
  ignored, so ascending is also how you keep a favourite when the stones
  keep rolling other classes. A favourite carries from low rank to G rank.
- **Salvage**: selling a relic at the smithy gives Relic Dust (an item;
  one of the free IDs) and frees its instance. **[research]**: whether the
  blob can see a sale (it can at least notice a missing ID at the next
  load and free it then).

### Rolls: a seed for every stone

Every stone gets a 16-bit seed as it drops, and everything it becomes
follows from it: its class, its three candidates, their looks. The modes
differ only in where that seed comes from:

- **Seeded** (randomizer runs, the default there): from the run seed, the
  rank and how many stones of that rank have dropped. The Nth stone of a
  rank is the same for everyone on a seed: same class, same three.
- **Clock** (the standalone default, `wild` inside randomfu): from the
  clock at the moment the stone drops. The PSP's tick counter
  (`sceRtcGetCurrentTick`, if the EBOOT imports it) is **[research]**;
  the game's own RNG state at the reward roll, mixed with the frame count,
  is the **[probably]** fallback.

Because the seed is taken at the drop and kept in the save, the clock
never decides at the menu. Reopening the smithy or reloading shows the same
shape and the same three; to get a different stone you'd quit the quest
unsaved and play it again, which is what scumming vanilla rewards already
costs.

### Balance and anti-tedium

- **Floors, not dice.** Every axis starts at the rank's floor and every
  point lands somewhere, so a Worn relic matches the rank's best on its
  main axis and is never trash.
- **A bounded ceiling.** Past the best by 5-20%, on one or two axes, with
  the overdrive notches costing double. Quirks are the way further, at a
  price.
- **Pity** (Slay the Spire's rare offset): each polish without a
  Masterwork or better adds 2% to that chance; one resets it. One counter
  a rank, in `RF_SAVE_DATA`.
- **Guarantees**: the first stone of each rank comes from a fixed early
  quest; the first polish of each rank has a Fine or better among its
  three; an Unknown Monster quest's stone is a tier up.
- **Class streaks**: never the same class three stones running; `lean`
  for those who want their main more often; ascend to keep a favourite.
- **No dead elements**: a candidate's element is never one that the
  current rank's monsters resist most, read from the disc's weakness
  tables (they follow `weaknesses.elements`) **[probably]**.
- **No menu scumming**: every roll comes from the stone's seed, kept from
  the drop.
- **Bounded grind**: stones are a bonus on hunts you do anyway, not a
  quest of their own. Tempering counts hunts you already play.

## Framing 1: inside randomfu

A relic run is a randomized run where your weapon story is your own:
the smithy still has its (shuffled) weapons, but the strongest weapons
come from stones.

### Settings

All under one group, as `elites` and `pact` are.

| Setting           | Default      | What it does                                                                                                       |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `relics.enabled`  | off          | Relic stones, Unpolished Relics and the polish, temper, reforge and ascend loop                                    |
| `relics.rolls`    | `seeded`     | `seeded`: the Nth stone of a rank is the same for everyone on this seed. `wild`: from the clock at the drop        |
| `relics.classes`  | `any`        | `any`: the stone picks any class, never three alike in a row. `lean`: one stone in three takes your equipped class |
| `relics.dropRate` | `normal`     | `rare`, `normal`, `generous` (×0.5, ×1, ×2)                                                                        |
| `relics.power`    | `strong`     | `fair` (the rank's best, notch 6), `strong` (past it, notch 9: +15%), `wild` (notch 12: +30%)                      |
| `relics.quirks`   | on           | Masterworks and Heirlooms can roll quirks                                                                          |
| `relics.economy`  | `supplement` | `supplement`: the smithy as usual. `relics-only`: the smithy makes only starters, and progress is relics           |
| `relics.looks`    | `tiered`     | `tiered` (mode by tier), `class`, `wild`                                                                           |

- **Seeds** **[known]**: `seeded` derives each stone's seed from the run
  seed plus a stone counter per rank (`RF_SAVE_DATA`), so two racers on the
  same seed get the same class and candidates from their Nth stone. It's
  fair and shareable ("seed 4421's third high rank stone is a Heirloom
  Lance"). With `lean`, the stone's class depends on what you had
  equipped, so racers who play the same classes still match.
- **Spoiler log**: the first few stones of each rank (class and triple)
  and every Heirloom's stone index, under a spoiler heading. **[known]**
  for `seeded`, since it's the same computation offline. With `lean` it
  can list only the `any` stones.
- **Bands from the run's own disc** **[known]**: bands read the tables as
  the shuffles left them (`weapons.attack`, `sharpness`, `elementKind`), so
  relics fit a randomized disc, as `RarityBounds` does for weapon stats.
  "Past the best" means past that disc's best.
- **Interactions**: stones join `questRewards` and `monsterRewards` after
  they shuffle, as additions, so they're not shuffled away; `recipes`
  randomizes the temper and reforge materials; `elites`, `pact` and
  `quests.unknown` become stone sources; `poogie` luck nudges the tier
  roll; the Echoing quirk needs `pact`.

### Presets and Guild Cards

Relics go in **Full** and **Chaos**:

| Preset | Relics                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Full   | on, `seeded`, `any`, `strong`, quirks on, `supplement`                                                  |
| Chaos  | on, `seeded`, `any`, `wild` power, quirks on, `wild` looks: "Full with the limits off" applies here too |

The Guild Card cap costs these presets nothing new. Poogie's luck is on
by default, and every preset starts from the defaults, so Full and Chaos
discs already keep only 3 received Guild Cards. Relics share the code
loader and its freed slots: about 1.7 KB of the 4,216-byte save area, or
one more of the 93 freed slots if the area fills.

What the presets still need:

- **Say it in the preset.** Its bullet points say "Relic weapons" and, as
  the Modifications section already does, that received Guild Cards are
  capped at 3. A player who turns Poogie off in a Full run keeps the cap
  while relics are on, and the setting's help says so.
- **Tried first.** Presets hold only options tried in game, so relics
  join Full and Chaos once the MVP has been played through a rank.
- **FUC.** FUC has no free item IDs for the stones. Until the item table
  is expanded, the presets would turn relics off on FUC and say so, or
  reuse three vanilla items **[research]**.

### A run, on the timeline

| Stage                                      | Stones                                      | What you do                                                                           |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Low rank, early (Village 1-3★, Guild 1-2★) | Guaranteed Worn stone on the first big hunt | First polish: see what the stone became, pick 1 of 3                                  |
| Low rank, late (Village 4-6★, Guild 3-5★)  | Worn: 2-4 more                              | Temper a favourite; a relic in a class you'd never have tried                         |
| High rank (Guild 6-8★)                     | Weathered; elites, Pact                     | Ascend or polish anew; Masterworks past the best; first quirks; Unknown Monster at 8★ |
| G rank (G★1-3)                             | Ancient; Unknown Monster G★3                | Heirlooms; reforge for a perfect roll; build around a quirk                           |
| Endgame                                    | Ancient, with pity                          | Fill the Heirloom set; one perfect relic a class                                      |

With `relics-only` this becomes a roguelite run: monster weapons are off
the table, the stones decide which classes you play, and the weapon you
finish with is the run's story.

## Framing 2: outside randomfu, on a vanilla save

The same mechanic as a mod for unrandomized play: you keep your save and
the game as it is, and gain a new loot layer on top.

### How it ships

| Route                                                        | What it is                                                                                   | Feasibility                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **A disc patch with every shuffle off** ("Vanilla + Relics") | randomfu's own pipeline with only `relics` on: the loader, the tables, the stones in rewards | [known] packaging; the parts as above            |
| A PRX plugin (CFW, PPSSPP plugins)                           | The blob as a plugin: no disc patch, maybe no Guild Card cap; tables allocated at runtime    | [research] (`code-loader.md`, "PRX alternative") |
| CWCheat codes                                                | Can patch RAM and code, but 100 KB of tables and the stitcher won't fit in cheat lines       | impractical                                      |

The disc patch is the realistic path. Its rolls draw from the clock
(`relics.rolls: wild`): there's no run to share, so every player's stones
are their own. The seed is still taken at the drop, so the clock never
rerolls a stone you've already seen.

### Playing on an existing save

- **It loads** **[known]**: the save is unchanged until you play, and
  stones and relics only add.
- **Guild Cards**: the code loader keeps only 3 received cards. A save
  with more loses cards 4-96 the first time it saves on the patched disc.
  Unlike a fresh randomizer save, a vanilla save may hold a collection, so
  the web app must say so loudly.
- **Back to an unpatched disc**: stones are harmless (dummy items), but a
  relic's ID reads past the vanilla tables (melee ID 1150 + k reads ranged
  record k), so the weapon has wrong stats and maybe a wrong model, and
  could crash when built. Mitigation **[research]**: a "Seal" at the
  smithy that turns every relic back into an Unpolished Relic stone
  record kept in `RF_SAVE_DATA`. Simpler: document it and leave it.
- **Late saves**: drops are rank-gated, so a G rank save sees Ancient
  stones in G quests at once, while low rank quests still drop Worn
  stones. A one-time welcome stone of each rank (a guarantee keyed to the
  save's rank) gets a veteran started.
- **IDs stable across versions**: relic records live in the save and the
  instance IDs are fixed, so a newer mod disc keeps old relics. The
  derivation from notches to stats is versioned, and old records keep
  their version.

### What changes against framing 1

|                  | In randomfu                            | Standalone                                     |
| ---------------- | -------------------------------------- | ---------------------------------------------- |
| Rolls            | Seeded by the run, racer-fair          | From the clock, taken at each drop             |
| Bands            | The shuffled disc's                    | Vanilla's, so tuned once and tested            |
| Sources          | Rewards, carves, elites, Pact, Unknown | Rewards, carves, breaks; elites optional       |
| Run shape        | A run with an end                      | An endless loot layer; Heirlooms are the chase |
| Relics-only mode | Yes                                    | No                                             |
| Spoiler log      | Yes                                    | No                                             |

## Pitfalls

1. **Guild Cards** are capped by the code loader. Randomizer presets
   already pay it through Poogie's luck; a vanilla save on the standalone
   patch loses cards 4-96.
2. **An unpatched disc** misreads relic IDs.
3. **The upgrade screen as the polish UI is unproven**: whether it shows
   target stats, how it reacts to targets rewritten under it, and that
   only 5 targets fit (3 candidates, plus temper or reforge, needs care).
4. **The create entry that changes class** is unproven, especially
   between melee and ranged.
5. **Model refresh**: a new look shows only after a stage load. A short
   line on the polish ("the smith finishes it by your next hunt") hides it.
6. **Ad-hoc play**: other players' games read a relic's ID from their own
   tables, so they'd see someone else's or a blank weapon. Solo first.
7. **Text**: names, descriptions and the stone's shape line per language;
   JP's message file isn't identified yet.
8. **FUC items**: no free item IDs, so stones need the item table expanded,
   and the presets need an answer for FUC.
9. **Real PSP**: the second `PT_LOAD` is untested on hardware.
10. **Power creep**: relics are meant to beat the smithy now, so the
    margins must be measured on real bands. `relics.power` turns them.
11. **Class droughts**: a run where the stones never roll your main. The
    streak rule, `lean` and ascend soften it; the drop rate decides how
    much.
12. **Grind creep**: every added cost (temper materials, reforge dust)
    must stay a bonus on normal hunting.
13. **Sale price**: relics must sell cheap, or polishing becomes a zenny
    farm.
14. **Bowguns** have no upgrades in vanilla, so the upgrade screen's
    behaviour with them is unknown.
15. **The ID budget** caps live relics (64 a side in this plan): salvage
    has to free instances reliably.

## MVP and later

**MVP (P0), EU, solo, PPSSPP:**

1. Instance IDs: the table expansion (from the probe) with a reserved
   block, and `rf_init` writing live relics' entries from `RF_SAVE_DATA`.
2. One stone a rank on EU dummy item IDs, in quest rewards and carves,
   and the first-stone guarantee.
3. The stone's seed and class at the drop, the stone queue, and the
   Create entry that follows it.
4. The 33 Unpolished Relics.
5. The polish on the Upgrade screen: three curated candidates from frame,
   archetype and budget; floors, the rank's best at notch 6 and overdrive
   past it, from the disc's bands.
6. Look from the stitcher's relic seed, with the mode by tier.
7. Names (English word lists) and rarity by tier.
8. `relics.rolls` seeded and wild (clock); the spoiler log.

**Built** (`relics.enabled`, EU only; `src/patches/relic-weapons.ts`,
`src/patches/weapon-tables.ts`, `blob/relic-weapons.c`):

- 1, 3, 4 and 7 as written, except that a stone's class is rolled when the
  blob first counts it in the box or pouch, not at the drop.
- 2 from quest rewards only (30% a quest, the first at each rank always);
  no carves yet.
- 5 on Improve Weapon instead of a polish table: the Unpolished Relic's
  three upgrade targets are free instances the blob rolls, from a donor
  weapon's frame, a tier budget and one of four archetypes. Not curated
  yet: the three can come out alike.
- 8 without a spoiler log beyond the report's summary.
- Not built: 6 (the stitched look; relics keep their donor's model).

Tried in PPSSPP: Create, the class tab, Improve's three candidates, the
pick kept through a save and reload. Not tried: a quest dropping a stone,
a ranged relic.

**P1:** temper and ascend; pity; the first quirks (Glass and Hungry, on
the Pact's caps); elites, Pact and Unknown Monster sources; reforge and
Relic Dust; salvage; `relics.classes: lean`; relics in Full and Chaos once
played; the standalone "Vanilla + Relics" packaging.

**P2:** the quest-load quirks (Momentum, Fickle, Wyvern-touched,
Covetous, Echoing), then the hit-hook quirks (Brittle, Bloodthirsty), each
probed; Heirlooms; a relic codex on the bookshelf (as `hints`); JP and
FUC; names in five languages; a PRX plugin; ad-hoc play.

## First probes

In order, each on a probe disc in PPSSPP (EU), deleted afterwards:

1. **The Upgrade screen as the polish.** An Unpolished Relic whose upgrade
   entry lists three new IDs, each with distinct stats written offline. Does
   the screen list all three with their stats, and does the upgrade leave
   the right ID in the box? Then the same with the blob rewriting the
   three entries at save load, and rewriting one while the smithy is open.
   This decides between the 1-of-3 design and the ruststone fallback.
2. **The Create entry that changes class.** One create entry whose target
   the blob points at a Lance, then a Bow, at save load. Does the list
   show the new name and make the right weapon, across melee and ranged?
3. **The clock.** Whether the EBOOT imports `sceRtcGetCurrentTick`, or
   which game RNG state the reward hook can read.

The first is the gate: if the Upgrade screen can't host three candidates,
the design keeps its stones, bands and quirks but loses the choice.

**Probe 1, offline half: passed (PPSSPP, EU, 2026-11-20).** The disc came
from the weapon-table expansion's relocation script, with four Bone Blade
clones at IDs 1150–1153. Unpolished Relic (1150) was sold by the Felyne
weapon merchant, and its upgrade entry listed Keen, Ember and Heavy Relic,
each with its own stats and materials.

- Improve Weapon listed all three by name, each coloured by its own
  rarity. The stored rarity shows one higher, so 4 showed as RARE-5.
- Each fee was half that target's price.
- Info showed each relic's own stats.
- Improving into Heavy Relic left it equipped, with its own stats and "cannot
  be upgraded further".

So the 1-of-3 design stands.

**Live half: passed too.** With the game running, the debugger rewrote the
table in RAM, changing Ember Relic's attack from 80 to 200 and the
relic's third target from 1153 to 1151. On a second Unpolished Relic,
the screen then listed Keen, Ember, Keen, and Ember's Info showed 960
attack. So the screen reads the relocated table each time it opens, with
nothing cached from boot, and `rf_init` can rewrite relic entries at save
load. Rewriting a relic while its screen is open remains untried.

**Probe 2, the Create entry that changes class: passed (PPSSPP, EU,
2026-11-20, live edits on the vanilla disc).** Vanilla already has the
machinery:

- **Create entries.** Each ruststone has an entry in the weapon Create
  table, which starts at EU 0x0894932C. Entry 503 is Flat Ruststone: type 5,
  ID 1501, and the stone ×1 as its material.
- **The polish table.** It lives in `lobby_task` at EU 0x09B07900, in
  10-byte rows of u16 stone, type, and IDs w0, w1, w2. When you create, the
  game finds the row whose stone is the entry's first material. It rolls
  r = rand % 100 and picks w0 if r < 5, w2 if r ≥ 30, and w1 otherwise.
  The (type, ID) it picks goes into the box.
- **Where the entry is listed.** The tab comes from a class byte per rust
  ID at EU 0x089A5597 + ID. 1501 is Great Sword, so the entry sits at the
  end of the GS/LS tab.
- **Its name and price.** Every ID ≥ 1501 shows lobby string 107,
  "??????", at a fixed 1000z.
- **When it appears.** The entry has byte +1 = 0 and material flag +0x14 = 1, so it shows only once the
  material's "obtained" bit is set. That bit array starts at save
  pointer + 0x4A0 + 0x6A7B4. On the test save, Potion's bit was clear and
  Sm Monster Bone's was set.

The test: the entry's material and the row's stone were both changed to Sm
Monster Bone. With the row set to (5, Iron Lance ×3), creating gave an Iron
Lance. Then, from the same Great Sword tab, the row (6, Hunter's Bow I ×3)
gave a Hunter's Bow I, which equipped fine. So the row's type byte alone
decides melee or ranged, and three equal IDs make the result fixed.

What this means for the design:

- A stone can be a vanilla ruststone entry. The blob writes the stone's
  row with the class rolled at the drop: type and the class's Unpolished
  Relic ID, three times. The stone keeps one entry and one item ID whatever its class.
- The row is in `lobby_task`, which is reloaded from the disc, so the blob
  has to rewrite it after each overlay load, not only at save load. The
  alternative: rows point at fixed IDs (one melee, one ranged Unpolished
  Relic per rank), with the hide/known logic choosing which is offered, and
  the blob rewrites those weapons' records instead.
- In the list, the name is "??????" for any ID ≥ 1501, so it can't say the
  class. Either the stone's description carries it, or the entry uses a
  real (< 1501) ID and something other than the polish path.
- The tab follows the class byte, which is EBOOT data the blob can write,
  so the entry can show in the tab of the class it will make.
- New stones need their "obtained" bit set when picked up, or their entry
  never shows. Vanilla sets that bit for gathered items, which should cover
  a stone that comes from rewards.

**Probe 3, the clock: answered offline.** The EU EBOOT doesn't import
`sceRtcGetCurrentTick`. It does import `sceRtcGetCurrentClockLocalTime`,
`sceKernelGetSystemTimeLow` (stub 0x0890DFB8, already used by the stitcher)
and `sceKernelGetSystemTimeWide`. Microseconds since boot, read at the
drop, are enough for a seed, so no new import is needed.

## Still open

Things these answers didn't settle:

1. **The margin's size.** +15% (+20% tempered) is a starting point. It
   needs measuring on the discs' bands, against the next rank's early
   weapons, and per class.
2. **`any` or `lean` by default**, and whether to weight classes at all
   (8 of 11 are melee, so `any` gives a gunner stone about 1 time in 4).
3. **Unwanted classes.** Whether an Unpolished Relic of a class you'll
   never use should salvage straight back for something (Dust, or a
   stone of the same rank at a cost).
4. **Chaos's rolls.** Seeded, as written, or the clock, to fit "every
   number varies widely"?
5. **Heirloom quirks.** Named, fixed Heirloom quirks (stronger versions of
   the table), or quirks of their own?
6. **FUC in the presets.** Relics off on FUC until the item table is
   expanded, or three vanilla items reused as stones.
