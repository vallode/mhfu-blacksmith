/*
 * Relics (docs/ruststone-weapons.md, the MVP): relic stones drop from quest
 * rewards, the smithy's Create list turns a stone into an Unpolished Relic of
 * the class the stone rolled, and Improve Weapon on it offers three rolled
 * relics, of which the hunter keeps one.
 *
 * Every relic is a weapon ID of its own (an "instance", from the room
 * weapon-tables.ts adds), whose table record this code writes from a seed:
 * at every save load for the relics the hunter holds, and when it offers new
 * candidates. The three candidates an Unpolished Relic offers are free
 * instances; the one the hunter improves into stays theirs, recorded here as
 * (seed, band, k) in the save, and the other two go back to the pool.
 *
 * The stones are held as a queue per rank, one class per stone: the queue
 * follows the number of stones in the box and pouch (new ones roll a class,
 * gone ones leave from the front), and each rank's Create entry makes the
 * Unpolished Relic of the class at the front.
 */
#include "rf.h"

extern const u8 rf_relic_data[]; /* relic-weapons.ts relicData */
extern const u8 rf_time_low[];   /* sceKernelGetSystemTimeLow() */

#define RANKS 3
#define CLASSES 11
#define BANDS (RANKS * CLASSES)
#define SIDES 2 /* melee, ranged */
#define INSTANCES 64
#define QUEUE 16

/* WEAPON_TYPE_NAMES' order: which classes are ranged, and which roll no element. */
#define RANGED_CLASSES ((1u << 1) | (1u << 5) | (1u << 10)) /* bowguns, bow */
#define NO_ELEMENT ((1u << 1) | (1u << 5))                 /* bowguns */

/* The save: the hunter's block, its item box, pouch and equipment box, the reward box. */
#define SAVE_HUNTER 0x4a0
#define SAVE_REWARDS 0x390
#define REWARD_SLOTS 16
#define HUNTER_ITEM_BOX 0x2f88
#define ITEM_BOX_SLOTS 1000
#define HUNTER_POUCH 0x3f28
#define POUCH_SLOTS 24
#define HUNTER_BOX 0xa8
#define BOX_SLOTS 1000
#define SLOT_BYTES 12
#define MELEE 5
#define RANGED 6

/* The quest (pact.c): the loaded file's header and its rank byte. */
#define Q_HEADER 0x126c
#define H_RANK 0x44 /* 2 High Rank, 5 G Rank, else Low */

/* Weapon records. */
#define MELEE_STATS 24
#define RANGED_STATS 28
#define UPGRADE_ENTRY 28
#define UPGRADE_TARGETS 16
#define CREATE_TYPE 0
#define CREATE_ID 2

struct band {
  u16 unpolished; /* this rank and class's Unpolished Relic */
  u16 best_attack; /* the record's attack at notch 6: the rank's best */
  u16 donor_at;    /* its donors in the list after the bands */
  u8 best_element; /* the record's element value at notch 6 */
  u8 donors;
  u8 rarity; /* stored rarity of a Worn relic at this rank */
  u8 pad[3];
};

struct relic_data {
  u32 stats[SIDES];
  u32 upgrade[SIDES];
  u32 create[RANKS]; /* each rank's Create entry */
  u32 run_seed;
  u16 first[SIDES]; /* the first instance ID */
  u16 instances;
  u16 stone[RANKS]; /* the stones' item IDs */
  u8 clock;         /* 1: rolls from the clock, 0: from the run's seed */
  u8 cap;           /* the highest notch (6: the rank's best) */
  u8 chance;        /* percent of quests that drop a stone */
  u8 pad;
  struct band band[BANDS];
  /* u16 donors[] */
};

#define D ((const struct relic_data *)rf_relic_data)
#define DONORS ((const u16 *)(rf_relic_data + sizeof(struct relic_data)))

static u8 *save;
static u8 *hunter;
static u32 ready;
static u32 rank_seen; /* this quest's rank: 0 Low, 1 High, 2 G */
static u32 in_quest;  /* a quest frame ran since the last rewards */
static u32 held[RANKS]; /* each rank's stones last counted, uncapped */
static u32 frame;

static u32 hash(u32 x) {
  x ^= x >> 16;
  x *= 0x7feb352d;
  x ^= x >> 15;
  x *= 0x846ca68b;
  x ^= x >> 16;
  return x;
}

static u32 clock(void) { return ((u32 (*)(void))rf_time_low)(); }

/* A fresh nonzero 16-bit seed: from the clock, or the run's seed and a counter. */
static u16 new_seed(u32 stream, u32 count) {
  u32 x = D->clock ? hash(clock() ^ (stream << 20) ^ count) : hash(D->run_seed ^ hash(stream * 0x10001 + count));
  return (u16)(x | 1);
}

/* A class's side: 0 melee, 1 ranged. */
static u32 side_of(u32 cls) { return (RANGED_CLASSES >> cls) & 1; }

/* ---- the rolls ---- */

static u32 rng;
static u32 next(void) {
  rng ^= rng << 13;
  rng ^= rng >> 17;
  rng ^= rng << 5;
  return rng;
}
static u32 below(u32 n) { return n ? next() % n : 0; }

enum { ATTACK, AFFINITY, ELEMENT, SLOTS, STATS };
static const u8 budget[4] = {9, 12, 16, 20};      /* Worn, Fine, Masterwork, Heirloom */
static const u8 tier_odds[4] = {60, 88, 98, 100}; /* cumulative percent */
/* Each archetype's weights for spending points: raw, keen, elemental, slotted. */
static const u8 weights[4][STATS] = {{6, 2, 1, 1}, {3, 6, 1, 1}, {3, 1, 6, 1}, {3, 2, 2, 5}};

/* Fills `rec` (a melee or ranged record) with candidate `k` of `seed` for band `b`. */
static void roll(u8 *rec, u32 b, u32 seed, u32 k) {
  const struct band *bd = &D->band[b];
  u32 cls = b % CLASSES;
  u32 ranged = side_of(cls);
  u32 size = ranged ? RANGED_STATS : MELEE_STATS;
  rng = hash(seed * 0x9e3779b1u + k * 0x85ebca6bu + b) | 1;
  /* The frame: one of the band's own weapons gives model, sharpness, notes, ammo. */
  const u8 *donor = (const u8 *)D->stats[ranged] + DONORS[bd->donor_at + below(bd->donors)] * size;
  for (u32 i = 0; i < size; i++) rec[i] = donor[i];
  u32 tier = 0, t = below(100);
  while (t >= tier_odds[tier]) tier++;
  u32 points = budget[tier];
  u32 arch = (seed + k) % 4;
  u32 noelem = (NO_ELEMENT >> cls) & 1;
  if (noelem && arch == 2) arch = 0;
  u8 notch[STATS] = {2, 0, 0, 0};
  points -= 2;
  while (points) {
    u32 total = 0;
    u8 w[STATS];
    for (u32 s = 0; s < STATS; s++) {
      u32 cap = (s == ATTACK || s == ELEMENT) ? D->cap : 6;
      u32 cost = notch[s] >= 6 ? 2 : 1;
      w[s] = (notch[s] >= cap || cost > points || (s == ELEMENT && noelem)) ? 0 : weights[arch][s];
      total += w[s];
    }
    if (!total) break;
    u32 r = below(total), s = 0;
    while (r >= w[s]) r -= w[s++];
    points -= notch[s] >= 6 ? 2 : 1;
    notch[s]++;
  }
  /* Attack: 70% of the rank's best at notch 0, +5% a notch (100% at 6). */
  u32 attack = (u32)bd->best_attack * (70 + 5 * notch[ATTACK]) / 100;
  s32 affinity = (s32)notch[AFFINITY] * 6 - 10;
  u32 element = 0;
  if (notch[ELEMENT]) {
    u32 e = notch[ELEMENT];
    element = e <= 6 ? bd->best_element * e / 6 : bd->best_element * (100 + 8 * (e - 6)) / 100;
    if (element > 255) element = 255;
    if (!element) element = 1;
  }
  u32 slots = notch[SLOTS] / 2;
  if (slots > 3) slots = 3;
  u32 rarity = bd->rarity + tier;
  if (rarity > 9) rarity = 9;
  u32 price = (rarity + 1) * 1000;
  rec[2] = (u8)rarity;
  rec[4] = (u8)price;
  rec[5] = (u8)(price >> 8);
  rec[6] = (u8)(price >> 16);
  rec[7] = 0;
  if (!ranged) {
    rec[10] = (u8)attack;
    rec[11] = (u8)(attack >> 8);
    rec[12] = 0; /* defense */
    rec[13] = (u8)(affinity & 0xff);
    if (element) {
      if (!rec[14] && rec[16]) {
        rec[17] = (u8)element; /* the frame's status */
      } else {
        if (!rec[14]) rec[14] = (u8)(1 + below(5));
        rec[15] = (u8)element;
        rec[16] = 0;
        rec[17] = 0;
      }
    } else {
      rec[14] = rec[15] = rec[16] = rec[17] = 0;
    }
    rec[18] = (u8)slots;
  } else {
    rec[8] = (u8)attack;
    rec[9] = (u8)(attack >> 8);
    rec[10] = 0;
    rec[12] = (u8)slots;
    rec[13] = (u8)(affinity & 0xff);
    if (!noelem) {
      if (element && !rec[17]) rec[17] = (u8)(1 + below(5));
      rec[18] = (u8)element;
      if (!element) rec[17] = 0;
    }
  }
}

/* ---- the tables ---- */

static u8 *record(u32 side, u32 id) {
  return (u8 *)D->stats[side] + id * (side ? RANGED_STATS : MELEE_STATS);
}
static u16 *targets(u32 side, u32 id) {
  return (u16 *)((u8 *)D->upgrade[side] + id * UPGRADE_ENTRY + UPGRADE_TARGETS);
}

static struct rf_relic *kept(u32 side, u32 i) { return &rf_save_data()->relic_kept[side][i]; }

/* Instance i of a side, or -1 if `id` isn't one. */
static s32 instance(u32 side, u32 id) {
  u32 first = D->first[side];
  return id >= first && id < first + D->instances ? (s32)(id - first) : -1;
}

/* The band whose Unpolished Relic `id` is, or -1. */
static s32 unpolished(u32 side, u32 id) {
  for (u32 b = 0; b < BANDS; b++) {
    if (side_of(b % CLASSES) == side && D->band[b].unpolished == id) return (s32)b;
  }
  return -1;
}

/* ---- the sync ---- */

static u8 used[SIDES][INSTANCES];
static u8 present[BANDS];

static void scan_box(void) {
  for (u32 s = 0; s < SIDES; s++)
    for (u32 i = 0; i < INSTANCES; i++) used[s][i] = 0;
  for (u32 b = 0; b < BANDS; b++) present[b] = 0;
  const u8 *slot = hunter + HUNTER_BOX;
  for (u32 n = 0; n < BOX_SLOTS; n++, slot += SLOT_BYTES) {
    u32 type = slot[1];
    if (type != MELEE && type != RANGED) continue;
    u32 side = type == RANGED;
    u32 id = slot[2] | (slot[3] << 8);
    s32 i = instance(side, id);
    if (i >= 0) {
      used[side][i] = 1;
      continue;
    }
    s32 b = unpolished(side, id);
    if (b >= 0) present[b] = 1;
  }
}

static u32 offered(u32 side, u32 id) {
  struct rf_save_data *sd = rf_save_data();
  for (u32 b = 0; b < BANDS; b++) {
    if (side_of(b % CLASSES) != side) continue;
    for (u32 k = 0; k < 3; k++)
      if (sd->relic_candidate[b][k] == id) return 1;
  }
  return 0;
}

/* Writes the records of every relic the save keeps. */
static void write_kept(void) {
  for (u32 s = 0; s < SIDES; s++) {
    for (u32 i = 0; i < D->instances; i++) {
      struct rf_relic *r = kept(s, i);
      if (r->seed) roll(record(s, D->first[s] + i), r->band, r->seed, r->k);
    }
  }
}

/* Gives band b three new candidates (or as many free instances as there are). */
static void offer(u32 b) {
  struct rf_save_data *sd = rf_save_data();
  u32 side = side_of(b % CLASSES);
  if (!sd->relic_seed[b]) sd->relic_seed[b] = new_seed(b, sd->relic_polished[b]);
  u16 *t = targets(side, D->band[b].unpolished);
  u32 i = 0;
  for (u32 k = 0; k < 3; k++) {
    u16 id = 0;
    for (; i < D->instances; i++) {
      u32 cand = D->first[side] + i;
      if (kept(side, i)->seed || used[side][i] || offered(side, cand)) continue;
      id = (u16)cand;
      i++;
      break;
    }
    sd->relic_candidate[b][k] = id;
    if (id) roll(record(side, id), b, sd->relic_seed[b], k);
    t[k] = id;
  }
}

/* A candidate in the box was improved into: keep it, and its band offers anew. */
static void commit(void) {
  struct rf_save_data *sd = rf_save_data();
  for (u32 b = 0; b < BANDS; b++) {
    u32 side = side_of(b % CLASSES);
    for (u32 k = 0; k < 3; k++) {
      u16 id = sd->relic_candidate[b][k];
      s32 i = id ? instance(side, id) : -1;
      if (i < 0 || !used[side][i] || kept(side, (u32)i)->seed) continue;
      struct rf_relic *r = kept(side, (u32)i);
      r->seed = sd->relic_seed[b];
      r->band = (u8)b;
      r->k = (u8)k;
      for (u32 j = 0; j < 3; j++) sd->relic_candidate[b][j] = 0;
      sd->relic_polished[b]++;
      sd->relic_seed[b] = 0;
      break;
    }
  }
}

static void sync_relics(void) {
  struct rf_save_data *sd = rf_save_data();
  scan_box();
  commit();
  /* Every Unpolished Relic in the box has three to offer. */
  for (u32 b = 0; b < BANDS; b++) {
    if (present[b] && !sd->relic_candidate[b][0]) offer(b);
  }
}

static u32 count_item(u32 item) {
  u32 n = 0;
  const u16 *box = (const u16 *)(hunter + HUNTER_ITEM_BOX);
  for (u32 s = 0; s < ITEM_BOX_SLOTS; s++)
    if (box[s * 2] == item) n += box[s * 2 + 1];
  const u16 *pouch = (const u16 *)(hunter + HUNTER_POUCH);
  for (u32 s = 0; s < POUCH_SLOTS; s++)
    if (pouch[s * 2] == item) n += pouch[s * 2 + 1];
  return n;
}

/* A new stone's class: any, but never the same three in a row. */
static u8 stone_class(u32 rank, u32 len, const u8 *queue) {
  struct rf_save_data *sd = rf_save_data();
  u32 x = new_seed(0x100 + rank, sd->relic_stones_seen[rank]++);
  u32 cls = x % CLASSES;
  if (len >= 2 && queue[len - 1] == cls && queue[len - 2] == cls) cls = (cls + 1 + (x >> 8) % (CLASSES - 1)) % CLASSES;
  return (u8)cls;
}

/* Drops the queue's front stone. */
static void pop(u8 *q, u32 *len) {
  for (u32 i = 1; i < *len; i++) q[i - 1] = q[i];
  (*len)--;
}

static void sync_stones(void) {
  struct rf_save_data *sd = rf_save_data();
  for (u32 r = 0; r < RANKS; r++) {
    u32 count = count_item(D->stone[r]);
    u8 *q = sd->relic_queue[r];
    u32 len = sd->relic_queue_len[r];
    if (len > QUEUE) len = 0;
    /* Used or sold: from the front, also past the queue's 16 (the count, not the queue, fell). */
    for (u32 n = count < held[r] ? held[r] - count : 0; n && len; n--) pop(q, &len);
    held[r] = count;
    u32 have = count > QUEUE ? QUEUE : count;
    while (len > have) pop(q, &len);
    while (len < have) {
      q[len] = stone_class(r, len, q);
      len++;
    }
    sd->relic_queue_len[r] = (u8)len;
    /* The Create entry makes the front stone's Unpolished Relic. */
    u32 cls = len ? q[0] : 0;
    u8 *e = (u8 *)D->create[r];
    u16 id = D->band[r * CLASSES + cls].unpolished;
    e[CREATE_TYPE] = side_of(cls) ? RANGED : MELEE;
    e[CREATE_ID] = (u8)id;
    e[CREATE_ID + 1] = (u8)(id >> 8);
  }
}

static void sync(void) {
  if (!ready) return;
  sync_stones();
  sync_relics();
}

/* ---- hooks ---- */

static void pad(u8 *arg) {
  (void)arg;
  if (++frame % 8 == 0) sync();
}

static void quest_frame(u8 *q) {
  const u8 *header = *(const u8 **)(q + Q_HEADER);
  if ((u32)header < 0x08800000 || (u32)header >= 0x0a000000) return;
  u32 rank = header[H_RANK];
  rank_seen = rank == 5 ? 2 : rank == 2 ? 1 : 0;
  in_quest = 1;
}

/* A completed quest: maybe a stone of its rank, always for a rank's first. */
static void rewards(u8 *arg) {
  (void)arg;
  /* Only after a quest whose rank was read: never a stale or guessed rank. */
  if (!ready || !in_quest) return;
  in_quest = 0;
  struct rf_save_data *sd = rf_save_data();
  u32 r = rank_seen;
  u32 first = !(sd->relic_given & (1u << r));
  if (!first && hash(clock() ^ sd->relic_stones_seen[r] * 0x2545f491u) % 100 >= D->chance) return;
  u16 *box = (u16 *)(save + SAVE_REWARDS);
  for (u32 s = 0; s < REWARD_SLOTS; s++, box += 2) {
    if (box[0]) continue;
    box[0] = D->stone[r];
    box[1] = 1;
    sd->relic_given |= (u8)(1u << r);
    return;
  }
}

void rf_relics_init(u32 reason, u8 *s) {
  (void)reason;
  save = s;
  hunter = s + SAVE_HUNTER;
  struct rf_save_data *sd = rf_save_data();
  scan_box();
  commit();
  /* Relics no longer held, and offers for Unpolished Relics no longer held, are freed. */
  for (u32 side = 0; side < SIDES; side++)
    for (u32 i = 0; i < D->instances; i++)
      if (!used[side][i]) kept(side, i)->seed = 0;
  for (u32 b = 0; b < BANDS; b++) {
    if (present[b]) continue;
    for (u32 k = 0; k < 3; k++) sd->relic_candidate[b][k] = 0;
  }
  write_kept();
  /* The stones held at load: the queue only follows changes from here. */
  for (u32 r = 0; r < RANKS; r++) held[r] = count_item(D->stone[r]);
  /* Offers that survive the load need their records and targets again. */
  for (u32 b = 0; b < BANDS; b++) {
    if (!sd->relic_candidate[b][0]) continue;
    u32 side = side_of(b % CLASSES);
    u16 *t = targets(side, D->band[b].unpolished);
    for (u32 k = 0; k < 3; k++) {
      u16 id = sd->relic_candidate[b][k];
      t[k] = id;
      if (id) roll(record(side, id), b, sd->relic_seed[b], k);
    }
  }
  ready = 1;
  sync();
  rf_on(RF_HOOK_PAD, pad);
  rf_on(RF_HOOK_QUEST_FRAME, quest_frame);
  rf_on(RF_HOOK_REWARDS, rewards);
}
