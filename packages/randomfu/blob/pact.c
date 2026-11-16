/*
 * Hunter's Pact (setting pact.enabled): at the start of every quest, a window
 * offers three pacts drawn at random, each a penalty paired with the reward
 * it pays. The player takes any of them, then seals; taking none ("Hunt
 * without a pact") changes nothing. Penalties hold for the quest; rewards
 * are paid only if it's completed. See ../docs/code-loader.md and
 * src/patches/pact.ts, which finds the game's addresses below on each disc
 * and builds the reward pool.
 *
 * Hooks: the pad hook reads the buttons and, while the window is open,
 * keeps them from the game with its input lock (as shops and dialogues do);
 * the HUD hook opens and draws the window, in the frame of the game's
 * "item received" card, above the rest of the HUD; the quest frame hook
 * notices a new quest, holds the clock while the window is open and keeps
 * the pact's penalties in force; the rewards hook adds the pact's items to
 * the reward box and its equipment to the equipment box.
 */
#include "monsters.h"

/* Found per disc (src/patches/pact.ts). */
extern const u8 rf_game_task[]; /* game_task.ovl's load address */
extern const u8 rf_window[];    /* window(hud, rect, text, alpha): the card's frame */
extern const u8 rf_fill[];      /* fill(hud, x, y, w, h, r, g, b, alpha) */
/* item_icon(hud, item, x, y, w, h, marks, alpha): the item's icon in its colour, as the pouch's */
extern const u8 rf_item_icon[];
/* equipment_icon(hud, type, id, x, y, w, h, alpha, dim): a piece's icon in its rarity's colour */
extern const u8 rf_equipment_icon[];
extern u8 *const rf_pad[];      /* the global holding the game's pad object */
extern u8 *const rf_printer[];  /* the global holding the text printer */
extern const u8 rf_print[];     /* print(printer, x, y, format, ...): reads ~C and ~B codes */
/* Made per seed (src/patches/pact.ts, pactPool). */
extern const u8 rf_pact_pool[];

/* The quest state: the HUD object (the hooks' argument). */
#define Q_TIME 0x1230   /* s32 ticks left, counting down */
#define Q_REWARD 0x1234 /* s32 reward zenny; a faint takes Q_PENALTY off it */
#define Q_PENALTY 0x1238
/* The reward tables the reward roll reads: u16 kind, u8, u8 draws, u32 items; until a kind of 0xFFFF */
#define Q_TABLES 0x127c
#define Q_HEADER 0x126c /* the quest file, loaded */
/*
 * The quest loader skips reading a file it loaded last (the same quest
 * again), so a pact that changed the loaded file clears that index.
 */
#define Q_LAST_FILE 0x1934
#define HUD_HUNTER 0x530
#define HUD_LAYER 0x534 /* the layer the HUD draws into: 9 to 14, drawn in order */
#define TOP_LAYER 14
/* The quest file's header (packages/randomfu/src/game/quest-fields.ts, spawns.ts). */
#define H_SUPPLIES 0x08
#define H_LARGE 0x14 /* the large monster tables */
#define H_OBJECTIVES 0x28 /* two of { u32 kind, u16 id, u8 count, u8 slot } */
#define H_RANK 0x44 /* 2 High Rank, 5 G Rank, else Low */
#define H_TYPE 0x4c /* 2: a delivery */
#define H_TARGET_ID 0x70
#define H_TARGET_NUM 0x72
#define OBJECTIVE_ITEM 2
#define DELIVERY 2

/* The main reward table, which the reward screen draws from `draws` times (at most 9). */
#define TABLE_MAIN 0x8000
#define TABLE_BYTES 8
#define TABLE_DRAWS 3
#define MAX_TABLES 16
#define MAX_DRAWS 9

/* The printer: its text layer, 0 to 5 for the HUD's layers 9 to 14. */
#define PRINTER_LAYER 0x12f
#define TOP_TEXT_LAYER 5

/* The save: reward box (16 slots of item and amount, u16 each) and equipment box. */
#define SAVE_REWARDS 0x390
#define REWARD_SLOTS 16
#define SAVE_EQUIPMENT 0x548
#define EQUIPMENT_SLOTS 400
#define EQUIPMENT_SLOT 12

/* Entities (monsters and the hunter). */
#define HP 0x2e4
#define HP_RED 0x41c
#define HP_MAX 0x41e
#define STAMINA 0x55a
#define STAMINA_MAX 0x62e

/*
 * Input: the pad hook gets the system's SceCtrlData (buttons a u32 at +4,
 * the stick's y byte at +9). The game ignores input while its pad object's
 * +0x17 is 1.
 */
#define CTRL_BUTTONS 4
#define CTRL_STICK_Y 9
#define PAD_LOCK 0x17
#define B_UP 0x0010
#define B_DOWN 0x0040
#define B_CIRCLE 0x2000
#define B_CROSS 0x4000

/* The penalties. Weight (1 to 3) is how hard each is, and picks its reward. */
enum {
  HP_UP,
  HP_UP2,
  HP_UP3,
  ATK_UP,
  ATK_UP2,
  ATK_UP3,
  HALF_TIME,
  ONE_CART,
  NO_SUPPLIES,
  FRAIL,
  WEARY,
  DELIVER_MORE,
  DELIVER_DOUBLE,
  PENALTIES
};
/* What a penalty needs of the quest to mean anything. */
#define NEEDS_LARGE 1    /* a large monster */
#define NEEDS_DELIVERY 2 /* an item to deliver, other than a Paw Pass Ticket from the box */
#define NEEDS_TIME 4     /* not a quest won by surviving until time over */
static const struct {
  const char *name;
  u8 weight;
  u8 group; /* one penalty per group in an offer */
  u8 needs;
} penalty[PENALTIES] = {
    {"Monsters' health +30%", 1, 0, NEEDS_LARGE},
    {"Monsters' health +60%", 2, 0, NEEDS_LARGE},
    {"Monsters' health +100%", 3, 0, NEEDS_LARGE},
    {"Monsters' attack +30%", 1, 1, NEEDS_LARGE},
    {"Monsters' attack +60%", 2, 1, NEEDS_LARGE},
    {"Monsters' attack +100%", 3, 1, NEEDS_LARGE},
    {"Half the time", 2, 2, NEEDS_TIME},
    {"One cart: a faint fails", 3, 3, 0},
    {"No supply box", 1, 4, 0},
    {"Frail: health capped at 50", 2, 5, 0},
    {"Weary: stamina capped at half", 1, 6, 0},
    {"Deliver 50% more", 2, 7, NEEDS_DELIVERY},
    {"Deliver twice as many", 3, 7, NEEDS_DELIVERY},
};

/* The rewards. */
enum { R_ZENNY, R_DRAWS, R_ITEM, R_EQUIPMENT, REWARDS };
/*
 * Zenny: a percent of what the quest pays, by weight, but at least a set
 * amount for its rank, so a quest that pays little is still worth it.
 */
static const u8 bonus_percent[4] = {0, 50, 100, 200};
static const u16 zenny_floor[3][3] = {{600, 1200, 2400}, {2000, 4000, 8000}, {4000, 8000, 15000}};

/*
 * The reward pool, per seed: a header of spans (first entry, count), per
 * rank (Low, High, G) and kind (items of grade 1 to 3, then equipment),
 * then the entries, then their names.
 */
#define BANDS 3
#define POOL_KINDS 4
#define EQUIPMENT_KIND 3
typedef struct {
  u16 first, count;
} rf_span;
typedef struct {
  u16 id;
  u8 type;   /* 0xFF an item; else the equipment box's type (0-4 armor, 5 melee, 6 ranged) */
  u8 amount; /* items */
  u16 name;  /* offset from the pool's start */
  u16 pad;
} rf_entry;
#define ITEM 0xff
static const rf_span *span(u32 band, u32 kind) {
  return (const rf_span *)rf_pact_pool + band * POOL_KINDS + kind;
}
static const rf_entry *entry(u32 index) {
  return (const rf_entry *)(rf_pact_pool + BANDS * POOL_KINDS * sizeof(rf_span)) + index;
}

#define OFFERS 3
#define ROWS (OFFERS + 1)
typedef struct {
  u8 penalty;
  u8 reward;
  u16 value; /* draws added, or a pool entry */
} rf_offer;

/*
 * IDLE: no quest. SETTLING: a quest began; wait a little before reading it,
 * so its file and HUD are surely in place. PENDING: offers drawn, the window
 * opens on the next HUD frame.
 */
enum { IDLE, SETTLING, PENDING, OPEN, SEALED };
#define SETTLE_FRAMES 20
static u8 state;
static u8 settle;
static u8 band;  /* the quest's rank: 0 Low, 1 High, 2 G */
static u8 kinds; /* what the quest has (NEEDS_*) */
static u8 room;  /* draws the main reward table can still take */
static rf_offer offer[OFFERS];
static u8 taken; /* bit k: offer[k] */
static u8 cursor;
static u16 held;      /* the buttons last frame */
static u8 swallow;    /* keep the buttons from the game until they're all up */
static u8 locked;     /* the pact set the game's input lock */
static u32 now;       /* frames, counted by the pad hook */
static u32 drawn;     /* the frame the window was last drawn on */
static s32 time_seen; /* the clock when the quest frame hook last ran */
static s32 held_time; /* the clock while the window is open */
static u32 seed;
static u8 *save;

/* What the sealed pact does every frame, and pays at the end. */
static u8 hp_up, atk_up, frail;
static s16 weary;  /* the stamina cap, or 0 */
static u8 sealing; /* asked for by the pad hook, done on the next quest frame */
static u8 paying;  /* bit k: offer[k]'s item or equipment, until the rewards hook pays it */

static u32 random(u32 n) {
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return seed % n;
}

/* A pointer into the PSP's user memory, aligned for its words. */
static int valid(const void *p) {
  const u32 a = (u32)p;
  return a >= 0x08800000 && a < 0x0a000000 && !(a & 3);
}

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

/* The loaded quest file, if it's there. */
static u8 *header_of(u8 *q) {
  u8 *header = *(u8 **)(q + Q_HEADER);
  return valid(header) ? header : 0;
}

/* The supply box's list: { u16 item, u16 amount } up to an item of 0. */
#define MAX_SUPPLIES 64
static u16 *supplies(u8 *header) {
  const u32 at = *(u32 *)(header + H_SUPPLIES);
  return at >= 0x80 && at < 0x10000 && !(at & 3) ? (u16 *)(header + at) : 0;
}

static int in_supplies(u8 *header, u32 item) {
  u16 *s = supplies(header);
  for (u32 k = 0; s && k < MAX_SUPPLIES && s[0]; k++, s += 2) {
    if (s[0] == item) return 1;
  }
  return 0;
}

/* Whether the quest has a large monster: its tables (16 bytes, until a u16 0) list them. */
static int has_large(u8 *header) {
  const u32 at = *(u32 *)(header + H_LARGE);
  if (at < 0x80 || at >= 0x10000 || (at & 3)) return 0;
  const u8 *table = header + at;
  for (u32 t = 0; t < 8 && *(const u16 *)table; t++, table += 16) {
    const u32 data = *(const u32 *)(table + 12);
    if (data < 0x80 || data >= 0x10000 || (data & 1)) continue;
    const u8 *m = header + data;
    for (u32 k = 0; k < 8 && *(const u16 *)m != 0xffff; k++, m += 60) {
      if (*(const u16 *)m) return 1;
    }
  }
  return 0;
}

/* The quest's main reward table, if it has one. */
static u8 *main_table(u8 *q) {
  u8 *t = *(u8 **)(q + Q_TABLES);
  if ((u32)t < 0x08800000 || (u32)t >= 0x0a000000 || ((u32)t & 1)) return 0;
  for (u32 k = 0; k < MAX_TABLES && *(u16 *)t != 0xffff; k++, t += TABLE_BYTES) {
    if (*(u16 *)t == TABLE_MAIN) return t;
  }
  return 0;
}

static u32 kinds_of(u8 *q, u8 *header) {
  u32 k = NEEDS_TIME;
  if (has_large(header)) k |= NEEDS_LARGE;
  if (header[H_TYPE] == DELIVERY && *(u16 *)(header + H_TARGET_NUM)) {
    /* The gathering quests' Paw Pass Ticket comes in the box; they're won by time over too. */
    if (in_supplies(header, *(u16 *)(header + H_TARGET_ID))) k &= ~NEEDS_TIME;
    else k |= NEEDS_DELIVERY;
  }
  return k;
}

static u32 rank_band(u8 *header) {
  const u32 rank = header[H_RANK];
  return rank == 2 ? 1 : rank == 5 ? 2 : 0;
}

/* The zenny an offer adds: a percent of the quest's, at least the rank's floor. */
static u32 bonus(u8 *q, const rf_offer *o) {
  const u32 weight = penalty[o->penalty].weight;
  const u32 base = (u32) * (s32 *)(q + Q_REWARD);
  const u32 floor = zenny_floor[band][weight - 1];
  const u32 n = base > 1000000 ? 0 : base * bonus_percent[weight] / 100;
  return n > floor ? n : floor;
}

/* Whether one of the first `k` offers already gives this pool entry's item or piece. */
static int offered(u32 k, u32 value) {
  const rf_entry *e = entry(value);
  for (u32 j = 0; j < k; j++) {
    if (offer[j].reward != R_ITEM && offer[j].reward != R_EQUIPMENT) continue;
    const rf_entry *f = entry(offer[j].value);
    if (f->id == e->id && f->type == e->type) return 1;
  }
  return 0;
}

/*
 * The reward for offer `k`, whose penalty is `p`: zenny and draws of a kind
 * no other offer has (`used`), and no item or piece another offer gives.
 */
static rf_offer pick(u32 k, u32 p, u32 *used) {
  const u32 weight = penalty[p].weight, b = band;
  u32 options[REWARDS + 2], n = 0;
  if (!(*used & (1u << R_ZENNY))) options[n++] = R_ZENNY;
  /* Draws only where all of them fit, so the offer pays what it says. */
  if (weight <= room && !(*used & (1u << R_DRAWS))) options[n++] = R_DRAWS;
  if (span(b, weight - 1)->count) options[n++] = R_ITEM;
  if (weight == 3 && span(b, EQUIPMENT_KIND)->count) options[n++] = R_EQUIPMENT;
  /* Things to get come up twice as often as bonuses. */
  if (span(b, weight - 1)->count) options[n++] = R_ITEM;
  if (weight == 3 && span(b, EQUIPMENT_KIND)->count) options[n++] = R_EQUIPMENT;
  rf_offer o = {(u8)p, R_ZENNY, 0};
  while (n) {
    o.reward = (u8)options[random(n)];
    if (o.reward == R_ITEM || o.reward == R_EQUIPMENT) {
      /* From a random place in the list, the first thing no other offer gives. */
      const rf_span *s = span(b, o.reward == R_ITEM ? weight - 1 : EQUIPMENT_KIND);
      const u32 start = random(s->count);
      u32 j = 0;
      for (; j < s->count; j++) {
        o.value = (u16)(s->first + (start + j) % s->count);
        if (!offered(k, o.value)) break;
      }
      if (j == s->count) { /* all of them are offered: another kind, then */
        u32 m = 0;
        for (u32 i = 0; i < n; i++) {
          if (options[i] != o.reward) options[m++] = options[i];
        }
        n = m;
        o.reward = R_ZENNY;
        continue;
      }
    }
    if (o.reward == R_DRAWS) o.value = (u16)weight; /* one more draw per weight */
    break;
  }
  if (o.reward == R_ZENNY) o.value = 0;
  *used |= 1u << o.reward;
  return o;
}

/* What the last quest's pact did ends with it. */
static void forget(void) {
  sealing = 0;
  taken = 0;
  paying = 0;
  cursor = 0;
  hp_up = atk_up = frail = 0;
  weary = 0;
}

static void new_quest(u8 *q, u8 *header) {
  seed ^= now;
  state = PENDING;
  band = (u8)rank_band(header);
  kinds = (u8)kinds_of(q, header);
  const u8 *main = main_table(q);
  room = main && main[TABLE_DRAWS] < MAX_DRAWS ? (u8)(MAX_DRAWS - main[TABLE_DRAWS]) : 0;
  /* Three penalties from different groups that fit the quest, each with its reward. */
  u8 can[PENALTIES];
  u32 n = 0, used = 0;
  for (u32 p = 0; p < PENALTIES; p++) {
    if ((penalty[p].needs & kinds) == penalty[p].needs) can[n++] = (u8)p;
  }
  for (u32 k = 0; k < OFFERS; k++) {
    if (!n) { /* never: four groups always fit */
      offer[k] = (rf_offer){WEARY, R_ZENNY, 0};
      continue;
    }
    const u32 p = can[random(n)];
    offer[k] = pick(k, p, &used);
    u32 m = 0;
    for (u32 j = 0; j < n; j++) {
      if (penalty[can[j]].group != penalty[p].group) can[m++] = can[j];
    }
    n = m;
  }
}

/* n times (100 + percent) / 100, rounded up. */
static u32 more(u32 n, u32 percent) { return (n * (100 + percent) + 99) / 100; }

/* The delivery asks for more: its target and its item objectives. */
static void deliver_more(u8 *header, u32 percent) {
  u16 *num = (u16 *)(header + H_TARGET_NUM);
  const u32 item = *(u16 *)(header + H_TARGET_ID);
  *num = (u16)more(*num, percent);
  for (u32 k = 0; k < 2; k++) {
    u8 *o = header + H_OBJECTIVES + k * 8;
    if (*(u32 *)o != OBJECTIVE_ITEM || *(u16 *)(o + 4) != item || !o[6]) continue;
    const u32 n = more(o[6], percent);
    o[6] = (u8)(n > 255 ? 255 : n);
  }
}

static void seal(u8 *q) {
  state = SEALED;
  if (!taken) return; /* no pact: nothing changes */
  u8 *header = header_of(q);
  u8 *hunter = *(u8 **)(q + HUD_HUNTER);
  if (!valid(hunter)) hunter = 0;
  u32 zenny = 0, draws = 0, one_cart = 0;
  for (u32 k = 0; k < OFFERS; k++) {
    if (!(taken & (1u << k))) continue;
    switch (offer[k].penalty) {
    case HP_UP: hp_up = 30; break;
    case HP_UP2: hp_up = 60; break;
    case HP_UP3: hp_up = 100; break;
    case ATK_UP: atk_up = 30; break;
    case ATK_UP2: atk_up = 60; break;
    case ATK_UP3: atk_up = 100; break;
    case HALF_TIME: *(s32 *)(q + Q_TIME) /= 2; break;
    case ONE_CART: one_cart = 1; break;
    case NO_SUPPLIES: {
      /* The list ends at an item of 0, whose amount is the quest's ID. */
      u16 *s = header ? supplies(header) : 0;
      if (!s) break;
      u16 *end = s;
      for (u32 n = 0; n < MAX_SUPPLIES && end[0]; n++) end += 2;
      if (end[0]) break;
      s[1] = end[1];
      s[0] = 0;
      break;
    }
    case DELIVER_MORE:
      if (header) deliver_more(header, 50);
      break;
    case DELIVER_DOUBLE:
      if (header) deliver_more(header, 100);
      break;
    case FRAIL: frail = 1; break;
    case WEARY: {
      if (!hunter) break;
      s16 a = *(s16 *)(hunter + STAMINA), b = *(s16 *)(hunter + STAMINA_MAX);
      weary = (s16)((a > b ? a : b) / 2);
      break;
    }
    }
    switch (offer[k].reward) {
    case R_ZENNY: zenny += bonus(q, &offer[k]); break;
    case R_DRAWS: draws += offer[k].value; break;
    default: paying |= (u8)(1u << k); break;
    }
  }
  /*
   * The game pays the reward zenny only for a completed quest. A
   * faint costs the same share of the new reward as of the old.
   */
  const s32 reward = *(s32 *)(q + Q_REWARD);
  if (zenny && reward > 0) {
    *(s32 *)(q + Q_PENALTY) = (s32)((u32) * (s32 *)(q + Q_PENALTY) * (reward + zenny) / reward);
  }
  *(s32 *)(q + Q_REWARD) = reward + (s32)zenny;
  if (one_cart) *(s32 *)(q + Q_PENALTY) = *(s32 *)(q + Q_REWARD);
  /* More draws from the main reward table (offered only where they fit). */
  u8 *main = draws ? main_table(q) : 0;
  if (main) {
    const u32 n = main[TABLE_DRAWS] + draws;
    main[TABLE_DRAWS] = (u8)(n > MAX_DRAWS ? MAX_DRAWS : n);
  }
  /* The quest file changed: have the loader read it again next time. */
  if (header) *(u16 *)(q + Q_LAST_FILE) = 0xffff;
}

/* The completed quest's rewards are in the box: add the pact's. */
static void rewards(u8 *arg) {
  (void)arg;
  if (state != SEALED || !paying || !save) return;
  for (u32 k = 0; k < OFFERS; k++) {
    if (!(paying & (1u << k))) continue;
    const rf_entry *e = entry(offer[k].value);
    if (e->type == ITEM) {
      u16 *box = (u16 *)(save + SAVE_REWARDS);
      for (u32 s = 0; s < REWARD_SLOTS; s++, box += 2) {
        if (box[0]) continue;
        box[0] = e->id;
        box[1] = e->amount;
        break;
      }
    } else {
      u8 *box = save + SAVE_EQUIPMENT;
      for (u32 s = 0; s < EQUIPMENT_SLOTS; s++, box += EQUIPMENT_SLOT) {
        if (box[0] || box[1]) continue;
        for (u32 b = 0; b < EQUIPMENT_SLOT; b++) box[b] = 0;
        box[0] = 1;
        box[1] = e->type;
        box[2] = (u8)e->id;
        box[3] = (u8)(e->id >> 8);
        break;
      }
    }
  }
  paying = 0;
}

static void clamp(u8 *e, u32 field, s16 cap) {
  if (*(s16 *)(e + field) > cap) *(s16 *)(e + field) = cap;
}

/* The sealed pact, every quest frame. */
static void keep(u8 *q) {
  u8 *hunter = *(u8 **)(q + HUD_HUNTER);
  if (!valid(hunter)) return;
  if (frail) {
    clamp(hunter, HP_MAX, 50);
    clamp(hunter, HP, 50);
    clamp(hunter, HP_RED, 50);
  }
  if (weary) {
    clamp(hunter, STAMINA_MAX, weary);
    clamp(hunter, STAMINA, weary);
  }
}

/* The pact's share of the monster boosts (monsters.c). */
static void boost(u8 *m, u32 slot, rf_boost *b) {
  (void)m;
  (void)slot;
  rf_boost_by(&b->hp, hp_up);
  rf_boost_by(&b->attack, atk_up);
}

static void quest_frame(u8 *q) {
  if (!game_task_loaded()) return;
  s32 t = *(s32 *)(q + Q_TIME);
  /*
   * A new quest: none yet since the last one ended (the pad hook saw game_task
   * go), or the clock went up (it counts down, and is full at the start).
   */
  if (state == IDLE || t > time_seen) {
    forget();
    state = SETTLING;
    settle = 0;
  }
  if (state == SETTLING && ++settle >= SETTLE_FRAMES) {
    u8 *header = header_of(q);
    if (header) new_quest(q, header);
    else settle = SETTLE_FRAMES; /* not loaded yet: try again next frame */
  }
  if (state == OPEN) *(s32 *)(q + Q_TIME) = t = held_time;
  if (state == OPEN && sealing) {
    sealing = 0;
    seal(q);
    t = *(s32 *)(q + Q_TIME);
  }
  if (state == SEALED && taken) keep(q);
  time_seen = t;
}

/* Text: a small string builder, printed with the game's "%s"; ~Cnn colours, ~Bnn button icons. */
static char line[80];
static u32 at;
static void put(const char *s) {
  while (*s && at < sizeof line - 1) line[at++] = *s++;
  line[at] = 0;
}
static void put_number(u32 n) {
  char digits[10];
  int k = 0;
  do digits[k++] = (char)('0' + n % 10);
  while ((n /= 10) && k < 10);
  while (k && at < sizeof line - 1) line[at++] = digits[--k];
  line[at] = 0;
}
static const char percent_s[] = "%s";

static void text(u32 x, u32 y) {
  rf_call8(rf_print, (u32)*rf_printer, x, y, (u32)percent_s, (u32)line, 0, 0, 0);
  at = 0;
}

static void fill(u8 *hud, u32 x, u32 y, u32 w, u32 h, u32 rgb, u32 alpha) {
  rf_call9(rf_fill, (u32)hud, x, y, w, h, rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff, alpha);
}

/* The rect window() reads, as the card fills it in. */
typedef struct {
  u16 x, y, w, h;
  u8 glyph_w, glyph_h; /* the printer's glyph size: 14 x 14 */
  u8 colour;           /* the printer's colour */
  u8 style;            /* the frame: 0 is the card's */
  s16 text_x, text_y;  /* where window() prints its text (none here) */
  u8 line_height, pad[3];
} rf_rect;

/* Colours (src/hints/style.ts) and symbols the game's font has. */
#define C_WHITE "~C00"
#define C_TAKEN "~C02" /* the card's item colour */
#define C_REWARD "~C04"
#define C_TITLE "~C05" /* the game's own highlight */
#define C_DIM "~C10"
#define BOX_ON "\xe2\x96\xa0"  /* ■ */
#define BOX_OFF "\xe2\x96\xa1" /* □ */
#define STAR "\xe2\x98\x85"    /* ★ */

#define SCREEN_W 480
#define SCREEN_H 272
#define ROW 16
#define OFFER_H (2 * ROW + 4)
#define WW 368
#define WH (10 + 22 + OFFERS * OFFER_H + 2 + 22 + ROW + 8)
#define WX ((SCREEN_W - WW) / 2)
#define WY ((SCREEN_H - WH) / 2)
#define LEFT (WX + 14)
#define BOX (LEFT + 20)
#define ICON 16                 /* an item's icon, the pouch's small one */
#define REWARD (BOX + ICON + 4) /* a reward's words, after its icon or star */
#define TOP (WY + 10)
#define OFFERS_Y (TOP + 22)
#define SEAL_Y (OFFERS_Y + OFFERS * OFFER_H + 2)
#define HINT_Y (SEAL_Y + 22)

/* The game's input lock, as shops and dialogues use it; left alone if the game holds it. */
static void lock(int on) {
  u8 *p = *rf_pad;
  if (!valid(p)) return;
  if (on && !locked && !p[PAD_LOCK]) {
    p[PAD_LOCK] = 1;
    locked = 1;
  } else if (!on && locked) {
    p[PAD_LOCK] = 0;
    locked = 0;
  }
}

static void put_reward(u8 *q, const rf_offer *o) {
  switch (o->reward) {
  case R_ZENNY:
    put("Zenny +");
    put_number(bonus(q, o));
    put("z");
    break;
  case R_DRAWS:
    put("Quest rewards +");
    put_number(o->value);
    break;
  default: {
    const rf_entry *e = entry(o->value);
    put((const char *)rf_pact_pool + e->name);
    if (e->type == ITEM) {
      put(" x");
      put_number(e->amount);
    }
  }
  }
}

static void draw(u8 *q) {
  if (!game_task_loaded()) return;
  u8 *printer = *rf_printer;
  if (!valid(printer)) return;
  if (state == PENDING) {
    state = OPEN;
    held_time = *(s32 *)(q + Q_TIME);
    swallow = 1;
    lock(1); /* from the next pad read on */
  }
  if (state != OPEN) return;
  drawn = now;
  /* Above the rest of the HUD: its last layer, for the shapes and the text. */
  const u8 hud_layer = q[HUD_LAYER], text_layer = printer[PRINTER_LAYER];
  q[HUD_LAYER] = TOP_LAYER;
  printer[PRINTER_LAYER] = TOP_TEXT_LAYER;

  fill(q, 0, 0, SCREEN_W, SCREEN_H, 0x000000, 0x90);
  rf_rect r;
  r.x = WX, r.y = WY, r.w = WW, r.h = WH;
  r.glyph_w = r.glyph_h = 14;
  r.colour = 0, r.style = 0;
  r.text_x = r.text_y = 0;
  r.line_height = ROW;
  ((void (*)(u8 *, rf_rect *, const char *, u32))rf_window)(q, &r, 0, 0xff);
  const u32 bar_y = cursor < OFFERS ? OFFERS_Y + cursor * OFFER_H - 2 : SEAL_Y - 2;
  fill(q, LEFT - 6, bar_y, WW - 2 * (LEFT - 6 - WX), cursor < OFFERS ? 2 * ROW + 2 : ROW + 2,
       0xffd060, 0x48);

  put(C_TITLE "Hunter's Pact");
  text(LEFT, TOP);
  for (u32 k = 0; k < OFFERS; k++) {
    const u32 on = taken & (1u << k);
    const u32 y = OFFERS_Y + k * OFFER_H;
    put(on ? C_TAKEN BOX_ON : C_WHITE BOX_OFF);
    text(LEFT, y);
    put(on ? C_TAKEN : C_WHITE);
    put(penalty[offer[k].penalty].name);
    text(BOX, y);
    /* Items and pieces show their own icons, centred on the line's 14-pixel glyphs; the rest a star. */
    if (offer[k].reward == R_ITEM || offer[k].reward == R_EQUIPMENT) {
      const rf_entry *e = entry(offer[k].value);
      if (e->type == ITEM) {
        rf_call8(rf_item_icon, (u32)q, e->id, BOX, y + ROW - 1, ICON, ICON, 0, 0xff);
      } else {
        rf_call9(rf_equipment_icon, (u32)q, e->type, e->id, BOX, y + ROW - 1, ICON, ICON, 0xff, 0);
      }
    } else {
      put(C_TITLE STAR);
      text(BOX, y + ROW);
    }
    put(C_REWARD);
    put_reward(q, &offer[k]);
    text(REWARD, y + ROW);
  }
  put(taken ? C_TITLE "Seal the pact" : C_WHITE "Hunt without a pact");
  text(BOX, SEAL_Y);
  put(C_DIM "~B09 Choose   ~B00 ");
  put(cursor < OFFERS ? "Take" : taken ? "Seal" : "Hunt");
  text(LEFT, HINT_Y);

  q[HUD_LAYER] = hud_layer;
  printer[PRINTER_LAYER] = text_layer;
}

/* The stick, as the d-pad's up and down. */
static u32 stick(const u8 *ctrl) {
  const u8 y = ctrl[CTRL_STICK_Y];
  return y < 0x30 ? B_UP : y > 0xd0 ? B_DOWN : 0;
}

static void pad(u8 *ctrl) {
  now++;
  /* Out of the quest (the village loads lobby_task where game_task was): the next one is new. */
  if (state != IDLE && !game_task_loaded()) {
    state = IDLE;
    swallow = 0;
  }
  const u16 buttons = (u16)(*(u32 *)(ctrl + CTRL_BUTTONS) | stick(ctrl));
  if (state == OPEN && now - drawn > 2) state = PENDING; /* the HUD went: let go */
  if (state == OPEN) {
    u16 pressed = buttons & ~held;
    if (pressed & B_UP) cursor = cursor ? cursor - 1 : ROWS - 1;
    if (pressed & B_DOWN) cursor = cursor == ROWS - 1 ? 0 : cursor + 1;
    if (pressed & (B_CIRCLE | B_CROSS)) {
      if (cursor < OFFERS) taken ^= 1u << cursor;
      else sealing = 1;
    }
    swallow = 1;
  }
  held = buttons;
  /* Held until every button is up, so the one that sealed doesn't reach the hunter. */
  if (swallow && !buttons && state != OPEN) swallow = 0;
  lock(swallow);
}

void rf_pact_init(u32 reason, u8 *s) {
  (void)reason;
  save = s;
  seed = (u32)s ^ 0x9e3779b9;
  state = IDLE;
  rf_on(RF_HOOK_PAD, pad);
  rf_on(RF_HOOK_QUEST_FRAME, quest_frame);
  rf_on(RF_HOOK_HUD, draw);
  rf_on(RF_HOOK_REWARDS, rewards);
  rf_add_booster(boost);
}
