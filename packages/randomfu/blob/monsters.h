/*
 * Monster boosts shared by features (monsters.c): each feature registers a
 * booster from its init, and every quest frame the boosters say how much
 * tougher each active large monster is. Percentages from several boosters
 * compose (+30% and +50% make +95%). HP and max HP follow the total once per
 * change; the attack and defense multipliers (+0x380, +0x384), which the game
 * rewrites at spawn and at rage start and end, are kept at the game's value
 * times the total. A total of 0 leaves a monster as the game has it.
 */
#ifndef RF_MONSTERS_H
#define RF_MONSTERS_H
#include "rf.h"

/* Percent extra for one monster: 30 means +30%. More defense is tougher. */
typedef struct {
  u16 hp, attack, defense;
} rf_boost;

/*
 * Adds this feature's percentages for `monster` (manager slot 0-19) to
 * `boost`. Boosters are asked on every quest frame a large monster is
 * active, the first such frame included, and always before its HP and
 * multipliers are scaled that frame, so the answer they give is applied
 * the same frame. They're asked in the order registered; at most 4.
 */
typedef void (*rf_booster)(u8 *monster, u32 slot, rf_boost *boost);
void rf_add_booster(rf_booster fn);

/*
 * During a booster call: whether this is the first frame the helper sees
 * the monster in `slot`. A monster is new when the slot's pointer or
 * species changed, when it's alive and was last seen dead, when its max HP
 * isn't what the helper last left it at (new memory in the same place), or
 * on a quest's first frame: game_task was gone since the last quest frame
 * (the village loads lobby_task in its place), or the clock went up. 0
 * outside a booster.
 */
int rf_monster_is_new(u32 slot);

/* `*field` grows by `percent`, composed with what's there. */
static inline void rf_boost_by(u16 *field, u32 percent) {
  *field = (u16)((100 + *field) * (100 + percent) / 100 - 100);
}

/* A monster whose species has a stat set: large, not small. */
int rf_monster_is_large(const u8 *monster);
/* A positive float's bits times (100 + percent) / 100, without an FPU. */
u32 rf_scale_float(u32 f, u32 percent);

#endif
