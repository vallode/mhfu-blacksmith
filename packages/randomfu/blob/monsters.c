/*
 * Monster boosts shared by features (the Hunter's Pact, elite monsters):
 * each registers a booster that says how much tougher a large monster is,
 * and this applies them all once, so two features compose instead of
 * fighting over the same fields. See monsters.h.
 */
#include "monsters.h"

extern const u8 rf_game_task[]; /* game_task.ovl's load address */
extern u8 *const rf_monsters[]; /* the global holding the monster manager */
extern const u8 rf_em_chunks[]; /* game_task's per-species table */

/* The monster manager: up to 20 monsters, large and small. */
#define MANAGER_SLOTS 0x1220
#define SLOTS 20
#define FLAGS 0x4 /* bit 0: active */
#define EM_ID 0x1e8
#define HP 0x2e4
#define HP_MAX 0x41e
#define ATTACK 0x380  /* f32, rewritten at spawn and at rage start and end */
#define DEFENSE 0x384 /* f32, likewise */
/* game_task's species table: 0x1D0 bytes each; its stat set is 0 for small monsters. */
#define CHUNK_BYTES 0x1d0
#define CHUNK_SET 0x14f
#define SPECIES 90
/* The HUD object hook 0 passes: its quest's clock, ticks left. */
#define Q_TIME 0x1230

#define BOOSTERS 4
static rf_booster boosters[BOOSTERS];

/*
 * Per manager slot: whose HP was scaled, the max HP and percentage it was
 * scaled to, and for each multiplier the game's own value and what was
 * written over it.
 */
static u8 *scaled[SLOTS];
static u8 species[SLOTS], alive[SLOTS], fresh[SLOTS];
static s32 last_time;
static u8 quest_over;
static s16 scaled_max[SLOTS];
static u16 hp_percent[SLOTS];
static u32 base[SLOTS][2], written[SLOTS][2];

void rf_add_booster(rf_booster fn) {
  for (u32 k = 0; k < BOOSTERS; k++) {
    if (!boosters[k]) {
      boosters[k] = fn;
      return;
    }
  }
}

int rf_monster_is_new(u32 slot) { return slot < SLOTS && fresh[slot]; }

int rf_monster_is_large(const u8 *m) {
  u32 em = m[EM_ID];
  return em > 0 && em < SPECIES && (signed char)rf_em_chunks[em * CHUNK_BYTES + CHUNK_SET] > 0;
}

u32 rf_scale_float(u32 f, u32 percent) {
  u32 e = (f >> 23) & 0xff;
  if ((f >> 31) || e == 0 || e >= 0xfe) return f;
  u32 m = ((f & 0x7fffff) | 0x800000) * (100 + percent) / 100;
  while (m >= 0x1000000) {
    m >>= 1;
    e++;
  }
  return (e << 23) | (m & 0x7fffff);
}

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

/* The game's value of a multiplier, times (100 + percent) / 100. */
static void rescale(u8 *m, u32 field, u32 slot, u32 k, u32 percent) {
  u32 now = *(u32 *)(m + field);
  if (now != written[slot][k]) base[slot][k] = now; /* the game set it again */
  u32 want = rf_scale_float(base[slot][k], percent);
  *(u32 *)(m + field) = want;
  written[slot][k] = want;
}

/* An s16 times (100 + to) / (100 + from), at most 0x7FFF. */
static s16 rescale16(s16 n, u32 from, u32 to) {
  u32 v = (u32)n * (100 + to) / (100 + from);
  return (s16)(v > 0x7fff ? 0x7fff : v);
}

static void frame(u8 *hud) {
  u8 *manager = *rf_monsters;
  if (!boosters[0] || !manager || !game_task_loaded()) return;
  s32 time = *(s32 *)(hud + Q_TIME);
  if (quest_over || time > last_time) {
    for (u32 k = 0; k < SLOTS; k++) scaled[k] = 0; /* a new quest */
  }
  quest_over = 0;
  last_time = time;
  for (u32 slot = 0; slot < SLOTS; slot++) {
    u8 *m = *(u8 **)(manager + MANAGER_SLOTS + slot * 4);
    if (!m || !(m[FLAGS] & 1) || !rf_monster_is_large(m)) continue;
    s16 max = *(s16 *)(m + HP_MAX);
    int living = *(s16 *)(m + HP) > 0;
    if (scaled[slot] != m || species[slot] != m[EM_ID] || scaled_max[slot] != max ||
        (living && !alive[slot])) {
      /* A monster not seen yet, or a new one in the same place. */
      scaled[slot] = m;
      species[slot] = m[EM_ID];
      hp_percent[slot] = 0;
      written[slot][0] = written[slot][1] = 0;
      fresh[slot] = 1;
    }
    alive[slot] = living;
    rf_boost b = {0, 0, 0};
    for (u32 k = 0; k < BOOSTERS && boosters[k]; k++) boosters[k](m, slot, &b);
    fresh[slot] = 0;
    if (b.hp != hp_percent[slot] && max > 0 && *(s16 *)(m + HP) > 0) {
      s16 n = rescale16(max, hp_percent[slot], b.hp);
      s16 hp = rescale16(*(s16 *)(m + HP), hp_percent[slot], b.hp);
      *(s16 *)(m + HP_MAX) = max = n;
      *(s16 *)(m + HP) = hp > n ? n : hp;
      hp_percent[slot] = b.hp;
    }
    scaled_max[slot] = max;
    if (b.attack || written[slot][0]) rescale(m, ATTACK, slot, 0, b.attack);
    if (b.defense || written[slot][1]) rescale(m, DEFENSE, slot, 1, b.defense);
  }
}

/* Every frame: the village loads lobby_task where game_task was, so a quest ended. */
static void pad(u8 *p) {
  (void)p;
  if (!game_task_loaded()) quest_over = 1;
}

void rf_monsters_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  for (u32 k = 0; k < SLOTS; k++) scaled[k] = 0;
  last_time = 0;
  quest_over = 0;
  rf_on(RF_HOOK_QUEST_FRAME, frame);
  rf_on(RF_HOOK_PAD, pad);
}
