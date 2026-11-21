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
typedef signed char s8;

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
  /* Damage numbers (damage.c): 0 for the disc's default, else the mode chosen in game + 1 */
  u8 damage_numbers;
  /* Monster health (monster-hp.c): the same, its mode chosen in game + 1 */
  u8 monster_hp;
  /* Attack hitboxes (hitboxes.c): the same, off 0 or on 1 + 1 */
  u8 hitboxes;
  /* The camera (camera.c): the same, each its choice + 1 */
  u8 camera_fov;
  u8 camera_distance;
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
/*
 * RF_HOOK_QUEST_CARD: just after lobby_task draws the quest counter's card
 *   (the Village Chief's and the Guild's), every frame it shows. The
 *   argument is the counter object. Draw here with the HUD's routines and
 *   the printer: the card leaves its layers set.
 */
#define RF_HOOK_QUEST_CARD 6

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
 * RF_HOOK_HIT: every time a hit lands on a monster, just after the game
 *   adds its damage to the part's damage for the frame (the monster's
 *   RF_HIT_PART_DAMAGE, s16 per part, which its next update takes off its
 *   HP times its defense multiplier). The argument is a struct rf_hit. A
 *   callback may add to the part's damage. Only in quests (game_sub.ovl).
 */
#define RF_HOOK_HIT 7
/*
 * RF_HOOK_MENU: the START menus' calls (the quest's and the village's),
 *   whose last entry the game leaves as a greyed placeholder. The argument
 *   is a struct rf_menu for one of each menu's four calls, `site`: its
 *   menu * 4 + RF_MENU_LABEL (the list draw's label getter, for every row),
 *   RF_MENU_SELECT (× in the list: `select(hud, cursor)`, 0 opens the entry),
 *   RF_MENU_RUN (each frame an entry runs: `run(hud, cursor, buttons)`, 0
 *   stays, 0x2000 goes back to the list, 8 closes the menu) or RF_MENU_DRAW
 *   (the menu's layer draw, `draw(hud)`). A callback that sets `handled`
 *   gives back `result` instead of the game's call, which it can make itself
 *   (`game`, with `args`); otherwise the game's call runs as it was. menu.c
 *   uses it (features add settings to its window, rf_add_setting), and
 *   send-all.c, with its own call (RF_CALL_REWARD_LABEL).
 */
#define RF_HOOK_MENU 8
#define RF_HOOKS 9

#define RF_MENU_LABEL 0
#define RF_MENU_SELECT 1
#define RF_MENU_RUN 2
#define RF_MENU_DRAW 3
#define RF_MENU_QUEST 0
#define RF_MENU_VILLAGE 1
/*
 * Other game calls go through the same stub, from site 8 on (menu.c leaves
 * them alone). RF_CALL_REWARD_LABEL: box() getting a row's label from
 * game_task's messages (its names 4), `msg(object, id)`, with the row in
 * `s2` and box()'s list of IDs in args[2] (send-all.c).
 */
#define RF_CALL_REWARD_LABEL 8
struct rf_menu {
  u32 args[4];      /* the call's $a0-$a3 */
  u8 *s0;           /* RF_MENU_LABEL: the row's colour byte (0xA greys it) */
  u32 s2;           /* RF_MENU_LABEL in the village: where the row's ID is */
  u32 site;         /* menu * 4 + RF_MENU_*, or an RF_CALL_* */
  const void *game; /* the function the game called */
  u32 handled;
  s32 result;
};
#define RF_BUTTON_START 0x0008
#define RF_BUTTON_UP 0x0010
#define RF_BUTTON_RIGHT 0x0020
#define RF_BUTTON_DOWN 0x0040
#define RF_BUTTON_LEFT 0x0080
#define RF_BUTTON_CIRCLE 0x2000 /* back, in the game's menus */
#define RF_BUTTON_CROSS 0x4000  /* choose */

/*
 * A setting in randomfu's START menu entry (menu.c): a name, its help
 * (lines of up to 28 columns, split by '\n', at most 6) and its choices,
 * which left, right and × step through. `get` and `set` keep the
 * choice, in the feature's field of rf_save_data so it lasts. A feature
 * adds its settings from its init; menu.c is only linked in when a disc has
 * the menu hook, so call it through a weak declaration and check it.
 */
struct rf_setting {
  const char *name; /* up to 20 columns */
  const char *help;
  const char *const *choices;
  u32 count;
  u32 (*get)(void);
  void (*set)(u32 choice);
};
void rf_add_setting(const struct rf_setting *setting);

struct rf_hit {
  u8 *monster;
  u8 *attack; /* the attack record (RF_ATTACK_*) */
  u8 *hunter; /* who attacked; 0 for none */
  u8 *hitbox; /* the monster's hitbox that was hit (RF_HITBOX_*) */
  u8 *zone;   /* its hitzone row: lead, cut, bash, shot, fire, water, ice, thunder, dragon, KO */
  s32 damage; /* added to the part's damage: raw and element, before defense */
  u32 element; /* the element's share of it, a float's bits */
};
#define RF_HIT_PART_DAMAGE 0x3b8 /* s16[8], by hitbox part & 7 */
#define RF_HITBOX_JOINT 0x0      /* u16 */
#define RF_HITBOX_PART 0x6       /* u16 */
#define RF_ATTACK_QUALITY 0x74   /* u8: melee hitzone x sharpness: 3 >= 1.0, 2 >= 0.45, 1, 0 */

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
