# Whetstone

An overhaul for **Monster Hunter Freedom Unite / Monster Hunter Portable
2nd G**: camera, HUD, quality-of-life and monster behaviour mods, patched
into your own disc image. It reads your EU (ULES01213), JP (ULJM05500) or
FUC disc and writes a new ISO with the mods in, plus a log of what went in.
It shuffles nothing and never ships game data: it only edits a copy of a
disc you supply. Its web app is `apps/whetstone`.

Licensed **GPL-3.0-or-later** (see `LICENSE`), because it builds on
`packages/mhfu-extract`'s readers and ciphers, which are GPL.

**Never commit a disc image, a patched image or a log made from one.**

## What's here

- The disc and DATA.BIN code (`src/disc/`), the edits a run collects
  (`src/edits.ts`) and writing them back (`src/write.ts`; see "How it
  writes the disc").
- Loading the game (`src/game/load.ts`, `board.ts`, `quest-fields.ts`,
  `quest-text.ts`, `tiers.ts`) and names (`src/names.ts`).
- The option machinery (`src/options.ts`) and Whetstone's options
  (`src/settings.ts`, `WHETSTONE_OPTIONS`).
- The mods (`src/patches/`), the code loader that their blob code goes in
  with, and the blob's C sources (`blob/`) and committed objects
  (`src/blob/`). `docs/code-loader.md` has the loader's design and
  `docs/monster-ai.md` what's known of monster AI.

## Running it

`src/run.ts` (`runWhetstone`) runs it end to end over a disc image: load,
apply the mods, write the changes, read every changed file back to check
it, and format the log (`formatReport`: the settings string, the disc,
then each mod's notes, from `src/report.ts`). Writes are kept in memory
over the image (`OverlaySource`, `src/disc/image.ts`), and the result is
the finished image as ranges of the original plus the changed bytes, so
the original is never written to. A dry run returns the log only.

`src/mods.ts` (`applyMods`) runs every mod over loaded game data and links
the code loader. It's deterministic: the same disc and settings give the
same disc. A Whetstone settings string is "WS" plus base64url JSON of the
version (`WHETSTONE_VERSION`, `src/version.ts`) and every option that
isn't its default; bump the version whenever the same settings would give
a different disc.

### How randomfu builds on it

randomfu (`packages/randomfu`) is the randomizer, built on Whetstone. It
loads and writes discs with Whetstone's code, runs its shuffles, then calls
`applyMods` with what they left:

- `scripts` and `quests`: the AI scripts as its AI reroll left them, and
  the quests as its monster shuffles left them, for monster aggression and
  reach to lean;
- `features`: its own blob code (the Hunter's Pact and the Unknown Monster
  quests), as `LoaderFeature`s that link into the same code loader beside
  the mods;
- `late`: its own late patches (the bookshelf guides).

randomfu's `OPTIONS` is its own options followed by `WHETSTONE_OPTIONS`,
under the same keys, so its "RF" settings strings carry Whetstone's options
too and strings made before the split still load. A change to Whetstone
that changes a disc bumps randomfu's `LOGIC_VERSION` with
`WHETSTONE_VERSION`.

## Options

All of them are defined once, in `src/settings.ts` (`WHETSTONE_OPTIONS`),
which the web apps' pages, settings files and settings strings read. No
online play isn't an option: every disc gets it (see "No online play").
Several mods run as blob code on the code loader, which caps received
Guild Cards at 3 (see "Code loader"); the table says which.

| Setting                     | Default  | What it does                                                                                           |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `weapons.elementMotion`     | off      | A Blademaster hit's element grows on a curve with its motion value, status in step, past a threshold   |
| `weapons.elementMotionFrom` | 26       | The motion value they start growing from (10 to 40; lower is stronger)                                 |
| `monsterAi.aggression`      | `off`    | `off`, `more` (attacks ×2, idle ≤ 1 s, recoveries 50% faster) or `relentless` (×4, ⅓ s, recoveries ×2) |
| `monsterAi.reach`           | `off`    | `off`, `less` (takeoffs and burrows ÷3, area and lost-hunter times ×2) or `rarely` (÷8, ×4)            |
| `mods.nodeMap`              | off      | Mark gathering, mining and bug nodes on the area map pictures                                          |
| `paint.stays`               | off      | A painted monster stays on the area map until the quest ends                                           |
| `mods.buttonIcons`          | `psp`    | `xbox`, `nintendo`, `playstation` or `keyboard` draws that set's icons                                 |
| `camera.fov`                | `normal` | How wide the camera sees: `wide`, `wider` or `widest`, ×1.15 to ×1.4 (caps Guild Cards)                |
| `camera.distance`           | `normal` | How far back the camera sits: `far`, `farther` or `farthest`, ×1.15 to ×1.5 (caps Guild Cards)         |
| `camera.tilt`               | `steps`  | D-pad up/down tilt the camera smoothly while held: `slow`, `smooth` or `fast`                          |
| `camera.photoMode`          | off      | L+R+START in a quest stops the game and hides the HUD; the camera flies free (caps Guild Cards)        |
| `camera.target`             | off      | L turns the camera to a large monster: `tap` (once) or `follow` (keeps it in view)                     |
| `quest.endWait`             | `normal` | The wait after a quest: `short` (20 s for every quest) or `instant` (straight to the rewards)          |
| `hud.monsterHp`             | off      | Large monsters' health under your name plate: `painted` or `always` (caps Guild Cards)                 |
| `hud.damageNumbers`         | off      | Numbers at the part each of your hits strikes: `total` or `split` element (caps Guild Cards)           |
| `hud.attackHitboxes`        | off      | Shade every monster attack that can hit right now, over the scene (caps Guild Cards)                   |
| `poogie.enabled`            | on       | A happy pet before a hunt makes its rewards rarer, more so as affection grows (caps Guild Cards)       |
| `elites.enabled`            | off      | Some large monsters are stronger elites, and their quests pay more (caps Guild Cards)                  |
| `elites.chance`             | 12       | Each large monster's chance of being an elite, in percent                                              |
| `quests.keyLabel`           | off      | A yellow ★ in the quest counter's card's top right corner when it shows a key quest (caps Guild Cards) |
| `rewards.sendAll`           | on       | A Send All to Item Box row in the reward screen's menu (caps Guild Cards)                              |
| `smithy.improvePips`        | on       | A pip on each weapon the smithy's Improve can improve now (caps Guild Cards)                           |
| `farm.harvestAll`           | on       | △ at the farm's Item Box sends everything the farm holds to the Item Box (caps Guild Cards)            |
| `pouch.bulkCombine`         | on       | The pouch's Combine asks how many at "Combine?" and makes them all at once (caps Guild Cards)          |
| `monsterList.slainCaptured` | off      | The Monster List's card shows slain and captured counts, from the save, in place of one hunted count   |
| `boot.skip`                 | `normal` | A faster start: `title` (no notice, logos or intro movie) or `village` (straight into the last hunter) |

## Element by motion value

`weapons.elementMotion` (`src/patches/element-motion.ts`) patches
`game_task` and `game_sub` so a Blademaster hit carries its weapon's
element times `(mv / t)^1.5`, `t` being `weapons.elementMotionFrom`, and
its status times `mv / t`, when that's more than 1. In the game, element
and status never depend on the move: a Dual Blades slash (motion value 7)
carries as much as a charged Great Sword slash (110), so slow weapons'
elements barely count. Raw damage already grows in step with the motion
value, so a straight `mv / t` would put an elemental weapon the same share
ahead on every hit; the curve puts it ahead on every swing and further on
the heavy ones. At the default 26, a Great Sword's side slash (36) carries
1.6 times its element, its draw slash (48) 2.5 times, its level 1 to 3
charges (65, 80, 110) 4, 5.4 and 8.7 times; the Hammer's golf swing (100)
7.5 times, a Long Sword or Lance hit up to 1.9 times, and Dual Blades and
Sword and Shield hits (6 to 25) stay as they were. Against a monster's
weak element (median over large monsters' best cut part, 410 element
against a raw weapon with a quarter more attack at rarity 8), that's a
Great Sword about 15% ahead on a side slash, 21% on a draw and 42% on a
level 3 charge, where the game has it 13% behind. An element has no cap;
status is capped at 2550 shown a hit, and still applies only on every third
swing, as in the game, now with more on a heavy one.

What it found (EU and JP; the patch has the details): each melee swing
builds an attack in `game_task` that copies the move's row from the motion
value table (EU 0x09BFBEF8; the motion value at `+0x1E`), then asks an
EBOOT getter (EU 0x088DA398) for the equipped weapon's fire, water,
thunder, dragon and ice, and every third swing for poison, paralysis and
sleep, putting the value in `+0x2A` (u8, a tenth of what's shown) and a
flag in `+0x28`. Then it rolls affinity, a critical multiplying the motion
value by 1.25. When the attack hits a monster, game_sub's hit function (EU
0x09C43458) turns `+0x2A` into a float for the attack's element and
multiplies it by the hit part's elemental hitzone over 100 (and a factor
not yet traced), summed into the hit's element damage; no motion value
enters into it. Status goes to the monster's buildup counters (EU
0x09C44F08) as it is.

The patch scales an element in game_sub, as the float (`value × f × √f`,
`f = mv / threshold`, by the motion value before any critical, worked back
from the critical flags in `+0x2B`, so affinity leaves the element alone as
in the game, and before the 1.35 the swing builder then applies in one hunter
state, probably the Long Sword's spirit, which marks the attack `+0x31` 0 and
`+0x32` 0x12), for a weapon's motion row only (types 0 to 3 at `+0x1F`: the
hit function deals type 0xB as fixed damage, its `+0x1E` the damage), when the attack's
owner is a hunter with a Blademaster weapon (`+0x4E9` is 5, the getter's
own test). It scales status in game_task: it rewrites the affinity code with
integer maths (the same results for every input) and uses the room it
frees to scale `+0x2A` first, `min(255, round(value × mv / threshold))` by
the motion value before any critical, when the attack has no element. Both
are checked against the game's code in `packages/randomfu/test/element-motion.test.ts`.
Element skills multiply first, as before. Kicks, Felyne comrades and Gunner
shots don't change. Seen in game (EU, the patch written into RAM, a thunder
220 Great Sword): each hit's element damage was `22 × (mv / 26)^1.5 ×
hitzone`, as the tests have it (a level 2 charge on a 25% part 29 against
the game's 5), and the monster lost raw plus element (`+0x2E4`, 145 HP for
three hits). With every swing made a critical (a test-only change), a
critical's element was a plain hit's (a level 2 charge on the same 25% part
29.69 either way) while its raw still grew by 1.25. Negative affinity and
fixed-damage (type 0xB) attacks are checked only in the tests.

## Monster aggression

**Monster aggression** (`monsterAi.aggression`, `makeMonstersAggressive` in
`src/patches/monster-ai.ts`) leans the monsters' AI choices towards attacks:
the weighted choices in their AI bytecode that randomfu's `monsterAi.branches`
rerolls (randomfu's README, "Monster behaviour"; read with `readScripts`,
the same file).

- Which entries lead to attacks can't be read without a disassembler, so it
  is data (`src/patches/monster-attacks.ts`), worked out from the EU disc
  as `docs/monster-ai.md` describes: for each script file, the choices that
  mix attacks with other moves (2,156 in 17 files), by their index in
  `findChoices`, with one letter per entry.
- An attack spawns a hit that knocks the hunter back or stuns; walking
  contact (no knockback, no stun) doesn't count, and em54's aura object
  (Kushala Daora, Teostra, Lunastra) does. Choices with an entry nobody
  could classify are left alone (38, mostly Great Thunderbug, Fatalis, the
  Vespoids and Bulldrome), as are the 2 that Hermitaur and Ceanataur share
  but disagree on.
- Attack entries' weights are multiplied by 2 (`more`) or 4 (`relentless`)
  and the choice is scaled back to 32, every possible entry keeping at
  least 1. On a randomfu disc it runs after `monsterAi.branches`, on the
  rerolled weights.
- A file is changed only if its choices and their vanilla weights hash to
  what the data was made from; the EU and FUC discs both match.
- Shorter pauses: every large monster stands in its idle between moves at
  most 30 frames (`more`, one second) or 10 (`relentless`), as blob code on
  the code loader (`src/patches/aggression.ts`, `blob/aggression.c`, on the
  shared monster boosts of `blob/monsters.c`). The idle (action group 0
  playing motion record 1, every species' looping stand) otherwise runs to
  the end of its loop before the AI goes on: Tigrex's is three seconds,
  then it turns to its next move. The blob sets the monster's "think now"
  flag (`+0x4B5`) once the cap is up, which is what the idle sets when its
  loop ends. No flag for "has seen a hunter" was found, so a monster that
  rests while it wanders rests less too. It goes in where `game_task`'s AI
  gate and AI match the EU code (EU and FUC do); elsewhere the odds still
  change and the report says the pauses don't.
- Quicker recoveries and turns: once a large monster's move is past its
  last hit (or roar, wind or tremor), the rest of it plays 50% faster
  (`more`) or twice as fast (`relentless`); a turn (a short motion whose
  only hits are light contact) plays faster all through. The monster
  update sets its animation speed every frame from a percent bonus at
  `+0x769` (u8) that some moves set for themselves (Tigrex's charge); the
  blob raises it for the rest of the move, keeps a move's own bonus where
  it's faster, and puts the game's back after. Where each move's last hit
  ends is data from the EU disc (`src/patches/monster-motions.ts`, from the
  attack sweep the site's attack viewer uses), by species and motion
  record. Moves whose hits the game's code spawns (Tigrex's charge) and
  walks aren't listed, so they run as they did. It goes in where
  `game_task`'s speed code matches the EU code; elsewhere the report says
  so.

Tried in game on the EU disc at four times: Giadrome was clearly more
aggressive. Species with walking contact and the elder dragons haven't been
played. The shorter pauses were played against Tigrex on the EU disc at
`relentless` (better, but its turns and some recoveries were still slow,
which the quicker recoveries are for). With the quicker recoveries too,
Tigrex's turns felt much better.

## Monster reach

**Monster reach** (`monsterAi.reach`, `keepMonstersInReach` in
`src/patches/monster-ai.ts`) makes large monsters spend less of the fight
out of reach: fewer flights and burrows, and less wandering off.

- Which entries take a monster into the air or underground is data
  (`src/patches/monster-reach.ts`), worked out from the EU disc as
  `docs/monster-ai.md` ("Out of reach") describes, in the same form as the
  attack data: 534 choices in 5 files that mix taking off or digging in
  (`L`) with other moves, and 3 of Fatalis's that mix landing (`B`) with
  staying up. That's Rathian, Rathalos and their kin (306), Diablos and
  Monoblos and their kin (145), Yian Kut-Ku and Gypceros and their kin
  (42), Fatalis and its kin (40) and Chameleos (1).
- `L` entries' weights are divided by 3 (`less`) or 8 (`rarely`) and `B`
  entries' multiplied, and the choice is scaled back to 32, every possible
  entry keeping at least 1. On the EU disc that takes Rathalos's chance of
  taking off, where a choice offers it, from 22% on average to 12% (`less`)
  or 8% (`rarely`), and Diablos's of digging in from 36% to 17% or 8%. It
  runs after randomfu's `monsterAi.branches` and `monsterAi.aggression`, on their
  weights, so it stacks with both; an entry that is both an attack and a
  takeoff is leaned both ways.
- A flight or a burrow, once started, is a fixed sequence in one entry, and
  no choice a flying monster makes mixes landing with staying up (outside
  Fatalis's three), so flights and burrows get rarer, not shorter.
- Every species that's a large monster in some quest (after
  randomfu's `questMonsters` changes, on a randomfu disc) fights in each area for longer before it leaves
  mid-fight. While it's aware of a hunter, its `+0x550` (s16, frames)
  counts down, and at 0 it leaves the area even while engaged (seen on the
  EU disc in PPSSPP: a Yian Kut-Ku took off and flew to the next area the
  moment it ran out, with the hunter right there). Entering an area sets it
  from the species' area-time list (`emChunk` `+0x1C0`: `{ s16 stage, s16
frames }` pairs, then `{ -1, default }`), plus 0 to 3 minutes the game
  picks. Most species stay 5 minutes by default, 1 to 10 in listed areas
  (Lunastra and Teostra nearly 18 in one of the Tower's). Every value is
  multiplied by 2 or 4, at most 27,367 frames (about 15 minutes), so the
  added minutes can't wrap the countdown, and never lowered. The 23 lists
  sit in `game_task.ovl` or the family's `emNN.ovl` (no other overlay is
  tried, as they all load at the same addresses); species that share one
  change together. A stage above 1000 gets none of the added minutes, so
  its time is capped at 32767 instead.
- The same monsters keep after a hunter they can't see for longer:
  its `emChunk`'s `+0x146` (s16, frames) is the time it stays engaged once
  the hunter is out of sight, after which it decides to walk or fly off to
  another area. It's 1800 frames (60 s) for most, 900 for the dromes and
  2700 for Yian Garuga; `less` doubles it and `rarely` quadruples it (at
  most 32767). Elites change with their species.
- A file's flights change only if its choices and their vanilla weights
  hash to what the data was made from; the EU and FUC discs both match. The
  area times and engagement time change on any disc where they read.

## Nodes on the map

**Nodes on the map** (`mods.nodeMap`, `src/patches/node-map.ts`) draws a
3x3 marker for every gathering (green), mining (orange) and bug catching
(yellow) node onto the map screen's textures (`cockpit/map<N>.tmh`, 160x160,
8-bit swizzled, RGBA8888 palette). Positions come from the quests' node
tables through the map screen's own formula (mhfu-extract README, "Area
maps"), so they need the EBOOT and the EU or JP disc (JP's table addresses
were found by searching for the EU tables' contents). A texture is shared by every
quest on the map, and nodes sit in the same places in all of them, so a
texture gets the union. The markers use palette entries the art leaves
unused (every map has over 200), so nothing else recolours and file sizes
are unchanged. Checked in PPSSPP on the Snowy Mountains map.

## Button icons

**Button icons** (`mods.buttonIcons`, `src/patches/button-icons.ts`)
redraws the PSP's ○ × △ □ L R START SELECT, wherever the game draws them
(its text's `~B` icons and the HUD), as another set's. `xbox` is the buttons
PPSSPP maps them to by default: B A Y X, LB RB, Menu and View. `nintendo` keeps
the Xbox's places with a Switch's letters (A ○, B ×, X △, Y □) and L R + −.
`playstation` draws coloured shapes (blue ×, red ○, pink □, green △), L1 R1,
Options (≡) and a touchpad rectangle. `keyboard` draws outlined keycaps with
PPSSPP's default keys: X ○, Z ×, S △, A □, Q W, Space (START) and Enter (SELECT); its keys are
drawn from scratch (outline 1, white top, 200 shade, 148/117 front, letters in
73 grey) rather than on the painted-out button, and take the nearest palette
entries too. START and SELECT exist only on the HUD sheet. They are sprites 50-58 of the HUD
sprite table (EU 0x089391A8, 12-byte rows of u16 u, v, w, h, texture, set),
all on texture 0x8001: the second image of `system/resides.tmh` (256x256,
8-bit swizzled, RGBA8888 palette; JP file 18, EU files 30-34, one per
language). The stick (56) and d-pad (59) stay. `system/demo.tmh`'s fourth
image (JP 17, EU 25-29) repeats the faces, L and R from (104, 144) in the
same art; what draws those isn't known, and they're redrawn too. Every
palette entry of the HUD sheet is in use, so nothing is added: each button
is the PSP one with its symbol painted out in its own body colour, and the
letters take the palette's nearest green, red, blue and yellow. A sheet is
drawn on only if its icons hash to the EU or FUC art (`PSP_ART`). The EU
file list's best fit for the system files (`filelist-eu.json`) names EU
33 and 34 `connect` and `demo`, but both hold `resides.tmh`, like 30-32.
Not yet seen in game.

## Monster health

`hud.monsterHp` (`painted` or `always`) draws a short gauge for
each large monster in the hunter's area, on the left edge under the name
plate: up to three, stacked. It's drawn by the HUD's own routines, so it
looks like the stamina gauge: the same frame, its end cap on both ends (the
left one mirrored), a 2-pixel fill in the hunter's health red, and
a yellow trail that drains a pixel a frame after a hit, as the hunter's
red recoverable health does. It runs as blob code on the code loader
(below), so it caps Guild Cards at 3. Its code goes on every disc, off or
not: the option picks the mode a disc starts in, and the START menu's
Whetstone entry (The START menu entry, below) changes it in game.

- **`painted`** shows a monster's gauge while the map shows its icon: the
  game's own test, so from a Paintball hit until the mark wears off (18000
  frames).
- **`always`** shows every large monster in the area.

A monster whose size makes a crown gets one over its gauge's right end
(on the end cap, centred on the bar), whenever the gauge shows: the HUD's
own gold or silver crown, and for a mini crown the gold one drawn smaller
(the HUD has no mini crown). It's the crown the Guild Card would record if
the monster were killed or captured now: its size against its species'
entry in the crown table, so a subspecies uses its base monster's
thresholds (mhfu-extract's README, "Monster size"). On a disc where the
crown code isn't found, the gauges show without crowns.

A captured monster's gauge goes once it's captured, though it lies asleep
with health left until the quest ends. On a disc where the capture code
isn't found, it keeps its gauge.

What it found (EU and JP; `src/patches/monster-hp.ts` has the details):

- A monster is an entity like the hunter: species `+0x1E8`, HP `+0x2E4`
  (s16), max HP `+0x41E`, area `+0x29A`, and bit 0 of `+4` set while it's
  active in the hunter's area. A Paintball sets `+0x3D0` and a timer at
  `+0x3D2`.
- `game_task` keeps every monster of the quest, large and small, in a
  manager behind a global (20 pointers at `+0x1220`). One that leaves the
  area stays in it, so the gauge checks the active bit and the area; a
  dead one's HP is 0.
- A species is large when its multiplier set in `game_task`'s monster
  table (`+0x14F`) isn't 0.
- The HUD draws the hunter's gauges in one EBOOT function, only when they
  show (not in cutscenes, nor with the HUD hidden). The monster gauges are
  drawn right after it, from a hook on that call, so they show and hide
  with it.
- A monster's size in percent is a u16 at `+0x274`. `game_task` copies it
  from the quest's monster record (`+0x30`, where the size roll puts it)
  when the monster spawns, scales the model by it, and a kill or capture
  writes it to the quest's largest and smallest records (EBOOT
  `0x0886AC48`). Read live on EU: a Yian Kut-Ku's record and entity both
  held 98.
- The Guild Card's check (EU `0x08853F84`) gives a mini crown at most the
  entry's `mini`, gold at least `gold`, else silver at least `silver`. The
  blob finds the crown table through that check and the emID groups
  through their lookup (`0x0884FC74`); both match once on EU and JP.
- The quest object (`*0x08A62C7C`) keeps a 60-byte record per spawn, which
  an EBOOT lookup `(quest, monster)` (`0x0886DD3C`) finds or returns 0. The
  capture code (`0x0886AD58`, called from 7 places in `game_task`) sets 8
  in the record's state (`+0x2E`, s16), and the gauge hides a monster
  whose record has it. The blob finds the lookup through the capture code
  and the global through `game_task`'s calls to it; both match on EU and
  JP.
- The HUD texture (0x8001, in RAM while in a quest) has a silver and a gold
  crown, 16×12: sprites 31 and 32 of its sprite table. Seen in EU's
  texture and in game; JP's sprite table has the same records, but its
  texture wasn't looked at.

Tried in PPSSPP on EU: the gauge tracks damage, goes when the monster
dies or leaves the area, and `painted` shows it once a Paintball hits. Not
yet tried: JP in game, the gauge going on a capture, and two large
monsters in one area.

## Camera

`camera.fov`, `camera.distance`, `camera.tilt` and `camera.target`
(Modifications → Camera in randomfu's web app), and the Field of view, Camera
distance, Camera tilt and Target camera settings in Whetstone's START menu entry (The START menu entry, below). The option picks what a disc starts with;
the menu changes it in game, and the save keeps it. Like the HUD options,
the code goes on every disc, so every disc caps received Guild Cards at 3.
Played on EU at `wider` and `farther` (PPSSPP, 2026-11-21): wider and
further back in the village and in quests, through area changes and a save
reload, with no popping at the screen's edges, and both settings changed
from the START menu. Smooth tilt was played on EU (PPSSPP, 2026-11-21), with
`wider` and `farther`: smooth while held, as the game's left and right
turns are.

What the game does:

- Its renderer (EU `*0x089CBBE4`) holds the near and far planes
  (30, 65000), the aspect ratio and the vertical field of view in radians
  (+0xC, 50°: 79° across). The camera eases +0xC towards a target, and
  the projection update (EU 0x08815348, JP 0x08816108) rebuilds the
  projection (+0xC00) and its inverse (+0xD00, which the frustum comes
  from) only when +0xC differs from +0x10, the angle it was last built
  with.
- The camera follows the hunter with presets from a block the renderer
  points to (+0x1BC). Each stage file (`stage/*.pac`, 239 on both discs)
  brings one, in pac entry 4 at +0x50; stages whose data says so use the
  EBOOT's own (EU 0x08933AE0). A block is the field of view, seven zeros,
  then five presets of `{?, eye height, distance, 0, look height, 0, ?, 0}`.
  On EU and JP, 219 stage files' blocks are 50° and 20 are 50° or 51° to a
  few bits (st012's is 0x3F63DEC4); 23 have no entry 4.
  The usual quest camera is eye 270, distance 490, looking at 170 (above
  the ground under the hunter). The camera reads the block's field of view
  once, when it's set up, and the presets as it follows, so writing them
  moves the camera at once; an area change loads the block again.
- The presets are the steps D-pad up and down tilt the camera through
  (seen live on EU). The renderer keeps the step at +0x14 as a level: 0 is
  the highest (preset 4: eye 400, distance 220, look 195, 45° down), then
  presets 0 (36°, only 160 back), 1 (the usual, 11.5°), 2 (a little
  upwards) and 3 (eye 60, look 210: 18° up). Down moves a level higher, up
  a level lower, one a press, however long it's held; a level written to
  +0x14 sticks, and the camera eases towards its preset. The game sometimes
  uses a camera that isn't in the block (EU 0x08933BE0: eye 280, distance
  500, look 170), seen for a few seconds walking towards a monster; what
  picks it isn't known, and Whetstone leaves it alone. 258 stage blocks were
  read: 201 have the EBOOT's presets with preset 2's first word -501.3, 50
  the EBOOT's with preset 4 200 back, and preset 1 is 270, 490, 170 in all
  but st227.

How Whetstone does it (`src/patches/camera.ts`, `blob/camera.c`):

- **Field of view:** the projection update's first nine words record the
  angle in +0x10 as the game has it (so it still rebuilds only on a
  change), multiply it by a float kept in the function's last word, and
  tail-call the perspective builder. Every view the game builds that way
  widens the same. The disc sets the float to its option's scale, so it
  works without the blob too; the blob sets it to the save's choice and
  zeroes +0x10 to have the projection rebuilt. The code never changes at
  run time.
- **Distance:** once a frame, on the pad hook (the village too), the blob
  checks the block the camera uses. A block it hasn't scaled, or one the
  game loaded again, is copied, then written back with each preset's
  distance, and its eye's height above the look height, scaled, so the
  camera moves back down the same line. A changed setting scales again from
  the copy, and words the game writes over the block replace the copy's.
  The blob marks a block it scaled, in the last of the zeros after its
  field of view, with the choice: it loads again after every save load,
  knowing nothing, and works the game's values back out from the mark
  rather than scaling twice. It writes nothing unless the block has a
  block's shape: an angle between 0.3 and 1.6 radians, the zeros, and
  distances between 0 and 5000.
- **Tilt:** smooth tilt writes every preset as one camera: preset 1's
  distance from what it looks at (times the distance's scale, so the two
  are one transform of the same copy) and look height, at a pitch the save
  keeps (`camera_pitch`, the sine × 32000). It puts the game's level back on
  the middle one each frame, so every step looks the same and the game's
  own step is the input. A step of one level, in the frame of a press of up
  or down or the frame after (the game steps after the pad hook), tilts the
  camera that way: for a frame if the button is already up, and on while
  it's held and the pad object's input lock (+0x17, shops and dialogues)
  stays off. A level the game moves by more, or while the button was held
  all along (an area loading), only goes back to the middle. The game
  doesn't step while a menu has the D-pad. It turns at 30, 50 or 80° a
  second, timed by `sceKernelGetSystemTimeLow` (a gap over 0.1 s counts as
  1/30 s), between 55° down and 20° up, with the eye kept 40 above the
  ground under the hunter, and starts at the angle of the step the game was
  on. A tilted block's mark has a second bit, and preset 1's eye height and
  distance as the game had them go in two more of the zeros after the field
  of view (words 5 and 6). The save keeps a copy of the block's presets as
  the game had them, and the block's address (`camera_block`,
  `camera_presets`): a blob loaded again takes that copy when it's the
  block's and preset 1 agrees with what the block kept, else preset 1 from
  the block and the others from the EBOOT's own presets (`game_presets` in
  `blob/camera.c`), exact again once the game loads the block again; the
  pitch comes from the save or, if it has none, from the block. The level
  at +0x14 (`rf_camera_level`) was seen in EU's RAM; the code that steps it
  and picks the preset from it, in the EBOOT and game_task, is the same on
  the US and JP discs, struct offsets and all, so tilt is on every disc.

### Target camera

`camera.target` turns the camera to face a large monster from behind the
hunter, as the newer games' target camera does. In MH4U and Generations
Ultimate, with Target Cam on, L turns to the monster and L twice resets
the camera behind you; Rise locks on with a press of R3 and cycles with the
next. Whetstone keeps the game's own buttons:

- **L** faces the target: the large monster in the hunter's area nearest
  the middle of the screen (or the one already targeted). With no large
  monster there (or none standing), L is the game's: behind the hunter.
- **L twice** within 0.4 s is the game's L, behind the hunter.
- **Hold L, D-pad left or right:** the next large monster to that side.
- **D-pad left or right** alone turns the camera as ever and lets go.

`tap` turns until the camera faces the target (within 1.4°, 3 s at most),
following it as it moves, then leaves the camera; `follow` keeps facing it
until L twice, a D-pad turn, or the target leaves the area or falls.

While the camera has a target it's marked on screen with a small reticle,
and for 0.6 s after, fading: four amber corner brackets, 20 pixels square
at any distance, in the HUD's translucent fill on the HUD hook. It sits
where the monster stands, raised to its body's height, the middle of its
joints' heights, eased slowly (4% a frame), so it holds still while the
monster swings its head and tail. The START menu's Target mark setting
turns it off (`camera_mark` in Whetstone's save data). A monster's joints
are `+0x190` (0x250 bytes each, the world matrix at +0xD0) and their count
is the u32 at `+0x1A4` (48 for a Rathalos, 16 for a Velocidrome, in
savestates). An arrow over the monster and a ring at its middle were tried
too, and a reticle round the box its joints cover, which wobbled with
every move.

The code goes on every disc with the START menu entry (`off` starts it off),
EU and JP. Played on EU (PPSSPP, 2026-11-22): Tap, Follow and the reticle.
JP builds but hasn't been played; nor has it with photo mode.

What the game does (EU; JP's code is the same words):

- The follow camera (EU 0x08886E50) keeps its yaw in the renderer's
  +0x150 sub-object: +0x80 the yaw it turns to, +0x82 the yaw it has (s16,
  the angle of the eye seen from the hunter, atan2(x, z) in 65536ths of a
  turn: behind a hunter facing f, its u16 at +0x1F4, is f + 0x8000), and
  +0x84 and +0x86 the buttons it sees, held and pressed (the renderer's
  +0xA70 and +0xA72, cleared in menus).
- Each frame whatever turns the camera sets +0x80: L's recentre (the
  renderer's +0xA81, set from `game_task` by EU 0x08813188) behind the
  hunter, D-pad left and right ±0x47E a frame, a forced view. Every path
  then meets one ease (EU 0x08887614, JP 0x08887318) that moves +0x82 a
  quarter of the way.
- Monsters are in the manager's 20 slots (`*rf_monsters + 0x1220`); a
  monster's +4 bit 0 is set while it's active in the hunter's area, +0x29A
  is its area (the hunter's is at the same place), +0x1E8 its species and
  +0x2E4 its HP. A species is large when its stat set in `game_task`'s
  table (+0x14F of its 0x1D0-byte entry) isn't 0.

How Whetstone does it (`src/patches/target-camera.ts`,
`blob/target-camera.c`): the ease's read of +0x80 becomes a call through
game hook 8's shared stub, which the blob answers with the yaw to the
target (or lets the game's read go on). The game then turns to the monster
as smoothly as it turns behind the hunter, and nothing of the game's
fights it: the recentre and the D-pad still write +0x80, and the blob
reads the buttons the camera sees. The game's own read is two words in the
projection update that the field of view patch leaves unreached, so this
always goes in with the camera's EBOOT patch.

## Photo mode

`camera.photoMode` (Modifications → Camera in randomfu's web app), and the Photo
mode setting in Whetstone's START menu entry (The START menu entry, below). In a
quest, hold L and R and press START: the game stops as it does for its own
pause, but with no dimming and no PAUSE box, the HUD and Whetstone's HUD
drawing go, and the camera is the player's. The stick turns it round what
it looks at (left and right orbit, up and down pitch), the D-pad moves it
along the ground, △ and × raise and lower it, □ and ○ bring it nearer and
further, L and R narrow and widen the field of view, and SELECT puts it
back where it started. START again ends it: the camera, its field of view
and the game go back exactly as they were, and the buttons stay cleared
until they're all let go, so the START doesn't open the menu. The rain stays
still round the camera, as everything else does. The camera
goes through walls and the ground. The option picks what a disc starts
with; the menu changes it in game, and the save keeps it (`photo_mode`).
It's blob code, so it caps Guild Cards at 3. It doesn't start in the
village, online, with a menu open, while the game is paused or the pad is
locked (shops, dialogues).

Tried on EU in PPSSPP (2026-11-21), with input sent through the debugger:
entering stops the quest's clock, hides the HUD and doesn't dim; the stick orbits round the hunter as the scene draws again; SELECT
resets; START ends with the eye back to the bit and the HUD back, and the
menu stays shut; the game's own pause still dims. Not yet played by hand,
with a monster in view, mid-attack, or on JP (it builds; its code is found
by the same signatures).

What the game does (EU addresses):

- The save's byte `+0x6AF1A` is the pause. `isPaused(save)` (EU
  0x088567B4) is it not being 0; `pause` (EU 0x088567C8) sets it to 1 and
  stops the sound (single player only: the system's flag at
  `*0x08A631A0+0xF7A57C`); `unpause` (EU 0x0885683C) sets it to 4 and
  starts the sound again, and `game_task` clears the 4 the next frame.
  `noPause(save, mode)` (EU 0x0884FA5C) checks the game mode (`+0x2E`).
- `game_task`'s frame (EU 0x09A62640) runs the play update (hunters,
  monsters, and the camera's update, EU 0x08812BD0) only when not paused.
  Paused, it runs the HUD's update (so hook 0 still runs) and the dimming
  (EU 0x0885658C: the screen in black at alpha 0xA0), and skips the quest's
  frame (its clock). The HUD's update skips its layers 9 (the gauges, and
  hook 1) and 11 (the map, the item bar) when paused; layer 10 is the menu
  and the PAUSE box. Paused, ×, ○ and START unpause, and START opens the
  menu.
- The camera's update copies its eye and target to the renderer's (EU
  `*0x089CBBE4`) `+0x20`/`+0x30` and `+0xB40`/`+0xB50` and its field of view
  to `+0xC`; `look(renderer)` (EU 0x08815384) rebuilds the projection if
  `+0xC` changed and the view (`+0xB80`) from `+0xB40`/`+0xB50`. While
  paused nothing writes them, and the frozen scene draws from whatever view
  they hold.
- The stage's ambient effects have a manager (EU `*0x09A4F060`, set up at
  EU 0x088C3138) whose update (EU 0x088C33E8, in the play update) runs each
  effect's (a list at +0xA2E0, next at +0x14, the update at vtable +0x1C).
  The rain is one (type 0xD, at +0x18): a texture on a mesh at the camera.
  Its update copies the camera's position to +0x50 and scrolls the
  texture's layers (+0x7C and +0x88 on, at speeds from a table in its
  definition), which is the rain falling. Paused, the rain stays where the
  camera was, so turning away from there leaves none in view. Running its
  update with the speeds at 0 (tried live) keeps it round the moved camera
  and still. In a rainy swamp area the list held that and two animated
  textures (type 0x13, frame counters); the hunters', monsters' and attacks'
  effects are other managers'.

How Whetstone does it (`src/patches/photo.ts`, `blob/photo.c`): on the pad
hook, the blob calls `pause`, then sets the byte to 2. The dimming's first
eight words are patched to test the byte for 1 instead of calling
`isPaused` (the frame set-up rearranged round the test), so 2 pauses
without dimming; with the byte at 2 the game's own unpause buttons do
nothing, as the HUD tests for 1. Each frame the blob clears the pad's
buttons and centres the stick, sets the pad's input lock (`+0x17`), moves
its own camera from the real buttons and writes the four vectors and the
field of view before calling `look`, then runs the update of each ambient
effect of the rain's type and puts its scroll (+0x64 to +0x94) back after,
so the rain follows the camera without falling; the other ambient effects
aren't updated. Ending writes back the 16 words and the field of view it
kept, calls `look`, puts back the camera angles the rain's effects keep
(+0x60, so the game's next update doesn't scroll them by the photo
camera's turn), lets the input lock go, and calls `unpause`; the buttons
stay cleared until every one is up. If the game leaves the pause by itself
(the byte isn't 2), or the renderer or pad goes, photo mode ends too.

## Quest end

`quest.endWait` (Modifications → Quest end in randomfu's web app), and the After a
quest setting in Whetstone's START menu entry (The START menu entry, below): how
long the game waits once a quest is completed or runs out of time, before
the reward screen. `normal` is the game's own; `short` waits 20 s after
every quest, with the game's "Returning to village in 20 secs." message, which is
time to carve one monster; `instant` goes straight to the rewards, with no
time to carve. The option picks what a disc starts with; the menu changes it
in game, and the save keeps it. It is a change to the EBOOT's code that
works without the blob; with the blob (as for the camera, every disc) it is
also a setting. Played on EU at `short` and, from the menu, `instant`
(PPSSPP, 2026-11-21): a hunt completed with carving in the 20 s, a quest
failed by running out of time, and the reward screen and the trip back to town after each. JP builds
(the code is found by its signature) but hasn't been played.

What the game does (EU addresses; JP's code is the same, 8 bytes earlier,
JP 0x0886B31C):

- The quest object (`*0x08A62C7C`; EU 0x09A05DC0 in a quest) runs a state
  machine once a frame (EU 0x0886B0E0, from `game_task`): byte +0 is the
  state, +1 the step within it, and +0x710 a countdown in frames (30 a
  second). +0x10 is the time left (90000 frames for 50 minutes).
- State 0 is the hunt. A quest that is completed or runs out of time goes
  to state 1 (seen for both). One failed by fainting (byte +6 set to 6, by
  the code at EU 0x0886F0F0) doesn't: state 0 returns -1 and the game goes
  back to town its own way, so Whetstone doesn't change it. State 1:
  - step 0 (EU 0x0886B324) shows the end message and sets the countdown to
    150: the 5 s "Quest Complete" banner;
  - step 1 counts it down, then picks the wait from the quest's flags
    (+0x28): without bit 0x80000, 1800 frames (a minute) and "Returning to
    village in 1 min."; with it and without bit 0x200000, 600 (20 s) and
    "Returning to village in 20 secs." (gathering quests); with both, 600
    or 1800 as EU 0x08872B40 says. The messages are IDs 0x14 and 0x15 from
    the end messages' ID table (EU 0x089AC5A0). A Treasure Hunting quest
    (flag 0x10) ends with "Treasure Hunters Quest Time Up!" (ID 0x2E) and
    has its own message, "Deliveries possible for 20 secs!" (ID 0x1E): its
    wait is the time to deliver what the hunter carries;
  - step 2 counts that down, then state 2 waits for every hunter of the
    party (+0x110, at most 3 minutes; in single player at once) and the
    reward screen follows.
- The hunter keeps control through both countdowns: that is the time to
  carve and gather. Cutting both to a frame live (writing +0x710) went
  straight to a working reward screen.
- The start of a quest has nothing like it: from departing to having
  control in base camp is about 4 s of loading and a fade, with no timer or
  intro behind it, and the trip back after the reward screen is loading
  too. Whetstone doesn't change them.

How Whetstone does it (`src/patches/quest-end.ts`, `blob/quest-end.c`):

- Steps 0 and 1 are rewritten in place. Step 0 loads the message's ID in
  one word less, which leaves room to load the banner's frames from the low
  half of a data word. Step 1 takes the wait from the word's high half when
  it isn't 0 (with the 20-second message; a wait of 1 with none) and
  otherwise picks as the game does. Treasure Hunting quests always get the
  game's choice, so their deliveries keep their time. The choice is
  rewritten in fewer words, so the data word takes the place of a `li`
  only the old choice reached (EU 0x0886B3FC, JP 0x0886B3F4). Normal is 150 and 0, Short 150 and 600,
  Instant 1 and 1.
- The disc sets the word to its option's choice; the blob sets it to the
  save's at every load and when the setting changes. The code never
  changes at run time.

## Damage numbers

`hud.damageNumbers` (`total` or `split`), after World's damage numbers:
each of your hits on a monster, large or small, pops a number at the part
it struck, in the game's own font, made bold (printed twice, a pixel
apart, with its glyphs stretched an eighth wider) over a black drop
shadow. It lands big in a flash (bright yellow, or white for a coloured
number) for three frames, settles to its size in a few, then rises and
shrinks away in a little over a second; a weak point's number shakes as
it lands. Bigger hits get bigger text. The number is the health the hit
takes: raw and element after the monster's defense multiplier. It's
white, or orange on a weak point: a melee hit whose hitzone × sharpness
is 0.45 or more (the test the game itself uses to pick its bigger hit
sparks), or a shot at a part whose shot hitzone is 45 or more. `split`
shows the element's share as a second, smaller number beside it, in its
colour: red fire, blue water, yellow thunder, cyan ice, magenta dragon.
Other hunters' and Felynes' hits show nothing. The numbers are drawn with the HUD, so they
hide with it, under the map and the item bar. It runs as blob code on the
code loader (below), so it caps Guild Cards at 3, and only reads game
state. Like monster health, its code goes on every disc.

The option picks the mode a disc starts in, and the START menu entry
(below) changes it in game.

What it found (EU, and the same code on JP; `src/patches/damage.ts` and
`docs/code-loader.md` have the details):

- `game_sub` works out a hit in one function: raw (the attack's power ×
  motion value × hitzone × sharpness × the hunter's attack multiplier)
  plus the element's share, added to the monster's damage for the frame at
  its part (`+0x3B8`, an s16 per part). The monster's update takes that
  times its defense multiplier (`+0x384`) off its HP. A game hook on the
  call right after (the status buildup) hands the blob the hit.
- A melee hit's quality (hitzone × sharpness: 3 at 1.0, 2 at 0.45, then 1
  and 0) is written to the attack (`+0x74`); the attack's `+0x28` flags
  say which element it carries.
- The number goes at the hitbox's joint (a game function gives its world
  position), put on screen by the game's projection with the camera its
  name tags use, and printed with the code-aware print at the size set in
  the printer (`+0x12C`, `+0x12D`).

Not yet tried in game: any of it. Then, in particular, the text's size and
spacing at sizes other than the game's 14 pixels, how the bold and the
black shadow (`~C01`, unused on the HUD by the game) look, the clock's rate
(numbers age by the quest clock, taken as about 30 ticks a second).

## The START menu entry

START opens the game's menu,
in a quest or in the village, and its last entry (on its second page, where
the game keeps a greyed `--------` placeholder) is now **Whetstone**: a window of settings
that can be changed in game, drawn like the game's Options with the
setting's help to its left: monster health (Off, On map, Always), damage
numbers (Off, Total, Split), attack hitboxes (Off, On), field of view
(Normal, Wide, Wider, Widest), camera distance (Normal, Far, Farther,
Farthest), camera tilt (Steps, Slow, Smooth, Fast), the target camera (Off,
Tap, Follow), its mark (Off, On), the wait after a quest (Normal, Short,
Instant) and photo mode (Off, On).
Up and down pick a setting; left, right and × change it; ○ goes back to the
menu and START closes it. The choice is kept in Whetstone's save data, so it
lasts across saves and holds over the disc's mode, on discs from other
seeds too (`monster_hp`, `damage_numbers`, `hitboxes`, `camera_fov`,
`camera_distance`, `quest_end`, `camera_tilt`, `camera_target`,
`camera_mark` and `photo_mode` in `struct rf_save_data`). Other
Modifications can add their settings to the same window
(`rf_add_setting`, `blob/menu.c`).

What it found (EU, and the same code on JP; `src/patches/menu.ts` and
`docs/code-loader.md` have the details):

- The quest and village START menus are EBOOT code on the HUD object (12
  entries in pages of six, and 14 in pages of seven), the last a placeholder
  that's always greyed and refused. Game hook 8 takes their label, choose,
  run and draw calls for Whetstone's entry (`docs/code-loader.md`).

The menu entry has been played in PPSSPP on EU, in the village. The game's
help bar for the placeholder is empty, so the entry clears it
(`docs/code-loader.md`).

## Attack hitboxes

`hud.attackHitboxes` shades, in translucent red, every monster attack that
can hit the hunter right now: each sphere and capsule filled in where it
falls on screen, with the HUD's translucent fill in strips 2 pixels tall.
It shows exactly what the game tests against the hunter, frame by frame,
so an attack's shading appears when it becomes able to hit and goes when
it stops. (A first version drew opaque red outlines with the HUD's line
routine; they were too loud.) It runs as blob code on the code
loader's HUD hook (below), so it caps Guild Cards at 3, and hides with the
hunter's gauges. Like monster health, its code goes on every disc: the
option picks whether a disc starts with it on, and Whetstone's START menu
entry (above) turns it on or off in game.

What it found (EU and JP; `src/patches/hitboxes.ts` has the details):

- Attacks are attack objects in a list behind a `game_task` global. Each
  frame `game_sub` tests those whose `+0x14` is 2 against the hunters, one
  shape at a time: the hurtboxes' 0x28-byte records, placed on the owning
  monster's joint matrices (`*(m + 0x190) + joint × 0x250 + 0xD0`) and
  scaled by its model scale. Projectiles carry their own two points
  instead.
- The camera's view matrix and the 3D projection sit in the renderer, at
  `+0xB80` and `+0xC00`. The GE itself never sees the view: the game
  multiplies it into every model's matrix.
- The HUD has a translucent fill (randomfu's Hunter's Pact shades the screen
  with it), and an opaque line routine next to the gauges' fill.

Projected from savestates of a Yian Kut-Ku fight, the fireball's shape
sits on the fireball and the monsters' hurtboxes on their bodies. Not
drawn: shapes the monster's own code places (joint 0x7D), and hunters'
attacks. The outline version was played on the EU disc in PPSSPP and worked; the
shading hasn't been played yet, nor JP.

## Poogie's luck

`poogie.enabled` (Modifications → Poogie in randomfu's web app, on by default).
Pet Poogie at home before a hunt: if it lies down happily, every carve,
capture, break and quest reward in that hunt rolls twice and keeps the
rarer entry. Poogie remembers how often it's been happy: after 50 happy
hunts on a save it rolls three times, after 200 four. A tumble gives
nothing.

What the game does (EU and JP):

- Petting Poogie (`lobby_task`) sets save event flag 0x1AC when it lies
  down happily and 0x1AB when it knocks the hunter over; the hunt's return
  to the village clears both. The flags are a bit array at save `+0x508`.
- Carves, captures and breaks all draw from one weighted picker in the
  EBOOT (`(chance, item[, quantity])` entries, ending at 0xFFFF). The quest
  rewards roll the same way, inline, in the reward roll.

How Whetstone does it (`src/patches/poogie-luck.ts`, `blob/poogie.c`):

- It's blob code on the code loader, so it caps received Guild Cards at 3
  like the other Modifications. The picker's first two words jump to a
  stub (game hook 5) that calls the blob's `rf_hook5` once the blob is
  loaded, and the game's own picker otherwise (the title screen). The
  quest rewards' inline walk is replaced with a call to the picker, keeping
  a list's forced first entry, so they get the luck too.
- The blob counts each happy pet and each tumble once, on the frame its
  flag goes from clear to set, in Whetstone's save data: the last Guild Card
  slot, which every loader build keeps out of the blob's room at the same
  save offset, so the count carries over to discs from other seeds and
  settings (`RF_SAVE_DATA`, `blob/rf.h`). Its first word stays 0, so a disc
  without the loader sees an empty Guild Card slot there; that game can
  still write a 96th card over it or clear it when it compacts the cards.
- `?poogie-test` in randomfu's web app's address (`apps/randomfu`) builds a test disc where a happy
  pick rolls 1025 times, all but guaranteeing the rarest entry.

The luck was confirmed in game on carves and quest rewards when it was
patched EBOOT code. Not yet tried in game since it moved into the blob,
nor the counting.

## Elite monsters

`elites.enabled` makes some large monsters elites, in the spirit of
World's Tempered and Sunbreak's Afflicted monsters. Each large monster
rolls once, when it shows up in a quest, at `elites.chance` percent (12 by
default), so the quest board never tells and a retried quest rolls again.
It runs as blob code on the code loader, so it caps Guild Cards at 3. An
elite:

- has half again its health (at most 32767), and hits 30% harder;
- moves 10% faster: its animations run 10% faster, except during moves
  that set their own speed;
- pauses less between moves: it stands in its idle at most 20 frames
  (two thirds of a second) before its next move, where the game would let
  the idle loop run out (Tigrex's three seconds). Monster aggression's cap
  applies too, and the shorter one wins;
- recovers and turns faster: past a move's last hit, and all through a
  turn, its animations run 50% faster (Monster aggression's, the faster
  one winning);
- enrages after 60% of the damage it would otherwise take, and stays
  enraged half again as long (monsters that don't enrage skip this);
- is 15% bigger than the quest made it (at most 250%), which the Guild
  Card doesn't record: its size records stay what the quest rolled;
- has a faint crimson pulse: its hide turns a little redder and darker
  every five seconds or so, and back. Other monsters of its species keep
  their colours.

Each elite in a quest adds a draw to the main reward (on top of what's
there, so randomfu's Hunter's Pact's extra draws stay: the pact offers only draws
that fit in the game's 9, so where both don't, it's the elite's that's
lost) and half the quest's zenny and points again; the first also makes
the main reward's rarer items (those below the average chance) half again
as likely. The rewards
grow when the elite shows up, so they're paid on completing the quest
whether or not the elite was the target.

Health and attack go through the monster boosts randomfu's Hunter's Pact
shares (`blob/monsters.c`), so the two compose, and all of it multiplies whatever
the quest ends up with, so it stacks on randomfu's
`monsterStats` and `questMonsters`.

What it found (EU, and the same code on JP; `src/patches/elite.ts` and
`docs/code-loader.md` have the details):

- The attack multiplier a monster's hits use is cached at `+0x380` (f32):
  the quest's stat row times its rage multiplier, written at spawn and when
  rage starts and ends.
- Rage: a species' parameters hang off its `game_task` table entry
  (`+0x1AC`): the meter's threshold, the rage's length, its speed, attack
  and defense multipliers, and the meter's gain by health left. A monster
  copies the threshold to `+0x570`, fills its meter at `+0x56E`, and when
  it's full enrages: bit `0x20` of `+0x638`, with `+0x56C` frames left.
- A monster's animations run at `2 × +0x4B0 × (100 + +0x769) / 100` each
  frame: `+0x4B0` is the move's speed (rage sets it too) and `+0x769` a
  bonus in percent some moves set and a change of move clears.
- Size is `+0x274` (percent), turned into the model's scale by a
  `game_task` function the game itself calls when a monster grows.
- Each monster has its own copy of its model's materials (`+0x58`), which
  the renderer reads every frame: diffuse, alpha and ambient colours per
  mesh.
- The reward screen draws the main reward table (kind `0x8000`) as many
  times as its byte `+3` (the quest file's "draws"), plus Luck skills', and
  picks each item by weight. It reads the quest file in memory, so the
  blob changes it there, and puts it back if the next quest finds it
  unread.

Not yet tried in game.

## Key quests

`quests.keyLabel` marks key quests where you pick them: when the quest
counter's card (the Village Chief's, and likely the Guild's, which share
the code) shows a key quest, a yellow star (★) shows in the card's top right
corner, drawn as the card draws "CLEAR!!" in its top left. Key quests are
the ones a star needs cleared before its Urgent Quest shows. The quests
themselves and their titles aren't changed. It runs as blob code on the
code loader (below), so it caps Guild Cards at 3.

What it found (EU and JP (FUC), in `lobby_task.ovl`; `src/patches/key-quests.ts`
has the details):

- The card is drawn by one function (EU 0x09A8CA40), called from one place
  in the counter's draw step every frame it shows. It reads the shown
  quest from a copy of its board record at a fixed address (EU
  0x09B03F40), which a getter returns. Bit 26 of the record's quest type
  marks a key quest (77 records on the EU boards), bit 25 an Urgent Quest.
- It draws its lines with a print routine that draws text over a drop
  shadow, after setting the printer's glyph size. "CLEAR!!" is glyph size
  14, yellow over shadow colour 1, 8 pixels in from the card's left (the
  card's place and size and "CLEAR!!"'s are in a layout table). The star, the
  font's own ★ (the quest details show levels as "LV★★★"), is drawn the
  same way just after the card, 8 pixels in from its right, clear of the
  quest type centred on the same row.
- The two discs' card functions are the same words but for immediates, so
  it's found by its masked first words, and the routines, globals and
  layout by what it does with them. Both discs' text is UTF-8 (the quest
  details' "LV★" on FUC too), so the star is the same bytes on both.

Tried in PPSSPP on EU at the Village Chief with "Key Quest!" in the same
corner; the star itself hasn't been seen in game yet. Not yet tried: the
Guild's counters, and JP.

## Send All to Item Box

`rewards.sendAll` adds a row to the reward screen's menu after a quest,
between "Send to Item Box" and "End": Send All to Item Box sends every
reward the Item Box can take at once (the comrade's items too), as Send to
Item Box does one by one, and plays its sound. With nothing left in
any of the rewards' slots the screen ends, as End does. What doesn't fit, or can't go in the box, stays, with the
menu, to take or sell as before. Its help bar says so. It's
blob code (`blob/send-all.c`) on the pad hook and the START menu's hook,
so it goes in with the START menu entry and caps Guild Cards; a disc whose
loader only fits without the menu leaves it out.

What it found (EU and JP (FUC), the same EBOOT code but for addresses and
the confirm button, × on EU and ○ on JP; `src/patches/send-all.ts` has the
details):

- The reward screen is EBOOT code on the HUD object, an update and a draw
  each frame of the results step. Its state is a byte (0 the menu), with
  the menu's row beside it. The rewards are 32 slots of item and amount in
  the save (16 for the Felyne comrade's items).
- Town runs the same screen (in `lobby_task`, likely for items it hands
  over, such as Trenya's or the farm's), telling the update and draw apart
  by their second argument, with a third list of its own. Town's is left as
  it is, three rows.
- The menu is a list window from a template only this screen uses, its
  labels game message IDs: three and a 0xFFFF a list. Making the quest's
  four rows (each list writes its rows with its row height, and the
  update's row count and the row the back button jumps to follow its second
  argument) and writing End's ID over the 0xFFFF gives a fourth row that
  reads and works as End; the blob renames the third and takes the confirm
  button on it. Without the blob, the disc has two End rows, and the last
  one's help bar shows the game's message for row 3 (row + 4), not End's.
- Sending an item is three EBOOT calls (can the box take it, add it, which
  returns what didn't fit, and mark it seen); the blob makes the same ones.
- The help bar takes the row + 4 as its message, which would give End the
  wrong text: the blob sets End's on that row and draws its own window for
  the new one.

The four rows would run into the time left below the window, so the rows
are 20 pixels high (from 22, and 24 for the comrade's) and the window 14
higher (town's window moves up with it). Whetstone checks on each disc that
the screen is only called with 0 or 1 for its second argument, from the
EBOOT and the overlays. Tried in PPSSPP on EU: the row, the layout, sending
and ending, and a town screen keeping its three rows. Not yet seen in game: the help bar's text on the new row and End,
and JP, which builds (its code matches) but hasn't been played.

## Improve pips

`smithy.improvePips` marks, in the box the smithy's Improve shows, each
weapon the hunter can improve right now with a small orange pip (3 × 3) in a dark
frame in its cell's top left corner. "Can improve" is the game's own test
for the list Improve opens on a weapon: at least one of the weapons it
improves into has every material in the pouch and box together, and the
zenny. It's blob code (`blob/improve-pips.c`) on the START menu's hook (a
call in `lobby_task`) and the pad hook, so it goes in with the START menu
entry and caps Guild Cards; a disc whose loader only fits without the menu
leaves it out.

What it found (`lobby_task.ovl`, from RAM on FUC with the picker open, and
matched on EU; `src/patches/improve-pips.ts` has the addresses):

- The box picker draws a page with `grid(object, cursor, flags, layout)`,
  from eight places. Improve's picker passes 0x410: 0x10 the equipment box
  (`save + 0x548`, 12 bytes a slot: used, type, u16 ID), 0x400 dimming all
  but weapons (types 5 and 6). The layout is a row of a table of s16s: the
  first cell's x, y, width, height and the steps to the next column and
  row (Improve's is 244, 32, 18, 18, 22, 20).
- The list of what a weapon improves into reads its row of the EBOOT's
  upgrade table (28 bytes: four materials, then five targets at +16; a
  melee section and a ranged one, which a ranged weapon only uses when a
  check says it has a row). A target is greyed out when a material falls
  short (`has(_, item, amount)`) or the zenny does (`afford(_, cost)`, half
  its price). The blob calls those same functions.

Which cells get a pip is worked out once a page and kept while the picker
shows: again for a slot that changes, and for the page when the zenny does
or the picker's been closed. Not yet seen in game.

## Harvest all

`farm.harvestAll`: standing at Pokke Farm's Item Box, its prompt ("□ :Open
Item Box") gets a second line, "△ :Harvest All to Item Box", while the farm
holds anything. △ sends everything every spot holds (the field, the Mining
Points, Insect Thickets, Mushroom Tree and Bee Hive) to the Item Box, with a
line in the message log for each kind of item and one saying how many went.
What doesn't fit stays on the farm, at the front of its spot. Gathering at a
spot is the game's. It's blob code (`blob/harvest.c`) on one call of the
START menu's hook in the EBOOT, so it goes in with the START menu entry and
caps Guild Cards.

What it found (EU and JP (FUC), the same code at other addresses;
`src/patches/harvest.ts` has the details):

- The farm is in the save at `+0x6A238`: what's built (the field's plots,
  Mining Points and Insect Thickets as the highest one there, the Mushroom
  Tree and Bee Hive as a level 1-3), then each spot's stock, which the farm
  restock rolls after every quest for every table, built or not, writing
  over whatever was left. A Mining Point or Insect Thicket holds 4 items, a
  tree 8 and a hive 6 (one list per level); a field plot 12 items with
  amounts.
- The prompt at an interaction point switches on the point's type (7 the
  farm's Item Box, 6 the house's): each prints its button's " :" message and
  its text, then a shared tail draws the banner and the button's sprite. An
  NPC with a second choice gets a second banner a line (16) lower. The
  village's interaction code takes □ for every type, and other buttons only
  for NPCs, so △ at the box is free.

The blob takes the farm box case's last message lookup (its text again, for
the banner's width): it makes the game's call, draws its own line under the
game's as an NPC's second choice is drawn, and on △ (the buttons the Item
Box's menu reads, nothing while input is locked) sends it all with the
reward screen's box calls. Not yet seen in game; the finder matches the EU
and FUC discs.

## Bulk combine

`pouch.bulkCombine`: in the item pouch's Combine (the START menus' second
entry), "Combine?" gets a "How many?" window beside Yes/No. Left and right
pick the count, from 1 up to what the ingredients make and what the pouch
has room for (the room for the result over the most one combine can make,
so nothing is lost); × on Yes combines that many at once, and the game's
own result message shows the lot. Each combine still rolls its own chance:
failures past the first give their Garbage too, and the message log says
how many failed. With one at most (one ingredient left, or no free slot for
the result), Combine is the game's, left and right moving the pouch's
cursor as ever. It's blob code (`blob/combine.c`) on the START menu's hook,
so it goes in with the START menu entry and caps Guild Cards.

What it found (EU and JP (FUC), the same code at other addresses;
`src/patches/combine.ts` has the details):

- Both menus run entry 1 with the same `combine_run`, a state machine in
  the HUD object: two states pick the ingredients (and the recipe), then
  "Combine?" (Yes/No on up and down, the pouch's cursor on left and right,
  and what's wrong: the pouch full, an ingredient gone), then the result.
- × on Yes calls `combine()` once: the recipe's chance, then the result
  and how many (up to the recipe's quantity class's most), or a failure; it
  takes one of each ingredient either way and doesn't give the result: the
  next state does, turning a failure into one Garbage.
- The Yes/No window is at (248, 200), 80 by 48, on both discs; the count's
  window goes right of it.

The blob takes the menus' run and draw calls while Combine runs, and the
combine call: that makes the game's call the count's times and answers with
the last result and the amounts summed. Not yet seen in game; the finder
matches the EU and FUC discs.

## Paint

`paint.stays` keeps a Paintball's mark for the rest of the quest: the
painted monster stays on the area map, where the game drops it after ten
minutes. It's a one-word patch of `game_task` (`src/patches/paint.ts`), no
blob, so it doesn't cap Guild Cards.

What it found (`game_task.ovl`, statically on EU and matched on JP):

- A Paintball hit sets the monster's paint flag (`+0x3D0`, u8) to 1 and its
  timer (`+0x3D2`, s16) to 18000 frames. The map draws a monster's icon
  while the flag is set (the map's test, EU 0x08844578, see "Monster
  health").
- Each frame the monster's update counts the timer down while the flag is
  set and isn't 0xFF, and clears the flag at 0 (EU 0x09AC74E8, JP
  0x09AC27B8). That's the only countdown; the flag is otherwise cleared
  when a monster is set up (spawned, or reset) and by the ad hoc sync, which
  every Whetstone disc turns off ("No online play").
- A monster that leaves the area stays in the quest's monster list with its
  fields, paint included, so the mark follows it to the next area. Each
  monster has its own flag and timer.

The patch turns the countdown's decrement into a `nop`, so the timer is
written back unchanged. Not yet seen in game: the mark across area changes
and with two monsters painted are what the code says, not what's been
played.

## Monster List

`monsterList.slainCaptured` changes the card the Monster List (the menu
with the Combo List and Comrade Info) shows for a monster: its "No. Hunted"
line becomes "Slain: n Captured: n".
Nothing in the save changes; the counts are the ones the game keeps on any
disc, so hunts from before the patch count, and the save still loads on an
unmodified disc. It's an EBOOT patch (`src/patches/monster-list.ts`), no
blob, so it doesn't cap Guild Cards.

What it found (the EBOOT, statically on EU and matched on JP):

- The save keeps slain and captured apart: a u16 per emID of captures at
  `save + 0x44CC` and of kills at `+0x46E8`, each capped at 9999, beside the
  record sizes (`+0x4580` largest, `+0x4634` smallest). At a quest's end the
  quest object's own counts (`+0x29C` slain, `+0x350` captured, counted up
  by the kill and capture code, see "Monster health") are added to them.
- A Monster List entry is a crown group, a list of emIDs (variants
  together). Two functions sum a group's slain and captured counts, and a
  third adds them, capped at 9999: that's what the card shows, as message
  90 ("No. Hunted:%d"), and whether it shows the record sizes.
- The Guild Card's Monster Log stores only the sum, in 14 bits of the card
  that is traded with other hunters, so it's left as it is.

The patch rewrites the two group sums as one function that returns both, a
second that prints the line, and the sum in place. The card's line calls
the new one and keeps the sum where the card reads it. The text is English
on every disc, like Send All to Item Box's row: the game's message would
need a second number. The card's window is 35 half-width columns; the line
is at most 25 characters. Not yet seen in game.

## Faster start

`boot.skip` (Modifications → Boot in randomfu's web app): what the game shows from
power-on. `normal` is the game's own: on EU a language choice, then a
"Checking for Memory Stick Duo" read that autoloads the options and waits on
"Auto-loaded Game data.", a health notice, two logos and the intro movie
before Press START, then the title menu, Load Game's list of saves, "Load
this character?" and its confirmation.

- `title` goes from the autoload straight to Press START. The EU language
  choice is taken out (the game keeps the PSP's language), and the autoload's
  message is confirmed on its first frame.
- `village` goes on into the village with the hunter in the slot the game
  saved last (the game records it; else the first slot with a save), on a
  black screen with no button to press. A cold boot skips the autoload, so
  the save is read once, by Load Game: in PPSSPP about 1.7 s from the
  language choice's end to the village loading, against 3.7 s when the boot
  autoload ran too. Holding START, L or SELECT from power-on (while the save
  is read) fades in and shows Load Game as normal, to choose another slot or
  cancel to the title menu; once the list is up it's confirmed at once, so a
  later press is too late. A
  message (no save, a broken one) fades in too. Load Game from the title
  menu always shows the list.

Both are data patches of `demo_task.ovl` and `cont_task.ovl`, with no blob
and no code loader, so they don't cap Guild Cards. The save loads exactly as
from the title menu (the same memcpy, which the code loader hooks), so the
blob and the START menu's settings load as ever. Played on EU in PPSSPP. JP
(FUC) builds (every address is found by signature, and its code was checked
against EU's) but hasn't been played.

What the game does (EU addresses; JP's in brackets where they matter):

- A task manager (`*0x08A8B1E8`) runs one task a slot. A task's handler is a
  pointer to member, `{0, -1, function}`, copied into the task at +4; a
  handler ends its task by setting byte +0x11 to 1 and +0x18 to the next
  task's ID. Task 2 is boot and the title screen (`demo_task.ovl`, loaded at
  EU 0x09A5F200, JP 0x09A5A580), task 3 the title menu, task 5 Load Game
  (`cont_task.ovl`, at the same address), task 10 the village.
- Task 2's handlers come from a table (EU 0x09A61B80, JP 0x09A5BD80): the
  language choice (EU only), two resource loads, the load step (EU
  0x09A5F670), then the notice (EU only), logos and movie, each followed by
  Press START (EU 0x09A60258). The second resource load goes on to the load
  step on a cold boot only (else to Press START), and sets the fade's state
  (`*0x089CC01C` +0x1C) to 0, keeping the old one, black, at +0x30 for the
  load step to put back. The load step autoloads with the select object
  (EU 0x088BE550; "Auto-loaded Game data." is its state 5, a 90-frame
  countdown or confirm), fades out, and applies the save's options to their
  working copy (EU 0x088572E8, JP 0x08857210: `save+0x6ADD8` on to
  `+0x6AF1C`). Task 2's EBOOT code sets the save's byte +0x494; the title
  menu's EBOOT stub (EU 0x0887F690) puts its cursor on Load Game while it's
  set, then clears it. Nothing else reads it.
- Load Game polls the select object (EU `*0x09A44C60`, its function EU
  0x088BC7F0, JP 0x088BF3F8) once a frame. Its state (+0xC): 0 and 1 read
  the saves (EU about 0.4 s in PPSSPP), 8 waits for the read to be
  processed (about 0.5 s) and puts the list's cursor on the slot saved
  last, 2 opens the list, 3 is the list, 4 "Load this character?" with Yes
  chosen, 5 its confirmation, 6 and 7 copy the slot into the save, 9 and up
  messages. States 3 to 5 wait for confirm in the frame's pressed buttons
  (EU 0x08A62C6C, held 4 bytes before; JP 0x08A5DD3C): × on EU, ○ on JP.
  Its byte +0x964 is a copy of an option byte (`save+0x6ADDC`, which the
  autoload reads): set, state 8 skips the list's opening animation and the
  hunter previews, and state 6 doesn't wait 41 frames. Once loaded, Load
  Game fades out, then (EU 0x09A5F5B4) runs its post-load step on the save.
  Its windows draw over the fade.

How Whetstone changes it (`src/patches/boot.ts`), new code in the overlays'
padding:

- Both: the autoload's call goes through 9 words that add confirm to the
  pressed buttons in its state 5. On EU the language choice's fade-in and
  fade-out calls and its wait for confirm are taken out. The load step's
  next handler becomes Press START.
- `village`: the load step's own table entry gets an 11-word handler that
  puts the fade's state back and ends task 2 with next = 5. In Load Game:
  - its fade-in and its fade-out after a load go through 8 words that skip
    them while +0x494 is set;
  - its poll goes through 26 words: while +0x494 is set and a flag word of
    theirs isn't, they set +0x964 and add confirm in states 3 to 5; START, L or SELECT held
    in those states, or a message, goes to 18 words that set the flag,
    clear +0x494 and fade in, so the menu is the player's;
  - its post-load call goes through 5 words that apply the options first.
- Load Game's padding is 58 words on EU and JP, which these 57 fit.
- Tested on the CPU in `test/boot.test.ts`, with each state, the held buttons, the title
  menu's case and JP's ○, and traced in PPSSPP from the task slots, the
  select object, the fade and the options.

## No online play

Every disc Whetstone writes is offline, whatever the settings, and so is
every randomfu disc, which goes through Whetstone's mods: a modded or
randomized disc plays a different game from anyone else's, so for now it
doesn't meet other hunters ad hoc (the Gathering Hall, the Training School)
or reach the download servers. It isn't an option; `applyMods` always runs
it. `src/patches/no-online.ts` does it.

What the game does (EU addresses; found statically on the EU and JP discs):

- Before and during network play it reads the WLAN switch with
  `sceWlanGetSwitchState` (1 is on). The EBOOT polls it (EU 0x088ABE58,
  keeping `state == 1` at `+0x176`), and `lobby_task`, `game_sub` and
  `arcade_task` test it before going on, or flag the session to end (EU
  `*0x09A0B544 + 0x1AFC`) when it's off, as when the switch is flipped
  mid-session.
- The network starts with `sceNetInit`, in the EBOOT's net state machine
  (EU 0x088AC66C, which goes on to `sceNetAdhocInit` or `sceNetInetInit`
  and their control libraries) and once in `lobby_task`. A negative result
  puts the state machine in its error state (2).

The patch finds the two imports' stubs by NID and replaces every `jal` to
them, in the EBOOT and every `overlay/*.ovl`, with the result: the switch
reads 0 (off), so the game takes its own WLAN-off path, and `sceNetInit`
returns 0x80410000, so the network can't start even where the switch isn't
read. The calls' delay slots only set up arguments and still run. That's
22 calls on EU (5 in the EBOOT) and 19 on FUC (2). Since it changes the
EBOOT, every disc has the decrypted EBOOT (most did already: Poogie's luck,
on by default, patches it too).

Not yet played: what the Gathering Hall and the Training School show with
the switch off, and that single player in them still works, are unchecked.

This covers the disc, not the save. HunterVerse and similar services tunnel
PPSSPP's ad hoc traffic, so a Whetstone or randomfu disc can't reach them, and the game
can't tell them from any other network. A hunter saved on such a disc
still loads on a vanilla disc and can go online from there. Saves are left
as they are on purpose: the save file is encrypted and never leaves the
player's machine, so a hidden "made with randomfu" mark is something no
server could check, and a visible one (on the Guild Card, say) or a separate
save folder hasn't been done. randomfu's FAQ (`apps/randomfu/faq.html`)
asks players not to.

## Code loader (prototype)

`?loader-demo` in randomfu's web app's address (see `apps/randomfu`) caps received
Guild Cards at 3 and turns the 93 freed slots (392,088 bytes of the save
struct) into room for Whetstone's own code and data. Its demo blob adds 1000
zenny on every save load, so it's seen to run; it does in PPSSPP on EU and
JP (FUC). It's not for play. `docs/code-loader.md` has the design: the
address, when it loads, the blob format, game hooks, the C toolchain and
the PRX alternative. Poogie's luck, monster health, damage numbers, the
key quest label and the other blob mods are built on it, and so are
randomfu's Hunter's Pact and Unknown Monster quests, which it hands to
`applyMods` as `LoaderFeature`s to link in the same loader.

- **Room.** The save struct is static (an arena in the EBOOT's BSS), so the
  freed slots are at a fixed address per region: EU `0x099A1820`, JP
  `0x0999D560`. `src/patches/guild-card-space.ts` caps the cards and
  rewrites the game's card compaction in 75 of its 351 words; the rest is a
  code cave that patches share (`allocateCave`, `allocateSlots`).
- **Loading.** Loading a save or making a new character overwrites the
  slots. The EBOOT's two save-load copies and the new character's card
  clear call a loader in the cave instead; it makes the game's call, then
  reads `/WHTSTN.BIN` (at the disc's root) over the slots with `sceIoOpen` and
  `sceIoRead`, checks its header, syncs the caches and calls the blob's
  `rf_init`.
- **Game hooks.** Game calls go through a gate in the cave to stubs in the
  blob that make the call, then run the blob's `rf_hookN` (without a blob,
  the gate makes the game's call alone): once a frame in
  a quest, after the HUD draws the hunter's gauges, after the pad read gets
  the controller, around the quest loader's calls, and after a completed
  quest's reward roll, when a hit lands on a monster, and in the quest
  START menu's last entry (`src/patches/game-hooks.ts`). Blob features
  register for them with `rf_on` (`blob/runtime.c`). One more replaces the game's weighted
  picker with the blob's `rf_hook5` (Poogie's luck).
- **Save data.** The last freed slot is Whetstone's own save data
  (`struct rf_save_data`), kept out
  of the blob's room in every build so features can remember things across
  saves and discs (`RF_SAVE_DATA`, `blob/rf.h`).
- **Blob code** is C in `blob/`, compiled by clang to MIPS objects
  (`node blob/build.mjs`, Homebrew `llvm`) and committed as base64
  (`src/blob/demo-object.ts`). Whetstone links them per disc at the
  region's address (`src/blob/link.ts`), so no compiler is needed to
  patch a disc. randomfu's own C (`packages/randomfu/blob/`) includes
  these headers and is built by its own `blob/build.mjs` the same way. The
  blob keeps its `rf_` names and `rf.h` from before the split. The file is
  `WHTSTN.BIN`: Whetstone shortened the way the game shortens names, to
  fit ISO 9660's 8.3.

Not yet tried: receiving Guild Cards with the cap, and a save from a
patched game on an unpatched one (its card slots 4–96 hold the blob).

## How it writes the disc

- **DATA.BIN** files are encrypted with a key seeded from their start
  sector. An edited file that keeps its size is re-encrypted and written
  where it was; nothing else in DATA.BIN changes (`src/disc/databin.ts`).
- **Quests** are re-sealed with their original seeds and a new salted SHA1,
  sector padding included, so an unchanged quest re-seals byte for byte
  (`src/disc/quest-file.ts`). A quest can grow into its own sector
  padding: its size field and hash cover the longer payload, and the
  entry keeps its sectors.
- **EBOOT.BIN** is written back as the decrypted, unsigned ELF. It's
  replaced in place if it fits its old sectors; otherwise it's moved to the
  end of the image, and its directory record and the volume size are
  updated (`src/disc/image.ts`). PPSSPP is expected to run it; that isn't
  confirmed yet.
- **New files** (the code loader's blob) go at the end of the image, with a
  record added to their directory, kept in name order and shaped like the
  directory's other records (UMD names have no `;1`); the directory must
  have room in its sectors (`PatchableImage.writeFile`).

## Tests

```bash
pnpm --filter whetstone test
pnpm --filter whetstone typecheck
```

The tests build a small fake disc (`test/fixtures.ts`: ISO 9660,
PARAM.SFO, an encrypted DATA.BIN with quests and overlays, an EBOOT) and
run the mods on it, `runWhetstone` included (`test/run.test.ts`); the
patch and blob code run on a small MIPS CPU (`test/mips-cpu.ts`).
randomfu's tests use the same fixtures.

The blob's C (`blob/*.c`) is compiled to relocatable MIPS objects and
committed as base64 in `src/blob/*-object.ts`, so nothing needs a compiler
to patch a disc. After changing `blob/*.c` or `blob/*.h`, rebuild them with
clang's Mips target (Homebrew's `llvm` has it):

```bash
cd packages/whetstone
node blob/build.mjs   # or CLANG=/path/to/clang node blob/build.mjs
```

randomfu's own `blob/build.mjs` compiles its C against these headers, so
rebuild it too after changing a header.
