# Code loader: design note

A prototype that gives randomfu a large code and data area in game, for QoL
features (a wishlist, an on-screen box number, pouch refill) and, later,
multiworld hooks. `?loader-demo` in the web app builds it with a demo blob;
the Monster health option (`hud.monsterHp`) builds it with the runtime and
the monster health gauges.

Addresses are EU / JP (FUC).

## Space: Guild Cards

The save struct (0x6AF40 bytes) has no spare room, but 96 received Guild
Cards of 4216 bytes take 404,736 bytes of it, and most players never use
them. `src/patches/guild-card-space.ts` keeps 3 (configurable) and frees
the other 93: 392,088 bytes at save `+0x7BC0`. It bounds every loop over
the cards (7 in the EBOOT, 1 in `game_sub.ovl`, plus a "96 − used" count)
and rewrites the card compaction (EU 0x08901A60, 351 words) as one pass in
75 words. That leaves 276 words of code cave in the EBOOT.

Several features can share both. `guildCardSpace()` runs once per image and
returns the same object to every caller: `allocateCave(words)` hands out
cave words, and `allocateSlots(n)` hands out freed card slots. The loader
assembles at whatever address it's given, so it can sit next to, for
example, pouch presets that take one slot for themselves.

## Address: fixed per region

The save struct is static, so code can be linked to run in it:

- The EBOOT is a fixed-address ELF (`ET_EXEC`). Its one `PT_LOAD` segment
  runs from 0x08804000 to 0x09D65480 (`memsz`), BSS included, and holds
  the game's arenas.
- The arenas' constructor (EU 0x089B9324) sets its base with `lui $s0,
0x8A9; addiu $s0, $s0, -0x3B00` (0x08A8C500) and passes base + 0xF0D760
  to the save's constructor. That constructor is the only code that stores
  the save pointer (EU 0x089CC438); the destructor clears it.
- So the save is at 0x09999C60 / 0x099959A0, as in every savestate, and
  the freed slots start at **0x099A1820 / 0x0999D560**.

`guildCardSpace` reads the address from the constructor, by signature.

## Load moment

Loading a save overwrites the freed slots, so the loader has to copy the
blob back every time. The EBOOT has three places that do this:

| What               | Code                                                         | EU site    | JP site    |
| ------------------ | ------------------------------------------------------------ | ---------- | ---------- |
| Save load          | `memcpy(save+0x4A0, buf+0x1000+slot×0x6B100, 0x6A938)`       | 0x088BD210 | 0x088BFDA8 |
| Save load (second) | same                                                         | 0x088BD474 | 0x088C0004 |
| New character      | `memset(save+0x4A58, 0, 0x62D00)`, called by `edit_task.ovl` | 0x08853CA4 | 0x08853BCC |

0x6A938 bytes is exactly the persistent part, `+0x4A0..+0x6ADD8`. The
same copy in the other direction (save into the file buffer) is how the
game saves, and isn't hooked. Each `jal` is pointed at an entry in the
cave that makes the game's call, then runs `load(reason)`. The delay slot
still sets the third argument, and `$v0` is passed back unchanged.

Before any save is loaded (the title screen), there's no blob. Game hooks
into the blob have to check the header first (see below).

## Reading the file

randomfu adds `RANDOMFU.BIN` to `/PSP_GAME/USRDIR`: its data goes at the
end of the image, a record goes into the directory (which has room), and
the volume size is updated (`PatchableImage.writeFile`). No ISO rebuild is
needed. The record copies the shape of the directory's other files: UMD
images name files without the `;1` version and give each an XA field, and
PPSSPP looks names up exactly, so a `RANDOMFU.BIN;1` record isn't found
(the first demo build failed this way). A file inside DATA.BIN would need the game's decrypting, asynchronous
reader. A loose file reads with plain synchronous calls the EBOOT already
imports: it opens `disc0:/PSP_GAME/USRDIR/DATA.BIN` itself.

The loader takes 107 cave words, path, status and both entries included,
which leaves 169 for other features. The game hooks (below) take 51 more. `load(reason)`:

1. `sceIoOpen("disc0:/PSP_GAME/USRDIR/RANDOMFU.BIN", O_RDONLY)`, then
   `sceIoRead` it over the freed slots (at most the room) and `sceIoClose`.
2. It checks that the bytes read equal the header's size, and that the
   magic and build id match what was baked into the loader. On any
   failure, it zeroes the magic and returns.
3. `sceKernelDcacheWritebackAll`, `sceKernelIcacheInvalidateAll`.
4. It calls `rf_init(reason, save, blob)`, where `reason` is 0 for a save
   load and 1 for a new game.

Four status words after the path (`STATUS`; the build log prints their
address) record how many times the loader ran, the last reason, and what
`sceIoOpen` and `sceIoRead` returned (−1 before a read). A savestate shows
from them whether the hooks ran and why a blob didn't load.

The stubs are found by NID through the module info (the first program
header's `p_paddr`). This EBOOT's `sceIoClose` NID is 0x810C4BC3.

## Blob format

| Offset | Field                                                                 |
| ------ | --------------------------------------------------------------------- |
| 0x00   | magic `RFU1`                                                          |
| 0x04   | build id: FNV-1a of the image with this field zeroed                  |
| 0x08   | size in bytes (the whole file)                                        |
| 0x0C   | `rf_init` address                                                     |
| 0x10   | `rf_hook0`…`rf_hook11` addresses (0 when not defined), for game hooks |
| 0x40   | code, read-only data, data, zeroed data, linked at the slots' address |

Each region links to its own address, so each has its own build id. A blob
from another build or region is never run. The blob is reloaded on every
load, so whatever the save held in those bytes is replaced.

Persistent feature data can't live in the blob, because the blob is
reloaded. It belongs in randomfu's save data (below), or in its own slots
(`allocateSlots`). Either way it's saved with the save, and the feature
must recognise first use: the bytes may be old Guild Cards.

## Save data

Every loader build keeps the last freed slot (95, save `+0x666E0`, 4216
bytes) out of the blob's room (`reserveSaveData`, `SAVE_DATA`). It's at the
same offset whatever features a build has or however big its blob is, so
what features keep there carries over to a disc from another seed or
settings. `rf_init` checks its magic (`RFS1`) before any feature's init and
clears the slot when it isn't there (old Guild Card bytes, or a first load);
a new character's memset clears it too. Its first word stays 0, the magic
is the second: the game takes a slot whose first halfword isn't 0 as a
received card, so on a disc without the loader the slot reads as empty, not
as a card of garbage (that game can still write a 96th card over it, or
clear it when it compacts the cards). Features read it with
`rf_save_data()`, a `struct rf_save_data` (`blob/rf.h`): new fields go at
the end, where a save that has the magic already has zeros.

## Game hooks

`src/patches/game-hooks.ts` points game calls at stubs in the cave. Each
stub saves `$a0`, makes the game's call, then calls `dispatch(a0, k)`,
which jumps to the blob's `rf_hookK` only when the magic word at the blob
address matches and the header's entry isn't 0; the call's `$v0` is passed
back. A stub's 32-byte frame leaves `sp+0..15` free for the O32 code it
reaches. Twelve words per stub and 15 for `dispatch`.

| Hook | `rf_hookN`  | The call                                                                                     | EU site(s)                                                                                                                   | JP site(s)                                |
| ---- | ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 0    | quest frame | `game_task`'s HUD update (EU 0x0883F270), playing and paused                                 | 0x09A627B0, 0x09A627D4                                                                                                       | 0x09A5DB20, 0x09A5DB44                    |
| 1    | HUD         | the hunter's gauges (EU 0x088405E4), in the update's layer 9                                 | 0x0883FA68                                                                                                                   | 0x0883FA84                                |
| 2    | pad         | the controller read in `padRead` (EU 0x08868F50), once a frame                               | 0x08868F64                                                                                                                   | 0x08868F5C                                |
| 3    | quest load  | the quest loader (EU 0x08870AEC), accepting and departing                                    | `lobby_task` +0x2F424, `game_task` +0x6B8                                                                                    | `lobby_task` +0x2F0B4, `game_task` +0x6A8 |
| 4    | rewards     | the quest reward roll (EU 0x0886F894), once a completed quest                                | 0x08875284                                                                                                                   | found by signature                        |
| 5    | pick        | replaces the weighted picker (`poogie-luck.ts`)                                              | 0x0887265C (the picker's first two words)                                                                                    | 0x08872654                                |
| 6    | quest card  | the quest counter's card (EU 0x09A8CA40), in town                                            | `lobby_task` 0x09A8BF08                                                                                                      | `lobby_task` 0x09A87078                   |
| 7    | hit         | the status buildup in the monster hit function (`game_sub`)                                  | 0x09C44C34                                                                                                                   | 0x09C3FC24                                |
| 8    | menu        | each START menu's label, choose, run and layer draw calls, and box()'s label call (Send All) | quest 0x08818F14, 0x08848F58, 0x08849024, 0x0883F854; village 0x08834A9C, 0x08834B84, 0x08834C4C, 0x088346C0; box 0x0882F8A8 | found by signature                        |

Hooks 0 and 1 pass the HUD object (EU 0x09A04BA0, right after the save
struct), hook 3 a `struct rf_load` (below), hook 4 the results step's
object, hook 6 the quest counter's object, hook 7 a `struct rf_hit` (Damage numbers, below), hook 8 a `struct rf_menu` (START menu, below). Hook 2 passes the system's `SceCtrlData` that `padRead` (called
once a frame by the main loop, EU 0x0888FD5C) reads into: buttons a u32 at
`+4`, the stick bytes at `+8`, `+9`. It runs before `padRead` checks the
game's input lock (the pad object's `+0x17`, which shops and dialogues
set): with it set, `padRead` clears the pad object and the hunter stands
still. A feature that sets the lock keeps reading the buttons here. The
gauge call only happens when the gauges show: the layer skips it in
cutscenes and when the HUD is off (HUD `+0x5DB`, save `+0x6AF1A`), and the
function itself returns at once when bit 1 of HUD `+0x1194` is set. So
anything drawn on hook 1 hides with the hunter's gauges. Every address is
found by signature: the two functions in the EBOOT, then the `jal`s to
them (exactly one in the EBOOT, two in `game_task`); hook 2's is
`padRead` `+0x14`. Hook 4's function is the one holding the reward walk
`poogie-luck.ts` finds (its start: the nearest `addiu $sp, $sp, -n` before
it), called from one place, the quest results step (EU 0x08874C58) that
`game_task` runs before the reward screen; it passes that step's object.
The roll has filled the save's reward box (`+0x390`, 16 slots) and sorted
it by then. The main loop's `jal padRead` (the one between `lui` and
`lw $a0`, its delay slot loading the pad object's global, and followed by
the printer's reset) gives the pad and printer globals.

Hook 5 isn't a call but a function: the picker's first two words (its
`addiu $sp` and `sw $ra`) become `j stub; nop`. The stub (19 words) checks
the blob's magic and header entry like `dispatch`, then calls `rf_hook5`
with the picker's `$a0` and `$a1` in a 32-byte frame and returns its `$v0`
to the picker's caller; without it, it runs the two words and jumps to the
picker's third. The picker only calls the RNG, so the temporaries the stub
uses are free. One feature defines `rf_hook5` (`blob/poogie.c`).

In the blob, `blob/runtime.c` defines `rf_init` and `rf_hook0`…, and
features register callbacks with `rf_on(RF_HOOK_*, fn)` from their init
(`blob/rf.h`). Each feature's init is a weak symbol that the linker
resolves to 0 when the feature isn't linked, so the runtime calls only the
ones chosen. A feature's settings are link-time constants: an extern
symbol whose "address" is the value (never 0, which clang assumes no
object has).

## Monster health

`blob/monster-hp.c` on hook 1. Per frame it walks the 20 slots of
`game_task`'s monster manager (a global; `MANAGER_SIGNATURE`) and, for each
large monster that's active in the hunter's area with HP left, draws a
gauge with the three routines the hunter's gauges use:

| Routine | Arguments                     | EU         | JP         | Found at gauge function + |
| ------- | ----------------------------- | ---------- | ---------- | ------------------------- |
| frame   | `(hud, x, y, w, h, sprite)`   | 0x0882AC18 | 0x0882B2B4 | 0x150                     |
| cap     | `(hud, x, y, sprite)`         | 0x0882A9DC | 0x0882B078 | 0x174                     |
| fill    | `(hud, x, y, w, h, r, g, b)`  | 0x0882D6F0 | 0x0882D934 | 0x220                     |
| map     | `(hud, monster)`: shows icon? | 0x08844578 | 0x08844528 | (own signature)           |
| sprite  | `(hud, x, y, w, h, sprite)`   | 0x0882AF70 | 0x0882B60C | icon panel + 0x30         |

Sprites 4 and 6 of the HUD's sprite table are the stamina gauge's frame and
end cap (3 and 5 are health's). The fill converts the colour to 5551 and
draws in the HUD's current layer. The hunter's fills are 2 pixels tall:
health green (0x10, 0xC0, 0x10), its recoverable part red (0xC0, 0x10,
0x10), stamina yellow (0xF0, 0xF0, 0x00). The monsters' gauges are red
with a yellow trail, 80 pixels wide, stacked 14 apart on the left edge
from (28, 92), under the name plate.

The frame's right end is the stamina cap; its left end is the same cap
mirrored. The sprite routine (the one the monster icon panel, EU
0x0882FDA4, draws its frame with) stretches a sprite record's texture cell
to any size, and it reads the record at `table + index × 12`. The blob
keeps a record of its own, `(76, 44, −24, 12, 0x8001, 0)`, whose negative
width reads the cap right to left, and passes the index that wraps to it
(the offset ÷ 4 × 0xAAAAAAAB). A first version led each gauge with the
monster's own icon (36-pixel cells of cockpit texture 0x8002, set 11, found
through the panel's species lookup) at half size; it drew correctly but
looked out of place.

Calls with more than four arguments use `rf_call8` (`blob/rf.h`), which
puts arguments 5–8 in `$t0`–`$t3` as EABI does. The gauges only read game
memory; the tests in `test/monster-hp.test.ts` run the blob in the
interpreter against a fake HUD and check it leaves the monsters, manager
and HUD as they were.

## Attack hitboxes

`blob/hitboxes.c` on hook 1, with a setting in the START menu's randomfu
entry (below). Per frame it walks `game_task`'s attack
list (the attack-object pool's `+0x502C`, then `+4`) and, for each object
that can hit (`+0x14` 2) owned by a monster (`+0xF`, slot `+0x15`) in the
hunter's area (`+0x18`), places its shapes as `game_sub` does (EU
0x09C37798), projects them with the renderer's view (`+0xB80`) and
projection (`+0xC00`), and fills each one's outline on screen as strips 2
pixels tall (taller for a shape over 128 pixels tall), up to 256 a frame,
clipped to the screen. Only then does it draw them, in translucent red,
with the HUD's `fill(hud, x, y, w, h, r, g, b, alpha)` (the pact's shade)
through `rf_call9`. The HUD's opaque `line(hud, x0, y0, x1, y1, r, g, b)`
(EU 0x0882DAC0, JP 0x0882DD04) drew a first version's outlines, which
were too loud.

| Extern       | What                                    | EU         | JP         |
| ------------ | --------------------------------------- | ---------- | ---------- |
| `rf_attacks` | global holding the attack-object pool   | 0x09C18FD0 | 0x09C14250 |
| `rf_camera`  | global holding the renderer             | 0x089CBBE4 | 0x089C6CB4 |
| `rf_fill`    | the HUD's translucent fill (the pact's) | 0x0882D8DC | 0x0882DB20 |

It's the one blob built with the FPU (`-mhard-float -msingle-float`):
Allegrex has single precision only, so it uses no doubles, and clang then
saves callee-saved FPU registers with `swc1`. No float is live across a
game call: the strips are worked out before any is drawn. The test CPU
runs single-precision FPU code for `test/hitboxes.test.ts`.

## Monster boosts

`blob/monsters.c` scales large monsters for any feature that asks
(`blob/monsters.h`): each registers a booster with `rf_add_booster`, which
says how many percent of health, attack and defense to add to a monster;
boosters compose (+30% and +50% make +95%). On hook 0 it walks the
monster manager: health and max health are rescaled whenever the total
changes, by (100 + new) / (100 + old), so a boost that comes after the
monster spawned still applies; attack (`+0x380`) and defense (`+0x384`),
float multipliers the game writes again at spawn and at rage start and
end, are rescaled from the game's value whenever it writes them. Boosters
are asked every frame, before the scaling, and `rf_monster_is_new(slot)`
tells them when a monster is first seen: a new pointer or species, alive
after dead, a max health other than the one last written, or a new quest.
A quest has ended when `game_task` is gone (the village loads `lobby_task`
at its address, seen on EU), which the pad hook notices since it runs on
every frame; the clock going up counts too.

## Poogie's luck

`blob/poogie.c` defines `rf_hook5`, the game's weighted picker done as the
game does it (the game's RNG, `rf_pick_rand(*rf_pick_rng, 0)`, modulo the
list's total chance, then a walk), except that with event flag 0x1AC set
(a happy pet since the last hunt) it rolls 2, 3 or 4 times by how many
happy hunts the save has seen (50 and 200 are the steps) and keeps the entry
with the lowest chance. On hook 2 it counts a happy pet and a tumble (flag
0x1AB) once each, on the frame the flag is first seen set, in the save
data. `rf_poogie_test_rolls` is 1 for play and 1025 for `?poogie-test`.
`test/poogie-luck.test.ts` runs the stub, the blob and the quest reward
walk in the interpreter.

## Hunter's Pact

`blob/pact.c` on hooks 0, 1, 2 and 4, with `monsters.c`, and a reward pool made
per seed (`pactPool` in `src/patches/pact.ts`), linked in as
`rf_pact_pool` (`linkBlob`'s `data`).

- **Quest start.** Hook 0 sees a new quest when hook 2 saw `game_task`
  go since the last one, or when the clock (quest `+0x10`) goes up. It
  waits 20 quest frames, then until the loaded quest file's pointer (quest
  `+0x4C`) is in user memory, before it reads anything. It draws three
  penalties from different groups that fit the quest, each with a reward
  its weight picks from the quest's rank (header `+0x44`: 2 High, 5 G,
  else Low), and holds the clock while the window is open. Every game
  pointer it follows (the file, the hunter, the printer, the pad object)
  is checked first.
- **What fits.** From the quest file: a large monster if its large
  monster tables (header `+0x14`; 16 bytes each until a u16 0, `+12` the
  list of 60-byte records until emID 0xFFFF) name one; a delivery if the
  quest type (`+0x4C`) is 2 and its item (`+0x70`, amount `+0x72`) isn't
  in the supply box; otherwise a type-2 quest is a Paw Pass gathering
  quest, which time over wins, so half the time isn't offered. Delivering
  more raises `+0x72` and the count of an item objective (`+0x28`, `+0x30`:
  u32 kind 2, u16 item, u8 count) for that item.
- **Zenny and HRP** are a share of the quest's (quest `+0x14`, header
  `+0x3C`) by weight, but at least a floor per rank and weight, worked
  out when the window draws and again at the seal, from the same values.
  No HRP is offered when the quest gives none.
- **Pool.** A header of spans (u16 first entry, u16 count) per rank and
  kind (items of grade 1, 2, 3, then equipment), then 8-byte entries (u16
  ID, u8 type: 0xFF an item, else the equipment box's; u8 amount; u16 name
  offset), then the names, ASCII.
- **Window.** Hook 1 draws it in the frame of the HUD's "Armor Sphere
  received." card: `window(hud, rect, text, 0xFF)` (EU 0x0882FC50, JP
  0x0882FE94) draws a framed box from a rect (u16 x, y, w, h; glyph size
  14×14 at `+8`, `+9`; colour `+0xA`; frame style `+0xB`, 0 for the card;
  text position `+0xC`; line height `+0x10`) and sets the printer's glyph
  size, colour and line height. The card's own code (EU 0x0885A23C) found
  it: traced from a savestate with the card up, through the `sprintf` of
  "`~C02%s~C00 received.`" left on the stack. The lines go through the
  print `window` calls at `+0xFC`, `print(printer, x, y, "%s", line)` (EU
  0x088920A8, JP 0x08891B68), which reads `~Cnn` colours and `~Bnn` button
  icons in the line; the other print (EU 0x08891474) shows them as text.
  The printer is the global the main loop resets right after `padRead`.
- **Layers.** The HUD queues its shapes into display lists by layer, 9 to
  14, which are drawn in order: the layer is the HUD object's `+0x534`
  byte when a shape is drawn, and the printer's text goes to 9 plus its
  `+0x12F` (0 to 5). The gauges draw in 9, the map and item bar later, so
  the pact sets both to the last (14 and 5) while it draws and puts them
  back after. Under the window, `fill(hud, x, y, w, h, r, g, b, alpha)`
  (EU 0x0882D8DC, JP 0x0882DB20; the ninth argument on the stack, as the
  game's fades pass it; `rf_call9`) darkens the screen, and again for the
  cursor's highlight. Its sibling just before (EU 0x0882D6F0, the gauges'
  fill) is opaque: its colour is 5551 with the alpha bit set.
- **Input.** Hook 2 reads the buttons (and the stick, as up and down)
  from the controller data. While the window is open, and after until
  every button is up, the pact sets the game's input lock (pad object
  `+0x17`), as shops and dialogues do, unless the game holds it already.
  If the window wasn't drawn for two frames (a cutscene, the HUD hidden),
  it lets go and asks again when the HUD shows.
- **Seal.** With nothing taken, nothing is written. Otherwise the
  penalties are applied once: the clock, monster health and attack (via
  `monsters.c`), a faint's penalty (quest `+0x18`; one cart sets it to
  the whole reward), the loaded quest file's supplies (`+0x08`, emptied by
  moving the end marker to the first entry), and the loader's last-file
  index (quest `+0x714`) set to 0xFFFF so the edited file is read again
  next time. Frail and Weary clamp the hunter's health and stamina each
  frame after. Zenny and HRP rewards are added to the quest's (`+0x14`,
  header `+0x3C`; the faint penalty `+0x18` keeps its share), which the
  game pays only on completion; luck goes in the hunter's skill ids for
  the reward roll.
- **Payout.** Hook 4, once a completed quest: items go in the reward box's
  first free slots (save `+0x390`), equipment in the equipment box's first
  free slot (save `+0x548`, 400 slots of 12 bytes: `01`, type, u16 ID, the
  rest 0). A quest left unfinished never reaches the hook, and the next
  quest forgets the pact.

`test/pact.test.ts` runs it in the interpreter against a fake quest, HUD,
hunter, pad, printer and save.

## Elite monsters

`blob/elite.c` registers a booster with the shared monster boosts
(`blob/monsters.c`, from the Hunter's Pact), which ask it once a frame,
on hook 0, about every active large monster, and scale HP and the attack
multiplier by what the boosters say. It also counts frames on hook 2,
where it sees `game_task` replaced by the village's `lobby_task`: a new
quest. It needs, per disc (`src/patches/elite.ts`), beside monster
health's manager and species table:

| Extern            | What                                             | EU         | JP         | Found by                             |
| ----------------- | ------------------------------------------------ | ---------- | ---------- | ------------------------------------ |
| `rf_quest`        | global holding the quest state                   | 0x08A62C7C | 0x08A5DD4C | `game_task`'s `lw`/`lb 0x116` of it  |
| `rf_rng`          | global holding the game's random number object   | 0x08A631A0 | 0x08A5E270 | what most `jal rand` load into `$a0` |
| `rf_rng_streams`  | where its u16 states are in it (a constant)      | 0xF7A56C   | 0xF7A3AC   | `rand`'s `lui`/`ori` (EU 0x088900C4) |
| `rf_apply_size`   | `game_task`: scale the model from its size `(m)` | 0x09AC7668 | 0x09AC2938 | its exact code                       |
| `rf_elite_chance` | the chance in percent (a constant)               |            |            | the setting                          |

A monster rolls the first frame the shared boosts see it set up and alive
(xorshift, stirred with the game's two first random streams, which it
only reads, the frame count and the monster's address); a new monster in
its slot, or a new quest, rolls again. For an elite the booster adds 50%
HP and 30% attack, and writes the rest whenever the game has written it
anew: the speed bonus (`+0x769`) when it's 0; the rage threshold (`+0x570`)
when it equals the species' (`+0x1AC` of its table entry, then `+0`); the
rage time left (`+0x56C`) on the frame rage starts; the size (`+0x274`),
after which it calls `rf_apply_size`; and the tint.

The tint is in the monster's own materials. The EBOOT's model renderer
(EU 0x0886477C, called from `game_task` with the entity `+0x50`) sets each
mesh's GE material from a table that `+0x58` points to and `+0x5C` ends:
16 bytes each, diffuse RGB (`0x56`), alpha (`0x58`), ambient RGB (`0x55`),
then the texture index at `+8`. The table is a copy inside the entity
(Giadrome's at `+0x830`, 12 entries, on EU and JP savestates), so
changing it changes that monster only. Each frame the blob scales the
diffuse and ambient channels: red up to ×1.16, green and blue down to
×0.77 and ×0.82, pulsing between half and all of that every 150 frames. A
colour the game changes is taken as the new base.

Rewards are written in the quest file in memory (quest state `+0x50`; its
reward tables at `+0x5C`): the header's zenny (`+0x54`) and points
(`+0x3C`), the main table's draws (`+3`, at most 9 of the roll's 10
slots) and its items' chances. The blob keeps the values it found, so a
quest file it finds as it left it (not read again) is put back first.

The species' rage routines (meter, start, end, the per-frame countdown),
the animation speed code and the model renderer are the same words on EU
and JP but for addresses, and so are all the offsets above. Tests:
`test/elite.test.ts` runs the blob in the interpreter.

## Unknown Monster quests

`blob/unknown-quests.c` on hook 3 (`README.md` has what it does for the
player). The quest loader, EU 0x08870AEC / JP 0x08870AE4, is
`(quest, u16 id, buf)`, a state machine its caller runs every frame until
it returns 1:

- Step 0 (`quest+0x716` is 0): maps the ID to its DATA.BIN file through a
  table of groups (EU 0x089A7CE8: by thousands below 10000, then 10xxx,
  11xxx, 2xxxx, 30xxx, 40xxx, 50xxx), returns 1 at once if `quest+0x714`
  says that file is loaded, else allocates 0x6800 bytes and starts reading.
- Step 1: when the read is done, decrypts the quest into `buf` (0: the
  default buffer, EU 0x08A5C440 / JP 0x08A57510), frees the read buffer
  and returns 1.

`lobby_task` calls it when a quest is accepted (`buf` is the town's quest
buffer) and `game_task` when it starts (the default buffer, the ID from the
save at `+0x6AF12`). The hook's stub is one for both, entered with the
phase in `$t4`: it stores `{quest, id, buf, result, phase}` at `sp+16`,
dispatches, makes the call with the arguments read back from there (so a
callback can change `id`), then stores `$v0` and dispatches again with
phase 2. 27 words.

The blob, on a new load (step 0) of one of its IDs, rolls (accepting) or
keeps the accepted roll (departing), sets `+0x714` to 0xFFFF so the file is
read again, and swaps the ID for the template's on every call of the load.
When the load returns 1 it rewrites the buffer: species at every large
monster record and preload entry, levels, the target and objectives,
`questId`, stars, size `+0x38`, size spread `+0x4A`, money, clears the
urgent and key bits, and writes the reward tables and one text block (all
seven languages point at it) after the quest's end, with the header's
pointers moved to them. `unknownTables` leaves out any roll whose rewards and
text wouldn't fit in the loader's 0x6800-byte buffer (`rewardBytes`,
`textBytes`).

The board lists and their pointer table (EU 0x089B1E64, JP 0x089AEF28)
are found from the function that counts them (`LIST_COUNT_SIGNATURE`), and
the system timer that seeds each roll is `sceKernelGetSystemTimeLow`,
imported by both EBOOTs. The tables are linked after the code as the
`rf_uq_data` symbol (`linkBlob`'s `data`), so the blob has them at a known
address; `test/unknown-quests.test.ts` runs the stub and blob against a fake
loader.

## Key quests

`blob/key-quests.c` on hook 6 (`README.md` has what it does for the
player). The hook wraps `lobby_task`'s one call of the quest counter's
card function, so it runs every frame the card shows, after the card is
drawn. The blob reads the shown quest's type from the record copy the
card draws from (EU 0x09B03F40, JP 0x09AFECD8) and, with bit 26 set, draws
a yellow ★ in the card's top right corner with `print(printer, x, y, shadow,
colour, text, dx, dy)` (EU 0x0889198C, JP 0x0889144C), as the card draws
"CLEAR!!" in its top left. It sets the
printer's glyph size bytes (`+0x12C`, `+0x12D`, `+0x15F`) to 14 for the
print and puts them back: the bytes the game's setter (EU 0x08890DE8)
writes, which `findKeyQuestSites` checks in the EBOOT, since the line height
(`+0x15F`) can also be set on its own. The ★ is UTF-8, as both discs'
text is. Every address and the label's place are link-time constants that
`findKeyQuestSites` reads from `lobby_task`; the hook's call is patched in
the overlay (`code-loader.ts`, `hooks.questCard`). `test/key-quests.test.ts`
runs the stub and blob in the interpreter, and `test/code-loader.test.ts`
checks the call goes to hook 6's stub.

## Toolchain

Two routes were weighed:

- **Hand assembly** with `src/patches/mips.ts`. This is how the compaction
  and the loader are written. It needs no tools, and every word is
  reviewed and run in the test interpreter. It's slow to write and hard to
  change beyond a few dozen instructions.
- **C, compiled by clang** (chosen for blob code). Homebrew `llvm` (clang 23) has the Mips target. It compiles `--target=mipsel-unknown-none-elf
-march=mips2 -msoft-float -mno-abicalls -fno-pic -G0 -Os -ffreestanding`.
  MIPS II is a subset Allegrex runs: no FPU, no `$gp`, no PIC. There is no
  `ld.lld`, and it isn't needed. `src/blob/link.ts` (about 300 lines)
  links the objects at a given address with the four relocations such
  code uses (`R_MIPS_32/26/HI16/LO16`). Undefined symbols resolve to game
  functions found per disc (`sceIoOpen`, …). pspdev's psp-gcc would also
  work. It isn't installed here, it's a much larger dependency, and
  Allegrex-specific instructions (`ext`, `ins`, `min`, `max`, VFPU) aren't
  needed yet.

**Calling convention.** clang's MIPS targets are O32, N32 and N64; it has no
EABI, which PSP code uses (arguments 5–8 in `$t0`–`$t3`, no argument area
on the stack). The two agree for up to four 32-bit integer or pointer
arguments and a 32-bit result, so calls between blob and game code must
stay within that (`blob/rf.h` says so), or go through `rf_call8`, which
sets `$t0`–`$t3` for calls into the game. An O32 callee may also store its
arguments in its caller's frame (`sp+0..15`), so the loader's frame leaves
that space free when it calls `rf_init`. psp-gcc would lift the limit.

**Prebuilt objects are committed** (`node blob/build.mjs` writes them as
base64 into `src/blob/*-object.ts`). randomfu runs in the browser
(`apps/randomfu`), and players shouldn't need a compiler. The objects are
relocatable, so one object serves both regions. They're a few hundred
bytes each and diffable as source plus a regenerated file. The catch:
whoever edits `blob/*.c` must run the build script with clang installed.
Nothing checks that the committed object matches the source. A CI step
could rebuild it and compare, but clang versions change the bytes.

## PRX alternative (not built)

Is there room to load a PRX with `sceKernelLoadModule`? The PPSSPP
savestate shows the kernel's user-memory allocator. The one in slot 1 (in
game, EU) had:

- the EBOOT image at 0x08804000–0x09D65500 (all the game's arenas are
  static, and its newlib heap is only 32 KB);
- `UserSbrk`, `sceFont_Library`, `net_common`, `net_adhoc`, `av_atrac3plus`
  and thread stacks at the top;
- **one free block of 0x22F200 bytes (2.2 MB) at 0x09DB2A00.**

So a PRX would fit, in PPSSPP at least. The EBOOT doesn't import
`sceKernelLoadModule`, but it does import `sceKernelLoadModuleByID` (load
from an open file) and `sceKernelStartModule`, plus
`sceKernelAllocPartitionMemory`. Open questions:

- **Real hardware.** Untested. Infrastructure modules (`sceHttp`/`sceSsl`,
  imported for DLC download) may load later and need that memory.
- **Persistence.** A PRX or allocated block isn't saved with the save.
  That is fine for code, but feature data needs save space anyway.
- **Simpler variant.** Allocating with `sceKernelAllocPartitionMemory`
  and reading the same blob there would avoid capping Guild Cards. The
  linker would then need a load address known at link time (allocate at a
  fixed address with `PSP_SMEM_Addr`) or relocations applied in game.
- **Signing.** An unsigned PRX needs CFW or PPSSPP. So does randomfu's
  decrypted EBOOT already.

## Damage numbers

`blob/damage.c` on hooks 7, 0 and 1 (`README.md` has what it does for the
player; `src/patches/damage.ts` finds the addresses).

**The hit.** `game_sub` works a hit on a monster out in one function (EU
0x09C43458 / JP 0x09C3E448), EABI `(attack, hunter, monster, ?, hitbox,
pos)`, keeping the attack in `$s5`, the hunter in `$s4`, the monster in
`$s3`, the hitbox in `$s2` and its hitzone row in `$s0`. The raw damage is
`attack+0x1E` × `attack+0x77` / 100 × hitzone × sharpness × the hunter's
`+0x380`; the element's share, a float in `$f26`, is added to it (EU
0x09C44A4C: `trunc.w.s $f0, $f26 … addu $a0, $s1, $a0`), and the sum, in
`$s1`, goes into the monster's part damage for the frame: `+0x3B8`, an s16
per hitbox part (`hitbox+6` & 7). The next call, with that store in its
delay slot, is the status buildup `(monster, attack)` (EU 0x09C44F08), and
hook 7 takes it (`HIT_SITE_SIGNATURE`, with `ELEMENT_ADD_SIGNATURE` at most
0x400 bytes before). The stub, a 64-byte frame and 21 words, stores `{$s3,
$s5, $s4, $s2, $s0, $s1, mfc1 $f26}` at `sp+16` as a `struct rf_hit`,
dispatches, then makes the call with `$a0`/`$a1` reloaded and passes its
`$v0` back. The monster's update (`game_task` EU 0x09AC8350) takes the sum
of the part damage times the defense multiplier `+0x384` (at least 1) off
its HP, so damage a callback adds there would be taken like the game's
own (damage numbers only read it).

For melee hits the function writes the hit's quality, hitzone × sharpness,
to `attack+0x74` (and the hunter's `+0x397`): 3 at 1.0 and up, 2 at 0.45,
then 1 and 0; it's 0 for shots, so the blob takes a weak point as quality
2 or more, or quality 0 and a shot hitzone (row byte 3) of 45 or more. The
element flags are `attack+0x28`: 0x10 fire, 0x20 water, 0x40 thunder, 0x80
ice, 0x100 dragon (1, 2, 4, 8 are statuses).

**Where to draw.** `jointPos(entity, out, joint)` (EU 0x08865F24 / JP
0x08865F1C) gives a joint's world position from its matrix; a hitbox's
first halfword is its joint. `project(camera, out, in)` (EU 0x08814674 /
JP 0x08815434) gives screen x and y in pixels, depth and w, with VFPU
`lv.q`/`sv.q`, so both vectors are 16-aligned in the blob. The camera is
behind the global every `jal project` loads into `$a0` (EU 0x089CBBE4 /
JP 0x089C6CB4); the game's own name tags project with it and print at the
result. The blob projects on hook 1 and prints with the code-aware print
(`pact.ts`) at the printer's bottom layer, setting the printer's glyph
size (`+0x12C` width, `+0x12D` height, `+0x15F` line height, as the setter
at EU 0x08890DE8 writes them) per number and putting it back.

**Time.** Numbers age by the quest clock (HUD `+0x1230`, ticks
left) on hook 0, so they stop while the game is paused; the clock going up
or `game_task` going away is a new quest, which clears them.

## START menu

`blob/menu.c` on hook 8, linked in with damage numbers
(`src/patches/menu.ts`; `game-hooks.ts` finds the sites).

**The menu** (EU) is EBOOT code on the HUD object (`hud`, EU 0x09A04BA0):
`+0x52D` is 1 while it's open, `+0x57C` 0 for the list and 1 while an
entry runs, `+0x57D` the cursor (0 to 11, kept between opens), `+0x5E8`
bit 2 the help bar. The HUD update (EU 0x0883F270) opens it on START and,
while it's open, calls its input (EU 0x08848E04) with the buttons pressed
this frame or auto-repeated (EU 0x0884FB6C, raw PSP bits). In the list ×
(0x4000) calls `select(hud, cursor)` (EU 0x08849120, a jump table of 12):
0 opens the entry (`+0x57C` = 1), anything else buzzes. ○ or START closes
the menu. While an entry runs, `run(hud, cursor, buttons)` (EU 0x08849214,
a table of 11) every frame: its result's 8 closes the menu, 0x2000 goes back
to the list; Options returns `buttons & 0x2008`. The list's draw (EU
0x08818C94, in the HUD's layer 10) labels each row with `msg1(obj, id)`
(game_task's getter for message table 1, EU 0x09A63198) from a u16 ID
table (EU 0x089B54E0: 0x6D Items … 0x77 Abandon Quest, then 0x78
`--------`), each row in the colour byte at `$s0` (0xA greys it). The last
entry, the placeholder, is greyed on both of the draw's paths, refused by
`select` and not in `run`'s table.

The HUD draws the menu in its layer 10 from one call (EU `jal 0x0883FAD4`
at 0x0883F854, `hud` in `$a0`).

**The village's menu** is other code on the same HUD object, with the same
shape: `+0x111D` open, `+0x1118` state, `+0x111C` cursor, 14 entries in two
pages of 7, the last (13) a greyed placeholder. Its list draw (EU
0x0883488C) gets each label from `lobby_task`'s getter (EU 0x09A7B790)
with `$s2` pointing at the row's u16 ID in a table in `lobby_task` (EU
0x09B051A0, found from the draw's `lui`/`addiu`), the colour byte at `$s0`.
Select is EU 0x08834D3C (called at 0x08834B84), run 0x08835098 (at
0x08834C4C, a table of 13), and the layer-10 draw call is at 0x088346C0
(`jal 0x08834730`, `hud` in `$a0`). The game draws nothing for the
placeholder while it runs, in either menu.

**The hook** takes each menu's four calls, each its function's only call
(`MENU_*_SIGNATURE` and `VILLAGE_*_SIGNATURE`, immediates masked). Each
call goes to two words that set `$t4` to its site (menu × 4 + `RF_MENU_*`)
and branch to one shared stub, so the eight calls cost 16 words, the stub
about 30 and a table of the game's functions by site 8 (the cave is
tight: a stub per call didn't fit). The stub has a 64-byte frame with a
`struct rf_menu` at `sp+16`: the call's `$a0`–`$a3`, `$s0` and `$s2` (the
label loops' row), the site, the game's function, `handled` (0) and
`result`. It dispatches; if the blob set `handled` it returns `result`,
otherwise it jumps to the game's function with the call's registers and
return address, as if called. Without the blob, or with no setting to show,
both menus are the game's.

The blob decides the rest:

- Label: the placeholder's row is the quest's ID in `$a1` (read from the
  ID table, extern `rf_quest_menu_id`) or the village's ID address in
  `$s2` (`rf_village_menu_id`). For it, `menu.c` returns its label and
  clears the row's colour byte at `$s0`, without the game's call.
- Choose and run: for the placeholder's cursor, `RF_MENU_SELECT` returns 0
  (opening it) and `RF_MENU_RUN` gets the buttons in `$a2`.
- Draw: `menu.c` makes the game's call, then draws its window.

Other calls can share the stub (`calls` in `assembleHooks`, sites 8 on:
`RF_CALL_*` in `blob/rf.h`), at 3 words each (2 and a table word). Send
All to Item Box (`blob/send-all.c`) takes `box()`'s call to the label
getter (EU 0x0882F8A8, `CALL_SITE.rewardLabel`), and its quest draw callback
runs before `menu.c`'s, making the game's call itself (`menu.c` then
doesn't).

`menu.c` gives the label "randomfu" only when a feature has added a
setting, takes the entry (clearing the help bar, whose text for the
placeholder is empty), moves its cursor and changes settings from the
buttons, and returns `buttons & 0x2008` like Options. The game draws
nothing for an entry it has no draw for, so the window is drawn on the
menu's draw while that menu has the entry open, in the HUD's top layer (14)
above the rest, the way the village's Options draws (EU 0x08839824):

- `box(hud, list, title, cursor, alpha, names)` (EU 0x0882F580,
  `BOX_SIGNATURE` in `src/patches/menu.ts`) draws the frame (style 3), the
  title on its light bar, the lines between rows and the rows' names. Its
  list is window()'s rect followed by the rows, their names, the list's
  flags, and the cursor bar's and title's places; `menu.c` fills it as the
  game's template routine (EU 0x0882FA24) does for the village Options' (x
  232, y 40, 32 columns wide, a title). `names` 3 takes the names as string
  pointers (the others are message IDs for the game's getters); box() ends
  the list early at a u16 0xFFFF, so `menu.c` keeps the names 4-aligned.
  Cursor -1 draws no cursor bar, as Options.
- Each value is printed in colour 5, centred on the list's x + 0xC4 at 7
  pixels a column.
- `arrows(hud, x, y, w, alpha)` (EU 0x0882E6F0, `ARROWS_SIGNATURE`) draws
  the pulsing green arrows either side of the cursor's value, at the text's
  x + 0x92, 0x46 wide, alpha 0xF0.
- The setting's help is in window(), in the help bar's frame (0) but left
  of the list (8, 40, 216 by 112: 28 columns, 6 lines), so the list can run
  down the screen; the village's Options puts it under its list (EU
  0x0893B180: 216, 152, 256 by 112).

Settings keep their choice through their own
`get` and `set`, in randomfu's save data: monster health's is
`monster_hp`, damage numbers' `damage_numbers` and attack hitboxes'
`hitboxes`, the mode + 1 (0 for the disc's, which the blob gets as an
extern of its mode + 1, since an extern's address can't be 0). The three
features go in the blob on every disc, off or not, so the menu can turn
them on; rows are in the order the features' inits add them.

## Not yet tried

- On hardware, at all. In PPSSPP, the demo works on EU and JP: loading a
  save from the title adds 1000 zenny (last played with the build from the
  web app's code path, after the review fixes).
- Receiving Guild Cards with the cap (exchange, the 4th card).
- A save from a patched game loaded on an unpatched one. Its slots 4–96
  hold the blob, which the game may read as cards (a slot is "used" when
  its first halfword isn't 0, and the magic starts with `RF`).
- Damage numbers, in game at all: the text's size and advance at glyph
  sizes other than 14 (the blob assumes digits are half as wide as high),
  and the clock's rate (taken as 30 ticks a second).
- The START menu entry's window, in game at all (the village's label was
  seen as the game's placeholder before the village was hooked). That ×
  chooses and ○ goes back on EU is from the code (raw bits, no swap seen
  in the pad read).
- How long a large blob takes to read from a real UMD (the demo is 108
  bytes, and the loader always reads only the file's size).
