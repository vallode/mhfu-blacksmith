/*
 * Bulk combine: the item pouch's Combine asks "Combine?" with a count beside
 * Yes/No, which left and right pick, up to what the ingredients and the
 * pouch allow; × on Yes combines that many at once. See
 * src/patches/combine.ts, which finds the game's addresses below on each
 * disc and the call this takes.
 *
 * Hooks: the menu hook's run and draw calls, while either menu runs its
 * Combine (entry 1), and its combine call (rf_combine_site), the one in
 * combine_run's "Combine?". Run picks the count and takes left and right
 * from the game (they'd move the pouch's cursor); draw shows it; the
 * combine call makes the game's call that many times and answers with the
 * result and the sum of the amounts, which the game gives and shows as one.
 */
#include "rf.h"

/* Found per disc (src/patches/combine.ts, menu.ts). */
extern const u8 rf_combine[];      /* combine(object, &amount, hunter, item1, item2, 0): result or -1 */
extern const u8 rf_combine_site[]; /* its call's site */
extern const u8 rf_combine_amounts[]; /* the most a combine makes, by the recipe's quantity class */
extern const u8 rf_pouch_slot[];   /* slot(save, k): the pouch's slot k, {u16 item, s16 amount} */
extern const u8 rf_pouch_room[];   /* room(save, item): how many more fit, or -1 for no slot */
extern const u8 rf_pouch_add[];    /* add(hunter, item, delta, 0) */
extern u8 *const rf_save_object[];
extern const u8 rf_log_text[]; /* log_text(hud, text): a line of text (kept, not copied) */
extern u8 *const rf_log_object[];
extern const u8 rf_window[];
extern const u8 rf_arrows[];
extern u8 *const rf_printer[];
extern const u8 rf_print[];

#define COMBINE_ENTRY 1
/* combine_run's HUD fields. */
#define STATE 0x5b8 /* 2: "Combine?" */
#define ASKING 2
#define SLOT1 0x5b0 /* the ingredients' pouch slots */
#define SLOT2 0x5b1
#define ITEM1 0x5ac /* and items, u16 */
#define ITEM2 0x5ae
#define RECIPE 0x5a8  /* u8 *: +2 the result (s16), +5 its quantity class */
#define PROBLEM 0x5ba /* nonzero: the pouch full, an ingredient gone */
#define AMOUNT 0x5e5  /* combine()'s &amount */
#define POUCH_SLOTS 24
#define GARBAGE 0x9b
#define MOST 99

/* Each menu's open flag, state (1 an entry running) and cursor (menu.c's). */
static const struct {
  u16 open, state, cursor;
} menus[2] = {{0x52d, 0x57c, 0x57d}, {0x111d, 0x1118, 0x111c}};
#define HUD_LAYER 0x534
#define TOP_LAYER 14
#define PRINTER_LAYER 0x12f
#define TOP_TEXT_LAYER 5

static u32 count = 1; /* how many the next × makes */
static u32 most;      /* the most it can, as run last saw */

typedef struct {
  u16 item;
  s16 amount;
} slot_t;

static u8 *save(void) { return *rf_save_object; }
static slot_t *pouch(void) { return ((slot_t * (*)(u8 *, u32)) rf_pouch_slot)(save(), 0); }

static u32 held(u32 item) {
  const slot_t *p = pouch();
  u32 n = 0;
  for (u32 k = 0; k < POUCH_SLOTS; k++) {
    if (p[k].item == item && p[k].amount > 0) n += (u32)p[k].amount;
  }
  return n;
}

/* The most this "Combine?" can make at once: 0 when it can't, 1 as the game. */
static u32 limit(const u8 *hud) {
  const u8 *recipe = *(u8 *const *)(hud + RECIPE);
  if (!recipe || hud[PROBLEM]) return 0;
  const u32 item1 = *(const u16 *)(hud + ITEM1), item2 = *(const u16 *)(hud + ITEM2);
  const u32 have1 = held(item1), have2 = held(item2);
  u32 n = item1 == item2 ? have1 / 2 : have1 < have2 ? have1 : have2;
  const s32 room = ((s32(*)(u8 *, u32))rf_pouch_room)(save(), *(const u16 *)(recipe + 2));
  /* No slot for it: the game's one, for an ingredient whose slot it empties. */
  if (room < 0) return n ? 1 : 0;
  u32 each = rf_combine_amounts[recipe[5]];
  if (!each) each = 1;
  const u32 fits = (u32)room / each;
  if (n > fits) n = fits ? fits : 1;
  return n > MOST ? MOST : n;
}

static void draw(u8 *q);

static char lines[4][40];
static u32 line;

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

/* The game's combine, `times` times; the result, the amounts summed into *amount. */
static s32 combine(struct rf_menu *m, u8 *hud, u32 times) {
  u8 *amount = (u8 *)m->args[1];
  u8 *hunter = (u8 *)m->args[2];
  const s32 item2 = pouch()[hud[SLOT2]].item;
  static u8 made;
  s32 result = -1;
  u32 total = 0, fails = 0;
  for (u32 k = 0; k < times; k++) {
    made = 0;
    const s32 r = (s32)rf_call8(rf_combine, m->args[0], (u32)&made, (u32)hunter, m->args[3],
                                (u32)item2, 0, 0, 0);
    if (r >= 0) {
      result = r;
      total += made;
    } else {
      fails++;
    }
  }
  *amount = (u8)(total > 0xff ? 0xff : total);
  if (fails && times > 1) {
    /* The game gives one Garbage for a combine that came to nothing. */
    const u32 more = result < 0 ? fails - 1 : fails;
    if (more) ((void (*)(u8 *, u32, s32, u32))rf_pouch_add)(hunter, GARBAGE, (s32)more, 0);
    char *text = lines[line++ & 3];
    char *p = number(text, fails);
    p = copy(p, " of ");
    p = number(p, times);
    p = copy(p, times == 1 ? " combination failed." : " combinations failed.");
    *p = 0;
    ((void (*)(u8 *, const char *))rf_log_text)(*rf_log_object, text);
  }
  return result;
}

static void menu(u8 *arg) {
  struct rf_menu *m = (struct rf_menu *)arg;
  if (m->site == (u32)rf_combine_site && m->game == rf_combine) {
    u8 *hud = (u8 *)m->args[1] - AMOUNT;
    u32 times = count;
    const u32 now = limit(hud);
    if (times > now) times = now;
    if (!times) times = 1;
    m->result = combine(m, hud, times);
    m->handled = 1;
    return;
  }
  const u32 which = m->site >> 2, call = m->site & 3;
  if (which > RF_MENU_VILLAGE) return;
  if (call == RF_MENU_DRAW) {
    if (!m->handled) {
      m->result =
          (s32)rf_call8(m->game, m->args[0], m->args[1], m->args[2], m->args[3], 0, 0, 0, 0);
      m->handled = 1;
    }
    u8 *q = (u8 *)m->args[0];
    if (q[menus[which].open] && q[menus[which].state] == 1 &&
        q[menus[which].cursor] == COMBINE_ENTRY && q[STATE] == ASKING && most > 1) {
      draw(q);
    }
    return;
  }
  if (call != RF_MENU_RUN || (m->args[1] & 0xff) != COMBINE_ENTRY || m->handled) return;
  u8 *hud = (u8 *)m->args[0];
  const u32 state = hud[STATE];
  if (state < ASKING) count = 1; /* a new pair of ingredients */
  if (state != ASKING) {
    most = 0;
    return;
  }
  most = limit(hud);
  if (most <= 1) {
    count = 1;
    return;
  }
  if (count > most) count = most;
  const u32 b = m->args[2];
  if (b & RF_BUTTON_RIGHT) count = count < most ? count + 1 : 1;
  if (b & RF_BUTTON_LEFT) count = count > 1 ? count - 1 : most;
  m->result = (s32)rf_call8(m->game, m->args[0], m->args[1],
                            b & ~(u32)(RF_BUTTON_LEFT | RF_BUTTON_RIGHT), m->args[3], 0, 0, 0, 0);
  m->handled = 1;
}

/* --- The count's window, right of Yes/No (EU 248, 200, 80 x 48). --- */

typedef struct {
  u16 x, y, w, h;
  u8 glyph_w, glyph_h, colour, style;
  s16 text_x, text_y;
  u8 line_height, pad[3];
} rf_rect;

#define GLYPH 14
#define BOX_X 332
#define BOX_Y 200
#define BOX_W 104
#define BOX_H 48
#define ALPHA 0xff
#define ARROWS_LEFT 0x2a /* from the value's centre, as menu.c */
#define ARROWS_W 0x46
#define ARROWS_ALPHA 0xf0
#define GLYPH_ADVANCE 7

static const rf_rect box = {BOX_X, BOX_Y, BOX_W, BOX_H, GLYPH, GLYPH, 0, 0, BOX_X + 8, BOX_Y + 9, 16, {0}};
static const char title[] = "How many?";
static const char value_format[] = "~C05%s~C00";
static char value[8];

static void draw(u8 *q) {
  u8 *printer = *rf_printer;
  if (!printer) return;
  const u8 hud_layer = q[HUD_LAYER], text_layer = printer[PRINTER_LAYER];
  q[HUD_LAYER] = TOP_LAYER;
  printer[PRINTER_LAYER] = TOP_TEXT_LAYER;
  ((void (*)(u8 *, const rf_rect *, const char *, u32))rf_window)(q, &box, title, ALPHA);
  const u32 centre = BOX_X + BOX_W / 2, y = BOX_Y + 9 + 16;
  *number(copy(value, "\xc3\x97"), count) = 0; /* ×n */
  const u32 columns = 2 + (count >= 10 ? 2 : 1); /* × is two columns */
  rf_call8(rf_print, (u32)printer, centre - columns * GLYPH_ADVANCE / 2, y, (u32)value_format,
           (u32)value, 0, 0, 0);
  rf_call8(rf_arrows, (u32)q, centre - ARROWS_LEFT, y, ARROWS_W, ARROWS_ALPHA, 0, 0, 0);
  q[HUD_LAYER] = hud_layer;
  printer[PRINTER_LAYER] = text_layer;
}

void rf_combine_init(u32 reason, u8 *s) {
  (void)reason;
  (void)s;
  count = 1;
  most = 0;
  rf_on(RF_HOOK_MENU, menu);
}
