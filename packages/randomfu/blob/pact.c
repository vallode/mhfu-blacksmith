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
 * the reward box and its equipment to the equipment box. Sealing lists the
 * pacts taken in the quest's details, for its info screen.
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
/* Made per disc (src/patches/pact.ts, encodeCapturable): bit n, emID n can be captured. */
extern const u8 rf_pact_capturable[];
/*
 * Made per seed (src/patches/pact.ts, encodeDrops): what each large monster
 * drops at each rank, a span per rank and species, then u16 item IDs.
 */
extern const u8 rf_pact_drops[];
#define SPECIES 96
/*
 * Made per disc (src/patches/pact.ts, findSharpnessLevel): the EBOOT's
 * level(hunter, sharpness), the colour a sharpness is on the equipped
 * weapon's bar (0 red to 6 purple; 0 for a gunner), or 0 where it wasn't
 * found (then no blade pacts).
 */
extern const u32 rf_pact_level_fn[];
/*
 * Made per disc (src/patches/pact.ts, findFreeSlot): the EBOOT's
 * freeSlot(save), the first free slot of as many as the hunter's equipment
 * box has, or 0xFFFF; 0 where it wasn't found (free_slot() then searches).
 */
extern const u32 rf_pact_free_slot_fn[];
/*
 * Made per disc (src/patches/pact.ts, pactLevels): by rank and stars, the
 * rarities a piece of equipment may have, the lowest in the low nibble.
 */
extern const u8 rf_pact_levels[];
#define LEVEL_STARS 16

/* The quest state: the HUD object (the hooks' argument). */
#define Q_STATE 0x1220  /* u8: 0 under way, 1 completed or timed out (banner and wait), 2 rewards */
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
#define H_REWARDS 0x0c /* the reward tables: u16, u16, u32 items; until a u16 0xFFFF */
#define H_LARGE 0x14 /* the large monster tables */
#define H_OBJECTIVES 0x28 /* two of { u32 kind, u16 id, u8 count, u8 slot } */
#define H_RANK 0x44 /* 2 High Rank, 5 G Rank, else Low */
#define H_STARS 0x66
#define H_TYPE 0x4c /* 2: a delivery */
#define H_STRINGS 0x60 /* LangPTRs: 7 offsets of StringPTRs blocks (src/game/quest-text.ts) */
#define H_TARGET_ID 0x70
#define H_TARGET_NUM 0x72
#define LANGUAGES 7
#define S_DETAILS 12 /* the details' offset in a StringPTRs block: title, goal, fail, details, ... */
#define QUEST_BYTES 0x6800 /* the loader's buffer: every offset in the file is below it */
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

/*
 * The save: reward box (32 slots of item and amount, u16 each; the quest's
 * own go in the first 16, captures' and breaks' in the rest) and equipment box.
 */
#define SAVE_REWARDS 0x390
#define REWARD_SLOTS 32
#define SAVE_EQUIPMENT 0x548
#define EQUIPMENT_SLOT 12
#define NO_SLOT 0xffff
/* The fewest slots a hunter's box has. */
#define SAFE_SLOTS 800
/* The item box and the pouch: { u16 item, u16 amount } a slot (the save file's offsets + 0x4A0). */
#define SAVE_BOX 0x3428
#define BOX_SLOTS 1000
#define SAVE_POUCH 0x43c8
#define POUCH_SLOTS 24
#define STACK 99

/* Entities (monsters and the hunter). */
#define HP 0x2e4
#define HP_RED 0x41c
#define HP_MAX 0x41e
#define STAMINA 0x55a
#define STAMINA_MAX 0x62e
#define WEAPON_KIND 0x4e9 /* u8: the equipped weapon's box type, 5 melee */
#define MELEE 5
#define SHARPNESS 0x10f2     /* s16: what's left; a hit's wear takes some off (game_task's sharpen) */
#define SHARPNESS_MAX 0x60c  /* s16: the bar's length; set at the quest's start and after a cart */

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
  DULL,
  BRITTLE,
  DELIVER_MORE,
  DELIVER_DOUBLE,
  /* The jackpots: never drawn with the rest (new_quest). */
  GLASS,
  EXHAUSTED,
  BLEEDING,
  CAPTURE_ONLY,
  LOST_POUCH,
  BROKEN,
  PENALTIES
};
#define FIRST_JACKPOT GLASS
#define JACKPOTS (PENALTIES - FIRST_JACKPOT)
/* What a penalty needs of the quest to mean anything. */
#define NEEDS_LARGE 1    /* a large monster */
#define NEEDS_DELIVERY 2 /* an item to deliver, other than a Paw Pass Ticket from the box */
#define NEEDS_TIME 4     /* not a quest won by surviving until time over */
#define NEEDS_CAPTURE 8  /* large monsters, every one of which can be captured */
#define NEEDS_BLADE 16   /* a Blademaster: the hunter's weapon has sharpness above red */
#define NEEDS_TOP 32     /* its best colour is at least 1/DULL_SHARE of the bar */
#define DULL_SHARE 8
/*
 * The jackpot: about one window in JACKPOT_ODDS, on a quest with a large
 * monster, its last pact is one of the jackpots, which pay far more than
 * any other. A faint while the quest is under way loses it; finishing
 * with time left pays more of its zenny (keep()). Weight 4 is theirs.
 */
#define JACKPOT_ODDS 10
#define JACKPOT_WEIGHT 4
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
    {"Dull blade: a colour lower", 2, 9, NEEDS_BLADE | NEEDS_TOP},
    {"Brittle blade: twice the wear", 1, 9, NEEDS_BLADE},
    {"Deliver 50% more", 2, 7, NEEDS_DELIVERY},
    {"Deliver twice as many", 3, 7, NEEDS_DELIVERY},
    {"Glass: 1 health, a faint fails", JACKPOT_WEIGHT, 8, NEEDS_LARGE},
    {"Exhausted: a quarter stamina", JACKPOT_WEIGHT, 8, NEEDS_LARGE},
    {"Bleeding: health drains to 1", JACKPOT_WEIGHT, 8, NEEDS_LARGE},
    {"Capture or nothing: no kills", JACKPOT_WEIGHT, 8, NEEDS_CAPTURE},
    {"Lost pouch: items to the box", JACKPOT_WEIGHT, 8, NEEDS_LARGE},
    {"Broken blade: red sharpness", JACKPOT_WEIGHT, 8, NEEDS_LARGE | NEEDS_BLADE},
};
#define BIT(p) (1u << (p))
/*
 * Each jackpot's zenny (a percent of what the quest pays, and of the rank's
 * jackpot floor, out of 1000), how many times a hard pact's amount of its
 * rare item it gives, and the penalties a window with it leaves out.
 */
static const struct {
  u16 percent;
  u8 amount;
  u32 leaves_out;
} jackpots[JACKPOTS] = {
    {1000, 5, BIT(ONE_CART) | BIT(FRAIL)}, /* Glass holds one cart already, and its health below Frail's */
    {500, 3, BIT(WEARY)},                  /* Exhausted is Weary, worse */
    {700, 4, BIT(FRAIL)},                  /* Bleeding takes health down further than Frail */
    {600, 3, 0},
    {800, 4, 0},
    {1000, 5, BIT(DULL) | BIT(BRITTLE)}, /* Broken blade is as low as sharpness goes */
};
/* Bleeding: a point of health every this many quest frames (30 a second). */
#define BLEED_FRAMES 60

/* The rewards. */
enum { R_ZENNY, R_DRAWS, R_ITEM, R_EQUIPMENT, R_JACKPOT, REWARDS };
/* The jackpot's item, when the rank has none to give. */
#define NO_ITEM 0xffff
/*
 * Zenny: a percent of what the quest pays, by weight, but at least a set
 * amount for its rank, so a quest that pays little is still worth it.
 */
static const u8 bonus_percent[4] = {0, 50, 100, 200};
/* By weight; the last is the jackpots', at 1000 (Glass's), scaled by each one's percent. */
static const u32 zenny_floor[3][4] = {
    {600, 1200, 2400, 30000}, {2000, 4000, 8000, 100000}, {4000, 8000, 15000, 200000}};
/* The most a quest pays with its pacts: six digits, as much as any disc quest shows. */
#define ZENNY_MAX 999999

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
  u16 extra; /* an item's most in one reward (0: no limit); a piece's rarity */
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
static u8 level; /* the rarities a piece may have for the quest's stars (rf_pact_levels) */
static u8 kinds; /* what the quest has (NEEDS_*) */
static u8 room;          /* draws the main reward table can still take */
static u8 *rewards_main; /* that table, found when the offers were made */
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
static u8 jackpot;        /* the jackpot taken (its penalty), or 0 */
static u8 jackpot_lost;   /* a faint (or a kill) lost it */
static u8 jackpot_timed;  /* the quest ended: the speed bonus was paid, or there was none */
static u32 jackpot_zenny; /* the zenny it adds */
static s32 jackpot_time;  /* the clock when it was sealed */
static u8 bleed;          /* quest frames since Bleeding last took health */
static u32 seen_alive;    /* Capture or nothing: bit n, the monster in slot n was seen alive */
static u8 *quest_seen;    /* the quest state the quest frame hook was last handed */
static u8 edge_capped;    /* Dull or Broken blade: sharpness held at edge_cap */
static s16 edge_cap;
static u8 brittle;        /* Brittle blade: every bit of wear taken twice */
static s16 edge_seen;     /* the sharpness last frame */
static u32 blade_due;     /* bit p: blade penalty p, sealed while the hunter couldn't be read */
static u8 paying;  /* bit k: offer[k]'s item or equipment, until the rewards hook pays it */
/* Bit n: item n is the quest's (tie_quest), so its item rewards lean to it. */
#define TIED_ITEMS 2048
static u32 tied[TIED_ITEMS / 32];

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
/* An offset into the loaded quest file. */
static int in_file(u32 off) { return off >= 0x80 && off < QUEST_BYTES; }

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

static int capturable(u32 em) { return em < 96 && (rf_pact_capturable[em >> 3] >> (em & 7)) & 1; }

/* Whether every large monster the quest's tables list can be captured. */
static int all_capturable(u8 *header) {
  const u32 at = *(u32 *)(header + H_LARGE);
  if (at < 0x80 || at >= 0x10000 || (at & 3)) return 0;
  const u8 *table = header + at;
  for (u32 t = 0; t < 8 && *(const u16 *)table; t++, table += 16) {
    const u32 data = *(const u32 *)(table + 12);
    if (data < 0x80 || data >= 0x10000 || (data & 1)) continue;
    const u8 *m = header + data;
    for (u32 k = 0; k < 8 && *(const u16 *)m != 0xffff; k++, m += 60) {
      if (*(const u16 *)m && !capturable(*(const u16 *)m)) return 0;
    }
  }
  return 1;
}

/* The colour `sharpness` is on the hunter's weapon's bar. */
static u32 colour(u8 *hunter, s32 sharpness) {
  return ((u32(*)(u8 *, s32))rf_pact_level_fn[0])(hunter, sharpness) & 0xff;
}

/* Whether the hunter's weapon has sharpness, and the level function was found. */
static int blade(u8 *hunter) { return hunter && rf_pact_level_fn[0] && hunter[WEAPON_KIND] == MELEE; }

/* The most sharpness may be and still be below colour `below`: the top of the colour under it. */
static s16 top_below(u8 *hunter, u32 below) {
  s32 lo = 0, hi = *(s16 *)(hunter + SHARPNESS_MAX);
  if (hi < 0) hi = 0;
  while (lo < hi) { /* colour rises with sharpness; colour(lo) < below */
    const s32 mid = (lo + hi + 1) / 2;
    if (colour(hunter, mid) < below) lo = mid;
    else hi = mid - 1;
  }
  return (s16)lo;
}

static u32 kinds_of(u8 *header) {
  u32 k = NEEDS_TIME;
  if (has_large(header)) k |= NEEDS_LARGE;
  if ((k & NEEDS_LARGE) && all_capturable(header)) k |= NEEDS_CAPTURE;
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

static void tie(u32 item) {
  if (item && item < TIED_ITEMS) tied[item >> 5] |= 1u << (item & 31);
}
static int is_tied(u32 item) { return item < TIED_ITEMS && (tied[item >> 5] >> (item & 31)) & 1; }

/*
 * What the quest is about: what its large monsters drop at its rank, and
 * what its own reward tables give, as the shuffles left them. A Tigrex hunt
 * pays Tigrex parts, where the pool has any that fit (pick()).
 */
static void tie_quest(u8 *header) {
  for (u32 w = 0; w < TIED_ITEMS / 32; w++) tied[w] = 0;
  const u32 at = *(u32 *)(header + H_LARGE);
  if (in_file(at) && !(at & 3)) {
    const u8 *table = header + at;
    for (u32 t = 0; t < 8 && *(const u16 *)table; t++, table += 16) {
      const u32 data = *(const u32 *)(table + 12);
      if (!in_file(data) || (data & 1)) continue;
      const u8 *m = header + data;
      for (u32 k = 0; k < 8 && *(const u16 *)m != 0xffff; k++, m += 60) {
        const u32 em = *(const u16 *)m;
        if (!em || em >= SPECIES) continue;
        const rf_span *s = (const rf_span *)rf_pact_drops + band * SPECIES + em;
        const u16 *items = (const u16 *)(rf_pact_drops + BANDS * SPECIES * sizeof(rf_span));
        for (u32 j = 0; j < s->count; j++) tie(items[s->first + j]);
      }
    }
  }
  const u32 rewards = *(u32 *)(header + H_REWARDS);
  if (!in_file(rewards) || (rewards & 3)) return;
  const u8 *t = header + rewards;
  for (u32 k = 0; k < MAX_TABLES && *(const u16 *)t != 0xffff; k++, t += TABLE_BYTES) {
    const u32 items = *(const u32 *)(t + 4);
    if (!in_file(items) || (items & 1)) continue;
    /* { u16 chance, u16 item, u16 amount }, until a chance of 0xFFFF */
    const u16 *i = (const u16 *)(header + items);
    for (u32 j = 0; j < 64 && in_file(items + j * 6 + 6) && i[0] != 0xffff; j++, i += 3) {
      tie(i[1]);
    }
  }
}

/* The zenny an offer adds: a percent of the quest's, at least the rank's floor. */
static u32 bonus(u8 *q, const rf_offer *o) {
  const u32 weight = penalty[o->penalty].weight;
  const u32 base = (u32) * (s32 *)(q + Q_REWARD);
  const int big = o->reward == R_JACKPOT;
  const u32 percent = big ? jackpots[o->penalty - FIRST_JACKPOT].percent : bonus_percent[weight];
  const u32 floor = big ? zenny_floor[band][3] * percent / 1000 : zenny_floor[band][weight - 1];
  const u32 n = base > 1000000 ? 0 : base * percent / 100;
  const u32 b = n > floor ? n : floor;
  /* A jackpot's would pass six digits on a quest that pays well: as much as fits. */
  if (big && base + b > ZENNY_MAX) return base < ZENNY_MAX ? ZENNY_MAX - base : 0;
  return b;
}

/* Whether an offer gives an item or piece from the pool (its icon, the rewards hook). */
static int gives_entry(const rf_offer *o) {
  return o->reward == R_ITEM || o->reward == R_EQUIPMENT ||
         (o->reward == R_JACKPOT && o->value != NO_ITEM);
}

/* Whether one of the first `k` offers, or the jackpot, already gives this pool entry's item or piece. */
static int offered(u32 k, u32 value) {
  const rf_entry *e = entry(value);
  for (u32 j = 0; j < OFFERS; j++) {
    /* The first k, and the jackpot (the last), which is drawn first. */
    if (j >= k && !(j == OFFERS - 1 && offer[j].reward == R_JACKPOT)) continue;
    if (!gives_entry(&offer[j])) continue;
    const rf_entry *f = entry(offer[j].value);
    if (f->id == e->id && f->type == e->type) return 1;
  }
  return 0;
}

/*
 * The reward for offer `k`, whose penalty is `p`: zenny and draws of a kind
 * no other offer has (`used`), and no item or piece another offer gives;
 * a reward of REWARDS when nothing is left for it.
 */
/* Whether a piece of equipment fits the quest's stars. */
static int fits_level(const rf_entry *e) { return e->extra >= (level & 15) && e->extra <= (level >> 4); }

/* The first free slot of the equipment box, or NO_SLOT. */
static u32 free_slot(void) {
  if (rf_pact_free_slot_fn[0]) return ((u32(*)(u8 *))rf_pact_free_slot_fn[0])(save);
  for (u32 s = 0; s < SAFE_SLOTS; s++) {
    if (!save[SAVE_EQUIPMENT + s * EQUIPMENT_SLOT]) return s;
  }
  return NO_SLOT;
}

/*
 * Whether the box has room for another piece besides those the first `k`
 * offers give: fills free slots to find the next, then empties them again.
 */
static int box_room(u32 k) {
  u32 pieces = 0, found[OFFERS], n = 0;
  for (u32 j = 0; j < k; j++) pieces += offer[j].reward == R_EQUIPMENT;
  while (n <= pieces) {
    const u32 s = free_slot();
    if (s == NO_SLOT) break;
    save[SAVE_EQUIPMENT + s * EQUIPMENT_SLOT] = 1;
    found[n++] = s;
  }
  const int room_left = n > pieces;
  while (n) save[SAVE_EQUIPMENT + found[--n] * EQUIPMENT_SLOT] = 0;
  return room_left;
}

/* Whether the rank has a piece that fits the quest's stars. */
static int pieces_fit(void) {
  const rf_span *s = span(band, EQUIPMENT_KIND);
  for (u32 j = 0; j < s->count; j++) {
    if (fits_level(entry(s->first + j))) return 1;
  }
  return 0;
}

#define NONE 0xffffffffu
/*
 * From `start` on (wrapping), the first entry of `s` no other offer gives:
 * a piece that fits the quest's stars, or an item tied to this quest. NONE
 * if there's none: never another quest's item, nor one no quest is tied to.
 */
static u32 find(u32 k, const rf_span *s, u32 start) {
  for (u32 j = 0; j < s->count; j++) {
    const u32 v = s->first + (start + j) % s->count;
    const rf_entry *e = entry(v);
    if (e->type == ITEM ? !is_tied(e->id) : !fits_level(e)) continue;
    if (!offered(k, v)) return v;
  }
  return NONE;
}

/* An entry of `s` from a random place: an item tied to the quest, or a piece that fits. */
static u32 choose(u32 k, const rf_span *s) {
  return s->count ? find(k, s, random(s->count)) : NONE;
}

/* Whether the quest has an item in `grade` that no other offer gives. */
static int items_fit(u32 k, u32 grade) {
  const rf_span *s = span(band, grade);
  for (u32 j = 0; j < s->count; j++) {
    const u32 v = s->first + j;
    if (is_tied(entry(v)->id) && !offered(k, v)) return 1;
  }
  return 0;
}

static rf_offer pick(u32 k, u32 p, u32 *used) {
  const u32 weight = penalty[p].weight, b = band;
  u32 options[REWARDS + 2], n = 0;
  if (!(*used & (1u << R_ZENNY))) options[n++] = R_ZENNY;
  /* Draws only where all of them fit, so the offer pays what it says. */
  if (weight <= room && !(*used & (1u << R_DRAWS))) options[n++] = R_DRAWS;
  const int items = items_fit(k, weight - 1), pieces = weight == 3 && pieces_fit() && box_room(k);
  if (items) options[n++] = R_ITEM;
  if (pieces) options[n++] = R_EQUIPMENT;
  /* Things to get come up twice as often as bonuses. */
  if (items) options[n++] = R_ITEM;
  if (pieces) options[n++] = R_EQUIPMENT;
  rf_offer o = {(u8)p, REWARDS, 0};
  while (n) {
    o.reward = (u8)options[random(n)];
    if (o.reward == R_ITEM || o.reward == R_EQUIPMENT) {
      /* Something no other offer gives, the quest's own if there is one. */
      const u32 v = choose(k, span(b, o.reward == R_ITEM ? weight - 1 : EQUIPMENT_KIND));
      o.value = (u16)v;
      if (v == NONE) { /* all of them are offered: another kind, then */
        u32 m = 0;
        for (u32 i = 0; i < n; i++) {
          if (options[i] != o.reward) options[m++] = options[i];
        }
        n = m;
        o.reward = REWARDS;
        continue;
      }
    }
    if (o.reward == R_DRAWS) o.value = (u16)weight; /* one more draw per weight */
    if (o.reward == R_ZENNY) o.value = 0;
    *used |= 1u << o.reward;
    break;
  }
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
  jackpot = jackpot_lost = jackpot_timed = 0;
  jackpot_zenny = 0;
  bleed = 0;
  seen_alive = 0;
  edge_capped = brittle = 0;
  blade_due = 0;
}

/*
 * The jackpot `p`, offer `k` (the last): a rare item no other offer gives,
 * from the rank's hardest grade, and many times the quest's zenny (bonus()).
 */
static rf_offer draw_jackpot(u32 k, u32 p) {
  rf_offer o = {(u8)p, R_JACKPOT, NO_ITEM};
  const u32 v = choose(k, span(band, 2));
  if (v != NONE) o.value = (u16)v;
  return o;
}

static void new_quest(u8 *q, u8 *header) {
  seed ^= now;
  state = PENDING;
  offer[OFFERS - 1].reward = REWARDS; /* no jackpot, until one's drawn */
  band = (u8)rank_band(header);
  const u32 stars = header[H_STARS] < LEVEL_STARS ? header[H_STARS] : LEVEL_STARS - 1;
  level = rf_pact_levels[band * LEVEL_STARS + stars];
  tie_quest(header);
  kinds = (u8)kinds_of(header);
  u8 *hunter = *(u8 **)(q + HUD_HUNTER);
  if (valid(hunter) && blade(hunter)) {
    const s32 max = *(s16 *)(hunter + SHARPNESS_MAX);
    const u32 best = colour(hunter, max);
    /* An all-red bar has nothing for a blade pact to take. */
    if (best) kinds |= NEEDS_BLADE;
    /* Dull blade only where the best colour is a fair share of the bar, so it costs something. */
    if (best && (max - top_below(hunter, best)) * DULL_SHARE >= max) kinds |= NEEDS_TOP;
  }
  rewards_main = main_table(q);
  const u32 draws = rewards_main ? rewards_main[TABLE_DRAWS] : MAX_DRAWS;
  room = draws < MAX_DRAWS ? (u8)(MAX_DRAWS - draws) : 0;
  /* Rarely, a jackpot that fits the quest: then nothing it holds already or overrides. */
  u32 rare = 0, leaves_out = 0;
  if ((kinds & NEEDS_LARGE) && !random(JACKPOT_ODDS)) {
    u8 fits[JACKPOTS];
    u32 m = 0;
    for (u32 p = FIRST_JACKPOT; p < PENALTIES; p++) {
      if ((penalty[p].needs & kinds) == penalty[p].needs) fits[m++] = (u8)p;
    }
    const u32 p = fits[random(m)]; /* Glass, at least: it needs only a large monster */
    leaves_out = jackpots[p - FIRST_JACKPOT].leaves_out;
    offer[OFFERS - 1] = draw_jackpot(0, p);
    rare = 1;
  }
  /* Three penalties from different groups that fit the quest, each with its reward. */
  u8 can[PENALTIES];
  u32 n = 0, used = 0;
  for (u32 p = 0; p < FIRST_JACKPOT; p++) {
    if (leaves_out & BIT(p)) continue;
    if ((penalty[p].needs & kinds) == penalty[p].needs) can[n++] = (u8)p;
  }
  for (u32 k = 0; k < OFFERS - rare; k++) {
    /* A penalty with nothing left to pay gives way to another. */
    u32 p = WEARY;
    rf_offer o = {WEARY, REWARDS, 0};
    while (n && o.reward == REWARDS) {
      const u32 j = random(n);
      p = can[j];
      o = pick(k, p, &used);
      if (o.reward == REWARDS) can[j] = can[--n];
    }
    /* Every penalty left has nothing to pay (an empty pool): zenny, if again. */
    if (o.reward == REWARDS) o = (rf_offer){(u8)p, R_ZENNY, 0};
    offer[k] = o;
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

/*
 * Text: a small string builder. `line` is printed with the game's "%s"
 * (~Cnn colours, ~Bnn button icons); `listed` is the sealed pact, for the
 * quest's text.
 */
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

/* How many of its item a jackpot gives. */
static u32 jackpot_amount(const rf_offer *o, const rf_entry *e) {
  u32 n = e->amount * jackpots[o->penalty - FIRST_JACKPOT].amount;
  /* No more than its share of what the recipes need (pactPool's demand). */
  const u32 most = e->extra;
  if (most && n > most) n = most > e->amount ? most : e->amount;
  return n > STACK ? STACK : n;
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
  case R_JACKPOT:
    if (o->value != NO_ITEM) {
      const rf_entry *e = entry(o->value);
      put((const char *)rf_pact_pool + e->name);
      put(" x");
      put_number(jackpot_amount(o, e));
      put(" +");
    } else {
      put("Zenny +");
    }
    put_number(bonus(q, o));
    put("z");
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

/* What every jackpot asks besides its penalty, and pays for. */
#define JACKPOT_RULE "No faints; faster pays more"

/* A symbol the game's font has (src/hints/style.ts). */
#define STAR "\xe2\x98\x85" /* ★ */

static char listed[OFFERS * 2 * sizeof line];
static u32 listed_at;
static void list_line(void) {
  for (u32 k = 0; k < at && listed_at < sizeof listed - 1; k++) listed[listed_at++] = line[k];
  if (listed_at < sizeof listed - 1) listed[listed_at++] = '\n';
  listed[listed_at] = 0;
  at = 0;
}

/*
 * The offer, as lines of `listed`: its penalty, then its reward after a
 * star (the window draws an item's or piece's icon there; text can't).
 * Before seal() pays it: bonus() reads what the quest pays.
 */
static void list_offer(u8 *q, const rf_offer *o) {
  put(penalty[o->penalty].name);
  list_line();
  put(STAR " ");
  put_reward(q, o);
  list_line();
  if (o->reward == R_JACKPOT) {
    put(JACKPOT_RULE);
    list_line();
  }
}

/*
 * The quest's details (page 4 of its info, "Quest Details:", about seven
 * lines) list the sealed pact in place of the description, in every
 * language: the quest's text is its file's, which the game reads by offset
 * from the file's start each time it shows it, so each block's details
 * offset is pointed at `listed` (the sum wraps). The fail conditions (page
 * 3) have one spare line, too few. The file is read again for the next
 * quest (seal() clears the loader's cache).
 */
static void list_in_text(u8 *header) {
  const u32 table = *(u32 *)(header + H_STRINGS);
  if (!in_file(table) || (table & 3) || !listed_at) return;
  listed[--listed_at] = 0; /* the last line's break */
  for (u32 lang = 0; lang < LANGUAGES; lang++) {
    const u32 block = *(u32 *)(header + table + lang * 4);
    if (in_file(block) && !(block & 3)) {
      *(u32 *)(header + block + S_DETAILS) = (u32)listed - (u32)header;
    }
  }
}

/* One pouch slot into the item box: onto stacks of it first, then a free slot; what doesn't fit stays. */
static void stash(u16 *slot) {
  u16 *box = (u16 *)(save + SAVE_BOX);
  for (u32 pass = 0; pass < 2; pass++) {
    for (u32 s = 0; s < BOX_SLOTS && slot[1]; s++) {
      u16 *b = box + s * 2;
      if (pass == 0 ? b[0] != slot[0] || b[1] >= STACK : b[0] != 0) continue;
      if (!b[0]) b[1] = 0;
      b[0] = slot[0];
      const u32 n = STACK - b[1] < slot[1] ? STACK - b[1] : slot[1];
      b[1] = (u16)(b[1] + n);
      slot[1] = (u16)(slot[1] - n);
    }
  }
  if (!slot[1]) slot[0] = 0;
}

/* Lost pouch: everything in it goes to the item box, as if left at home. */
static void lose_pouch(void) {
  if (!save) return;
  u16 *pouch = (u16 *)(save + SAVE_POUCH);
  for (u32 k = 0; k < POUCH_SLOTS; k++, pouch += 2) {
    if (!pouch[0]) continue;
    if (!pouch[1]) pouch[0] = 0;
    else stash(pouch);
  }
}

/* Sharpness held at the top of the colour under `below` (Dull and Broken blade). */
static void cap_edge(u8 *hunter, u32 below) {
  if (!blade(hunter) || !below) return;
  edge_cap = top_below(hunter, below);
  edge_capped = 1;
}

/* A blade pact's penalty, on a hunter that can be read. */
static void blade_penalty(u8 *hunter, u32 p) {
  if (!blade(hunter)) return;
  if (p == DULL) cap_edge(hunter, colour(hunter, *(s16 *)(hunter + SHARPNESS_MAX)));
  if (p == BROKEN) cap_edge(hunter, 1); /* red */
  if (p == BRITTLE) {
    brittle = 1;
    edge_seen = *(s16 *)(hunter + SHARPNESS);
  }
}

static void seal(u8 *q) {
  state = SEALED;
  if (!taken) return; /* no pact: nothing changes */
  u8 *header = header_of(q);
  u8 *hunter = *(u8 **)(q + HUD_HUNTER);
  if (!valid(hunter)) hunter = 0;
  u32 zenny = 0, draws = 0, one_cart = 0;
  at = listed_at = 0;
  for (u32 k = 0; k < OFFERS; k++) {
    if (!(taken & (1u << k))) continue;
    /*
     * A blade pact on a hunter without a blade: neither its penalty nor its
     * reward. One the hunter can't be read for yet (it was a blade when
     * offered) holds, and its penalty waits for the hunter (keep).
     */
    if ((penalty[offer[k].penalty].needs & NEEDS_BLADE) && hunter && !blade(hunter)) continue;
    list_offer(q, &offer[k]);
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
    case GLASS: one_cart = 1; break;
    case EXHAUSTED: {
      if (!hunter) break;
      s16 a = *(s16 *)(hunter + STAMINA), b = *(s16 *)(hunter + STAMINA_MAX);
      weary = (s16)((a > b ? a : b) / 4);
      break;
    }
    case LOST_POUCH: lose_pouch(); break;
    case DULL:
    case BROKEN:
    case BRITTLE:
      if (hunter) blade_penalty(hunter, offer[k].penalty);
      else blade_due |= BIT(offer[k].penalty);
      break;
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
    case R_JACKPOT:
      jackpot = offer[k].penalty;
      jackpot_zenny = bonus(q, &offer[k]);
      zenny += jackpot_zenny;
      if (offer[k].value != NO_ITEM) paying |= (u8)(1u << k);
      break;
    default: paying |= (u8)(1u << k); break;
    }
  }
  /*
   * The game pays the reward zenny only for a completed quest. A
   * faint costs the same share of the new reward as of the old.
   */
  const s32 reward = *(s32 *)(q + Q_REWARD);
  /* Six digits at most, with the jackpot's and another zenny pact's together. */
  if (reward >= 0 && (u32)reward + zenny > ZENNY_MAX) {
    zenny = (u32)reward < ZENNY_MAX ? ZENNY_MAX - (u32)reward : 0;
  }
  if (zenny && reward > 0) {
    *(s32 *)(q + Q_PENALTY) = (s32)((u32) * (s32 *)(q + Q_PENALTY) * (reward + zenny) / reward);
  }
  *(s32 *)(q + Q_REWARD) = reward + (s32)zenny;
  if (one_cart) *(s32 *)(q + Q_PENALTY) = *(s32 *)(q + Q_REWARD);
  /* More draws from the main reward table (offered only where they fit). */
  u8 *main = draws ? rewards_main : 0;
  if (main) {
    const u32 n = main[TABLE_DRAWS] + draws;
    main[TABLE_DRAWS] = (u8)(n > MAX_DRAWS ? MAX_DRAWS : n);
  }
  jackpot_time = *(s32 *)(q + Q_TIME); /* after Half the time */
  if (header) list_in_text(header);
  /* The quest file changed: have the loader read it again next time. */
  if (header || main) *(u16 *)(q + Q_LAST_FILE) = 0xffff;
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
        box[1] = (u16)(offer[k].reward == R_JACKPOT ? jackpot_amount(&offer[k], e) : e->amount);
        break;
      }
    } else {
      const u32 s = free_slot();
      if (s == NO_SLOT) continue;
      u8 *box = save + SAVE_EQUIPMENT + s * EQUIPMENT_SLOT;
      for (u32 b = 0; b < EQUIPMENT_SLOT; b++) box[b] = 0;
      box[0] = 1;
      box[1] = e->type;
      box[2] = (u8)e->id;
      box[3] = (u8)(e->id >> 8);
    }
  }
  paying = 0;
}

/*
 * The jackpot is lost: its item isn't paid and its zenny comes off the
 * reward, and off the faint's penalty, so One cart's stays the whole reward.
 */
static void lose_jackpot(u8 *q) {
  if (!jackpot || jackpot_lost) return;
  jackpot_lost = 1;
  for (u32 k = 0; k < OFFERS; k++) {
    if (offer[k].reward == R_JACKPOT) paying &= (u8) ~(1u << k);
  }
  s32 *reward = (s32 *)(q + Q_REWARD), *penalty = (s32 *)(q + Q_PENALTY);
  *reward = *reward > (s32)jackpot_zenny ? *reward - (s32)jackpot_zenny : 0;
  *penalty = *penalty > (s32)jackpot_zenny ? *penalty - (s32)jackpot_zenny : 0;
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
  for (u32 p = 0; blade_due; p++) {
    if (blade_due & BIT(p)) blade_penalty(hunter, p);
    blade_due &= ~BIT(p);
  }
  /*
   * Brittle blade: what the hits took since last frame, taken again (a
   * whetstone's sharpening, and the cart's refill, aren't). Then the cap:
   * the bar ends at it, so a whetstone sharpens up to it and no further.
   */
  s16 *edge = (s16 *)(hunter + SHARPNESS);
  if (brittle && *edge < edge_seen) {
    const s32 v = 2 * *edge - edge_seen;
    *edge = (s16)(v > 0 ? v : 0);
  }
  if (edge_capped) {
    clamp(hunter, SHARPNESS_MAX, edge_cap);
    clamp(hunter, SHARPNESS, edge_cap);
  }
  edge_seen = *edge;
  if (!jackpot) return;
  const int under_way = !q[Q_STATE];
  if (jackpot == GLASS) {
    clamp(hunter, HP_MAX, 1);
    clamp(hunter, HP, 1);
    clamp(hunter, HP_RED, 1);
  }
  if (jackpot == BLEEDING && under_way) {
    /* Down to 1, never to a faint: and wounds don't heal by themselves (no red health). */
    s16 *hp = (s16 *)(hunter + HP);
    if (++bleed >= BLEED_FRAMES) {
      bleed = 0;
      if (*hp > 1) --*hp;
    }
    clamp(hunter, HP_RED, *hp);
  }
  /*
   * A faint (health at 0) while the quest is under way loses the jackpot,
   * whether or not one cart fails the quest. Once the quest is completed, a
   * faint costs nothing.
   */
  if (under_way && *(s16 *)(hunter + HP) <= 0) lose_jackpot(q);
  /*
   * The quest ended (completed, or timed out with no time left): the speed
   * bonus, its zenny again times the share of the time that's left.
   */
  if (!under_way && !jackpot_timed) {
    jackpot_timed = 1;
    const s32 t = *(s32 *)(q + Q_TIME);
    if (jackpot_lost || t <= 0 || jackpot_time <= 0) return;
    const u32 share = (u32)(t < jackpot_time ? t : jackpot_time) * 100u / (u32)jackpot_time;
    u32 extra = jackpot_zenny / 100 * share;
    s32 *reward = (s32 *)(q + Q_REWARD);
    if (*reward < 0) return;
    if ((u32)*reward + extra > ZENNY_MAX) extra = (u32)*reward < ZENNY_MAX ? ZENNY_MAX - (u32)*reward : 0;
    *reward += (s32)extra;
  }
}

/* The pact's share of the monster boosts (monsters.c). */
static void boost(u8 *m, u32 slot, rf_boost *b) {
  rf_boost_by(&b->hp, hp_up);
  rf_boost_by(&b->attack, atk_up);
  /*
   * Capture or nothing: a large monster that was alive and is dead (a
   * captured one keeps its health) loses the jackpot, while the quest is
   * under way.
   */
  if (jackpot != CAPTURE_ONLY || state != SEALED || !quest_seen || slot >= 32) return;
  if (rf_monster_is_new(slot)) seen_alive &= ~BIT(slot);
  if (*(s16 *)(m + HP) > 0) seen_alive |= BIT(slot);
  else if ((seen_alive & BIT(slot)) && !quest_seen[Q_STATE]) lose_jackpot(quest_seen);
}

static void quest_frame(u8 *q) {
  if (!game_task_loaded()) return;
  quest_seen = q;
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

#define SCREEN_W 480
#define SCREEN_H 272
#define ROW 16
#define OFFER_H (2 * ROW + 4)
#define WW 368
#define WH (10 + 22 + OFFERS * OFFER_H + 2 + 22 + 2 * ROW + 8)
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
    /* The jackpot stands out in the game's highlight until it's taken. */
    put(on ? C_TAKEN : offer[k].reward == R_JACKPOT ? C_TITLE : C_WHITE);
    put(penalty[offer[k].penalty].name);
    text(BOX, y);
    /* Items and pieces show their own icons, centred on the line's 14-pixel glyphs; the rest a star. */
    if (gives_entry(&offer[k])) {
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
  /* On a jackpot: what it asks besides its penalty, below the controls. */
  if (cursor < OFFERS && offer[cursor].reward == R_JACKPOT) {
    put(C_DIM JACKPOT_RULE);
    text(LEFT, HINT_Y + ROW);
  }

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
