/*
 * Damage numbers (the hud.damageNumbers option). See ../docs/code-loader.md
 * and src/patches/damage.ts, which finds the game's addresses below on each
 * disc. Each of the hunter's hits on a monster pops a number at the part it
 * struck, in the game's font, bold over a black drop shadow: it flashes in
 * big, settles to its size, rises and shrinks away; a weak point's shakes
 * as it lands. It's the HP the hit takes (the monster's defense multiplier
 * applied). White, orange on a weak point; split, the element's share is a
 * second, smaller number in its element's colour. It only reads game
 * state. The mode can be changed in game, in randomfu's START menu entry
 * (menu.c), and is kept in randomfu's save data; until then it's the
 * disc's.
 */
#include "rf.h"

/* Found per disc (src/patches/damage.ts). */
extern const u8 rf_game_task[];      /* game_task.ovl's load address */
extern u8 *const rf_printer[];       /* the global holding the text printer */
extern const u8 rf_print[];          /* print(printer, x, y, format, ...): reads ~C codes */
extern u8 *const rf_camera[];        /* the global holding the camera */
extern const u8 rf_project[];        /* project(camera, out vec4, in vec3): screen x, y, z, w */
extern const u8 rf_joint_pos[];      /* joint_pos(entity, out vec3, joint) */
/* A constant, not an address: the disc's default MODE_* + 1 (an extern's address is never 0). */
extern const u8 rf_damage_mode[];

#define MODE_OFF 0
#define MODE_TOTAL 1
#define MODE_SPLIT 2
#define MODES 3

/* The mode: the one chosen in game (kept in randomfu's save data), else the disc's. */
static u32 mode(void) {
  const struct rf_save_data *d = rf_save_data();
  u32 chosen = d ? d->damage_numbers : 0;
  return chosen && chosen <= MODES ? chosen - 1 : (u32)rf_damage_mode - 1;
}

/* Monsters. */
#define HP 0x2e4
#define DEFENSE 0x384 /* float: the part damage's multiplier */
/* The attack record: element flags, and the hit's quality. */
#define ATTACK_ELEMENT 0x28 /* u16 */
#define E_FIRE 0x10
#define E_WATER 0x20
#define E_THUNDER 0x40
#define E_ICE 0x80
#define E_DRAGON 0x100
#define ZONE_SHOT 3
/* The HUD object (the hooks' argument) and the printer. */
#define HUD_HUNTER 0x530
#define Q_TIME 0x1230 /* s32 ticks left, counting down */
#define GLYPH_W 0x12c
#define GLYPH_H 0x12d
#define LAYER 0x12f /* 0 to 5: the HUD's layers 9 to 14 */
#define LINE_H 0x15f

#define SCREEN_W 480
#define SCREEN_H 272

/* Colours (src/hints/style.ts). */
enum { WHITE, ORANGE, FIRE, WATER, ICE, THUNDER, DRAGON, BLACK, FLASH };
static const char codes[][5] = {"~C00", "~C11", "~C19", "~C17", "~C04",
                                "~C18", "~C16", "~C01", "~C18"};

/* --- Floats, without an FPU. --- */

static const u32 ONE = 0x3f800000;

/* A float's bits to an int, toward zero. */
static s32 ftoi(u32 f) {
  s32 e = (s32)((f >> 23) & 0xff) - 127;
  if (e < 0) return 0;
  if (e > 30) e = 30;
  u32 m = (f & 0x7fffff) | 0x800000;
  u32 v = e >= 23 ? m << (e - 23) : m >> (23 - e);
  return (f >> 31) ? -(s32)v : (s32)v;
}

/* n (under 0x8000) times a positive float, truncated. */
static u32 fmul(u32 n, u32 f) {
  u32 e = (f >> 23) & 0xff;
  if ((f >> 31) || e == 0) return 0;
  u32 v = n * (((f & 0x7fffff) | 0x800000) >> 8); /* n × 1.m × 2^15 */
  s32 shift = (s32)e - 127 - 15;
  if (shift >= 0) return shift > 15 ? 0x7fff : v << shift;
  return -shift >= 32 ? 0 : v >> -shift;
}

static int positive(u32 f) { return !(f >> 31) && (f & 0x7fffffff); }

/* --- State. --- */

static u8 *hud;
static s32 last_time;

#define POPS 16
#define LIFE 36   /* clock ticks a number shows (about 30 a second) */
#define POP_IN 4  /* ticks it takes to settle */
#define FADE 10   /* ticks it shrinks for, at the end */
#define FLASHING 3 /* ticks it shows in its flash colour */
#define SHAKING 8  /* ticks a weak point's number shakes */

typedef struct {
  u32 at[4]; /* the world position: floats, 16-aligned for the projection's lv.q */
  u16 value;
  u8 colour, size, age, live, weak;
  s8 dx, dy;
} __attribute__((aligned(16))) pop_t;
static pop_t pops[POPS];
static u32 spread;

static u32 screen[4] __attribute__((aligned(16)));

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

static void clear(void) {
  for (u32 k = 0; k < POPS; k++) pops[k].live = 0;
}

/* --- Hits (hook 7). --- */

static void joint_pos(u8 *m, u32 *out, u32 joint) {
  ((void (*)(u8 *, u32 *, u32))rf_joint_pos)(m, out, joint);
  out[3] = ONE;
}

/* A number at the joint; the oldest makes way when they're all showing. */
static pop_t *add_pop(u8 *m, u32 joint, u32 value, u32 colour, u32 size, u32 weak) {
  if (!value) return 0;
  pop_t *p = &pops[0];
  for (u32 k = 0; k < POPS; k++) {
    if (!pops[k].live) {
      p = &pops[k];
      break;
    }
    if (pops[k].age > p->age) p = &pops[k];
  }
  joint_pos(m, p->at, joint);
  p->value = (u16)(value > 9999 ? 9999 : value);
  p->colour = (u8)colour;
  p->size = (u8)size;
  p->weak = (u8)weak;
  p->age = 0;
  p->live = 1;
  spread = (spread + 1) % 5; /* a few hits at one joint fan out */
  p->dx = (s8)(((s32)spread - 2) * 8);
  p->dy = (s8)(-(s32)(spread & 1) * 6);
  return p;
}

static u32 digits(u32 n) {
  u32 k = 1;
  while (n >= 10) n /= 10, k++;
  return k;
}

/* Bigger numbers, bigger text. */
static u32 size_of(u32 value, u32 weak) {
  u32 size = value < 20 ? 12 : value < 50 ? 14 : value < 100 ? 16 : 18;
  return size + (weak ? 2 : 0);
}

static u32 element_colour(const u8 *attack) {
  u16 e = *(const u16 *)(attack + ATTACK_ELEMENT);
  return e & E_FIRE      ? FIRE
         : e & E_WATER   ? WATER
         : e & E_ICE     ? ICE
         : e & E_THUNDER ? THUNDER
         : e & E_DRAGON  ? DRAGON
                         : WHITE;
}

static void hit(u8 *arg) {
  const struct rf_hit *h = (const struct rf_hit *)arg;
  u8 *m = h->monster;
  const u32 shown = mode();
  if (shown == MODE_OFF || !hud || !m || h->damage <= 0 || *(s16 *)(m + HP) <= 0) return;
  if (!h->hunter || h->hunter != *(u8 **)(hud + HUD_HUNTER)) return; /* only the hunter's own */
  const u32 joint = *(u16 *)(h->hitbox + RF_HITBOX_JOINT);
  const u32 defense = *(u32 *)(m + DEFENSE);
  const u32 quality = h->attack[RF_ATTACK_QUALITY];
  const u32 weak = quality >= 2 || (quality == 0 && h->zone[ZONE_SHOT] >= 45);
  const u32 damage = (u32)h->damage;
  s32 element = ftoi(h->element);
  if (element < 0 || (u32)element > damage) element = 0;
  if (shown == MODE_SPLIT && element) {
    u32 r = fmul(damage - (u32)element, defense), e = fmul((u32)element, defense);
    pop_t *p = add_pop(m, joint, r, weak ? ORANGE : WHITE, size_of(r, weak), weak);
    u32 esize = size_of(e, 0) - 2;
    pop_t *q = add_pop(m, joint, e, element_colour(h->attack), esize, 0);
    if (p && q) {
      /* To the right of the raw number, its baseline a little lower. */
      q->dx = (s8)(p->dx + (s32)(digits(r) * p->size + digits(e) * esize) / 4 + 4);
      q->dy = (s8)(p->dy + (s32)(p->size - esize) / 2 + 4);
    }
  } else {
    u32 total = fmul(damage, defense);
    add_pop(m, joint, total, weak ? ORANGE : WHITE, size_of(total, weak), weak);
  }
}

/* --- Time (hook 0). --- */

static void tick(u32 ticks) {
  for (u32 k = 0; k < POPS; k++) {
    pop_t *p = &pops[k];
    if (!p->live) continue;
    u32 age = p->age + ticks;
    if (age >= LIFE) p->live = 0;
    p->age = (u8)age;
  }
}

static void frame(u8 *q) {
  if (!game_task_loaded()) {
    hud = 0;
    return;
  }
  s32 time = *(s32 *)(q + Q_TIME);
  if (hud != q || time > last_time) clear(); /* a new quest */
  hud = q;
  if (time < last_time) tick((u32)(last_time - time > 4 ? 4 : last_time - time));
  last_time = time;
}

/* --- Drawing (hook 1). --- */

/* Where a world position shows on screen; 0 when it's behind or off it. */
static int project(const u32 *at, s32 *x, s32 *y) {
  u8 *camera = *rf_camera;
  if (!camera) return 0;
  ((void (*)(u8 *, u32 *, const u32 *))rf_project)(camera, screen, at);
  if (!positive(screen[3]) || (screen[2] >> 31)) return 0;
  *x = ftoi(screen[0]);
  *y = ftoi(screen[1]);
  return *x > -32 && *x < SCREEN_W + 32 && *y > -32 && *y < SCREEN_H + 32;
}

static char line[16];
static const char percent_s[] = "%s";

static void print_at(u8 *printer, s32 x, s32 y, u32 colour, const char *text) {
  u32 at = 0;
  for (u32 k = 0; k < 4; k++) line[at++] = codes[colour][k];
  while (*text && at < sizeof line - 1) line[at++] = *text++;
  line[at] = 0;
  rf_call8(rf_print, (u32)printer, (u32)x, (u32)y, (u32)percent_s, (u32)line, 0, 0, 0);
}

/*
 * Digits centred on x, y, `size` pixels high on glyphs an eighth wider;
 * digits are half as wide as a glyph. Bold is the text twice, a pixel
 * apart, over a black shadow drawn the same way further down and right.
 */
static void print(u8 *printer, s32 x, s32 y, u32 size, u32 colour, const char *text, u32 n) {
  if (size < 4) return;
  const u32 w = size + size / 8;
  printer[GLYPH_W] = (u8)w;
  printer[GLYPH_H] = printer[LINE_H] = (u8)size;
  x -= (s32)(n * w / 4);
  y -= (s32)size / 2;
  if (x < 0 || y < 0) return;
  const s32 drop = size >= 20 ? 2 : 1;
  for (s32 k = 0; k < 2; k++) print_at(printer, x + drop + k, y + drop, BLACK, text);
  for (s32 k = 0; k < 2; k++) print_at(printer, x + k, y, colour, text);
}

static void draw_pop(u8 *printer, const pop_t *p) {
  s32 x, y;
  if (!project(p->at, &x, &y)) return;
  const u32 age = p->age;
  u32 size = p->size;
  if (age < POP_IN) size += (POP_IN - age) * 3;                            /* in big, then settle */
  if (age + FADE > LIFE) size -= (age + FADE - LIFE) * size / (FADE + 2); /* shrink away */
  /* Flash: white for a coloured number, bright yellow for a white one. */
  u32 colour = p->colour;
  if (age < FLASHING) colour = colour == WHITE ? FLASH : WHITE;
  /* A weak point's number shakes as it lands, less every tick. */
  s32 sx = 0, sy = 0;
  if (p->weak && age < SHAKING) {
    s32 amp = (s32)(SHAKING - age) / 2;
    sx = age & 1 ? amp : -amp;
    sy = age & 2 ? amp / 2 : -amp / 2;
  }
  char text[6];
  u32 n = digits(p->value), v = p->value;
  text[n] = 0;
  for (u32 k = n; k--; v /= 10) text[k] = (char)('0' + v % 10);
  print(printer, x + p->dx + sx, y + p->dy + sy - 12 - (s32)age, size, colour, text, n);
}

static void draw(u8 *q) {
  if (!hud || q != hud || !game_task_loaded()) return;
  if (mode() == MODE_OFF) {
    clear(); /* turned off in game: what's showing goes too */
    return;
  }
  u8 *printer = *rf_printer;
  if (!printer) return;
  const u8 w = printer[GLYPH_W], h = printer[GLYPH_H], lh = printer[LINE_H],
           layer = printer[LAYER];
  printer[LAYER] = 0; /* under the rest of the HUD */
  for (u32 k = 0; k < POPS; k++) {
    if (pops[k].live) draw_pop(printer, &pops[k]);
  }
  printer[GLYPH_W] = w;
  printer[GLYPH_H] = h;
  printer[LINE_H] = lh;
  printer[LAYER] = layer;
}

/* --- The setting, in randomfu's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const mode_names[MODES] = {"Off", "Total", "Split"};
static u32 get_mode(void) { return mode(); }
static void set_mode(u32 choice) {
  struct rf_save_data *d = rf_save_data();
  if (d && choice < MODES) d->damage_numbers = (u8)(choice + 1);
}
static const struct rf_setting setting = {
    "Damage numbers",
    "Show the damage of each of\nyour hits where it strikes.\nSplit shows the element's\nshare apart.",
    mode_names,
    MODES,
    get_mode,
    set_mode,
};

void rf_damage_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  hud = 0;
  if (rf_add_setting) rf_add_setting(&setting);
  rf_on(RF_HOOK_QUEST_FRAME, frame);
  rf_on(RF_HOOK_HUD, draw);
  rf_on(RF_HOOK_HIT, hit);
}
