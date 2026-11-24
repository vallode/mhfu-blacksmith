/*
 * The wait at the end of a quest (the quest.endWait option, and a setting
 * in randomfu's START menu entry). See src/patches/quest-end.ts, which
 * patches the EBOOT and finds the word below on each disc.
 *
 * The quest's end steps are patched (on every disc this blob is on) to take
 * the "Quest Complete" banner's frames from the low half of a data word in
 * their own code, rf_quest_end, and the wait after it from the high half (0
 * for the game's own: 20 s or a minute). The disc sets it to its option's
 * choice; this sets it to the save's. The code itself never changes at run
 * time, and it makes no game calls.
 */
#include "rf.h"

/* Found per disc (src/patches/quest-end.ts). */
extern u32 rf_quest_end[];
/* A constant, not an address: the disc's choice + 1 (an extern's address is never 0). */
extern const u8 rf_quest_end_choice[];

#define CHOICES 3
/* Banner | wait << 16, in frames (30 a second), as QUEST_END_FRAMES has them. */
static const u32 words[CHOICES] = {150, 150 | 600 << 16, 1 | 1 << 16};

static u32 choice(void) {
  const struct rf_save_data *d = rf_save_data();
  const u8 chosen = d ? d->quest_end : 0;
  return chosen && chosen <= CHOICES ? chosen - 1u : (u32)rf_quest_end_choice - 1u;
}

static void apply(void) { *(volatile u32 *)rf_quest_end = words[choice()]; }

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const names[CHOICES] = {"NORMAL", "SHORT", "INSTANT"};

static void set(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->quest_end = (u8)(c + 1);
  apply();
}

static const struct rf_setting setting = {
    "After a quest",
    "How long the game waits\nafter a quest is over.\nSHORT: 20 s, time to carve\none monster. INSTANT:\nstraight to the rewards,\nno time to carve.",
    names,
    CHOICES,
    choice,
    set,
};

void rf_quest_end_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  apply();
  if (rf_add_setting) rf_add_setting(&setting);
}
