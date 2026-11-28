/*
 * Attack hitboxes (the hud.attackHitboxes option, and a setting in Whetstone's
 * START menu entry): every monster attack
 * that can hit right now, its shapes filled in translucent red over the
 * scene with the HUD's translucent fill, in strips. See
 * ../docs/code-loader.md and src/patches/hitboxes.ts, which finds the
 * game's addresses below on each disc. It only reads game state.
 *
 * Built with the FPU (single precision only: Allegrex has no doubles), so
 * nothing here may use a double. Floats are never live across a game call:
 * the shapes are worked out into `strips` first, then drawn.
 */
#include "rf.h"

/* Found per disc (src/patches/hitboxes.ts). */
extern const u8 rf_game_task[]; /* game_task.ovl's load address */
extern u8 *const rf_monsters[]; /* the global holding the monster manager */
extern u8 *const rf_attacks[];  /* the global holding the attack objects' pool */
extern u8 *const rf_camera[];   /* the global holding the renderer: its view and projection */
extern const u8 rf_fill[];      /* fill(hud, x, y, w, h, r, g, b, alpha): translucent */
/* A constant, not an address: the disc's default, off 0 or on 1, + 1 (an extern's address is never 0). */
extern const u8 rf_hitboxes_mode[];

#define MODES 2 /* off, on */

/* On or off: as chosen in game (kept in Whetstone's save data), else the disc's. */
static u32 on(void) {
  const struct rf_save_data *d = rf_save_data();
  u32 chosen = d ? d->hitboxes : 0;
  return chosen && chosen <= MODES ? chosen - 1 : (u32)rf_hitboxes_mode - 1;
}

/* The pool: a list of live attack objects. */
#define ATTACK_LIST 0x502c
/* An attack object. */
#define NEXT 0x4
#define OWNER_NONE 0xe    /* 0xFF: no owner */
#define OWNER_MONSTER 0xf /* 0: a hunter's, else a monster's */
#define STATE 0x14        /* 2: can hit (the only state the game tests) */
#define STATE_LIVE 2
#define OWNER_SLOT 0x15 /* the owner's monster manager slot */
#define AREA 0x18       /* u16, as the entity's */
#define SHAPES 0x34
#define POSITION 0x40     /* where code puts it: joints 0x7E (start) and 0x7F */
#define POSITION_END 0x50 /* joint 0x7E's end */

/* Shape records, 0x28 bytes: s16 joint (-1 ends), s16 type, f32 radius, start, end. */
#define SHAPE_BYTES 0x28
#define SHAPE_TYPE 0x2
#define SHAPE_RADIUS 0xc
#define SHAPE_START 0x10
#define SHAPE_END 0x1c
#define SPHERE 0
#define CAPSULE 1
#define JOINT_SWEPT 0x7d /* placed by its owner's code: left out */
#define JOINT_LINE 0x7e  /* from POSITION to POSITION_END */
#define JOINT_POINT 0x7f /* offsets from POSITION */
#define MAX_SHAPES 16

/* Monsters (game_sub's shape placing, EU 0x09C37798, reads these). */
#define MANAGER_SLOTS 0x1220
#define SLOTS 20
#define ENTITY_AREA 0x29a
#define JOINTS 0x190
#define JOINT_BYTES 0x250
#define JOINT_MATRIX 0xd0
#define SCALE 0x220
#define HUD_HUNTER 0x530

/* The renderer: the camera's view matrix and the 3D projection, 4×4, row vectors. */
#define VIEW 0xb80
#define PROJECTION 0xc00

/* The screen, and the near plane in front of the camera. */
#define WIDTH 480.0f
#define HEIGHT 272.0f
#define NEAR 20.0f

/* What it draws, at most, a frame: the HUD's display list is shared. */
#define MAX_STRIPS 256
/* A shape is filled in strips this tall, or taller when it's tall on screen. */
#define STRIP 2
#define MAX_STRIPS_A_SHAPE 64

#define FILL_R 0xff
#define FILL_G 0x40
#define FILL_B 0x30
#define FILL_ALPHA 0x50

typedef struct {
  float x, y, z;
} vec3;

static struct {
  s16 x, y, w, h;
} strips[MAX_STRIPS];
static u32 strip_count;

static float sqrt_f(float x) {
  float r;
  __asm__("sqrt.s %0, %1" : "=f"(r) : "f"(x));
  return r;
}

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

/* p · m, row vector times a 4×4 matrix's first three columns, w = 1. */
static vec3 transform(const float *m, vec3 p) {
  vec3 r;
  r.x = p.x * m[0] + p.y * m[4] + p.z * m[8] + m[12];
  r.y = p.x * m[1] + p.y * m[5] + p.z * m[9] + m[13];
  r.z = p.x * m[2] + p.y * m[6] + p.z * m[10] + m[14];
  return r;
}

static vec3 load(const u8 *at) {
  const float *f = (const float *)at;
  vec3 r = {f[0], f[1], f[2]};
  return r;
}

static vec3 add(vec3 a, vec3 b) {
  vec3 r = {a.x + b.x, a.y + b.y, a.z + b.z};
  return r;
}

/* A point on screen and its depth (the projection's w); 0 when behind the near plane. */
typedef struct {
  float x, y, w;
} screen;

static int project(const u8 *renderer, vec3 world, screen *out) {
  const float *proj = (const float *)(renderer + PROJECTION);
  vec3 v = transform((const float *)(renderer + VIEW), world);
  float cx = v.x * proj[0] + v.y * proj[4] + v.z * proj[8] + proj[12];
  float cy = v.x * proj[1] + v.y * proj[5] + v.z * proj[9] + proj[13];
  float w = v.x * proj[3] + v.y * proj[7] + v.z * proj[11] + proj[15];
  if (!(w > NEAR)) return 0;
  out->x = WIDTH * 0.5f * (1.0f + cx / w);
  out->y = HEIGHT * 0.5f * (1.0f - cy / w);
  out->w = w;
  return 1;
}

/* Where a row `y` crosses a circle: widens [*lo, *hi]. */
static void span_circle(float y, float cx, float cy, float r, float *lo, float *hi) {
  float dy = y - cy;
  float d = r * r - dy * dy;
  if (d < 0.0f) return;
  float half = sqrt_f(d);
  if (cx - half < *lo) *lo = cx - half;
  if (cx + half > *hi) *hi = cx + half;
}

/* Where a row `y` crosses a segment: widens [*lo, *hi]. */
static void span_edge(float y, float x0, float y0, float x1, float y1, float *lo, float *hi) {
  if ((y < y0 && y < y1) || (y > y0 && y > y1) || y0 == y1) return;
  float x = x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  if (x < *lo) *lo = x;
  if (x > *hi) *hi = x;
}

/*
 * A sphere swept from `a` to `b` (a == b for a sphere), as seen: the two end
 * circles and the band between them, a convex shape, filled row by row.
 * Each row's span is the widest any of its parts reaches, clipped to the
 * screen.
 */
static void capsule(const u8 *renderer, vec3 a, vec3 b, float radius) {
  screen sa, sb;
  if (!project(renderer, a, &sa) || !project(renderer, b, &sb)) return;
  /* A sphere's outline: its radius at its depth, in the projection's scale. */
  float scale = ((const float *)(renderer + PROJECTION))[5] * HEIGHT * 0.5f;
  float ra = radius * scale / sa.w, rb = radius * scale / sb.w;
  if (ra < 1.0f) ra = 1.0f;
  if (rb < 1.0f) rb = 1.0f;
  float dx = sb.x - sa.x, dy = sb.y - sa.y;
  float length = sqrt_f(dx * dx + dy * dy);
  float nx = 0.0f, ny = 0.0f;
  if (length >= 1.0f) {
    nx = -dy / length;
    ny = dx / length;
  }
  float top = sa.y - ra < sb.y - rb ? sa.y - ra : sb.y - rb;
  float bottom = sa.y + ra > sb.y + rb ? sa.y + ra : sb.y + rb;
  if (top < 0.0f) top = 0.0f;
  if (bottom > HEIGHT) bottom = HEIGHT;
  if (!(bottom > top)) return;
  s32 y0 = (s32)top, y1 = (s32)(bottom + 0.5f);
  s32 step = STRIP;
  while ((y1 - y0) / step > MAX_STRIPS_A_SHAPE) step++;
  /* The band's corners: each end's centre, out along the normal by its radius. */
  float p0x = sa.x + nx * ra, p0y = sa.y + ny * ra, p1x = sb.x + nx * rb, p1y = sb.y + ny * rb;
  float q0x = sa.x - nx * ra, q0y = sa.y - ny * ra, q1x = sb.x - nx * rb, q1y = sb.y - ny * rb;
  for (s32 y = y0; y < y1 && strip_count < MAX_STRIPS; y += step) {
    s32 h = y + step > y1 ? y1 - y : step;
    float row = (float)y + (float)h * 0.5f;
    float lo = WIDTH, hi = -1.0f;
    span_circle(row, sa.x, sa.y, ra, &lo, &hi);
    span_circle(row, sb.x, sb.y, rb, &lo, &hi);
    if (length >= 1.0f) {
      span_edge(row, p0x, p0y, p1x, p1y, &lo, &hi);
      span_edge(row, q0x, q0y, q1x, q1y, &lo, &hi);
    }
    if (lo < 0.0f) lo = 0.0f;
    if (hi > WIDTH) hi = WIDTH;
    s32 x = (s32)(lo + 0.5f), w = (s32)(hi + 0.5f) - x;
    if (w <= 0) continue;
    strips[strip_count].x = (s16)x;
    strips[strip_count].y = (s16)y;
    strips[strip_count].w = (s16)w;
    strips[strip_count].h = (s16)h;
    strip_count++;
  }
}

/* One shape record of an attack its monster owns, placed as the game places it. */
static void shape(const u8 *renderer, const u8 *attack, const u8 *m, const u8 *s) {
  s16 joint = *(const s16 *)s;
  s16 type = *(const s16 *)(s + SHAPE_TYPE);
  if (type != SPHERE && type != CAPSULE) return;
  float radius = *(const float *)(s + SHAPE_RADIUS);
  vec3 start = load(s + SHAPE_START);
  vec3 end = type == CAPSULE ? load(s + SHAPE_END) : start;
  if (joint == JOINT_LINE) {
    capsule(renderer, load(attack + POSITION), load(attack + POSITION_END), radius);
  } else if (joint == JOINT_POINT) {
    vec3 at = load(attack + POSITION);
    capsule(renderer, add(at, start), add(at, end), radius);
  } else if (joint >= 0 && joint < JOINT_SWEPT) {
    const u8 *joints = *(u8 *const *)(m + JOINTS);
    if (!joints) return;
    const float *matrix = (const float *)(joints + joint * JOINT_BYTES + JOINT_MATRIX);
    radius *= *(const float *)(m + SCALE);
    capsule(renderer, transform(matrix, start), transform(matrix, end), radius);
  }
}

static void draw(u8 *hud) {
  if (on() != 1) return;
  if (!game_task_loaded()) return;
  u8 *manager = *rf_monsters, *pool = *rf_attacks, *renderer = *rf_camera;
  u8 *hunter = *(u8 **)(hud + HUD_HUNTER);
  if (!manager || !pool || !renderer || !hunter) return;
  u16 area = *(u16 *)(hunter + ENTITY_AREA);
  strip_count = 0;
  u32 guard = 0;
  for (u8 *attack = *(u8 **)(pool + ATTACK_LIST); attack && guard < 64;
       attack = *(u8 **)(attack + NEXT), guard++) {
    if (attack[STATE] != STATE_LIVE || attack[OWNER_NONE] == 0xff || !attack[OWNER_MONSTER]) continue;
    if (*(u16 *)(attack + AREA) != area || attack[OWNER_SLOT] >= SLOTS) continue;
    u8 *m = *(u8 **)(manager + MANAGER_SLOTS + attack[OWNER_SLOT] * 4);
    const u8 *s = *(u8 **)(attack + SHAPES);
    if (!m || !s) continue;
    for (u32 k = 0; k < MAX_SHAPES && *(const s16 *)s != -1; k++, s += SHAPE_BYTES) {
      shape(renderer, attack, m, s);
    }
  }
  for (u32 k = 0; k < strip_count; k++) {
    rf_call9(rf_fill, (u32)hud, (u32)strips[k].x, (u32)strips[k].y, (u32)strips[k].w,
             (u32)strips[k].h, FILL_R, FILL_G, FILL_B, FILL_ALPHA);
  }
}

/* --- The setting, in Whetstone's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const mode_names[MODES] = {"OFF", "ON"};
static void set_on(u32 choice) {
  struct rf_save_data *d = rf_save_data();
  if (d && choice < MODES) d->hitboxes = (u8)(choice + 1);
}
static const struct rf_setting setting = {
    "Attack hitboxes",
    "Shade in red each monster\nattack that can hit you\nright now: the parts that\nhurt, and projectiles like\nfireballs.",
    mode_names,
    MODES,
    on,
    set_on,
};

void rf_hitboxes_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  rf_on(RF_HOOK_HUD, draw);
  if (rf_add_setting) rf_add_setting(&setting);
}
