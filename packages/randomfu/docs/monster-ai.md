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
(below) is in em17, Gravios's, and their roots are Gravios's, so they take
em17 (`SCRIPT_OVERLAY`). The game's own emID-to-overlay load table wasn't
found: the `emNN.ovl` name strings are in the EBOOT (EU file offset
0x1D0425) with no pointer to them.

## Roots and tables

A root is up to 20 table pointers (fewer when the monster calls no high
sub-script group; other data follows). Each table lists script entry points:

- `+0`: by the monster's state (`+0x500`).
- `+4`: for op `81 n`, which sets `+0x51C` and jumps (0x09ABA9F8).
- `+0x3C + 4a`: for op `82 a n`, a sub-script call; the resume point is
  saved at `+0x4F4` (0x09ABAA38).

## The interpreter

`think(monster)` at 0x09AB4B68 runs at most 1000 ops a call, over 130
opcodes dispatched by a compare chain; each handler is
`(monster, pc + 1) -> new pc`. The instruction length routine is at
0x09AB7758 and skip-to-marker at 0x09AB7628. A full parser would use those;
randomfu reads by pattern instead (below).

| Op          | What                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `80 00 N`   | Weighted random choice: N entries `80 k w <body>`, then `80 FF`. Roll `+0x322 & 0x1F` (0–31), walk the weights.                             |
| `05 g i 00` | Start action `i` of group `g` (handler 0x09AB52A4 → 0x09AC89F0 → the monster's vtable `+0x88`); 0x09AB73D0 saves the resume pc at `+0x4CC`. |
| `06 a b c`  | Sets `+0x506`/`+0x508`/`+0x504`: a mode (0, 2 or 9 while unaware, 1 once it's fighting), not the move.                                      |
| `81 n`      | Jump through the `+4` table.                                                                                                                |
| `82 a n`    | Call through the `+0x3C + 4a` table.                                                                                                        |
| `FF`        | End.                                                                                                                                        |

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
type; loaders 0x09B674C0, 0x09B67620, 0x09B67338, 0x09B674D0) through
`obj+0xC8`. `game_sub` tests it against the hunters: 0x09C41E58 loops 20
entities, 0x09C42650 tests the shape list (`obj+0x34`, 0x28-byte records,
−1 ends; nothing hits without one), and 0x09C42F00 applies damage: power
(`obj+0x1E`) times the attacker's rage multiplier (`+0x380`).

### Which actions are attacks

An action counts as an attack if its code, or a motion it plays, spawns an
attack object whose row has power above 0 (a roar, sound wave or wind with
power 0 doesn't count). This was worked out for every species by static
analysis (capstone and unicorn): from the start-action method to the group
and id handlers, the motions each plays, and the attack spawns each motion
triggers. A choice entry is an attack if its body starts an attack action,
directly or through a sub-script; it's unknown if any action it reaches is
unresolved (a record index computed at run time, or a factory whose attack
row is computed: 0x09B63C58, 0x09B65030, 0x09B65678, 0x09B65740,
0x09B65C50, 0x09B65F68 and em54's 0x09D1A2E0).

The drome result matches the Giadrome fight logged in PPSSPP: every hit
came during motions 21, 22 or 25, which only group 3 plays. Group 3 isn't
attacks for everyone: Rathian's are spread over groups 0 to 4 and 6, for
example.

Of the 3,355 choices randomfu edits, 2,994 are fully classified and 1,331
of those mix attacks with other moves. "Attack weight" is the share of the
32 that mixed choices give attacks now.

| File      | Species                                  | Choices | Classified | Mixed | Attack weight |
| --------- | ---------------------------------------- | ------: | ---------: | ----: | ------------: |
| game_task | Velocidrome, Gendrome, Iodrome, Giadrome |     226 |        226 |   114 |           57% |
| game_task | Velociprey, Genprey, Ioprey, Giaprey     |      28 |         28 |    19 |           55% |
| game_task | Shogun and Terra Shogun Ceanataur        |      99 |         95 |    60 |           56% |
| game_task | Daimyo and Plum Daimyo Hermitaur         |      77 |         69 |    42 |           90% |
| game_task | Hermitaur, Ceanataur                     |      24 |         24 |    10 |           88% |
| game_task | Shakalaka, King Shakalaka                |      38 |         38 |    31 |           82% |
| game_task | Blangonga, Rajang, Blango                |      72 |         35 |    18 |           95% |
| game_task | Copper Blangonga                         |      81 |         39 |    18 |           95% |
| game_task | Furious Rajang                           |      92 |         20 |     0 |               |
| game_task | Congalala, Emerald Congalala             |      21 |         11 |     0 |               |
| game_task | Bulldrome                                |      19 |         16 |     2 |           61% |
| game_task | Cephadrome, Cephalos                     |      32 |         11 |     0 |               |
| game_task | Vespoid, Hornetaur, Vespoid Queen        |      32 |         24 |    15 |           42% |
| game_task | Small monsters and Felynes (7 groups)    |      77 |         59 |    24 |        25–37% |
| em01      | Rathian, Rathalos and their variants     |     696 |        696 |   515 |           64% |
| em02      | Fatalis, Crimson Fatalis, White Fatalis  |      97 |         80 |    16 |         9–34% |
| em07      | Lao-Shan Lung, Ash Lao-Shan Lung         |      10 |         10 |     1 |           38% |
| em14      | Diablos, Monoblos and their variants     |     163 |        159 |    84 |           71% |
| em15      | Khezu, Red Khezu                         |     108 |        108 |    86 |           66% |
| em17      | Gravios, Black Gravios, Basarios         |     139 |        139 |    20 |           86% |
| em20      | Yian Kut-Ku, Gypceros and their variants |     207 |        207 |    34 |           16% |
| em21      | Plesioth, Green Plesioth                 |      86 |         86 |    42 |           62% |
| em33      | Kirin                                    |     222 |        215 |   116 |           55% |
| em40      | Yian Garuga, Scarred Yian Garuga         |     324 |        321 |    12 |           38% |
| em54      | Kushala Daora, Rusted Kushala Daora      |     150 |         33 |     0 |               |
| em54      | Lunastra, Teostra                        |     151 |         88 |     7 |           26% |
| em55      | Shen Gaoren                              |       3 |          3 |     0 |               |
| em58      | Yama Tsukami                             |      22 |         19 |    12 |           71% |
| em59      | Chameleos                                |      29 |         28 |    15 |           68% |
| em75      | Tigrex                                   |      39 |         37 |     8 |           64% |
| em75      | Nargacuga                                |      36 |         34 |    15 |           73% |
| em75      | Akantor, Ukanlos                         |      24 |         24 |    10 |           85% |
| em82      | Hypnocatrice                             |      42 |         42 |     0 |               |
| em83      | Lavasioth                                |      49 |         49 |    21 |           72% |

Caveats:

- Species that share a choice can disagree, because their classes differ:
  93 choices, 67 of them Lunastra's against Teostra's (Teostra's attacks
  there are unresolved), 24 in the Blangonga/Rajang scripts, 2 between
  Hermitaur and Ceanataur. An option should change a shared choice only
  where every species sharing it agrees.
- The elder dragons (em54), Rajang, Congalala, Cephadrome and Kelbi have
  the most unknowns: their attacks come from the computed-row factories.
- Low attack counts (Yian Kut-Ku and Gypceros, 3 attack actions; Hypnocatrice,
  none resolved) are probably missed spawns rather than harmless monsters;
  check those in game before relying on them.

The per-species action and choice classification, and the Python scripts
that made it, are outside the repo (left with the session notes) since they
need a disassembler; rerunning them needs capstone, unicorn and an unpacked
disc.

## More aggressive monsters

An option that moves weight from non-attack to attack entries is doable
for the 1,331 mixed choices: keep the 32, keep every entry at 1 or more,
and leave alone any choice with an unknown entry or one that species
sharing it disagree on. That covers most of the large monsters (Rathian and
Rathalos, Diablos, Khezu, Gravios, Plesioth, Kirin, Tigrex, Nargacuga,
Akantor, the dromes, the crabs) and very little of the elder dragons,
Rajang or Congalala. It needs the classification in the randomizer as
data, keyed by file and choice offset and checked against the disc, since
it can't be worked out without a disassembler. Before building it, play an
attack-heavy test disc for a few species, in particular one from the
low-confidence rows.

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
