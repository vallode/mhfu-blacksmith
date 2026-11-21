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
#define RF_SAVE_FLAGS 0x508 /* event flags: a bit array of u16s */

/*
 * randomfu's own save data: the last Guild Card slot (95), at the same save
 * offset whatever features a build has and however big its blob is, so it
 * carries over to a disc from another seed or settings. The code loader
 * never loads the blob over it, and it's saved with the save. A new
 * character's memset clears it; rf_init clears it on first use too (the
 * bytes may be an old Guild Card) and sets the magic. Features keep their
 * fields here: add new ones at the end, where an older save has zeros.
 *
 * Its first word stays 0: the game takes a card slot whose first halfword
 * isn't 0 as a received card, so on a disc without the loader the slot
 * reads as empty rather than as a card of garbage. (The game there can
 * still write a 96th card over it, or clear it when compacting cards.)
 * RF_SAVE_DATA must match SAVE_DATA in src/patches/guild-card-space.ts.
 */
#define RF_SAVE_DATA 0x666E0
#define RF_SAVE_DATA_BYTES 4216
#define RF_SAVE_DATA_MAGIC 0x31534652 /* "RFS1" */
struct rf_save_data {
  u32 empty; /* always 0: an empty Guild Card slot to the game */
  u32 magic;
  /* Poogie (poogie.c) */
  u16 poogie_happy;   /* hunts after Poogie was happy to be petted */
  u16 poogie_tumbles; /* times Poogie knocked the hunter over */
  u8 poogie_counted;  /* which of the pet flags are already counted (poogie.c) */
  /* Relics (relic-weapons.c) */
  u8 relic_given;            /* ranks whose first stone was given, as bits */
  u8 relic_queue_len[3];     /* stones held, per rank */
  u8 relic_queue[3][16];     /* each held stone's class, oldest first */
  u16 relic_stones_seen[3];  /* stones rolled so far, per rank */
  u16 relic_seed[33];        /* each band's next offer's seed; 0 none yet */
  u16 relic_polished[33];    /* offers taken so far, per band */
  u16 relic_candidate[33][3]; /* the instance IDs each band offers; 0 none */
  struct rf_relic {
    u16 seed; /* 0: a free instance */
    u8 band;
    u8 k;
  } relic_kept[2][64]; /* melee, ranged */
};

/* The save's randomfu data, set up by rf_init before any feature's init. */
struct rf_save_data *rf_save_data(void);

/* Whether event flag `n` is set in the save (the EBOOT's own test, inline). */
static inline u32 rf_flag(const u8 *save, u32 n) {
  return (*(const u16 *)(save + RF_SAVE_FLAGS + (n >> 4) * 2) >> (n & 15)) & 1;
}

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
 * every load. The argument is the HUD object for the first two.
 *
 * RF_HOOK_QUEST_FRAME: every frame of a quest (game_task.ovl's call to the
 *   HUD's update), menus and pauses included.
 * RF_HOOK_HUD: just after the hunter's health and stamina gauges are drawn,
 *   which the game skips when the HUD is hidden (cutscenes, the HUD option).
 *   Draw here with the HUD's own routines to sit in the same layer.
 * RF_HOOK_PAD: once a frame in every task, inside the game's pad read, just
 *   after it reads the controller and before the task runs. The argument is
 *   the system's SceCtrlData: buttons a u32 at +4, the stick bytes at +8 and
 *   +9. The game ignores input while its pad object's +0x17 is 1 (shops,
 *   dialogues); set it to keep the buttons from the game, as they do.
 */
#define RF_HOOK_QUEST_FRAME 0
#define RF_HOOK_HUD 1
#define RF_HOOK_PAD 2
/*
 * RF_HOOK_QUEST_LOAD: around both calls to the quest loader (accepting a
 *   quest in town, departing on it), once before the call and once after.
 *   The argument is a struct rf_load; before the call, a callback may change
 *   `id`, which is what the loader is then called with. The loader is a
 *   state machine its caller runs every frame until it returns 1; the step
 *   byte (RF_QUEST_LOADER_STEP) is 0 when a new load starts.
 */
#define RF_HOOK_QUEST_LOAD 3

#define RF_LOAD_ACCEPT 0 /* lobby_task: the quest is accepted */
#define RF_LOAD_DEPART 1 /* game_task: the quest starts */
#define RF_LOAD_AFTER 2  /* either call returned; `result` is its $v0 */
struct rf_load {
  u8 *quest; /* the quest object */
  u32 id;
  u8 *buf; /* where it decrypts the quest; 0 for the default buffer */
  u32 result;
  u32 phase;
};
/* The quest object's loader state (the loader's code pins them). */
#define RF_QUEST_LOADED_FILE 0x714 /* u16: the file in the buffer; not read again */
#define RF_QUEST_LOADER_STEP 0x716 /* u8 */

/*
 * RF_HOOK_REWARDS: once a completed quest, just after its rewards are rolled
 *   into the save's reward box (save +0x390: 16 slots of item and amount,
 *   u16 each) and before the reward screen shows them.
 */
#define RF_HOOK_REWARDS 4
#define RF_HOOKS 5

/*
 * rf_hook5 isn't a callback hook: it replaces the EBOOT's weighted picker,
 * which every carve, capture, break and (randomfu routes them through it)
 * quest reward rolls with: `u32 rf_hook5(const u16 *list, u16 *quantity)`.
 * The list is (chance, item) entries, or (chance, item, quantity) when
 * `quantity` isn't 0, ending at chance 0xFFFF; it returns the item, or
 * 0xFFFF for none, and writes the quantity (0 for none). One feature
 * defines it (poogie.c); without one, or before the blob loads, the game's
 * own picker runs.
 */
#define RF_HOOK_PICK 5

/*
 * rf_hook6 isn't a callback hook either: it runs at the start of the game's
 * weapon model build, `void rf_hook6(u8 *resources, u8 *hunter, u32 n)`,
 * with the build's own arguments, before the game goes on with the build.
 * The weapon's package is already in its slot's buffer (resources + 0x80258
 * + slot * 4, slot (n & 0xff) * 8 + 6), so the hook may write another over
 * it, no bigger than the slot (resources + 0x80318 + slot * 4). One feature
 * defines it (stitch.c); without one, or before the blob loads, the build
 * runs as it is.
 */
#define RF_HOOK_BUILD 6

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

/*
 * The same with a ninth argument, which the PSP passes on the stack: the
 * callee finds it at the caller's $sp + 0.
 */
static inline u32 rf_call9(const void *fn, u32 a0, u32 a1, u32 a2, u32 a3, u32 a4, u32 a5,
                           u32 a6, u32 a7, u32 a8) {
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
  __asm__ volatile(".set push\n.set noreorder\naddiu $sp, $sp, -16\nsw %[a8], 0($sp)\njalr "
                   "$25\nnop\naddiu $sp, $sp, 16\n.set pop"
                   : "=r"(r2), "+r"(r4), "+r"(r5), "+r"(r6), "+r"(r7), "+r"(r8), "+r"(r9),
                     "+r"(r10), "+r"(r11), "+r"(r25)
                   : [a8] "r"(a8)
                   : "$1", "$3", "$12", "$13", "$14", "$15", "$24", "$31", "hi", "lo",
                     "memory");
  return r2;
}

#endif
