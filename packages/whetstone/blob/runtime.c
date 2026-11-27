/*
 * The blob's runtime, linked into every feature build: rf_init, and the game
 * hooks' callbacks (see rf.h). Features are linked in when chosen; each has a
 * weak init here, which is 0 when it isn't linked.
 */
#include "rf.h"

/* Callbacks a hook can take: test/blob-link.test.ts checks the features' rf_on calls fit. */
#define PER_HOOK 8

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
void rf_hook3(u8 *arg) { run(RF_HOOK_QUEST_LOAD, arg); }
void rf_hook4(u8 *arg) { run(RF_HOOK_REWARDS, arg); }
void rf_hook6(u8 *arg) { run(RF_HOOK_QUEST_CARD, arg); }
void rf_hook7(u8 *arg) { run(RF_HOOK_HIT, arg); }
void rf_hook8(u8 *arg) { run(RF_HOOK_MENU, arg); }

__attribute__((weak)) void rf_monster_hp_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_pact_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_monsters_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_elite_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_aggression_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_unknown_quests_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_poogie_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_key_quests_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_damage_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_menu_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_hitboxes_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_camera_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_send_all_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_quest_end_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_photo_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_target_camera_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_improve_pips_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_harvest_init(u32 reason, u8 *save);
__attribute__((weak)) void rf_combine_init(u32 reason, u8 *save);

static struct rf_save_data *save_data;

struct rf_save_data *rf_save_data(void) { return save_data; }

void rf_init(u32 reason, u8 *save, u8 *blob) {
  (void)blob;
  save_data = (struct rf_save_data *)(save + RF_SAVE_DATA);
  if (save_data->magic != RF_SAVE_DATA_MAGIC) {
    volatile u32 *word = (volatile u32 *)save_data;
    for (u32 k = 0; k < RF_SAVE_DATA_BYTES / 4; k++) word[k] = 0;
    save_data->magic = RF_SAVE_DATA_MAGIC;
  }
  /* Before the menu, whose draw it makes the game's call ahead of. */
  if (rf_send_all_init) rf_send_all_init(reason, save);
  /* Before the features, which add their settings to it. */
  if (rf_menu_init) rf_menu_init(reason, save);
  if (rf_monster_hp_init) rf_monster_hp_init(reason, save);
  if (rf_pact_init) rf_pact_init(reason, save);
  if (rf_monsters_init) rf_monsters_init(reason, save);
  if (rf_elite_init) rf_elite_init(reason, save);
  if (rf_aggression_init) rf_aggression_init(reason, save);
  if (rf_unknown_quests_init) rf_unknown_quests_init(reason, save);
  if (rf_poogie_init) rf_poogie_init(reason, save);
  if (rf_key_quests_init) rf_key_quests_init(reason, save);
  if (rf_damage_init) rf_damage_init(reason, save);
  if (rf_hitboxes_init) rf_hitboxes_init(reason, save);
  if (rf_camera_init) rf_camera_init(reason, save);
  if (rf_target_camera_init) rf_target_camera_init(reason, save);
  if (rf_quest_end_init) rf_quest_end_init(reason, save);
  if (rf_photo_init) rf_photo_init(reason, save);
  if (rf_improve_pips_init) rf_improve_pips_init(reason, save);
  if (rf_harvest_init) rf_harvest_init(reason, save);
  /* After send-all and the menu, which make the menus' draw call first. */
  if (rf_combine_init) rf_combine_init(reason, save);
}
