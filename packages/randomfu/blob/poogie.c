/*
 * Poogie's luck (poogie.enabled): pet Poogie at home before a hunt, and if it
 * lies down happily, that hunt's carves, captures, breaks and quest rewards
 * lean towards rarer rewards. The happier Poogie has been over the save, the
 * more it leans: Poogie's affection.
 *
 * The game sets event flag 0x1AC when a pet goes well and 0x1AB when Poogie
 * knocks the hunter over, and clears both when a hunt ends (see
 * ../src/patches/poogie-luck.ts). Each time one goes from clear to set, it
 * counts once in the save's randomfu data (rf.h).
 *
 * rf_hook5 replaces the game's weighted picker (rf.h, RF_HOOK_PICK). It does
 * what the game's does: roll the game's random number modulo the list's total
 * chance, and walk the list. With the happy flag set it rolls more than once
 * and keeps the entry with the lowest chance.
 */
#include "rf.h"

extern const u8 rf_pick_rand[];         /* the game's random number: (context, 0) */
extern u8 *const rf_pick_rng[];         /* the global holding its context */
extern const u8 rf_poogie_test_rolls[]; /* a constant: a lucky pick's rolls in a test build, else 1 */

#define HAPPY_FLAG 0x1ac
#define TUMBLE_FLAG 0x1ab
#define COUNTED_HAPPY 1
#define COUNTED_TUMBLE 2
#define NONE 0xffff

/* Affection: a lucky pick rolls 2 times, 3 from 50 happy hunts, 4 from 200. */
static const u16 affection[] = {50, 200};

static u8 *save_struct;

u32 rf_poogie_rolls(void) {
  if ((u32)rf_poogie_test_rolls > 1) return (u32)rf_poogie_test_rolls;
  u32 happy = rf_save_data()->poogie_happy;
  u32 rolls = 2;
  for (u32 k = 0; k < sizeof affection / sizeof affection[0]; k++) {
    if (happy >= affection[k]) rolls++;
  }
  return rolls;
}

static u32 random(void) {
  return ((u32 (*)(u8 *, u32))rf_pick_rand)(*rf_pick_rng, 0);
}

u32 rf_hook5(const u16 *list, u16 *quantity) {
  u32 stride = quantity ? 3 : 2;
  u32 total = 0;
  for (const u16 *e = list; *e != NONE; e += stride) total += *e;
  const u16 *best = 0;
  if (total) {
    u32 rolls = rf_flag(save_struct, HAPPY_FLAG) ? rf_poogie_rolls() : 1;
    for (; rolls; rolls--) {
      s32 roll = (s32)(random() % total);
      const u16 *e = list;
      for (;;) {
        roll -= *e;
        if (roll < 0) break;
        e += stride;
      }
      if (!best || *e < *best) best = e;
    }
  }
  if (quantity) *quantity = best ? best[2] : 0;
  return best ? best[1] : NONE;
}

/* Every frame: count each pet flag once when it's newly set. */
static void pad(u8 *arg) {
  (void)arg;
  struct rf_save_data *data = rf_save_data();
  u32 happy = rf_flag(save_struct, HAPPY_FLAG);
  u32 tumble = rf_flag(save_struct, TUMBLE_FLAG);
  if (happy && !(data->poogie_counted & COUNTED_HAPPY) && data->poogie_happy != 0xffff) {
    data->poogie_happy++;
  }
  if (tumble && !(data->poogie_counted & COUNTED_TUMBLE) && data->poogie_tumbles != 0xffff) {
    data->poogie_tumbles++;
  }
  data->poogie_counted = (happy ? COUNTED_HAPPY : 0) | (tumble ? COUNTED_TUMBLE : 0);
}

void rf_poogie_init(u32 reason, u8 *save) {
  (void)reason;
  save_struct = save;
  rf_on(RF_HOOK_PAD, pad);
}
