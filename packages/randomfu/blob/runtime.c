/*
 * The blob's runtime, linked into every feature build: rf_init, and the game
 * hooks' callbacks (see rf.h). Features are linked in when chosen; each has a
 * weak init here, which is 0 when it isn't linked.
 */
#include "rf.h"

#define PER_HOOK 4

/* Zeroed data comes zeroed from the file, so every load starts empty. */
static rf_hook_fn hooks[RF_HOOKS][PER_HOOK];

void rf_on(u32 hook, rf_hook_fn fn) {
  if (hook >= RF_HOOKS) return;
  for (u32 k = 0; k < PER_HOOK; k++) {
    if (!hooks[hook][k]) {
      hooks[hook][k] = fn;
      return;
    }
  }
}

static void run(u32 hook, u8 *arg) {
  for (u32 k = 0; k < PER_HOOK && hooks[hook][k]; k++) hooks[hook][k](arg);
}

void rf_hook0(u8 *arg) { run(RF_HOOK_QUEST_FRAME, arg); }
void rf_hook1(u8 *arg) { run(RF_HOOK_HUD, arg); }
void rf_hook2(u8 *arg) { run(RF_HOOK_PAD, arg); }
void rf_hook3(u8 *arg) { run(RF_HOOK_REWARDS, arg); }

__attribute__((weak)) void rf_monster_hp_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_pact_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_monsters_init(u32 reason, u8 *save);

void rf_init(u32 reason, u8 *save, u8 *blob) {
  (void)blob;
  if (rf_monster_hp_init) rf_monster_hp_init(reason, save);
  if (rf_pact_init) rf_pact_init(reason, save);
  if (rf_monsters_init) rf_monsters_init(reason, save);
}
