/*
 * Monster aggression (monsterAi.aggression): the AI scripts' odds are data
 * the disc carries (src/shuffles/monster-ai.ts); this is the part that runs.
 * Every large monster stands in its idle between moves at most as long as
 * the disc's choice says, through the shared monster boosts (monsters.h),
 * so an elite's shorter cap wins where it's shorter; and its recoveries
 * after a move's last hit, and its turns, go faster (an elite's or this,
 * whichever is faster).
 * src/patches/aggression.ts links it.
 */
#include "monsters.h"

/* A constant: the most frames a monster idles (30 a second). */
extern const u8 rf_aggression_idle[];
/* A constant: percent faster past a move's last hit, and through a turn. */
extern const u8 rf_aggression_speed[];

static void booster(u8 *m, u32 slot, rf_boost *b) {
  (void)m;
  (void)slot;
  rf_boost_idle(b, (u32)rf_aggression_idle);
  rf_boost_speed(b, (u32)rf_aggression_speed);
}

void rf_aggression_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  rf_add_booster(booster);
}
