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
reloaded. It belongs in its own slots (`allocateSlots`) or past the blob's
end in the same room. Either way it's saved with the save, and the feature
must recognise first use: the bytes may be old Guild Cards.

## Game hooks

`src/patches/game-hooks.ts` points game calls at stubs in the cave. Each
stub saves `$a0`, makes the game's call, then calls `dispatch(a0, k)`,
which jumps to the blob's `rf_hookK` only when the magic word at the blob
address matches and the header's entry isn't 0; the call's `$v0` is passed
back. A stub's 32-byte frame leaves `sp+0..15` free for the O32 code it
reaches. Twelve words per stub and 15 for `dispatch`.

| Hook | `rf_hookN`  | The call                                                       | EU site(s)             | JP site(s)             |
| ---- | ----------- | -------------------------------------------------------------- | ---------------------- | ---------------------- |
| 0    | quest frame | `game_task`'s HUD update (EU 0x0883F270), playing and paused   | 0x09A627B0, 0x09A627D4 | 0x09A5DB20, 0x09A5DB44 |
| 1    | HUD         | the hunter's gauges (EU 0x088405E4), in the update's layer 9   | 0x0883FA68             | 0x0883FA84             |
| 2    | pad         | the controller read in `padRead` (EU 0x08868F50), once a frame | 0x08868F64             | 0x08868F5C             |
| 3    | rewards     | the quest reward roll (EU 0x0886F894), once a completed quest  | 0x08875284             | found by signature     |

Hooks 0 and 1 pass the HUD object (EU 0x09A04BA0, right after the save
struct). Hook 2 passes the system's `SceCtrlData` that `padRead` (called
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
`padRead` `+0x14`. Hook 3's function is the one holding the reward walk
`poogie-luck.ts` finds (its start: the nearest `addiu $sp, $sp, -n` before
it), called from one place, the quest results step (EU 0x08874C58) that
`game_task` runs before the reward screen; it passes that step's object.
The roll has filled the save's reward box (`+0x390`, 16 slots) and sorted
it by then. The main loop's `jal padRead` (the one between `lui` and
`lw $a0`, its delay slot loading the pad object's global, and followed by
the printer's reset) gives the pad and printer globals.

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

## Hunter's Pact

`blob/pact.c` on hooks 0 to 3, with `monsters.c`, and a reward pool made
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
- **Payout.** Hook 3, once a completed quest: items go in the reward box's
  first free slots (save `+0x390`), equipment in the equipment box's first
  free slot (save `+0x548`, 400 slots of 12 bytes: `01`, type, u16 ID, the
  rest 0). A quest left unfinished never reaches the hook, and the next
  quest forgets the pact.

`test/pact.test.ts` runs it in the interpreter against a fake quest, HUD,
hunter, pad, printer and save.

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

## Not yet tried

- On hardware, at all. In PPSSPP, the demo works on EU and JP: loading a
  save from the title adds 1000 zenny (last played with the build from the
  web app's code path, after the review fixes).
- Receiving Guild Cards with the cap (exchange, the 4th card).
- A save from a patched game loaded on an unpatched one. Its slots 4–96
  hold the blob, which the game may read as cards (a slot is "used" when
  its first halfword isn't 0, and the magic starts with `RF`).
- How long a large blob takes to read from a real UMD (the demo is 108
  bytes, and the loader always reads only the file's size).
