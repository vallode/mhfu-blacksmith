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
which leaves 169 for other features. The game hooks (below) take 39 more. `load(reason)`:

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

| Hook | `rf_hookN`  | The call                                                     | EU site(s)                                | JP site(s)                                |
| ---- | ----------- | ------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------- |
| 0    | quest frame | `game_task`'s HUD update (EU 0x0883F270), playing and paused | 0x09A627B0, 0x09A627D4                    | 0x09A5DB20, 0x09A5DB44                    |
| 1    | HUD         | the hunter's gauges (EU 0x088405E4), in the update's layer 9 | 0x0883FA68                                | 0x0883FA84                                |
| 2    | pad         | the main loop's pad read (EU 0x08868F50), in every task      | 0x0888FD5C                                | 0x0888FA60                                |
| 3    | quest load  | the quest loader (EU 0x08870AEC), accepting and departing    | `lobby_task` +0x2F424, `game_task` +0x6B8 | `lobby_task` +0x2F0B4, `game_task` +0x6A8 |

Hooks 0 and 1 pass the HUD object (EU 0x09A04BA0, right after the save
struct); hook 2 passes the pad object (from the Hunter's Pact), and hook 3
a `struct rf_load` (below). The
gauge call only happens when the gauges show: the layer skips it in
cutscenes and when the HUD is off (HUD `+0x5DB`, save `+0x6AF1A`), and the
function itself returns at once when bit 1 of HUD `+0x1194` is set. So
anything drawn on hook 1 hides with the hunter's gauges. Every address is
found by signature: the two functions in the EBOOT, then the `jal`s to
them (exactly one in the EBOOT, two in `game_task`).

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
