/*
 * Elite monsters (elites.enabled): now and then a large monster in a quest
 * is an elite, a stronger version of itself, in the spirit of World's
 * Tempered and Sunbreak's Afflicted monsters. Each large monster rolls once
 * when it shows up; an elite has more health, hits harder, moves faster,
 * pauses less between moves, recovers and turns faster, enrages sooner and
 * for longer, and is bigger, and its hide has a faint crimson pulse. The
 * quest it's in pays out more.
 *
 * Health, attack, the pauses and the recoveries go through the shared
 * monster boosts (monsters.h), so
 * they compose with other features'. The rest is run-time state the game
 * keeps per monster and per quest, written from the same booster, which
 * monsters.c asks once a frame for every active large monster.
 * src/patches/elite.ts finds the addresses below on each disc and says what
 * each field does.
 */
#include "monsters.h"

/* Found per disc (src/patches/elite.ts). */
extern const u8 rf_game_task[];    /* game_task.ovl's load address */
/* game_task's per-species table: word-aligned, so its pointers are read with plain loads. */
extern const u8 rf_em_chunks[] __attribute__((aligned(4)));
extern u8 *const rf_quest[];       /* the global holding the quest state */
extern u8 *const rf_rng[];         /* the global holding the game's random number object */
extern const u8 rf_rng_streams[];  /* a constant: where its streams' u16 states are in it */
extern const u8 rf_apply_size[];   /* game_task: scale = base scale × size% / 100 (m) */
extern const u8 rf_elite_chance[]; /* a constant: an elite's chance, in percent */
/*
 * A constant: 1 + the most frames (30 a second) an elite stands in its idle
 * between moves, or 1 to leave its idle alone (an extern's address is never 0).
 */
extern const u8 rf_elite_idle[];

/* A monster. */
#define SLOTS 20
#define EM_ID 0x1e8
#define HP 0x2e4
#define HP_MAX 0x41e
#define SIZE 0x274        /* u16: size in percent of the base scale */
#define RAGE_LEFT 0x56c   /* s16: frames of rage left */
#define RAGE_NEEDED 0x570 /* s16: the rage meter's threshold */
#define FLAGS 0x638       /* u32 */
#define ENRAGED 0x20
#define SPEED_BONUS 0x769 /* u8: % added to its animation speed; moves set and clear it */
/* Its model's materials, its own copy: 16 bytes each from MATERIALS up to MATERIALS_END. */
#define MATERIALS 0x58
#define MATERIALS_END 0x5c
#define MATERIAL_BYTES 16
#define MAX_MATERIALS 16
#define ENTITY_BYTES 0x53b0
/* A material's colours: diffuse RGB at +0 (then alpha), ambient RGB at +4. */
static const u8 COLOURS[6] = {0, 1, 2, 4, 5, 6};

/* game_task's species table: 0x1D0 bytes each. */
#define CHUNK_BYTES 0x1d0
#define CHUNK_RAGE 0x1ac /* the species' rage parameters, or 0: s16 threshold first */

/* The quest state: time left, the quest file in memory and its reward tables. */
#define QUEST_TIME_LEFT 0x10
#define QUEST_FILE 0x50
#define QUEST_REWARDS 0x5c
/* The quest file's header. */
#define FILE_POINTS 0x3c
#define FILE_ZENNY 0x54
/* A reward table: u16 kind, u8, u8 draws, u32 items (from the file's start). */
#define TABLE_BYTES 8
#define TABLE_MAIN 0x8000
#define TABLE_DRAWS 3
#define TABLE_ITEMS 4
#define TABLE_END 0xffff
/* An item: u16 chance, u16 item, u16 amount; a chance of 0xFFFF ends the list. */
#define ITEM_BYTES 6
#define MAX_ITEMS 24
/* The main reward roll fills a 10-slot list: its draws, then chances of more. */
#define MAX_DRAWS 9

/* How much stronger an elite is ("moderate"). Health and attack are percent added. */
#define HP_BOOST 50
#define ATTACK_BOOST 30
#define SPEED_PERCENT 10
/* Percent faster past a move's last hit, and through a turn (monsters.h). */
#define TAIL_SPEED 50
#define RAGE_NEEDED_PERCENT 60
#define RAGE_LONGER_PERCENT 150
#define SIZE_PERCENT 115
#define SIZE_CAP 250
/*
 * The tint: each colour channel times (256 + TINT[c] × pulse / 256) / 256,
 * pulse rising and falling between PULSE_LOW and 256 every PULSE_FRAMES:
 * redder, and darker in green and blue.
 */
static const s16 TINT[3] = {40, -60, -45};
#define PULSE_LOW 128
#define PULSE_FRAMES 150
/* What an elite adds to its quest: draws, zenny and points per elite, and rarer items' odds once. */
#define EXTRA_DRAWS 1
#define ZENNY_PERCENT 50
#define POINTS_PERCENT 50
#define RARE_PERCENT 150

/* Per manager slot: whether its monster is an elite, and what was last written to it. */
static struct slot {
  u8 elite;
  u8 enraged;
  u16 size;
  /* Each material's colours as the game set them, and as the tint left them. */
  u8 base[MAX_MATERIALS][6];
  u8 tinted[MAX_MATERIALS][6];
} slots[SLOTS] __attribute__((aligned(4)));

/* This quest's elites and its rewards as the quest file had them, to add to. */
static struct {
  u8 *file;
  u8 *main;
  u32 zenny, points;
  u32 wrote_zenny;
  u16 chances[MAX_ITEMS];
  u8 draws;
  u8 items;
  u8 elites;
} quest;

static s32 time_left;
static u8 quest_over;
static u32 frames, checked;
static u32 seed = 0x2545f491;

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

static u32 percent(u32 value, u32 pct, u32 cap) {
  u32 out = value * pct / 100;
  return out > cap ? cap : out;
}

/*
 * A roll: xorshift, stirred with the game's own generator (which every
 * attack, carve and reward roll moves on), the frame and the monster.
 */
static u32 random(u8 *m) {
  u8 *rng = *rf_rng;
  if (rng) {
    /* Two u16 reads: the pair needn't be word-aligned. */
    const volatile u16 *streams = (const volatile u16 *)(rng + (u32)rf_rng_streams);
    seed ^= streams[0] | (u32)streams[1] << 16;
  }
  seed ^= (u32)m ^ frames * 0x9e3779b9u;
  for (u32 k = 0; k < 3; k++) {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
  }
  if (!seed) seed = 1;
  return seed;
}

static u16 *item_chance(u32 k) {
  return (u16 *)(quest.file + *(u32 *)(quest.main + TABLE_ITEMS) + k * ITEM_BYTES);
}

/* A new quest: note its rewards before any elite adds to them. */
static void new_quest(u8 *qs) {
  u8 *file = *(u8 **)(qs + QUEST_FILE);
  /* The same file, still as this left it (not read again): put it back first. */
  if (file == quest.file && quest.elites && *(u32 *)(file + FILE_ZENNY) == quest.wrote_zenny) {
    *(u32 *)(file + FILE_ZENNY) = quest.zenny;
    *(u32 *)(file + FILE_POINTS) = quest.points;
    if (quest.main) {
      quest.main[TABLE_DRAWS] = quest.draws;
      for (u32 k = 0; k < quest.items; k++) *item_chance(k) = quest.chances[k];
    }
  }
  quest.file = file;
  quest.elites = 0;
  quest.main = 0;
  quest.items = 0;
  if (!file) return;
  quest.zenny = *(u32 *)(file + FILE_ZENNY);
  quest.points = *(u32 *)(file + FILE_POINTS);
  u8 *table = *(u8 **)(qs + QUEST_REWARDS);
  for (; table && *(u16 *)table != TABLE_END; table += TABLE_BYTES) {
    if (*(u16 *)table == TABLE_MAIN) {
      quest.main = table;
      break;
    }
  }
  if (!quest.main) return;
  quest.draws = quest.main[TABLE_DRAWS];
  while (quest.items < MAX_ITEMS && *item_chance(quest.items) != 0xffff) {
    quest.chances[quest.items] = *item_chance(quest.items);
    quest.items++;
  }
}

/* Each elite: another draw, more zenny and points; the first also makes rarer items likelier. */
static void reward(void) {
  u8 *file = quest.file;
  if (!file) return;
  u32 n = quest.elites;
  /*
   * Each elite adds its share of the quest's own zenny and points to what's
   * there, so others' bonuses (the Hunter's Pact's) stay.
   */
  quest.wrote_zenny = *(u32 *)(file + FILE_ZENNY) + quest.zenny * ZENNY_PERCENT / 100;
  *(u32 *)(file + FILE_ZENNY) = quest.wrote_zenny;
  *(u32 *)(file + FILE_POINTS) += quest.points * POINTS_PERCENT / 100;
  if (!quest.main) return;
  /* Another draw on what's there, so others' draws (the Hunter's Pact's) stay. */
  u32 draws = quest.main[TABLE_DRAWS] + EXTRA_DRAWS;
  quest.main[TABLE_DRAWS] = (u8)(draws > MAX_DRAWS ? MAX_DRAWS : draws);
  if (n != 1 || !quest.items) return;
  u32 total = 0;
  for (u32 k = 0; k < quest.items; k++) total += quest.chances[k];
  for (u32 k = 0; k < quest.items; k++) {
    u32 c = quest.chances[k];
    if (c * quest.items < total) *item_chance(k) = (u16)percent(c, RARE_PERCENT, 0xfffe);
  }
}

/*
 * Once a frame, before any roll: a new quest when the village replaced
 * game_task since the last quest frame, or the clock went up.
 */
static void check_quest(void) {
  u8 *qs = *rf_quest;
  if (!qs) return;
  s32 left = *(s32 *)(qs + QUEST_TIME_LEFT);
  if (quest_over || left > time_left) new_quest(qs);
  quest_over = 0;
  time_left = left;
}

/* How strong the tint is this frame, out of 256. */
static u32 pulse(void) {
  u32 t = frames % PULSE_FRAMES;
  u32 half = PULSE_FRAMES / 2;
  u32 ramp = t < half ? t : PULSE_FRAMES - t; /* 0 → half → 0 */
  return PULSE_LOW + (256 - PULSE_LOW) * ramp / half;
}

/*
 * Tints the monster's own materials (its model's are left alone, so another
 * of its species isn't). A colour the game changed since is taken as the new
 * base, so its own colour changes still show under the tint.
 */
static void tint(u8 *m, struct slot *s) {
  u8 *mats = *(u8 **)(m + MATERIALS);
  u8 *end = *(u8 **)(m + MATERIALS_END);
  if (mats < m || end <= mats || end > m + ENTITY_BYTES) return;
  u32 count = (u32)(end - mats) / MATERIAL_BYTES;
  if (count > MAX_MATERIALS) count = MAX_MATERIALS;
  u32 p = pulse();
  for (u32 k = 0; k < count; k++) {
    u8 *mat = mats + k * MATERIAL_BYTES;
    for (u32 c = 0; c < 6; c++) {
      u8 now = mat[COLOURS[c]];
      if (now != s->tinted[k][c]) s->base[k][c] = now;
      s32 scale = 256 + TINT[c % 3] * (s32)p / 256;
      u32 out = (u32)s->base[k][c] * (u32)scale / 256;
      s->tinted[k][c] = (u8)(out > 255 ? 255 : out);
      mat[COLOURS[c]] = s->tinted[k][c];
    }
  }
}

/* What the game rewrites, written again: speed, rage, size and colour. */
static void boost(u8 *m, struct slot *s) {
  if (m[SPEED_BONUS] == 0) m[SPEED_BONUS] = SPEED_PERCENT;

  const u8 *rage = *(const u8 *const *)(rf_em_chunks + m[EM_ID] * CHUNK_BYTES + CHUNK_RAGE);
  if (rage) {
    s16 needed = *(const s16 *)rage;
    if (needed > 0 && *(s16 *)(m + RAGE_NEEDED) == needed) {
      *(s16 *)(m + RAGE_NEEDED) = (s16)(needed * RAGE_NEEDED_PERCENT / 100);
    }
    u8 enraged = (*(u32 *)(m + FLAGS) & ENRAGED) != 0;
    if (enraged && !s->enraged) {
      s32 left = *(s16 *)(m + RAGE_LEFT);
      if (left > 0) *(s16 *)(m + RAGE_LEFT) = (s16)percent((u32)left, RAGE_LONGER_PERCENT, 0x7fff);
    }
    s->enraged = enraged;
  }

  u32 size = *(u16 *)(m + SIZE);
  if (size != s->size && size != 0) {
    s->size = (u16)percent(size, SIZE_PERCENT, SIZE_CAP);
    *(u16 *)(m + SIZE) = s->size;
    ((void (*)(u8 *))rf_apply_size)(m);
  }

  tint(m, s);
}

static void booster(u8 *m, u32 slot, rf_boost *b) {
  if (slot >= SLOTS) return;
  if (checked != frames) {
    checked = frames;
    check_quest();
  }
  struct slot *s = &slots[slot];
  if (rf_monster_is_new(slot)) {
    s->elite = 0;
    s->enraged = 0;
    s->size = 0;
    /* Nothing written yet: whatever the materials hold is the base. */
    for (u32 k = 0; k < MAX_MATERIALS; k++) {
      for (u32 c = 0; c < 6; c++) s->tinted[k][c] = s->base[k][c] = 0;
    }
    /* Rolled once it's set up and alive; one that isn't yet is new again when it is. */
    if (*(s16 *)(m + HP_MAX) > 0 && *(s16 *)(m + HP) > 0) {
      s->elite = random(m) % 100 < (u32)rf_elite_chance;
      if (s->elite) {
        quest.elites++;
        reward();
      }
    }
  }
  if (!s->elite) return;
  rf_boost_by(&b->hp, HP_BOOST);
  rf_boost_by(&b->attack, ATTACK_BOOST);
  rf_boost_idle(b, (u32)rf_elite_idle - 1u);
  rf_boost_speed(b, TAIL_SPEED);
  if (*(s16 *)(m + HP) > 0) boost(m, s);
}

/* Every frame, in every task: counts frames, and sees the village replace game_task. */
static void pad(u8 *p) {
  (void)p;
  frames++;
  if (!game_task_loaded()) quest_over = 1;
}

void rf_elite_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  time_left = 0;
  quest_over = 1;
  rf_add_booster(booster);
  rf_on(RF_HOOK_PAD, pad);
}
