# Monster AI: research note

What's known about how monsters decide what to do, from the EU disc
(ULES01213) with a disassembler, and from Giadrome logged live in PPSSPP.
The Monster behaviour option (`monsterAi.branches`,
`src/shuffles/monster-ai.ts`) uses the script format below; the rest is
here for later work, such as making monsters more aggressive.

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
Basarios and Black Gravios read in both em17 and em83, so they're left
alone. Other code in the repo has the same problem (mhfu-extract
`monsters/collision.ts`); the game's own emID-to-overlay table isn't
found yet.

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

What an action does is species code. For the dromes (Velocidrome,
Gendrome, Iodrome and Giadrome share one set of scripts in `game_task`):

- The drome class vtable is in the EBOOT, entries from 0x089BC664; a method
  offset `off` as code uses it is the entry at `0x089BC664 + off − 8`.
  `+0x88` is 0x09B0DE58, which switches on the group (table at 0x09C0DF98)
  and starts the action (0x09AC8818 stores group `+0x298` and id `+0x299`;
  the generic starter is 0x09AC8690).
- Each frame, 0x09B07D28 runs the action by group, then by id, and plays
  motions with 0x09AC5228(monster, record): an 8-byte record table at
  `+0x640`, the motion id at `+0x324` being record + 1000.

| Group | What             | Motions                                                                                         |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 0     | Various          | ids 2→50, 3→51 (roar on first contact), 4→52, 5/11→11, 6/8→39, 7→43/44, 9→42, 10/12→12, 17–20→1 |
| 1     | Walk and turn    | 1→2, 2→8, 3→9, 4→10                                                                             |
| 2     | Unknown          | 3, 4, 5                                                                                         |
| 3     | Attacks          | 0/7/12→22, 2/5/6/8/10/11→20/21 (pounce), 3/9→25, 4/13/14/15→26                                  |
| 4, 5  | Likely reactions | 30–47                                                                                           |

In a Giadrome fight every hit on the hunter came during motions 21, 22 or
25 (20 is 21's wind-up), all group 3; 1, 2, 6 and 7 were idle, walking and
turning. Rage wasn't seen.

The dromes' scripts call their attacks through six sub-scripts
(`82 04 01`…`06`), each a choice between attacks. 226 choices are found in
their scripts. 114 of them mix attacks with other moves, in 10 patterns
repeated across the 11 roots, with 8, 12–15, 17–19 or 30 of 32 on attacks.
An entry counts as an attack if its body starts a group 3 action, directly
or through a sub-script.

An attack-only test disc (every non-attack entry of those 114 set to 0)
was built for PPSSPP; how it played isn't recorded yet. Making monsters more
aggressive this way needs each species' attack group checked against its
code first: nothing says group 3 is attacks for anyone but the dromes.

## Other things found on the way

- `emChunk` `+0x60` and `+0x80` (DetectRange, DetectRadius) look like
  aggro distances: plain data.
- Hits on the hunter go through `game_sub`: 0x09C41E58 loops 20 entities
  against an attack object, 0x09C42650 tests its shape list (`+0x34`,
  0x28-byte records, -1 ends), 0x09C42F00 applies damage (reading the
  attacker's multiplier at `+0x380`). Who creates attack objects isn't
  known.
- Enrage is 0x09AD23D0 and calm 0x09AD87E8 (`+0x638` bit 0x20).

## Live logging

The monster manager is behind the global 0x09C121B0, with 20 entity slots
at `+0x1220`; an entity's emID is at `+0x1E8`. The hunter was at
0x090B3440 (HP `+0x2E4`, max `+0x41E`). PPSSPP 1.19.3's debugger on macOS
crashed (CoreAudio, MoltenVK) or froze within a minute in two of three
sessions, with OpenGL, sound off and a single connection, with and without
breakpoints, so static work was used instead.
