/*
 * Attack hitboxes (the hud.attackHitboxes option): an outline of every
 * monster attack that can hit right now, drawn over the scene with the HUD's
 * line routine. See ../docs/code-loader.md and src/patches/hitboxes.ts,
 * which finds the game's addresses below on each disc. It only reads game
 * state.
 *
 * Built with the FPU (single precision only: Allegrex has no doubles), so
 * nothing here may use a double. Floats are never live across a game call:
 * the shapes are projected into `lines` first, then drawn.
 */
#include "rf.h"

/* Found per disc (src/patches/hitboxes.ts). */
extern const u8 rf_game_task[];    /* game_task.ovl's load address */
extern u8 *const rf_monsters[];    /* the global holding the monster manager */
extern u8 *const rf_attacks[];     /* the global holding the attack objects' pool */
extern u8 *const rf_camera[];      /* the global holding the renderer: its view and projection */
extern const u8 rf_hud_line[];     /* line(hud, x0, y0, x1, y1, r, g, b) */

/* The pool: a list of live attack objects. */
#define ATTACK_LIST 0x502c
/* An attack object. */
#define NEXT 0x4
#define OWNER_NONE 0xe /* 0xFF: no owner */
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
#define MAX_LINES 192
#define SEGMENTS 12

#define LINE_R 0xff
#define LINE_G 0x30
#define LINE_B 0x30

typedef struct {
  float x, y, z;
} vec3;

static struct {
  s16 x0, y0, x1, y1;
} lines[MAX_LINES];
static u32 line_count;

/* cos and sin of k × 30°. */
static const float unit[SEGMENTS][2] = {
    {1.0f, 0.0f},         {0.8660254f, 0.5f},   {0.5f, 0.8660254f},   {0.0f, 1.0f},
    {-0.5f, 0.8660254f},  {-0.8660254f, 0.5f},  {-1.0f, 0.0f},        {-0.8660254f, -0.5f},
    {-0.5f, -0.8660254f}, {0.0f, -1.0f},        {0.5f, -0.8660254f},  {0.8660254f, -0.5f},
};

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

/* Clips a segment to the screen (Liang-Barsky) and keeps it, if there's room. */
static void line(float x0, float y0, float x1, float y1) {
  if (line_count == MAX_LINES) return;
  float dx = x1 - x0, dy = y1 - y0;
  float t0 = 0.0f, t1 = 1.0f;
  float p[4] = {-dx, dx, -dy, dy};
  float q[4] = {x0, WIDTH - 1.0f - x0, y0, HEIGHT - 1.0f - y0};
  for (int k = 0; k < 4; k++) {
    if (p[k] == 0.0f) {
      if (q[k] < 0.0f) return;
      continue;
    }
    float t = q[k] / p[k];
    if (p[k] < 0.0f) {
      if (t > t1) return;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return;
      if (t < t1) t1 = t;
    }
  }
  lines[line_count].x0 = (s16)(x0 + t0 * dx);
  lines[line_count].y0 = (s16)(y0 + t0 * dy);
  lines[line_count].x1 = (s16)(x0 + t1 * dx);
  lines[line_count].y1 = (s16)(y0 + t1 * dy);
  line_count++;
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

static void circle(screen c, float r) {
  for (int k = 0; k < SEGMENTS; k++) {
    const float *a = unit[k], *b = unit[(k + 1) % SEGMENTS];
    line(c.x + r * a[0], c.y + r * a[1], c.x + r * b[0], c.y + r * b[1]);
  }
}

/*
 * A sphere swept from `a` to `b` (a == b for a sphere), as seen: a circle at
 * each end and the two lines that join them.
 */
static void capsule(const u8 *renderer, vec3 a, vec3 b, float radius) {
  screen sa, sb;
  if (!project(renderer, a, &sa) || !project(renderer, b, &sb)) return;
  /* A sphere's outline: its radius at its depth, in the projection's scale. */
  float scale = ((const float *)(renderer + PROJECTION))[5] * HEIGHT * 0.5f;
  float ra = radius * scale / sa.w, rb = radius * scale / sb.w;
  if (ra < 1.0f) ra = 1.0f;
  if (rb < 1.0f) rb = 1.0f;
  circle(sa, ra);
  float dx = sb.x - sa.x, dy = sb.y - sa.y;
  float length = sqrt_f(dx * dx + dy * dy);
  if (length < 1.0f) return;
  circle(sb, rb);
  float nx = -dy / length, ny = dx / length;
  line(sa.x + nx * ra, sa.y + ny * ra, sb.x + nx * rb, sb.y + ny * rb);
  line(sa.x - nx * ra, sa.y - ny * ra, sb.x - nx * rb, sb.y - ny * rb);
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
  if (!game_task_loaded()) return;
  u8 *manager = *rf_monsters, *pool = *rf_attacks, *renderer = *rf_camera;
  u8 *hunter = *(u8 **)(hud + HUD_HUNTER);
  if (!manager || !pool || !renderer || !hunter) return;
  u16 area = *(u16 *)(hunter + ENTITY_AREA);
  line_count = 0;
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
  for (u32 k = 0; k < line_count; k++) {
    rf_call8(rf_hud_line, (u32)hud, (u16)lines[k].x0, (u16)lines[k].y0, (u16)lines[k].x1,
             (u16)lines[k].y1, LINE_R, LINE_G, LINE_B);
  }
}

void rf_hitboxes_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  rf_on(RF_HOOK_HUD, draw);
}
