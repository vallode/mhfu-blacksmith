# Code loader: design note

A prototype that gives randomfu a large code and data area in game, for QoL
features (a wishlist, an on-screen box number, pouch refill) and, later,
multiworld hooks. `randomize --loader-demo` builds it with a demo blob.

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
which leaves 169 for other features. `load(reason)`:

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

A feature that hooks game code (a per-frame or menu hook) should jump to a
cave stub. The stub compares the magic word at the fixed blob address and
calls `rf_hookN` only when it matches. That isn't built yet: the demo only
needs `rf_init`.

Persistent feature data can't live in the blob, because the blob is
reloaded. It belongs in its own slots (`allocateSlots`) or past the blob's
end in the same room. Either way it's saved with the save, and the feature
must recognise first use: the bytes may be old Guild Cards.

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
  save from the title adds 1000 zenny.
- Receiving Guild Cards with the cap (exchange, the 4th card).
- A save from a patched game loaded on an unpatched one. Its slots 4–96
  hold the blob, which the game may read as cards (a slot is "used" when
  its first halfword isn't 0, and the magic starts with `RF`).
- How long a large blob takes to read from a real UMD (the demo is 108
  bytes, and the loader always reads only the file's size).
