# Monster AI: research note

What's known about how monsters decide what to do, from the EU disc
(ULES01213) with a disassembler, and from Giadrome logged live in PPSSPP.
The Monster behaviour option (`monsterAi.branches`,
`src/shuffles/monster-ai.ts`) uses the script format below; the rest is
here for later work, such as making monsters more aggressive (see the last
sections).

Addresses are EU unless marked. `game_task.ovl` loads at 0x09A5F200,
`game_sub.ovl` at 0x09C19000, and every `emNN.ovl` at 0x09D1A180 (one
slot, shared by all monster families).

## Where the AI is

AI is bytecode, run by an interpreter in `game_task.ovl`, not species code.
A monster's `emChunk` (`MonChunk[90]` in `game_task`, stride 0x1D0, EU
0x09BB89B0; mhfu-extract `monsters/hitzones.ts`) holds 28 pointers at
`+0x158` (`emPTRTable` in the vendored hexpats):

| Pointer | What                                                                 |
| ------- | -------------------------------------------------------------------- |
| 0       | Targeting and movement table, used by op `05`                        |
| 3–19    | AI script roots, one per map                                         |
| 21      | Rage (`+0x1AC`): duration, attack and defense multipliers (elite.ts) |

A switch at 0x09ABAAC0 picks the root by a byte at save `+0x6AF10` and
stores it in the monster at `+0x4C8`.

The scripts are in `game_task.ovl` for small monsters, the dromes,
Blangonga, Rajang, Congalala and others, and in the family's `emNN.ovl`
for the rest. The overlays share one load address, so a root address alone
doesn't say which file holds it. The randomizer takes the monster's own
`emNN.ovl` if the root reads there (Lao-Shan Lung's roots read as roots in
em33 too, with no choices), or else the one overlay where every root reads.
Basarios and Black Gravios read in both em17 and em83; their class code
(below) is in em17, Gravios's, and their roots are Gravios's on the EU and
FUC discs, so they take em17 (mhfu-extract `monsters/families.ts`, which
`monsters/collision.ts` uses too). The game's own emID-to-overlay load table wasn't
found: the `emNN.ovl` name strings are in the EBOOT (EU file offset
0x1D0425) with no pointer to them.

## Roots and tables

A root is a list of table pointers: 20 for most monsters, more where
`82 a n` uses a group above 4 (Kirin, Diablos, Congalala and Cephadrome go
up to `82 09`), fewer when the monster calls no high group; other data
follows. Each table lists script entry points:

- `+0`: by the monster's state (`+0x500`).
- `+4`: for op `81 n`, which sets `+0x51C` and jumps (0x09ABA9F8).
- `+8`: for op `0F` (approach), `+0x14` and `+0x18` for op `17` (roam).
- `+0x3C + 4a`: for op `82 a n`, a sub-script call; the resume point is
  saved at `+0x4F4` (0x09ABAA38).

## The interpreter

`think(monster)` at 0x09AB4B68 runs at most 1000 ops a call, over 130
opcodes dispatched by a compare chain; each handler is
`(monster, pc + 1) -> new pc`. The instruction length routine is at
0x09AB7758 and skip-to-marker at 0x09AB7628. A full parser would use those;
randomfu reads by pattern instead (below). The length routine reads
`80 00 N` and the first `80 1 w` as one 6-byte instruction; 82 opcodes have
fixed lengths there and 48 depend on their first operand. Stepping over a
script one byte at a time misreads the operands of ops like `17` as
`05 g i 00`: the classification below runs the game's routine in unicorn.

| Op             | What                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `80 00 N`      | Weighted random choice: N entries `80 k w <body>`, then `80 FF`. Roll `+0x322 & 0x1F` (0–31), walk the weights.                             |
| `05 g i 00`    | Start action `i` of group `g` (handler 0x09AB52A4 → 0x09AC89F0 → the monster's vtable `+0x88`); 0x09AB73D0 saves the resume pc at `+0x4CC`. |
| `06 a b c`     | Sets `+0x506`/`+0x508`/`+0x504`: a mode (0, 2 or 9 while unaware, 1 once it's fighting), not the move.                                      |
| `81 n`         | Jump through the `+4` table.                                                                                                                |
| `82 a n`       | Call through the `+0x3C + 4a` table.                                                                                                        |
| `0F a b c d e` | Approach the hunter (0x09ABD530): runs script `d` of the `+8` table, which walks and turns (actions like 1.0 and 1.1), then resumes.        |
| `17 a b c d`   | Roam between map points (0x09ABD6C0): list `a` of the `+0x14` table names the points; each step runs script `c` of the `+0x18` table.       |
| `FF`           | End.                                                                                                                                        |

3,412 of about 3,500 `80 00 N` choices on the disc have weights that add up
to exactly 32. The randomizer edits a choice only if its entries come in
order, its weights add up to 32, it ends with `80 FF` within reach, and no
entry holds another `80 00` (a nested choice would hide its entries). On
both the EU and FUC discs that is 3,355 choices in 18 files.

## Actions: what a branch does

What an action does is species code: each species has a C++-style class,
and its vtable says what `05 g i` does.

- The spawn switch at 0x09AB15D8 (jump table 0x09C0CCF8, 90 cases, by
  emID) builds the monster and stores its vtable. Vtables are in the EBOOT
  with a 2-word header: the method a call uses at offset `off` is the entry
  at `vtable + off − 8`. Species of one family share a class; their methods
  are in the family's `emNN.ovl` or in `game_task.ovl`, which is also how
  Basarios and Black Gravios were placed in em17.
- `+0x88` starts an action (group, id): a switch on the group, then the
  generic starter 0x09AC8690 → 0x09AC8818, which stores the group at
  `+0x298` and the id at `+0x299`.
- Each frame the class runs the action by group and id and plays motions
  through an 8-byte record table at `+0x640` (from 0x09BD3780[emID]:
  motion, part, blend, …); the motion id at `+0x324` is record + 1000.
- `+0x80`, also each frame, spawns attack objects by motion and frame
  (compare chains on `+0x324` and the frame), and some actions spawn them
  directly. Attacks are spawned by this code, not described in data.

### Motion banks

The motion banks (`pac`/motion packs, decoded in mhfu-extract
`models/motion.ts` and `motion-pack.ts`) hold only keyframes: no hit
windows, power or attack ids. Nothing in them says which motion hurts.

### Attack objects

An attack is an object from a pool behind the global 0x09C18FD0
(`+0x5000`; allocator 0x08859B44, live list at `+0x502C`), made by a
factory per kind of attack (body hit, breath, projectile, shockwave). Its
vtable loads a row from a table of 24-byte rows (byte 2 power, byte 3
the hunter's reaction, byte 20 stun; loaders 0x09B674C0, 0x09B67620, 0x09B67338, 0x09B674D0) through
`obj+0xC8`. `game_sub` tests it against the hunters: 0x09C41E58 loops 20
entities, 0x09C42650 tests the shape list (`obj+0x34`, 0x28-byte records,
−1 ends; nothing hits without one), and 0x09C42F00 applies damage: power
(`obj+0x1E`) times the attacker's rage multiplier (`+0x380`).

### Which actions are attacks

An action is classified by the attack rows it spawns, from its own code or
from the motions it plays:

- **Attack** (`A`): a row with power (byte 2) that knocks the hunter back
  (reaction byte 3 isn't 1) or stuns (byte 20 above 0).
- **Trample** (`t`): only rows with reaction 1 and no stun: the light
  contact a large monster deals with every step while walking (Yian
  Kut-Ku's walk motions spawn one per footfall, power 10). It counts as no
  attack. This is a heuristic: a real attack whose rows are all reaction 1
  with no stun would count as trample too. The drome's bites, confirmed in
  the live log, are reaction 1 with stun 5, so they count as attacks.
- **No attack** (`-`): nothing with power. Roars, wind pressure and
  tremors are rows of the shared effect table (types 5, 6, 7, 0x13, 0x1D)
  with power 0.
- em54's own object 0x09D1A2E0 (kind 0x1D), spawned by actions 1.7 and
  1.18 of Kushala Daora, Lunastra and Teostra, counts as an attack although
  it has no row: it is most likely the aura (wind, or fire for Teostra and
  Lunastra), and favouring it is aggressive.

This was worked out for every species by static analysis (capstone and
unicorn): from the start-action method to the group and id handlers, the
motions each plays, and the attack spawns each motion triggers. Details
that mattered:

- The per-frame spawner switches on motion − 1000 in some classes and
  motion − 1001 in others (em20, em82 and more); missing the second hid
  most attacks of Yian Kut-Ku, Gypceros and Hypnocatrice.
- Row byte 3 is the hunter's reaction (the hit code branches on it), byte
  20 is stun: `game_sub` adds it to the hunter's `+0x394`, which `game_task`
  checks against 150 and clears with the stun-negating skill.
- The row index is usually the third argument of the factory, but the
  shared effect factory 0x09B63C58 takes a position there and the row
  fourth; 0x09B65030 makes kind 6 itself (row 7); 0x09AF1990 forwards its
  argument to 0x09B64C30 for Cephadrome and 0x09B65130 for others; and a
  class's row table can be passed in `a2` (0x09B67620) rather than `a3`.
- Where the index is computed, the action is still decided if every row of
  the table is the same kind (em54's 0x09B65678 and 0x09B65C50 are all
  attacks).
- Some species play motions through a helper that forwards its argument to
  the motion player (Kelbi's 0x09ADBF50); those count as the player.

A choice entry is an attack if its body starts an attack action, directly
or through a sub-script (`81`, `82`, and the movement scripts of `0F` and
`17`), and unknown if any action it reaches is unresolved or a sub-script
it calls can't be read. Many of Kirin's, Diablos's and Congalala's choices
pick only how to approach (`82` into a `0F`); the move follows the choice,
so they're no-attack choices, not missing data.

The drome result matches the Giadrome fight logged in PPSSPP: every hit
came during motions 21, 22 or 25, which only group 3 plays, and group 1
(walking and turning) spawns nothing. Group 3 isn't attacks for everyone:
Rathian's are spread over groups 0 to 4 and 6, for example.

Of the 3,355 choices randomfu edits, 3,317 are fully classified and 2,158
of those mix attacks with other moves. "Attack weight" is the share of the
32 that mixed choices give attacks now; "Attack/trample" counts the
species' actions of each kind.

| File      | Species                                  | Choices | Classified | Mixed | Attack weight | Attack/trample actions |
| --------- | ---------------------------------------- | ------: | ---------: | ----: | ------------: | ---------------------: |
| game_task | Velocidrome, Gendrome, Iodrome, Giadrome |     226 |        226 |   114 |           57% |                   12/0 |
| game_task | Velociprey, Genprey, Ioprey, Giaprey     |      28 |         28 |    21 |           59% |                    9/2 |
| game_task | Shogun and Terra Shogun Ceanataur        |      99 |         99 |    60 |           56% |                   25/0 |
| game_task | Daimyo and Plum Daimyo Hermitaur         |      77 |         77 |    42 |           90% |                   33/0 |
| game_task | Hermitaur, Ceanataur                     |      24 |         24 |    10 |           88% |                   19/0 |
| game_task | Shakalaka, King Shakalaka                |      38 |         38 |    31 |           82% |                   22/0 |
| game_task | Blangonga, Rajang, Blango                |      72 |         72 |    31 |           91% |                   69/0 |
| game_task | Copper Blangonga                         |      81 |         81 |    36 |           89% |                   69/0 |
| game_task | Furious Rajang                           |      92 |         92 |    41 |           88% |                   50/0 |
| game_task | Congalala, Emerald Congalala             |      21 |         21 |    11 |           50% |                   53/0 |
| game_task | Conga                                    |       7 |          7 |     6 |           47% |                   50/0 |
| game_task | Bulldrome                                |      19 |         16 |     2 |           61% |                    6/0 |
| game_task | Cephadrome, Cephalos                     |      32 |         32 |    10 |           62% |                   26/6 |
| game_task | Vespoid, Hornetaur, Vespoid Queen        |      32 |         24 |    15 |           42% |                    7/0 |
| game_task | Kelbi, Anteka                            |       7 |          7 |     1 |           88% |                    6/0 |
| game_task | Other small monsters and Felynes         |      63 |         53 |    24 |        25–37% |                        |
| em01      | Rathian, Rathalos and their variants     |     696 |        696 |   529 |           61% |                  33/15 |
| em02      | Fatalis                                  |      33 |         32 |     6 |           59% |                   60/0 |
| em02      | Crimson Fatalis                          |      31 |         22 |    10 |           91% |                   60/0 |
| em02      | White Fatalis                            |      33 |         26 |    10 |           89% |                   60/0 |
| em07      | Lao-Shan Lung, Ash Lao-Shan Lung         |      10 |         10 |     1 |           38% |                   23/0 |
| em14      | Diablos, Monoblos and their variants     |     163 |        163 |   148 |           76% |                  28/14 |
| em15      | Khezu, Red Khezu                         |     108 |        108 |    86 |           66% |                   28/7 |
| em17      | Gravios, Black Gravios, Basarios         |     139 |        139 |    20 |           86% |                   45/7 |
| em20      | Yian Kut-Ku, Gypceros and their variants |     207 |        207 |   142 |           62% |                  37/28 |
| em21      | Plesioth, Green Plesioth                 |      86 |         86 |    66 |           71% |                   13/7 |
| em33      | Kirin                                    |     222 |        222 |   116 |           55% |                   16/0 |
| em40      | Yian Garuga, Scarred Yian Garuga         |     324 |        324 |   285 |           61% |                  25/22 |
| em54      | Kushala Daora, Rusted Kushala Daora      |     150 |        150 |   125 |           69% |                   52/0 |
| em54      | Lunastra, Teostra                        |     151 |        151 |   127 |           56% |                   52/0 |
| em55      | Shen Gaoren                              |       3 |          3 |     0 |               |                   30/0 |
| em58      | Yama Tsukami                             |      22 |         22 |    12 |           71% |                   17/0 |
| em59      | Chameleos                                |      29 |         29 |    15 |           68% |                   16/0 |
| em75      | Tigrex                                   |      39 |         39 |     9 |           62% |                  111/0 |
| em75      | Nargacuga                                |      36 |         36 |    15 |           73% |                  111/0 |
| em75      | Akantor, Ukanlos                         |      24 |         24 |    10 |           85% |                  118/0 |
| em82      | Hypnocatrice                             |      42 |         42 |    23 |           60% |                  41/10 |
| em83      | Lavasioth                                |      49 |         49 |    21 |           72% |                   27/7 |

Caveats:

- Only 2 shared choices disagree between the species sharing them (both
  Hermitaur against Ceanataur). An option should still change a shared
  choice only where every species sharing it agrees.
- What's left unknown (38 choices): Great Thunderbug, Fatalis's family
  (an action each), the Vespoid family and Bulldrome (unresolved actions).
- Trample is a heuristic (above).

The per-species action and choice classification
(`monster-attack-choices.json`: each species' actions as `A`/`t`/`-`/`?`
and choices as `A`/`-`/`?` strings, keyed by the choice's vaddr) and the
Python scripts that made it (`monster-attack-scripts.tgz`) are outside the
repo, since they need a disassembler: in
`~/Library/Application Support/Claude/side-session-notes/local_9a5921b3-efe4-4424-aa07-046a21f9d4f7/`
on the machine this was done on. Rerunning them needs capstone, unicorn
and an unpacked EU disc. The EU and FUC discs have the same choices in the
same order with the same weights in every script file, at shifted
addresses, so the classification can be keyed by file and choice order.

## More aggressive monsters

`monsterAi.aggression` (README, "Monster aggression") moves weight from
non-attack to attack entries in 2,156 of the 2,158 mixed choices: the
other 2 are the ones Hermitaur and Ceanataur share but disagree on. It
keeps the 32 and every entry at 1 or more, and leaves alone any choice with
an unknown entry. That covers nearly every large monster, including the
elder dragons, Rajang, Congalala and Hypnocatrice; the weakest is
Bulldrome. The classification ships as data (`monster-attacks.ts`), keyed
by file and choice order and checked against the disc's weights by a hash,
since it can't be worked out without a disassembler; `aggressive-choices.json`
and `gen-attacks.mts` in the notes folder made it.

A test disc with the attack entries of every mixed choice weighted ×4
(then back to 32), what `relentless` does, made Giadrome clearly more
aggressive on the EU disc in PPSSPP. Still to play: a trample-heavy species
(Yian Kut-Ku, Yian Garuga, Diablos) to check the trample rule, and an elder
dragon for the aura.

## Pauses between moves

Found statically on the EU disc (2026-11-22) from Tigrex, whose pause before
turning to its next move prompted it; the same code is on FUC.

- Each frame a monster's AI gate (0x09AD8278, called from 0x09B15CF0)
  counts `+0x778` (s16) down and skips the AI while it's above 0; otherwise
  it runs `think` (0x09AB4B68) when `+0x4B5` (u8, "think now") is set, and
  clears it. Op `48 N` sets `+0x778`, but no monster's scripts use it.
- Op `05` starts the move and stops the interpreter (it saves the resume pc
  at `+0x4CC`); the move's code sets `+0x4B5` when it's done. Setting
  `+0x4B5` from outside is the move ending there: the AI goes on after the
  `05` the next frame.
- Tigrex's class (vtable EBOOT 0x089BB69C; move runner em75 0x09D36A08)
  runs action 0.1 (0x09D26470) as its idle: it plays motion record 1,
  waits for the motion's end (`+0xBC` bit 0), then sets `+0x4B5`
  (0x09D26158). Record 1 is a looping 180-frame stand, three seconds at the
  game's 2 motion frames a frame. Its scripts use `05 00 01 00` often: 11
  of the 32 in one combat choice (root 0x09D56448, `82 0 4`) and always in
  that choice's other branch, and every attack script (`82 3 n`) starts with
  the turn `05 01 02 00`: idle, turn, attack.
- Action 0.0 (0x09D26398) is a timed idle instead, counting `+0x414` down;
  0x09AD81B0 sets it from the s16 table 0x09BCF168 (240, 300, 450, 600)
  indexed by `emChunk + 0x14C` (−1 gives 10). Likely the rest while
  unaware.
- Motion slot 1 is a looping idle for every monster the site has, so
  "group 0 (`+0x298`) and motion 1001 (`+0x324`)" finds an idle without
  species code. `blob/monsters.c` ends it after a cap (Monster aggression,
  elites).
- No "has seen a hunter" flag was found: `+0x506` takes several values in
  Tigrex's scripts (3, 6, 10), and `+0x500` is the script state (op `07`
  sets it, op `04` clears it).

Played against Tigrex on the EU disc (2026-11-22, `relentless`): better,
but its turns and the end of some attacks were still slow.

### Turns and recoveries

- Each frame the monster update (0x09AC667C, in the function that also
  runs the AI gate) sets the four animation channels' speeds (`+0x94`,
  `+0xD4`, `+0x114`, `+0x154`) to 2 × `+0x4B0` × (100 + `+0x769`) / 100.
  `+0x769` (u8) is a percent bonus: Tigrex's charge actions 1.4 and 1.5 set
  20 and 30, and a change of move clears it (0x09AC6C10, 0x09AC87F4). The
  body's first channel's frame is `+0x90` (f32, 2 a game frame), its loop
  end `+0x9C`, its flags `+0xBC` (bit 0 the motion ended).
- Tigrex's turn (action 1.3) plays records 7 and 8 (62 frames) or 2 (56),
  whose only hits are light contact (power 10, reaction 1, stun 2) all
  through; its attacks end well after their last hit (record 43's last
  hit ends at frame 186 of 332, 41 at 140 of 214, 46 at 130 of 344).
- mhfu-extract's attack sweep (`monsters/attacks.ts`) gives each record's
  hit windows; `src/shuffles/monster-motions.ts` keeps where the last one
  ends, per species, and `blob/monsters.c` raises `+0x769` past it.

Played against Tigrex on the EU disc at `relentless` (2026-11-22): its
turns felt much better.

## Out of reach

`monsterAi.reach` (README, "Monster reach") is two findings: which choice
entries start a flight or a burrow, and how a monster decides to leave an
area. Found on the EU disc; the scripts (`reach.py`, `posture.py`,
`gen-reach.mts`) are in the notes folder.

### Posture

A monster's posture is `+0x280`: 0 on the ground, 2 in the air, 4
underground (in sand); 1 is a state not looked into. The scripts test it
with conditional ops, each `XX 00` (if), `XX 01` (else), `XX 02` (endif):
`08` is posture 0, `09` posture 2, `1f` posture 1, `51` posture 4. (An `ff`
inside an if-block doesn't end the script; a dump that stops at the first
`ff` misses the rest.) Other conditionals used here: `02 00` if `+0x503`
(engaged with a hunter) is set, `0b 00 N` if `+0x4B9` (awareness) is N.

- Flyers (em01 Rathian/Rathalos, em20 Kut-Ku/Gypceros, em02 Fatalis, em40
  Garuga, em54 Kushala/Lunastra/Teostra, em59 Chameleos, em82
  Hypnocatrice) take off with action 2.0 under `08 00` and land with 2.1
  under `09 00`.
- em14 (Diablos, Monoblos and their kin) digs in with 2.0 in the else of
  `51 00`, moves underground with 2.3, 2.4 and 2.27-2.29 and surfaces with
  2.2.
- Cephadrome and Cephalos (one `game_task` root) dive with 2.16, mostly
  outside choices, so nothing is weighted for them.

The classifier walks each choice entry's body, following `81`, `82`, `0F`
and `17` into sub-scripts with a stack of the posture guards it's under,
and marks an entry `L` if it reaches the takeoff or dig action outside an
"already away" guard, in a choice made on the ground; `B` if a choice made
in the air or underground has an entry that reaches the landing or
surfacing action. A choice's own posture comes from parsing every entry
script linearly. Choices that mix `L` with other moves get the weights;
ones whose every entry leaves (em40, em54, em82 decide flights that way, or
outside choices) can't be leaned. Some scripts are shared by roots that
resolve one `82` entry differently (Kut-Ku's root 0x9D386F0); an entry is
`L` if it takes off under every root that reaches it, entries the game
never picks (weight 0) count as either, and a choice the roots still
disagree on is left out (36: 29 in em20, 6 in em01, 1 in em82).

### Leaving an area

Rathalos's state table (`+0x500`, set only by op `07 n`): 0 idle (aware: to
2; unaware: roam states 6, 7, 1), 1 move to another area (route `16 07`,
then `18`), 2 decide (engaged: 3, combat; not: 4, walk off, or 9, fly
off), 3 combat, 4 picks 5 or 8 (walk to an exit), 9 fly off (action 2.16).
So a monster leaves when no hunter engages it.

Engagement is the hunter's bit in `+0x503`:

- Each frame (0x09AC9B08, called from 0x09AC5F38) a monster that sees a
  hunter (`+0x513`, set at 0x09ACB368 from raycasts at 0x09C403C0 and the
  vision cone at 0x09AD40E8) sets the hunter's bit and resets
  `+0x514[h]` (s16) to its `emChunk`'s `+0x146`. While it can't see them,
  the timer counts down and the bit clears at 0.
- Aggro: 0x09AD29F8(monster, add, cap, hunter) adds into `+0x554[h]`, which
  decays each frame; at 9000 or more, with the hunter in the same area, it
  sets the bit and resets the timer too. The add and cap pairs come from
  the table at `emChunk` pointer 22 (`+0x1B0`, 0x09BCDCB0 for most:
  10000/30000, 3000/30000, 4000/35000, 10/30000, ...).
- `ff f7` in a script forgets the target hunter (`+0x511`): it clears its
  bit, timer and aggro.

`emChunk` `+0x146` is 1800 frames (60 s) for most species, 900 for the
dromes and raptors, 2700 for Yian Garuga. `monsterAi.reach` multiplies it
for large monsters. Not yet seen in game whether a monster that stays
engaged with a hunter in another area waits or follows.

## Other things found on the way

- `emChunk` `+0x60` and `+0x80` (DetectRange, DetectRadius) look like
  aggro distances: plain data.
- Enrage is 0x09AD23D0 and calm 0x09AD87E8 (`+0x638` bit 0x20).

## Live logging

The monster manager is behind the global 0x09C121B0, with 20 entity slots
at `+0x1220`; an entity's emID is at `+0x1E8`. The hunter was at
0x090B3440 (HP `+0x2E4`, max `+0x41E`). PPSSPP 1.19.3's debugger on macOS
crashed (CoreAudio, MoltenVK) or froze within a minute in two of three
sessions, with OpenGL, sound off and a single connection, with and without
breakpoints, so static work was used instead.
