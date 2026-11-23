/*
 * Harvest all: gathering once at any of Pokke Farm's spots sends everything
 * the farm holds to the Item Box. See src/patches/harvest.ts, which finds
 * the game's addresses below on each disc and the five calls this takes.
 *
 * Hook: the menu hook's farm calls (rf_farm_site and the four after it, in
 * the order mining, insects, mushrooms, honey, field): each gathering
 * action asking frame(hunter + 0x80, 0) whether its motion has reached the
 * gathering frame, once. This makes the game's call ($f12, the frame, is as
 * the game left it: blob code is soft-float), and when it says yes and the
 * farm holds anything, sends it all and answers no, so the game gathers
 * nothing itself. What doesn't fit in the box stays on the farm; with
 * nothing sent, the game gathers as usual.
 */
#include "rf.h"

/* Found per disc (src/patches/harvest.ts, send-all.ts' findBoxCalls). */
extern const u8 rf_farm[];       /* the farm's offset in the save */
extern const u8 rf_farm_frame[]; /* frame(motion, 0): the gathering frame, once */
extern const u8 rf_farm_site[];  /* the first of the five calls' sites */
extern const u8 rf_add_to_box[]; /* add_to_box(save, item, amount, slot): what doesn't fit */
extern const u8 rf_item_seen[];  /* item_seen(save, item), as the game after a send */
extern const u8 rf_can_store[];  /* can_store(object, item): 0 for an item the box can't take */
extern u8 *const rf_can_store_object[];
extern const u8 rf_log_item[]; /* log_item(hud, 1, 0, item): the log's "obtained" line */
extern const u8 rf_log_text[]; /* log_text(hud, text): a line of text (kept, not copied) */
extern u8 *const rf_log_object[];
extern const u8 rf_item_sound[]; /* item_sound(object, item): the jingle for its rarity */
extern u8 *const rf_item_sound_object[];

/* The farm, from rf_farm: what's there, then each spot's stock (harvest.ts). */
#define FIELD_LEVEL 0
#define MINING_LEVEL 2
#define INSECT_LEVEL 3
#define MUSHROOM_LEVEL 4
#define HONEY_LEVEL 5
#define MINING 0x08 /* 5 points of 4 items */
#define INSECTS 0x30
#define POINT_ITEMS 4
#define POINTS 5
#define MUSHROOMS 0x58 /* 3 trees, one per level, of 8 items */
#define MUSHROOM_ITEMS 8
#define HONEY 0x88 /* 3 hives of 6 */
#define HONEY_ITEMS 6
#define LEVELS 3
#define FIELD 0xb0 /* 3 plots of 40 bytes */
#define PLOT_BYTES 40
#define PLOT_ITEMS 4 /* 12 items, u16 */
#define PLOT_AMOUNTS 0x1c /* and their amounts, u8 */
#define PLOT_SLOTS 12
#define PLOTS 3

#define KINDS 5
#define FIRST_SCREEN_KIND 2 /* mushrooms, honey and the field open a screen */
#define HUNTER_MOTION 0x80  /* frame()'s first argument, in the hunter */
#define HUNTER_NO_SCREEN 0x1d7

/* The log keeps 20 lines; leave the game a few. */
#define LOG_ITEMS 12
#define KEPT 48

static u8 *save;

typedef u32 (*can_store_fn)(u8 *, u32);
typedef u32 (*add_fn)(u8 *, u32, u32, u32);
typedef void (*seen_fn)(u8 *, u32);

/* What one harvest sent, by item, and what it left. */
static u16 items[KEPT];
static u16 amounts[KEPT];
static u32 kinds, sent, left;
static char text[48];

static void count(u32 item, u32 amount) {
  sent += amount;
  for (u32 k = 0; k < kinds; k++) {
    if (items[k] == item) {
      amounts[k] += amount;
      return;
    }
  }
  if (kinds < KEPT) {
    items[kinds] = item;
    amounts[kinds++] = amount;
  }
}

/* Sends `amount` of `item` to the box; what didn't fit. */
static u32 send(u32 item, u32 amount) {
  if (!((can_store_fn)rf_can_store)(*rf_can_store_object, item)) return amount;
  const u32 over = ((add_fn)rf_add_to_box)(save, item, amount, 0xffff) & 0xffff;
  ((seen_fn)rf_item_seen)(save, item);
  if (over < amount) count(item, amount - over);
  return over;
}

/* A spot's list of single items: sends them, keeping what didn't fit at the front. */
static void take(u16 *list, u32 n) {
  u32 keep = 0;
  for (u32 k = 0; k < n; k++) {
    const u32 item = list[k];
    if (!item) continue;
    if (send(item, 1)) {
      list[keep++] = item;
      left++;
    }
  }
  while (keep < n) list[keep++] = 0;
}

/* A field plot: items with amounts. */
static void take_plot(u8 *plot) {
  u16 *list = (u16 *)(plot + PLOT_ITEMS);
  u8 *amount = plot + PLOT_AMOUNTS;
  u32 keep = 0;
  for (u32 k = 0; k < PLOT_SLOTS; k++) {
    const u32 item = list[k], n = amount[k];
    if (!item || !n) continue;
    const u32 over = send(item, n);
    if (over) {
      list[keep] = item;
      amount[keep++] = over;
      left += over;
    }
  }
  for (; keep < PLOT_SLOTS; keep++) list[keep] = amount[keep] = 0;
}

static u32 at_most(u32 level, u32 most) { return level < most ? level : most - 1; }

/* Calls `fn` on every list the farm has, or counts what's in them when `fn` is 0. */
static u32 each(void (*fn)(u16 *, u32), void (*plots)(u8 *)) {
  u8 *farm = save + (u32)rf_farm;
  u32 any = 0;
  for (u32 k = 0; k <= at_most(farm[FIELD_LEVEL], PLOTS); k++) {
    u8 *plot = farm + FIELD + k * PLOT_BYTES;
    if (plots) plots(plot);
    else
      for (u32 j = 0; j < PLOT_SLOTS; j++) any |= ((u16 *)(plot + PLOT_ITEMS))[j] && plot[PLOT_AMOUNTS + j];
  }
  struct {
    u32 offset, size, first, last;
  } lists[4] = {
      {MINING, POINT_ITEMS, 0, at_most(farm[MINING_LEVEL], POINTS)},
      {INSECTS, POINT_ITEMS, 0, at_most(farm[INSECT_LEVEL], POINTS)},
      {MUSHROOMS, MUSHROOM_ITEMS, farm[MUSHROOM_LEVEL] - 1, farm[MUSHROOM_LEVEL] - 1},
      {HONEY, HONEY_ITEMS, farm[HONEY_LEVEL] - 1, farm[HONEY_LEVEL] - 1},
  };
  for (u32 l = 0; l < 4; l++) {
    /* No tree or hive: level 0, so first is past last (or past LEVELS). */
    for (u32 k = lists[l].first; k <= lists[l].last && k < (l < 2 ? POINTS : LEVELS); k++) {
      u16 *list = (u16 *)(farm + lists[l].offset + k * lists[l].size * 2);
      if (fn) fn(list, lists[l].size);
      else
        for (u32 j = 0; j < lists[l].size; j++) any |= list[j];
    }
  }
  return any;
}

static char *number(char *p, u32 n) {
  char digits[10];
  u32 k = 0;
  do digits[k++] = '0' + n % 10;
  while (n /= 10);
  while (k) *p++ = digits[--k];
  return p;
}

static char *copy(char *p, const char *s) {
  while (*s) *p++ = *s++;
  return p;
}

/* The log: a line for each kind of item, then how many went to the box. */
static void report(void) {
  u8 *hud = *rf_log_object;
  for (u32 k = 0; k < kinds && k < LOG_ITEMS; k++) {
    rf_call8(rf_log_item, (u32)hud, 1, 0, items[k], 0, 0, 0, 0);
  }
  char *p = copy(text, "Sent ");
  p = number(p, sent);
  p = copy(p, sent == 1 ? " item" : " items");
  p = copy(p, left ? ". Item Box full." : " to the Item Box.");
  *p = 0;
  ((void (*)(u8 *, const char *))rf_log_text)(hud, text);
  ((void (*)(u8 *, u32))rf_item_sound)(*rf_item_sound_object, items[0]);
}

static void menu(u8 *arg) {
  struct rf_menu *m = (struct rf_menu *)arg;
  const u32 kind = m->site - (u32)rf_farm_site;
  if (m->handled || m->game != rf_farm_frame || kind >= KINDS) return;
  m->result = (s32)rf_call8(m->game, m->args[0], m->args[1], m->args[2], m->args[3], 0, 0, 0, 0);
  m->handled = 1;
  if (!m->result || !each(0, 0)) return;
  kinds = sent = left = 0;
  each(take, take_plot);
  if (!sent) return;
  report();
  if (kind >= FIRST_SCREEN_KIND) ((u8 *)m->args[0] - HUNTER_MOTION)[HUNTER_NO_SCREEN] = 1;
  m->result = 0;
}

void rf_harvest_init(u32 reason, u8 *s) {
  (void)reason;
  save = s;
  rf_on(RF_HOOK_MENU, menu);
}
