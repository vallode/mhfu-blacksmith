/*
 * What blob code can rely on. The code loader copies the linked blob into
 * the freed Guild Card slots after every save load and new game, then calls
 * rf_init. See ../docs/code-loader.md.
 */
#ifndef RF_H
#define RF_H

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef signed int s32;
typedef signed short s16;

/* rf_init's reason. */
#define RF_SAVE_LOADED 0
#define RF_NEW_GAME 1

/* Save struct offsets, shared by EU and JP. */
#define RF_SAVE_ZENNY 0x696F0

/*
 * Called after every load of the blob, with the save struct (a fixed
 * address per region) and where the blob starts. Everything in the blob,
 * code and data, is fresh from the disc at this point.
 */
void rf_init(u32 reason, u8 *save, u8 *blob);

/*
 * Game functions the linker provides (src/patches/code-loader.ts).
 *
 * Calling convention: blob code is compiled as O32 (clang has no MIPS EABI),
 * while PSP code passes arguments 5-8 in $t0-$t3 and aligns 64-bit ones
 * differently. Calls between the two agree only for up to four 32-bit
 * integer or pointer arguments and a 32-bit result: keep every game function
 * a blob calls, and every entry the game calls in a blob, to that.
 */
s32 sceIoOpen(const char *path, s32 flags, s32 mode);
s32 sceIoRead(s32 fd, void *data, u32 size);
s32 sceIoClose(s32 fd);

/*
 * Game hooks (runtime.c): the code loader points game calls at stubs that
 * make the call, then run rf_hookN in the blob, if it's loaded. A feature
 * registers callbacks with rf_on from its init, which runs from rf_init after
 * every load. The argument is the HUD object for both hooks.
 *
 * RF_HOOK_QUEST_FRAME: every frame of a quest (game_task.ovl's call to the
 *   HUD's update), menus and pauses included.
 * RF_HOOK_HUD: just after the hunter's health and stamina gauges are drawn,
 *   which the game skips when the HUD is hidden (cutscenes, the HUD option).
 *   Draw here with the HUD's own routines to sit in the same layer.
 */
#define RF_HOOK_QUEST_FRAME 0
#define RF_HOOK_HUD 1
#define RF_HOOKS 2

typedef void (*rf_hook_fn)(u8 *arg);
void rf_on(u32 hook, rf_hook_fn fn);

/*
 * Calls a game function that takes five to eight arguments, the fifth to
 * eighth in $t0-$t3 as the PSP's EABI passes them (see above: O32 can't).
 */
static inline u32 rf_call8(const void *fn, u32 a0, u32 a1, u32 a2, u32 a3, u32 a4, u32 a5,
                           u32 a6, u32 a7) {
  register u32 r4 __asm__("$4") = a0;
  register u32 r5 __asm__("$5") = a1;
  register u32 r6 __asm__("$6") = a2;
  register u32 r7 __asm__("$7") = a3;
  register u32 r8 __asm__("$8") = a4;
  register u32 r9 __asm__("$9") = a5;
  register u32 r10 __asm__("$10") = a6;
  register u32 r11 __asm__("$11") = a7;
  register u32 r25 __asm__("$25") = (u32)fn;
  register u32 r2 __asm__("$2");
  __asm__ volatile(".set push\n.set noreorder\njalr $25\nnop\n.set pop"
                   : "=r"(r2), "+r"(r4), "+r"(r5), "+r"(r6), "+r"(r7), "+r"(r8), "+r"(r9),
                     "+r"(r10), "+r"(r11), "+r"(r25)
                   :
                   : "$1", "$3", "$12", "$13", "$14", "$15", "$24", "$31", "hi", "lo",
                     "memory");
  return r2;
}

#endif
