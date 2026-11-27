/*
 * Whetstone's entry in the START menus, the quest's and the village's: each
 * menu's last entry, a greyed placeholder, becomes "Whetstone", which opens a window
 * of the settings features add with rf_add_setting (damage numbers, so
 * far). Up and down pick a setting; left, right and × change it; ○ goes
 * back to the menu and START closes it, as the game's Options do. A
 * setting keeps its choice in Whetstone's save data, through its own get and
 * set. See ../docs/code-loader.md (hook 8) and src/patches/menu.ts, which
 * finds the game's addresses below on each disc.
 *
 * Hooks: the menu hook (RF_HOOK_MENU) has each menu's label, choose, run
 * and layer draw calls. It gives the entry's label, takes the entry when
 * it's chosen, gets the buttons while it runs, and draws the window after
 * the menu's layer, above the rest of the HUD, while the menu has the entry
 * open. Every other call goes on to the game's.
 */
#include "rf.h"

/* Found per disc (src/patches/menu.ts). */
extern const u8 rf_window[];   /* window(hud, rect, text, alpha): a framed box */
extern const u8 rf_box[];      /* box(hud, list, title, cursor, alpha, names): a list window */
extern const u8 rf_arrows[];   /* arrows(hud, x, y, w, alpha): the pulsing ◀ ▶ of a choice */
extern u8 *const rf_printer[]; /* the global holding the text printer */
extern const u8 rf_print[];    /* print(printer, x, y, format, ...): reads ~C and ~B codes */
extern const u8 rf_quest_menu_id[];   /* the quest placeholder's label ID */
extern const u8 rf_village_menu_id[]; /* where the village placeholder's ID is */

/* The HUD object: each menu's open flag, state (0 the list, 1 an entry running) and cursor. */
static const struct {
  u16 open, state, cursor;
  u8 entry; /* the last entry, the placeholder */
} menus[2] = {
    {0x52d, 0x57c, 0x57d, 11},   /* RF_MENU_QUEST: 12 entries */
    {0x111d, 0x1118, 0x111c, 13}, /* RF_MENU_VILLAGE: 14 */
};
#define MENU_HELP 0x5e8 /* bit 2: the help bar under the menu */
#define HELP_BAR 4
#define HUD_LAYER 0x534 /* the layer the HUD draws into: 9 to 14, drawn in order */
#define TOP_LAYER 14
#define PRINTER_LAYER 0x12f /* 0 to 5: the HUD's layers 9 to 14 */
#define TOP_TEXT_LAYER 5

#define MAX_SETTINGS 12 /* the window fits 12 rows above the screen's bottom */
static const struct rf_setting *settings[MAX_SETTINGS];
static u32 count;
static u8 *hud; /* while the window is open */
static u32 which; /* its menu */
static u8 row;

void rf_add_setting(const struct rf_setting *setting) {
  if (count < MAX_SETTINGS && setting && setting->count) settings[count++] = setting;
}

static const char label[] = "Whetstone";

/* Whether the menu still has the entry open (the game can close it under us). */
static int showing(const u8 *q) {
  return q && q[menus[which].open] && q[menus[which].state] == 1 &&
         q[menus[which].cursor] == menus[which].entry;
}

static void draw(u8 *q);

static void step(const struct rf_setting *s, s32 by) {
  u32 now = s->get();
  if (now >= s->count) now = 0;
  s->set((now + s->count + (u32)by) % s->count);
}

static void menu(u8 *arg) {
  struct rf_menu *m = (struct rf_menu *)arg;
  const u32 menu = m->site >> 2, call = m->site & 3;
  /* With nothing to set, the placeholder stays the game's. */
  if (!count || menu > RF_MENU_VILLAGE) return;
  if (call == RF_MENU_LABEL) {
    const int ours = menu == RF_MENU_QUEST ? m->args[1] == (u32)rf_quest_menu_id
                                           : m->s2 == (u32)rf_village_menu_id;
    if (!ours) return;
    *m->s0 = 0; /* not greyed */
    m->result = (s32)label;
  } else if (call == RF_MENU_DRAW) {
    /* Unless a callback before this one made the game's call (send-all.c). */
    if (!m->handled) {
      m->result =
          (s32)rf_call8(m->game, m->args[0], m->args[1], m->args[2], m->args[3], 0, 0, 0, 0);
    }
    if (menu == which) draw((u8 *)m->args[0]);
  } else {
    if ((m->args[1] & 0xff) != menus[menu].entry) return;
    if (call == RF_MENU_SELECT) {
      hud = (u8 *)m->args[0];
      which = menu;
      row = 0;
      hud[MENU_HELP] &= (u8)~HELP_BAR; /* its help is the placeholder's: none */
      m->result = 0;
    } else {
      const u32 b = m->args[2];
      if (b & RF_BUTTON_UP) row = row ? row - 1 : (u8)(count - 1);
      if (b & RF_BUTTON_DOWN) row = row + 1 < count ? row + 1 : 0;
      if (b & (RF_BUTTON_RIGHT | RF_BUTTON_CROSS)) step(settings[row], 1);
      if (b & RF_BUTTON_LEFT) step(settings[row], -1);
      m->result = (s32)(b & (RF_BUTTON_CIRCLE | RF_BUTTON_START));
      if (m->result) hud = 0;
    }
  }
  m->handled = 1;
}

/* --- Drawing (after the menu's own layer draw), as the game's Options. --- */

/* The rect window() reads (pact.c has the same): here, the help's. */
typedef struct {
  u16 x, y, w, h;
  u8 glyph_w, glyph_h; /* the printer's glyph size: 14 x 14 */
  u8 colour;           /* the printer's colour */
  u8 style;            /* the frame: 0 the item card's (and help's) */
  s16 text_x, text_y;  /* where window() prints its text */
  u8 line_height, pad[3];
} rf_rect;

/*
 * The list window box() reads: window()'s rect, then its rows and their
 * names, and where its title and cursor bar go (EU 0x0882FA24 makes one
 * from a template; the village's Options has x 232, 32 columns, title).
 */
typedef struct {
  u16 x, y, w, h;
  u8 glyph_w, glyph_h, colour, style; /* colour is the title's; style 3 the START menu's */
  s16 text_x, text_y;
  u16 line_height, rows;
  const char *const *names; /* box()'s names 3: string pointers */
  u32 flags;
  u16 bar_x, bar_y, bar_w, bar_h;
  u16 title_x, title_y;
} rf_list;

#define NAMES_STRINGS 3
#define ALPHA 0xff
#define LIST_X 232
#define LIST_Y 40
#define LIST_COLUMNS 32
#define GLYPH 14
#define VALUE_X 0xc4  /* values centre at the list's x + this */
#define ARROWS_X 0x92 /* from its text's x */
#define ARROWS_W 0x46
#define ARROWS_ALPHA 0xf0
#define GLYPH_ADVANCE 7 /* half the glyph: the game's centring */

/*
 * The help, in the frame of the game's help bar (Options' is EU 0x0893B180,
 * under the list), here left of the list so the list can run down the
 * screen: 28 columns, 6 lines.
 */
static const rf_rect help_rect = {8, LIST_Y, 216, 112, GLYPH, GLYPH, 0, 0, 16, LIST_Y + 9, 16, {0}};

#define NAME_ROOM 24
/* Names copied 4-aligned: box() stops at a u16 0xFFFF in the pointer array. */
static char names[MAX_SETTINGS][NAME_ROOM] __attribute__((aligned(4)));
static const char *name_list[MAX_SETTINGS];
static const char title[] = " Whetstone~C00";
static const char value_format[] = "~C05%s~C00";

static u32 length(const char *s) {
  u32 n = 0;
  while (s[n]) n++;
  return n;
}

static void draw(u8 *q) {
  if (!hud) return;
  if (q != hud || !showing(q)) {
    hud = 0;
    return;
  }
  u8 *printer = *rf_printer;
  if (!printer) return;
  const u8 hud_layer = q[HUD_LAYER], text_layer = printer[PRINTER_LAYER];
  q[HUD_LAYER] = TOP_LAYER;
  printer[PRINTER_LAYER] = TOP_TEXT_LAYER;

  for (u32 k = 0; k < count; k++) {
    const char *from = settings[k]->name;
    u32 n = 0;
    while (from[n] && n < NAME_ROOM - 1) names[k][n] = from[n], n++;
    names[k][n] = 0;
    name_list[k] = names[k];
  }
  rf_list l;
  const u16 line = GLYPH + 2;
  l.x = LIST_X, l.y = LIST_Y;
  l.glyph_w = l.glyph_h = GLYPH;
  l.colour = 5, l.style = 3;
  l.w = (u16)(((GLYPH * LIST_COLUMNS) / 2 + 0x17) & 0x7ff8);
  l.h = (u16)(line * (count + 1) + 0x10);
  l.text_x = (s16)(l.x + 8), l.text_y = (s16)(l.y + 0x19);
  l.line_height = line, l.rows = (u16)count;
  l.names = name_list;
  l.flags = 0x8000c040;
  l.bar_x = (u16)(l.x + 6), l.bar_y = (u16)(l.text_y - 2), l.bar_w = (u16)(l.w - 12);
  l.bar_h = (u16)(line + 1);
  l.title_x = (u16)(l.x + 8), l.title_y = (u16)(l.y + 7);
  rf_call8(rf_box, (u32)q, (u32)&l, (u32)title, (u32)-1, ALPHA, NAMES_STRINGS, 0, 0);

  for (u32 k = 0; k < count; k++) {
    const struct rf_setting *s = settings[k];
    u32 choice = s->get();
    if (choice >= s->count) choice = 0;
    const char *value = s->choices[choice];
    const u32 x = l.x + VALUE_X - length(value) * GLYPH_ADVANCE / 2;
    rf_call8(rf_print, (u32)printer, x, (u32)(l.text_y + k * line), (u32)value_format, (u32)value,
             0, 0, 0);
  }
  rf_call8(rf_arrows, (u32)q, (u32)(l.text_x + ARROWS_X), (u32)(l.text_y + row * line), ARROWS_W,
           ARROWS_ALPHA, 0, 0, 0);
  if (settings[row]->help) {
    ((void (*)(u8 *, const rf_rect *, const char *, u32))rf_window)(q, &help_rect,
                                                                    settings[row]->help, ALPHA);
  }

  q[HUD_LAYER] = hud_layer;
  printer[PRINTER_LAYER] = text_layer;
}

void rf_menu_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  count = 0;
  hud = 0;
  rf_on(RF_HOOK_MENU, menu);
}
