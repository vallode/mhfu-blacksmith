/*
 * The weapon stitcher (mods.weaponStitcher): every time the game builds the
 * hunter's weapon model (stage loads, the house's equipment change), a new
 * look for it, stitched from the forges' parts in FORGE.BIN.
 *
 * rf_hook6 runs at the start of the game's weapon build (rf.h,
 * RF_HOOK_BUILD), when the weapon's package from DATA.BIN is already in its
 * slot's buffer. For the hunter's own weapon it rolls a recipe (another
 * handle of its class, a head, in "any" and "wild" mode often from another
 * class, maybe another guard, the second piece, a material), places the
 * parts along the grip (with borrowed trim and a glow), scaled and turned in Q12 fixed point when they come
 * from another class, and writes a new package (the
 * model, the frame's skeleton, a texture set of the parts' images) over the
 * buffer if it fits the slot. A bow or bowgun gets another of its class's
 * body, barrel, stock, limbs or quiver, each vertex unposed from the frame's
 * drawn skins into its bind pose. If anything fails, the buffer keeps DATA.BIN's
 * bytes. With relics (../src/forge/relics.ts), only a relic is stitched, its
 * random state from a seed kept in its equipment box slot (relic_seed).
 * ../src/forge/stitch.ts is the same stitcher in TypeScript, and the
 * file's layout is in ../src/forge/stitch-library.ts; the two must agree
 * byte for byte (test/stitch.test.ts).
 */
#include "rf.h"

extern const u8 rf_io_lseek[];         /* sceIoLseek(fd, s64 offset, whence) */
extern const u8 rf_time_low[];         /* sceKernelGetSystemTimeLow() */
extern const u8 rf_weapon_file_base[]; /* a constant: the DATA.BIN file of weapon model 0 */
extern const u8 rf_stitch_mode[];      /* a constant: 1 + the mode (0 class, 1 any, 2 wild) */
extern const u8 rf_relic_mode[];       /* a constant: 2 to stitch only relics, each from its slot's seed (1 not) */
extern const u8 rf_save_pointer[];     /* the game's global holding the save's address */
extern const u32 rf_relics[];          /* relics.ts relicTable: a count, then sorted (ranged, ID, model) */
void sceKernelDcacheWritebackAll(void);

/* The resources object's per-slot tables (the build's own code reads them). */
#define RES_BUFFER 0x80258
#define RES_CAPACITY 0x80318
#define RES_FILE 0x80408
#define WEAPON_SLOT 6

/* The save (relics.ts): the hunter's block, its equipment box and equipped set. */
#define SAVE_HUNTER 0x4a0
#define SAVE_EQUIPPED 0x60 /* another copy of the equipped set, before the hunter's block */
#define HUNTER_EQUIPPED 0x20
#define HUNTER_BOX 0xa8
#define HUNTER_WEAPON_INDEX 0x4020
#define BOX_SLOTS 1000
#define SLOT_BYTES 12
#define BUILT_EQUIPPED 0x4e8 /* the hunter object's copy */

/* FORGE.BIN (stitch-library.ts). */
#define MAGIC 0x47464652
#define VERSION 4
#define HEADER_BYTES 48
#define INDEX_BYTES 6
#define RECORD_BYTES 288
#define PIECE_BYTES 20
#define CLASSES 8
#define REDUCED 8
#define NO_SPAN_HI (-0x8000)
#define HEAD_STAIRS 16
#define GUARD_STAIRS 8
#define HEAD_STAIRS_AT 176
#define GUARD_STAIRS_AT (HEAD_STAIRS_AT + HEAD_STAIRS * 4)
#define HEAD_TOP_AT (GUARD_STAIRS_AT + GUARD_STAIRS * 4)

/* Scales are Q12: Q is 1.0. */
#define Q 4096
#define GUARD_FIT_LO 2458 /* 0.6 */
#define GUARD_FIT_HI 6554 /* 1.6 */
#define LEAST_SCALE 1024  /* 0.25 */
#define REDUCE_BELOW 3277 /* 0.8 */
#define ON_AXIS 6
#define TURNED_CLASS 3 /* dual blades face the other way */
#define PLACED_LIMIT 0x7fff
#define ALONG_LO 1024 /* borrowed trim sits 0.25 to 0.85 along the head */
#define ALONG_SPAN 2458
#define EFFECT 15 /* in 100: a borrowed glow */
#define MAX_EXTRAS 2

#define ROLE_HANDLE 0
#define ROLE_HEAD 1
#define ROLE_GUARD 2
#define ROLE_EXTRA_HIGH 3
#define ROLE_EXTRA_LOW 4
#define ROLE_EFFECT_HIGH 5
#define ROLE_EFFECT_LOW 6
#define ROLE_SECOND 7

#define FLAG_LENDS 1
#define FLAG_HEAD 2
#define FLAG_SEATS 4
#define FLAG_GUARD 8
#define FLAG_SECOND 16
#define FLAG_SECOND_PARTS 32
#define FLAG_TWIN 64
#define FLAG_GRIP 128
#define CLASS_GUARDED 1

#define ROLLS 6
#define MAX_MODELS 640
#define MAX_PIECES 4096
#define MAX_INSTANCES 24
#define MAX_BLOCKS 16
#define MAX_CHUNKS 4 /* a block's (stitch-library.ts's MAX_CHUNKS) */
#define MAX_GROUPS (MAX_INSTANCES * MAX_CHUNKS)
#define MAX_IMAGES 24
#define MAX_MATERIALS 64
#define MAX_MESHES 8
/*
 * The biggest package written. A take's bodies, images and skeleton are
 * loaded into the arena before the package is written over the slot
 * buffer, and each is no bigger than what it becomes there (a body's chunk
 * head and vertices no bigger than its group's record, list head and
 * vertices), so the arena holds any take whose package fits, with room for
 * the alignment, and a gunner chunk without normals (none on the EU disc)
 * a byte a vertex over.
 */
#define PACKAGE_MAX 0x6000
#define ARENA_BYTES (PACKAGE_MAX + 0x1000)
#define PACK_MARGIN 16 /* lz.ts's: packed bytes end this far past their unpacked end */
#define BLOCK_HEAD 16

#define CHUNK_HEAD 24
#define LAYOUT_NORMAL 1
#define LAYOUT_WEIGHTS 2

/* Bows and bowguns (stitch-gunner.ts): classes from GUNNER_CLASS. */
#define GUNNER_CLASS 8
#define LIGHT_BOWGUN 8
#define HEAVY_BOWGUN 9
#define BOW 10
#define GUNNER_BONES 8
#define GUNNER_ROLES 5
#define GROLE_BODY 0
#define GROLE_STOCK 1
#define GROLE_BARREL 2
#define GROLE_LIMBS 3
#define GROLE_SECOND 4
#define GFLAG_BODY 1
#define GFLAG_STOCK 2
#define GFLAG_BARREL 4
#define GFLAG_LIMBS 8
#define GFLAG_SECOND 16
#define GFLAG_SECOND_PARTS 32
#define NO_SLOT 15
#define DET_MIN 13421773 /* 0.05 in Q28 */

static const u8 ramps[8][3][3] = {
    {{60, 35, 5}, {170, 120, 30}, {255, 220, 120}},
    {{10, 5, 20}, {60, 40, 90}, {170, 150, 220}},
    {{70, 60, 40}, {190, 175, 140}, {250, 245, 225}},
    {{50, 0, 10}, {170, 20, 40}, {255, 140, 150}},
    {{0, 40, 25}, {40, 150, 90}, {190, 255, 210}},
    {{20, 40, 80}, {110, 170, 230}, {235, 250, 255}},
    {{40, 20, 10}, {130, 65, 30}, {210, 150, 90}},
    {{30, 32, 38}, {120, 125, 135}, {230, 235, 245}},
};

static const u32 cross[3] = {0, 50, 90}; /* in 100: a head from another class, per mode */

static u8 index_bytes[MAX_MODELS * INDEX_BYTES];
static u32 model_count, unit_shift, record_at, loaded;
static u32 guard_target[CLASSES], class_scale[CLASSES][CLASSES];
/* Borrowable trim and glows: each one's model, with 0x8000 for a glow; the rest is read when placed. */
static u16 piece_model[MAX_PIECES];
static u32 piece_count, piece_at;
static u32 rng_state;
static s32 fd;
static u8 arena[ARENA_BYTES] __attribute__((aligned(16)));

/* Why the last build kept DATA.BIN's bytes (0: it was stitched), and how many were stitched. */
u32 rf_stitch_status, rf_stitch_count;

static u32 rd16(const u8 *p) { return p[0] | p[1] << 8; }
static s32 rs16(const u8 *p) { return (s16)rd16(p); }
static u32 rd32(const u8 *p) { return rd16(p) | rd16(p + 2) << 16; }
static void wr16(u8 *p, u32 v) {
  p[0] = v;
  p[1] = v >> 8;
}
static void wr32(u8 *p, u32 v) {
  wr16(p, v);
  wr16(p + 2, v >> 16);
}
static void copy(u8 *to, const u8 *from, u32 n) {
  while (n--) *to++ = *from++;
}
/* Clang copies structs of more than 16 bytes with memcpy, which nothing else here provides. */
void *memcpy(void *to, const void *from, u32 n) {
  copy(to, from, n);
  return to;
}
static void zero(u8 *to, u32 n) {
  while (n--) *to++ = 0;
}
static u32 align16(u32 n) { return (n + 15) & ~15u; }

static u32 read_at(u32 offset, void *to, u32 size) {
  rf_call8(rf_io_lseek, (u32)fd, 0, offset, 0, 0, 0, 0, 0);
  return (u32)sceIoRead(fd, to, size) == size;
}

static u32 next(void) {
  u32 x = rng_state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return rng_state = x;
}
static u32 rand_int(u32 n) { return next() % n; }

static u32 isqrt(u32 x) {
  u32 root = 0, bit = 1u << 30;
  while (bit > x) bit >>= 2;
  while (bit) {
    if (x >= root + bit) {
      x -= root + bit;
      root = (root >> 1) + bit;
    } else {
      root >>= 1;
    }
    bit >>= 2;
  }
  return root;
}

static s32 scaled(s32 v, s32 s) { return (v * s + 2048) >> 12; }
static s32 max_s(s32 a, s32 b) { return a > b ? a : b; }
static s32 min_s(s32 a, s32 b) { return a < b ? a : b; }
static u32 turns(u32 from, u32 frame) { return (from == TURNED_CLASS) != (frame == TURNED_CLASS); }

/* ------------------------------------------------------------ the library */

static const u8 *entry(u32 n) { return index_bytes + n * INDEX_BYTES; }
#define E_MODEL(n) rd16(entry(n))
#define E_TYPE(n) entry(n)[2]
#define E_FLAGS(n) entry(n)[3]
#define E_SHAPE(n) entry(n)[4]
#define E_CLASS(n) entry(n)[5]

/* A seat table (stitch-library.ts's `stairs`): (distance, lowest z) steps. */
struct stairs {
  u32 count;
  s32 step[HEAD_STAIRS][2];
};

struct record {
  s32 handle_bone, head_bone, twin_handle, twin_head;
  s32 cut, shaft_top, head_bottom, guard_top, extras_under, head_width, guard_width;
  s32 head_top, head_box[4];
  u32 refs[16][2];
  u32 head_scale[CLASSES];
  struct stairs head_stairs, guard_stairs;
};

static void load_stairs(struct stairs *t, const u8 *at, u32 count, u32 limit) {
  t->count = count < limit ? count : limit;
  for (u32 k = 0; k < t->count; k++) {
    t->step[k][0] = rs16(at + k * 4);
    t->step[k][1] = rs16(at + k * 4 + 2);
  }
}

static u32 load_record(u32 n, struct record *r) {
  u8 raw[RECORD_BYTES];
  if (!read_at(record_at + n * RECORD_BYTES, raw, RECORD_BYTES)) return 0;
  r->handle_bone = (signed char)raw[0];
  r->head_bone = (signed char)raw[1];
  r->twin_handle = (signed char)raw[2];
  r->twin_head = (signed char)raw[3];
  r->cut = rs16(raw + 4);
  r->shaft_top = rs16(raw + 6);
  r->head_bottom = rs16(raw + 8);
  r->guard_top = rs16(raw + 10);
  r->extras_under = rs16(raw + 12);
  r->head_width = rd16(raw + 14);
  r->guard_width = rd16(raw + 16);
  for (u32 k = 0; k < 16; k++) {
    r->refs[k][0] = rd32(raw + 32 + k * 8);
    r->refs[k][1] = rd32(raw + 36 + k * 8);
  }
  for (u32 k = 0; k < CLASSES; k++) r->head_scale[k] = rd16(raw + 160 + k * 2);
  load_stairs(&r->head_stairs, raw + HEAD_STAIRS_AT, raw[18], HEAD_STAIRS);
  load_stairs(&r->guard_stairs, raw + GUARD_STAIRS_AT, raw[19], GUARD_STAIRS);
  r->head_top = rs16(raw + HEAD_TOP_AT);
  for (u32 k = 0; k < 4; k++) r->head_box[k] = rs16(raw + HEAD_TOP_AT + 2 + k * 2);
  return 1;
}

static u32 load_library(void) {
  if (loaded) return 1;
  u8 head[HEADER_BYTES];
  if (!read_at(0, head, HEADER_BYTES) || rd32(head) != MAGIC || rd32(head + 4) != VERSION) return 0;
  model_count = rd16(head + 16);
  unit_shift = rd32(head + 12);
  record_at = rd32(head + 24);
  if (model_count > MAX_MODELS) return 0;
  if (!read_at(rd32(head + 20), index_bytes, model_count * INDEX_BYTES)) return 0;
  u8 classes[CLASSES * 2 + CLASSES * CLASSES * 2];
  if (!read_at(rd32(head + 28), classes, sizeof classes)) return 0;
  for (u32 t = 0; t < CLASSES; t++) {
    guard_target[t] = rd16(classes + t * 2);
    for (u32 f = 0; f < CLASSES; f++) class_scale[f][t] = rd16(classes + CLASSES * 2 + (f * CLASSES + t) * 2);
  }
  piece_at = rd32(head + 32);
  piece_count = rd32(head + 36);
  if (piece_count > MAX_PIECES) return 0;
  /* Through the arena, a few hundred at a time. */
  for (u32 k = 0; k < piece_count;) {
    u32 n = piece_count - k < ARENA_BYTES / PIECE_BYTES ? piece_count - k : ARENA_BYTES / PIECE_BYTES;
    if (!read_at(piece_at + k * PIECE_BYTES, arena, n * PIECE_BYTES)) return 0;
    for (u32 i = 0; i < n; i++, k++)
      piece_model[k] = rd16(arena + i * PIECE_BYTES) | (arena[i * PIECE_BYTES + 2] ? 0x8000 : 0);
  }
  return loaded = 1;
}

/* A bow's or bowgun's record: its numbers, skeleton and block references. */
struct gunner {
  s32 barrel_start, limb_z;
  u32 bones, at, meets;
  s32 parents[GUNNER_BONES];
  u32 refs[GUNNER_ROLES];
};

static u32 load_gunner(u32 n, struct gunner *g) {
  u8 raw[32 + GUNNER_ROLES * 8];
  if (!read_at(record_at + n * RECORD_BYTES, raw, sizeof raw)) return 0;
  g->barrel_start = rs16(raw + 4);
  g->limb_z = rs16(raw + 6);
  g->bones = raw[8];
  if (g->bones > GUNNER_BONES) return 0;
  for (u32 k = 0; k < g->bones; k++) g->parents[k] = (signed char)raw[9 + k];
  g->at = rd32(raw + 20);
  g->meets = rd16(raw + 24);
  for (u32 k = 0; k < GUNNER_ROLES; k++) g->refs[k] = rd32(raw + 32 + k * 8);
  return 1;
}

/* ------------------------------------------------------------ recipes */

struct recipe {
  u32 frame, handle, head;
  s32 guard, second;
  u32 extra_count, extra[MAX_EXTRAS], along[MAX_EXTRAS];
  s32 effect;
  s32 head_scale, guard_scale;
  u32 twin, material, head_material;
};

/* What a roll picks from: models, or pieces of trim and glows (so MAX_PIECES of them). */
static u16 list[MAX_PIECES];

static u32 mode(void) { return (u32)rf_stitch_mode - 1; }

/* A head that can sit on another handle. */
static u32 seats(u32 n) { return (E_FLAGS(n) & (FLAG_HEAD | FLAG_SEATS)) == (FLAG_HEAD | FLAG_SEATS); }

/* Picks the indices of a recipe, as stitch.ts's rollStitch; the sizes come once their records are in. */
static u32 roll(u32 frame, struct recipe *r) {
  u32 type = E_TYPE(frame), m = 0, wild = mode() == 2;
  for (u32 n = 0; n < model_count; n++)
    if (E_TYPE(n) == type && (E_FLAGS(n) & FLAG_LENDS)) list[m++] = n;
  if (!m) return 0;
  r->frame = frame;
  r->handle = list[rand_int(m)];
  u32 from = type;
  if (rand_int(100) < cross[mode()]) {
    u32 classes[CLASSES], c = 0;
    for (u32 t = 0; t < CLASSES; t++) {
      if (t == type) continue;
      u32 n = 0;
      while (n < model_count && !(E_TYPE(n) == t && seats(n))) n++;
      if (n < model_count) classes[c++] = t;
    }
    if (c) from = classes[rand_int(c)];
  }
  m = 0;
  for (u32 n = 0; n < model_count; n++) {
    if (E_TYPE(n) != from) continue;
    if (from == type ? (E_FLAGS(n) & FLAG_HEAD) && (n == r->handle || seats(n)) : seats(n)) list[m++] = n;
  }
  if (!m) return 0;
  r->head = list[rand_int(m)];
  u32 wants = 0;
  if (E_CLASS(frame) & CLASS_GUARDED) wants = rand_int(100) < (wild ? 60u : 50u);
  else if (mode()) wants = rand_int(100) < (wild ? 35u : 20u);
  r->guard = -1;
  if (wants) {
    m = 0;
    for (u32 n = 0; n < model_count; n++)
      if ((mode() ? E_TYPE(n) < CLASSES : E_TYPE(n) == type) && n != r->head && (E_FLAGS(n) & FLAG_GUARD))
        list[m++] = n;
    if (m) r->guard = list[rand_int(m)];
  }
  /* Borrowed trim and a glow, from the classes the head may come from. */
  u32 many = rand_int(100);
  u32 count = wild ? (many < 35 ? 0 : many < 75 ? 1 : 2) : (many < 60 ? 0 : many < 90 ? 1 : 2);
  m = 0;
  for (u32 k = 0; k < piece_count; k++) {
    u32 n = piece_model[k] & 0x7fff;
    if (!(piece_model[k] & 0x8000) && n != r->head && (mode() || E_TYPE(n) == type)) list[m++] = k;
  }
  r->extra_count = 0;
  for (u32 k = 0; k < count && m; k++) {
    r->extra[k] = list[rand_int(m)];
    r->along[k] = ALONG_LO + rand_int(ALONG_SPAN);
    r->extra_count++;
  }
  r->effect = -1;
  if (rand_int(100) < EFFECT) {
    m = 0;
    for (u32 k = 0; k < piece_count; k++) {
      u32 n = piece_model[k] & 0x7fff;
      if ((piece_model[k] & 0x8000) && n != r->head && (mode() || E_TYPE(n) == type) &&
          (!m || list[m - 1] != n))
        list[m++] = n;
    }
    if (m) {
      u32 donor = list[rand_int(m)];
      m = 0;
      for (u32 k = 0; k < piece_count; k++)
        if (piece_model[k] == (donor | 0x8000)) list[m++] = k;
      r->effect = list[rand_int(m)];
    }
  }
  r->second = -1;
  if (E_FLAGS(frame) & FLAG_SECOND_PARTS) {
    m = 0;
    for (u32 n = 0; n < model_count; n++)
      if (E_TYPE(n) == type && n != frame && E_SHAPE(n) == E_SHAPE(frame) && (E_FLAGS(n) & FLAG_SECOND)) list[m++] = n;
    r->second = rand_int(100) < 30 && m ? (s32)list[rand_int(m)] : (s32)frame;
    if (!(E_FLAGS(r->second) & FLAG_SECOND)) r->second = m ? (s32)list[rand_int(m)] : -1;
  }
  u32 which = rand_int(100);
  u32 material = 1 + rand_int(8);
  r->twin = (E_FLAGS(frame) & FLAG_TWIN) != 0;
  r->material = which < 15 ? material : 0;
  r->head_material = which >= 15 && which < 45 ? material : 0;
  return 1;
}

/* The head's and guard's scales, as rollRecipe sizes them. */
static void size(struct recipe *r, const struct record *D, const struct record *G) {
  u32 type = E_TYPE(r->frame), head_type = E_TYPE(r->head);
  s32 hs = D->head_scale[type];
  const struct record *sized = G ? G : D;
  u32 sized_type = E_TYPE(G ? (u32)r->guard : r->head);
  s32 width = sized->guard_width, target = guard_target[type], fitted;
  if (sized_type == type || width <= 0) fitted = Q;
  /* Both positive: unsigned divides. */
  else if (target > 0) fitted = min_s(GUARD_FIT_HI, max_s(GUARD_FIT_LO, (u32)(target * Q) / (u32)width));
  else if (!G) fitted = hs;
  else fitted = class_scale[sized_type][type];
  s32 gs = fitted;
  if (head_type != type && width > 0)
    gs = min_s(fitted, max_s(LEAST_SCALE, (u32)(3 * D->head_width * hs) / (u32)(2 * width)));
  r->head_scale = hs;
  r->guard_scale = gs;
}

/* ------------------------------------------------------------ placement */

/* A block placed: x and y scaled (and turned), z = base + (z - pivot) scaled. */
struct placing {
  s32 base, pivot, scale;
  u32 turn;
  s32 dx, dy; /* across, after scaling */
};

struct instance {
  u32 block; /* offset in the file */
  struct placing at;
  s32 bone;
  u32 material, handle;
  const struct gunner *source; /* a gunner block: the model whose bones it is on */
};

static struct instance instances[MAX_INSTANCES];
static u32 instance_count;
static struct record rec_frame, rec_handle, rec_head, rec_guard, rec_second, rec_effect;

static void add(u32 block, const struct placing *at, s32 bone, u32 material, u32 handle) {
  if (!block || instance_count >= MAX_INSTANCES) return;
  struct instance *i = &instances[instance_count++];
  i->block = block;
  i->at = *at;
  i->bone = bone;
  i->material = material;
  i->handle = handle;
  i->source = 0;
}

static u32 ref(const struct record *r, u32 role, u32 reduced, s32 scale) {
  u32 lighter = (reduced || scale < REDUCE_BELOW) && role <= ROLE_SECOND ? r->refs[REDUCED + role][0] : 0;
  return lighter ? lighter : r->refs[role][0];
}

/* The lowest z on the axis of a part with seat table `t` placed by `at`; 0 if none is. */
static u32 seat_low(const struct stairs *t, const struct placing *at, s32 *low) {
  s32 reach = ON_AXIS << unit_shift;
  u32 k = 0;
  while (k < t->count && t->step[k][0] * at->scale <= reach * Q) k++;
  if (!k) return 0;
  *low = at->base + scaled(t->step[k - 1][1] - at->pivot, at->scale);
  return 1;
}

/* The instances a take places (extras: the head's trim; reduced: fewer vertices; twin: the pair). */
static u32 place(const struct recipe *r, u32 extras, u32 reduced, u32 twin) {
  const struct record *F = &rec_frame, *H = &rec_handle, *D = &rec_head;
  const struct record *G = r->guard >= 0 ? &rec_guard : 0;
  s32 one = 1 << unit_shift, hs = r->head_scale, gs = r->guard_scale;
  u32 type = E_TYPE(r->frame), head_type = E_TYPE(r->head);
  u32 grip = (E_FLAGS(r->head) & FLAG_GRIP) != 0;
  s32 drop = 0;
  if (grip && (head_type != type || G)) {
    s32 bottom = scaled(D->head_bottom, hs);
    s32 guard_top = G ? scaled(G->guard_top, gs) : scaled(D->guard_top, head_type == type ? hs : gs);
    s32 under = max_s(guard_top, scaled(D->extras_under, hs));
    drop = max_s(0, bottom - under - one);
  }
  struct placing on_head = {grip ? H->cut - drop : 0, grip ? D->cut : 0, hs, turns(head_type, type)};
  struct placing still = {0, 0, Q, 0};
  s32 socket = grip ? H->cut : scaled(D->cut, hs);
  instance_count = 0;
  u32 handle_block = ref(H, ROLE_HANDLE, reduced, Q), head_block = ref(D, ROLE_HEAD, reduced, hs);
  if (!handle_block || !head_block) return 0;
  u32 all = r->material, top = r->head_material ? r->head_material : r->material;
  add(handle_block, &still, F->handle_bone, all, 1);
  add(head_block, &on_head, F->head_bone, top, 0);
  u32 low = r->head == r->handle || !grip;
  if (extras) {
    add(D->refs[ROLE_EXTRA_HIGH][0], &on_head, F->head_bone, top, 0);
    if (low) add(D->refs[ROLE_EXTRA_LOW][0], &on_head, F->head_bone, top, 0);
  }
  add(D->refs[ROLE_EFFECT_HIGH][0], &on_head, F->head_bone, 0, 0);
  if (low) add(D->refs[ROLE_EFFECT_LOW][0], &on_head, F->head_bone, 0, 0);
  /* The guard: a borrowed one, the head's own with it, or from another class on the socket if it is centred. */
  const struct record *guard = 0;
  struct placing guard_at = on_head;
  if (G) {
    guard = G;
    guard_at = (struct placing){socket, G->cut, gs, turns(E_TYPE(r->guard), type)};
  } else if (head_type == type) {
    guard = D;
  } else if (E_FLAGS(r->head) & FLAG_GUARD) {
    guard = D;
    guard_at = (struct placing){socket, D->cut, gs, turns(head_type, type)};
  }
  if (guard) add(ref(guard, ROLE_GUARD, reduced, guard_at.scale), &guard_at, F->head_bone, top, 0);
  if (extras) {
    /* Borrowed pieces, sized for the frame's class, moved in across to the head's sides (doubled). */
    s32 side[2][2];
    for (u32 k = 0; k < 2; k++) {
      s32 lo = scaled(D->head_box[k], hs), hi = scaled(D->head_box[2 + k], hs);
      side[k][0] = on_head.turn ? -hi : lo;
      side[k][1] = on_head.turn ? -lo : hi;
    }
    s32 length = scaled(D->head_top, hs);
    /* The head's span along z as placed; a piece is kept within it. */
    s32 lo = on_head.base + scaled(D->cut + D->head_bottom - on_head.pivot, hs);
    s32 hi = on_head.base + scaled(D->cut + D->head_top - on_head.pivot, hs);
    for (u32 e = 0; e < r->extra_count + (r->effect >= 0); e++) {
      u32 glow = e == r->extra_count;
      u8 raw[PIECE_BYTES];
      if (!read_at(piece_at + (glow ? (u32)r->effect : r->extra[e]) * PIECE_BYTES, raw, PIECE_BYTES)) return 0;
      u32 from = rd16(raw), from_type = E_TYPE(from);
      struct placing at = {0, 0, class_scale[from_type][type], turns(from_type, type), 0, 0};
      s32 min_z = rs16(raw + 12), max_z = rs16(raw + 18), mid_z = (min_z + max_z) >> 1;
      s32 spot;
      if (glow) {
        /* As far along this head as along its own, no larger than this head is to its own and no longer than it. */
        if (!load_record(from, &rec_effect)) return 0;
        s32 own = rec_effect.head_top - rec_effect.head_bottom;
        u32 along = Q >> 1, room = (u32)max_s(0, hi - lo) * Q;
        if (max_z > min_z && room / (u32)(max_z - min_z) < (u32)at.scale) at.scale = room / (u32)(max_z - min_z);
        if (own > 0) {
          if (room / (u32)own < (u32)at.scale) at.scale = room / (u32)own;
          along = (u32)max_s(0, mid_z - rec_effect.cut - rec_effect.head_bottom) * Q / (u32)own;
          if (along > Q) along = Q;
        }
        spot = lo + scaled(hi - lo, along);
      } else {
        spot = socket + scaled(length, r->along[e]);
      }
      s32 half = scaled(max_z - min_z, at.scale) >> 1;
      at.base = hi - lo < 2 * half ? (lo + hi) >> 1 : min_s(hi - half, max_s(lo + half, spot));
      at.pivot = mid_z;
      for (u32 k = 0; k < 2; k++) {
        s32 center = scaled(rs16(raw + 8 + k * 2) + rs16(raw + 14 + k * 2), at.scale);
        if (at.turn) center = -center;
        s32 mid = side[k][0] + side[k][1], half = (u32)((side[k][1] - side[k][0]) * 3) / 5;
        (k ? &at.dy : &at.dx)[0] = (min_s(mid + half, max_s(mid - half, center)) - center) >> 1;
      }
      add(rd32(raw + 4), &at, F->head_bone, glow ? 0 : top, 0);
    }
  }
  /* Seated on the handle's shaft. */
  if (r->head != r->handle && H->shaft_top != NO_SPAN_HI) {
    s32 body = 0, z;
    u32 found = seat_low(&D->head_stairs, &on_head, &body);
    if (guard && seat_low(&guard->guard_stairs, &guard_at, &z)) {
      body = found ? min_s(body, z) : z;
      found = 1;
    }
    if (found) {
      s32 gap = body - H->shaft_top;
      if (gap > 0)
        for (u32 k = 0; k < instance_count; k++)
          if (!instances[k].handle) instances[k].at.base -= gap + one;
    }
  }
  if (twin) {
    u32 n = instance_count;
    for (u32 k = 0; k < n; k++) {
      struct instance *i = &instances[k];
      add(i->block, &i->at, i->handle ? F->twin_handle : F->twin_head, i->material, i->handle);
    }
  } else if (r->second >= 0) {
    add(ref(&rec_second, ROLE_SECOND, reduced, Q), &still, -1, all, 0);
  }
  return 1;
}

/* ------------------------------------------------------------ bows and bowguns */

struct gunner_recipe {
  s32 body, stock, barrel, limbs, second;
  u32 material, accent;
};

/* The frame's record and drawn skins (Q14 3x3 row by row, then the translation), and the parts' records. */
static struct gunner gun_frame, gun_part[GUNNER_ROLES];
static s32 skins[GUNNER_BONES][12];
static u8 meet_bytes[MAX_MODELS * 2];
static u16 kept[MAX_MODELS];

static s32 pick(const u16 *from, u32 m) { return m ? (s32)from[rand_int(m)] : -1; }

/* Into `list`: the gunners of `type` with `flag`. */
static u32 having(u32 type, u32 flag) {
  u32 m = 0;
  for (u32 n = 0; n < model_count; n++)
    if (E_TYPE(n) == type && (E_FLAGS(n) & flag)) list[m++] = n;
  return m;
}

static u32 meets(u32 n) {
  for (u32 k = 0; k < gun_part[GROLE_BODY].meets; k++)
    if (rd16(meet_bytes + k * 2) == n) return 1;
  return 0;
}

/* As stitch-gunner.ts's rollGunnerStitch: 0 if nothing can be. */
static u32 roll_gunner(u32 frame, struct gunner_recipe *r) {
  u32 type = E_TYPE(frame);
  s32 body = pick(list, having(type, GFLAG_BODY));
  if (body < 0) return 0;
  struct gunner *B = &gun_part[GROLE_BODY];
  if (!load_gunner(body, B)) return 0;
  r->body = body;
  r->stock = r->barrel = r->limbs = r->second = -1;
  if (type == HEAVY_BOWGUN) {
    if (B->meets > MAX_MODELS || !read_at(B->at + B->bones * 48, meet_bytes, B->meets * 2)) return 0;
    u32 m = having(type, GFLAG_BARREL), k = 0;
    for (u32 i = 0; i < m; i++)
      if (list[i] != (u32)body && meets(list[i])) kept[k++] = list[i];
    s32 barrel = pick(kept, k);
    if (barrel < 0) {
      k = 0;
      for (u32 i = 0; i < m; i++)
        if (list[i] != (u32)body) kept[k++] = list[i];
      barrel = pick(kept, k);
    }
    if (barrel < 0) barrel = pick(list, m);
    if (barrel < 0) return 0;
    r->barrel = barrel;
  } else if (type == LIGHT_BOWGUN) {
    r->stock = pick(list, having(type, GFLAG_STOCK));
    u32 m = having(type, GFLAG_BARREL), k = 0;
    for (u32 i = 0; i < m; i++)
      if (list[i] != (u32)body) kept[k++] = list[i];
    s32 barrel = pick(kept, k);
    if (barrel < 0) barrel = pick(list, m);
    if (barrel < 0) return 0;
    r->barrel = barrel;
    if (rand_int(100) < 50) r->limbs = (E_FLAGS(body) & GFLAG_LIMBS) ? body : pick(list, having(type, GFLAG_LIMBS));
  }
  if (E_FLAGS(frame) & GFLAG_SECOND_PARTS) {
    u32 m = 0;
    for (u32 n = 0; n < model_count; n++)
      if (E_TYPE(n) == type && (E_FLAGS(n) & GFLAG_SECOND) && n != frame && E_SHAPE(n) == E_SHAPE(frame)) list[m++] = n;
    s32 second = (s32)frame;
    if (rand_int(100) < 50 && m) second = pick(list, m);
    if (!(E_FLAGS(second) & GFLAG_SECOND)) second = pick(list, m);
    r->second = second;
  }
  u32 which = rand_int(100);
  u32 material = 1 + rand_int(8);
  r->material = which < 15 ? material : 0;
  r->accent = which >= 15 && which < 45 ? material : 0;
  return 1;
}

static void add_gunner(s32 source, u32 role, s32 shift, u32 material) {
  if (source < 0) return;
  const struct gunner *g = &gun_part[role];
  struct placing at = {shift, 0, Q, 0};
  u32 before = instance_count;
  add(g->refs[role], &at, -1, material, 0);
  if (instance_count > before) instances[before].source = g;
}

/* As placeGunnerStitch: each part slid along z (drawn) and unposed from its own model's bones. */
static u32 place_gunner(const struct gunner_recipe *r, u32 type) {
  instance_count = 0;
  u32 all = r->material, accent = r->accent ? r->accent : r->material;
  add_gunner(r->body, GROLE_BODY, 0, all);
  if (!instance_count) return 0;
  if (type == LIGHT_BOWGUN) {
    add_gunner(r->stock, GROLE_STOCK, 0, all);
    add_gunner(r->barrel, GROLE_BARREL, gun_part[GROLE_BODY].barrel_start - gun_part[GROLE_BARREL].barrel_start,
               accent);
    if (r->limbs >= 0)
      add_gunner(r->limbs, GROLE_LIMBS, gun_frame.limb_z - gun_part[GROLE_LIMBS].limb_z, accent);
  } else if (type == HEAVY_BOWGUN) {
    add_gunner(r->barrel, GROLE_BARREL, 0, accent);
  }
  add_gunner(r->second, GROLE_SECOND, 0, type == BOW ? accent : all);
  return 1;
}

/* The frame bone a source bone maps to (stitch-gunner.ts's boneMap). */
static u32 bone_map(const struct gunner *s, s32 bone) {
  for (u32 hops = 0; bone >= 0 && (u32)bone < s->bones && hops <= GUNNER_BONES; hops++, bone = s->parents[bone])
    if ((u32)bone < gun_frame.bones && s->parents[bone] == gun_frame.parents[bone]) return bone;
  return 0;
}

/* a / b rounded half away from zero. */
static s32 rdiv(s32 a, s32 b) {
  u32 ua = a < 0 ? -a : a, ub = b < 0 ? -b : b;
  u32 q = (ua + (ub >> 1)) / ub;
  return (a < 0) != (b < 0) ? -(s32)q : (s32)q;
}

static s32 q14(s32 x) { return (x + 8192) >> 14; }

static s32 cofactors(const s32 *a, s32 *c) {
  c[0] = q14(a[4] * a[8] - a[5] * a[7]);
  c[1] = q14(a[5] * a[6] - a[3] * a[8]);
  c[2] = q14(a[3] * a[7] - a[4] * a[6]);
  c[3] = q14(a[2] * a[7] - a[1] * a[8]);
  c[4] = q14(a[0] * a[8] - a[2] * a[6]);
  c[5] = q14(a[1] * a[6] - a[0] * a[7]);
  c[6] = q14(a[1] * a[5] - a[2] * a[4]);
  c[7] = q14(a[2] * a[3] - a[0] * a[5]);
  c[8] = q14(a[0] * a[4] - a[1] * a[3]);
  return a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
}

/* A gunner vertex out: in the frame's bind pose, on up to two frame bones. */
struct unposed {
  s32 p[3], n[3];
  u32 count, bone[2], weight[2];
};

/*
 * stitch-gunner.ts's unposedWeights and unpose; `mapped` is the chunk's
 * bone slots on frame bones, `s` the vertex's slots and then its weights.
 */
static void unpose(const u8 *v, const u8 *s, u32 normal, s32 shift, const u8 *mapped, struct unposed *u) {
  u->count = 0;
  for (u32 k = 0; k < 2; k++) {
    u32 slot = k ? s[0] >> 4 : s[0] & 15, w = s[1 + k];
    if (slot == NO_SLOT || !w) continue;
    u32 b = mapped[slot], at = 0;
    while (at < u->count && u->bone[at] != b) at++;
    if (at < u->count) {
      u->weight[at] += w;
    } else {
      u->bone[u->count] = b;
      u->weight[u->count++] = w;
    }
  }
  if (!u->count) {
    u->bone[0] = mapped[s[0] & 15];
    u->weight[0] = 0x80;
    u->count = 1;
  }
  s32 m[12], c[9], total = 0;
  for (u32 k = 0; k < u->count; k++) total += u->weight[k];
  for (u32 e = 0; e < 12; e++) {
    s32 sum = 0;
    for (u32 k = 0; k < u->count; k++) sum += (s32)u->weight[k] * skins[u->bone[k]][e];
    m[e] = rdiv(sum, total);
  }
  s32 det = cofactors(m, c);
  if ((det < 0 ? -det : det) < DET_MIN) {
    u32 strongest = 0;
    for (u32 k = 1; k < u->count; k++)
      if (u->weight[k] > u->weight[strongest]) strongest = k;
    for (u32 e = 0; e < 12; e++) m[e] = skins[u->bone[strongest]][e];
    det = cofactors(m, c);
  }
  s32 d = (det + 8192) >> 14;
  s32 r[3] = {rs16(v) - m[9], rs16(v + 2) - m[10], rs16(v + 4) + shift - m[11]};
  for (u32 i = 0; i < 3; i++) {
    s32 p = d ? rdiv(c[i] * r[0] + c[3 + i] * r[1] + c[6 + i] * r[2], d) : 0;
    u->p[i] = min_s(PLACED_LIMIT, max_s(-PLACED_LIMIT, p));
  }
  if (normal) {
    s32 n[3] = {(signed char)v[6], (signed char)v[7], (signed char)v[8]}, t[3];
    for (u32 k = 0; k < 3; k++) t[k] = (m[k] * n[0] + m[3 + k] * n[1] + m[6 + k] * n[2]) >> 9;
    u32 len = isqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]);
    for (u32 k = 0; k < 3; k++) u->n[k] = len ? min_s(127, max_s(-127, rdiv(t[k] * 127, len))) : 0;
  }
}

/* ------------------------------------------------------------ writing */

/* A block: its head's offset, its body in the arena, and where its image is (offset, packed, size). */
struct block {
  u32 at;
  const u8 *data;
  u32 image[3];
};
static struct block blocks[MAX_BLOCKS];
static u32 block_count, arena_used;

static u32 short_of_room;

/* Room for `size` bytes in the arena (and `margin` past them), or 0. */
static u8 *take_room(u32 size, u32 margin) {
  if (arena_used + size + margin > ARENA_BYTES) {
    short_of_room = 1;
    return 0;
  }
  u8 *to = arena + arena_used;
  arena_used = align16(arena_used + size);
  return to;
}

/* `packed` bytes at `at` unpacked (lz.ts's unpack) to `size` in the arena, in place; 0 if they don't fit or fail. */
static u8 *load(u32 at, u32 packed, u32 size) {
  u8 *to = take_room(size, PACK_MARGIN);
  if (!to) return 0;
  if (packed == size) return read_at(at, to, size) ? to : 0;
  const u8 *in = to + size + PACK_MARGIN - packed;
  if (!read_at(at, (u8 *)in, packed)) return 0;
  u8 *out = to, *end = to + size;
  while (out < end) {
    u32 t = *in++, n = t >> 4;
    if (n == 15)
      for (u32 b = 255; b == 255; n += b) b = *in++;
    while (n--) *out++ = *in++;
    if (out >= end) break;
    const u8 *from = out - (in[0] | in[1] << 8);
    in += 2;
    n = t & 15;
    if (n == 15)
      for (u32 b = 255; b == 255; n += b) b = *in++;
    for (n += 4; n--;) *out++ = *from++;
  }
  return to;
}

static const struct block *load_block(u32 at) {
  for (u32 k = 0; k < block_count; k++)
    if (blocks[k].at == at) return &blocks[k];
  if (block_count >= MAX_BLOCKS) return 0;
  u8 head[BLOCK_HEAD];
  if (!read_at(at, head, BLOCK_HEAD)) return 0;
  struct block *b = &blocks[block_count];
  if (!(b->data = load(rd32(head), rd16(head + 4), rd16(head + 6)))) return 0;
  b->at = at;
  b->image[0] = rd32(head + 8);
  b->image[1] = rd16(head + 12);
  b->image[2] = rd16(head + 14);
  block_count++;
  return b;
}

struct group {
  const u8 *chunk;
  const struct placing *at;
  s32 bone;
  const struct gunner *source;
  u8 mapped[16];  /* a gunner chunk's bone slots on frame bones */
  u8 palette[GUNNER_BONES]; /* and the frame bones its vertices are on */
  u32 palette_count;
  u32 material, mesh, slot;
  /* Layout of its display list. */
  u32 bones, stride, uv_at, normal_at, position_at, index_size, list_bytes, vertex_at, index_at;
};
static struct group groups[MAX_GROUPS];
static u32 group_count;
static u8 order[MAX_GROUPS];

struct image {
  u32 at, packed, size, material;
  const u8 *data;
};
static struct image images[MAX_IMAGES];
static u32 image_count;

static u32 materials[MAX_MATERIALS][3];
static u32 material_count;

struct mesh {
  u32 flags, blend, slot_count;
  u8 slots[MAX_MATERIALS];
};
static struct mesh meshes[MAX_MESHES];
static u32 mesh_count;

#define C_FLAGS(c) rd32(c)
#define C_BLEND(c) rd32((c) + 4)
#define C_VERTICES(c) rd16((c) + 16)
#define C_INDICES(c) rd16((c) + 18)
#define C_BONES(c) (c)[20]
#define C_NORMAL(c) ((c)[21] & LAYOUT_NORMAL)
#define C_WEIGHTS(c) ((c)[21] & LAYOUT_WEIGHTS)
#define C_DRAWS(c) rd16((c) + 22)

/* A chunk's (stitch-library.ts's blockBody): its draws, a vertex's slot and uv, a vertex, an index. */
#define C_DRAW_AT(c) (CHUNK_HEAD + C_BONES(c))
#define C_SLOT(c) (6u + (C_NORMAL(c) ? 3 : 0))
#define C_UV(c) (C_SLOT(c) + (C_BONES(c) ? 1 : 0) + (C_WEIGHTS(c) ? 2 : 0))
#define C_VERTEX(c) (C_UV(c) + 4)
#define C_INDEX(c) (C_VERTICES(c) <= 0x100 ? 1u : 2u)

static u32 chunk_bytes(const u8 *c) {
  return C_DRAW_AT(c) + C_DRAWS(c) * 4 + C_VERTICES(c) * C_VERTEX(c) + C_INDICES(c) * C_INDEX(c);
}

/* A positive int over 2^shift as an f32's bits (exact below 2^24). */
static u32 float_bits(u32 v, u32 shift) {
  if (!v) return 0;
  u32 b = 31;
  while (!(v >> b)) b--;
  u32 mantissa = b >= 23 ? v >> (b - 23) : v << (23 - b);
  return (b - shift + 127) << 23 | (mantissa & 0x7fffff);
}

/* A block vertex's position, placed. */
static void place_vertex(const struct placing *at, const u8 *v, s32 p[3]) {
  s32 sign = at->turn ? -1 : 1;
  p[0] = sign * scaled(rs16(v), at->scale) + at->dx;
  p[1] = sign * scaled(rs16(v + 2), at->scale) + at->dy;
  p[2] = at->base + scaled(rs16(v + 4) - at->pivot, at->scale);
  for (u32 a = 0; a < 3; a++) p[a] = min_s(PLACED_LIMIT, max_s(-PLACED_LIMIT, p[a]));
}

static u32 recolor(u32 entry, u32 format, u32 material) {
  const u8(*ramp)[3] = ramps[material - 1];
  u32 c[3];
  if (format == 3) {
    c[0] = entry & 0xff;
    c[1] = (entry >> 8) & 0xff;
    c[2] = (entry >> 16) & 0xff;
  } else {
    for (u32 k = 0; k < 3; k++) c[k] = (((entry >> (k * 5)) & 31) * 510 + 31) / 62;
  }
  u32 lum = 299 * c[0] + 587 * c[1] + 114 * c[2];
  u32 at = lum * 512 / 255000;
  u32 i = at >> 8;
  if (i > 1) i = 1;
  u32 f = at - (i << 8);
  for (u32 k = 0; k < 3; k++) {
    u32 target = (ramp[i][k] * (256 - f) + ramp[i + 1][k] * f + 128) >> 8;
    c[k] = (c[k] * 64 + target * 192 + 128) >> 8;
  }
  if (format == 3) return (entry & 0xff000000) | c[2] << 16 | c[1] << 8 | c[0];
  u32 out = entry & 0x8000;
  for (u32 k = 0; k < 3; k++) out |= ((c[k] * 62 + 255) / 510) << (k * 5);
  return out;
}

/*
 * The package for the placed instances, written over `out` (the slot
 * buffer, which holds `skeleton`) once everything it takes is loaded; its
 * size, or 0 (leaving `out` as it was) if it doesn't fit `limit`. Its
 * blocks stay loaded for the roll's next take; images and the skeleton are
 * loaded only once it fits.
 */
static u32 package(u8 *out, const u8 *skeleton, u32 skeleton_size, u32 limit, u32 extra) {
  group_count = image_count = material_count = mesh_count = 0;
  for (u32 n = 0; n < instance_count; n++) {
    struct instance *in = &instances[n];
    const struct block *b = load_block(in->block);
    if (!b) return 0;
    u32 image = 0;
    while (image < image_count && !(images[image].at == b->image[0] && images[image].material == in->material))
      image++;
    if (image == image_count) {
      if (image_count >= MAX_IMAGES) return 0;
      images[image].at = b->image[0];
      images[image].packed = b->image[1];
      images[image].size = b->image[2];
      images[image].material = in->material;
      image_count++;
    }
    const u8 *c = b->data + 2;
    for (u32 k = rd16(b->data); k; k--, c += chunk_bytes(c)) {
      u32 diffuse = rd32(c + 8), ambient = rd32(c + 12), m = 0;
      while (m < material_count &&
             !(materials[m][0] == diffuse && materials[m][1] == ambient && materials[m][2] == image))
        m++;
      if (m == material_count) {
        if (material_count >= MAX_MATERIALS) return 0;
        materials[m][0] = diffuse;
        materials[m][1] = ambient;
        materials[m][2] = image;
        material_count++;
      }
      if (group_count >= MAX_GROUPS) return 0;
      struct group *g = &groups[group_count++];
      g->chunk = c;
      g->at = &in->at;
      g->bone = in->bone;
      g->source = in->source;
      g->material = m;
      if (g->source)
        for (u32 s = 0; s < 16; s++) g->mapped[s] = s < C_BONES(c) ? bone_map(g->source, c[24 + s]) : 0;
    }
  }

  /* Bounds, in units. */
  u32 max[3] = {1, 1, 1}, radius = 0;
  for (u32 n = 0; n < group_count; n++) {
    struct group *g = &groups[n];
    const u8 *c = g->chunk;
    const u8 *v = c + C_DRAW_AT(c) + C_DRAWS(c) * 4;
    u32 on = 0;
    for (u32 k = C_VERTICES(c); k; k--, v += C_VERTEX(c)) {
      s32 p[3];
      if (g->source) {
        struct unposed u;
        unpose(v, v + C_SLOT(c), 0, g->at->base, g->mapped, &u);
        for (u32 a = 0; a < 3; a++) p[a] = u.p[a];
        for (u32 b = 0; b < u.count; b++) on |= 1u << u.bone[b];
      } else {
        place_vertex(g->at, v, p);
      }
      u32 sum = 0;
      for (u32 a = 0; a < 3; a++) {
        u32 abs = p[a] < 0 ? -p[a] : p[a];
        if (abs > max[a]) max[a] = abs;
        sum += abs * abs;
      }
      u32 r = isqrt(sum);
      if (r > radius) radius = r;
    }
    /* A gunner group's palette: its frame bones, in order. */
    g->palette_count = 0;
    for (u32 b = 0; b < GUNNER_BONES; b++)
      if (on >> b & 1) g->palette[g->palette_count++] = b;
  }

  /* Meshes by blend and flags, opaque first; each group's slot, and its list's layout. */
  u32 count = 0;
  for (u32 pass = 0; pass < 2; pass++)
    for (u32 n = 0; n < group_count; n++)
      if ((C_BLEND(groups[n].chunk) != 0) == pass) order[count++] = n;
  for (u32 o = 0; o < group_count; o++) {
    struct group *g = &groups[order[o]];
    const u8 *c = g->chunk;
    u32 m = 0;
    while (m < mesh_count && !(meshes[m].blend == C_BLEND(c) && meshes[m].flags == C_FLAGS(c))) m++;
    if (m == mesh_count) {
      if (mesh_count >= MAX_MESHES) return 0;
      meshes[m].blend = C_BLEND(c);
      meshes[m].flags = C_FLAGS(c);
      meshes[m].slot_count = 0;
      mesh_count++;
    }
    struct mesh *mesh = &meshes[m];
    u32 s = 0;
    while (s < mesh->slot_count && mesh->slots[s] != g->material) s++;
    if (s == mesh->slot_count) mesh->slots[mesh->slot_count++] = g->material;
    g->mesh = m;
    g->slot = s;
    g->bones = g->source ? g->palette_count : g->bone < 0 ? C_BONES(c) : 1;
    g->uv_at = (g->bones + 1) & ~1u;
    g->normal_at = g->uv_at + 4;
    g->position_at = (g->normal_at + (C_NORMAL(c) ? 3 : 0) + 1) & ~1u;
    g->stride = g->position_at + 6;
    g->index_size = C_VERTICES(c) <= 0x100 ? 1 : 2;
    g->vertex_at = align16((5 + C_DRAWS(c) + 2) * 4);
    g->index_at = align16(g->vertex_at + C_VERTICES(c) * g->stride);
    g->list_bytes = align16(g->index_at + C_INDICES(c) * g->index_size);
  }

  /* The PMO's layout, as writePmo lays it out. */
  u32 slots = 0, palette = 0;
  for (u32 m = 0; m < mesh_count; m++) slots += meshes[m].slot_count;
  for (u32 n = 0; n < group_count; n++) palette += groups[n].bones;
  u32 mesh_table = 0x40;
  u32 group_table = align16(mesh_table + mesh_count * 0x18);
  u32 material_map = align16(group_table + group_count * 0x10);
  u32 bone_palette = align16(material_map + slots);
  u32 material_table = align16(bone_palette + palette * 2);
  u32 list_base = align16(material_table + material_count * 0x10);
  u32 pmo_size = list_base;
  for (u32 n = 0; n < group_count; n++) pmo_size += groups[n].list_bytes;
  u32 tmh_size = 16;
  for (u32 k = 0; k < image_count; k++) tmh_size += images[k].size;
  u32 pmo_at = 32;
  u32 skeleton_at = align16(pmo_at + pmo_size);
  u32 tmh_at = align16(skeleton_at + skeleton_size);
  u32 total = tmh_at + tmh_size;
  if (total > limit) return 0;

  /* The images, once each, and the skeleton, out of the way of the package. */
  for (u32 k = 0; k < image_count; k++) {
    struct image *i = &images[k];
    i->data = 0;
    for (u32 j = 0; j < k; j++)
      if (images[j].at == i->at) i->data = images[j].data;
    if (!i->data && !(i->data = load(i->at, i->packed, i->size))) return 0;
  }
  u8 *bones = take_room(skeleton_size, 0);
  if (!bones) return 0;
  copy(bones, skeleton, skeleton_size);
  zero(out, total);
  wr32(out, 3);
  wr32(out + 4, pmo_at);
  wr32(out + 8, pmo_size);
  wr32(out + 12, skeleton_at);
  wr32(out + 16, skeleton_size);
  wr32(out + 20, tmh_at);
  wr32(out + 24, tmh_size);
  copy(out + skeleton_at, bones, skeleton_size);

  u8 *pmo = out + pmo_at;
  static const u8 magic[8] = {'p', 'm', 'o', 0, '1', '.', '0', 0};
  copy(pmo, magic, 8);
  wr32(pmo + 0x08, pmo_size);
  wr32(pmo + 0x0c, float_bits(radius, unit_shift));
  for (u32 a = 0; a < 3; a++) wr32(pmo + 0x10 + a * 4, float_bits(max[a], unit_shift));
  wr16(pmo + 0x1c, mesh_count);
  wr16(pmo + 0x1e, material_count);
  wr32(pmo + 0x20, mesh_table);
  wr32(pmo + 0x24, group_table);
  wr32(pmo + 0x28, material_map);
  wr32(pmo + 0x2c, bone_palette);
  wr32(pmo + 0x30, material_table);
  wr32(pmo + 0x34, list_base);

  u32 slot_base = 0, first = 0, palette_start = 0, list_at = 0;
  for (u32 m = 0; m < mesh_count; m++) {
    struct mesh *mesh = &meshes[m];
    u8 *rec = pmo + mesh_table + m * 0x18;
    wr32(rec, 0x3f800000);
    wr32(rec + 4, 0x3f800000);
    wr32(rec + 8, mesh->flags);
    wr32(rec + 12, mesh->blend);
    wr16(rec + 0x10, mesh->slot_count);
    wr16(rec + 0x12, slot_base);
    for (u32 s = 0; s < mesh->slot_count; s++) pmo[material_map + slot_base + s] = mesh->slots[s];
    u32 in_mesh = 0;
    for (u32 o = 0; o < group_count; o++) {
      struct group *g = &groups[order[o]];
      if (g->mesh != m) continue;
      const u8 *c = g->chunk;
      u8 *grec = pmo + group_table + (first + in_mesh) * 0x10;
      grec[0] = g->slot;
      grec[1] = g->bones;
      wr16(grec + 2, palette_start);
      wr32(grec + 4, list_at);
      wr32(grec + 8, list_at + g->vertex_at);
      wr32(grec + 12, list_at + g->index_at);
      for (u32 b = 0; b < g->bones; b++) {
        pmo[bone_palette + (palette_start + b) * 2] = b;
        pmo[bone_palette + (palette_start + b) * 2 + 1] =
            g->source ? g->palette[b] : g->bone < 0 ? c[24 + b] : (u32)g->bone;
      }
      palette_start += g->bones;

      u8 *list = pmo + list_base + list_at;
      u32 vertices = C_VERTICES(c), draws = C_DRAWS(c);
      u32 type = 2 | (C_NORMAL(c) ? 1 << 5 : 0) | 2 << 7 | 1 << 9 | (g->bones - 1) << 14 | g->index_size << 11;
      wr32(list, 0x14000000);
      wr32(list + 4, 0x10000000);
      wr32(list + 8, 0x02000000 | g->index_at);
      wr32(list + 12, 0x01000000 | g->vertex_at);
      wr32(list + 16, 0x12000000 | type);
      copy(list + 20, c + C_DRAW_AT(c), draws * 4);
      wr32(list + 20 + draws * 4, 0x13000000);
      wr32(list + 24 + draws * 4, 0x0b000000);
      const u8 *v = c + C_DRAW_AT(c) + draws * 4;
      u8 *to = list + g->vertex_at;
      for (u32 k = 0; k < vertices; k++, v += C_VERTEX(c), to += g->stride) {
        s32 placed[3];
        copy(to + g->uv_at, v + C_UV(c), 4);
        if (g->source) {
          struct unposed u;
          unpose(v, v + C_SLOT(c), C_NORMAL(c), g->at->base, g->mapped, &u);
          for (u32 b = 0; b < g->bones; b++) {
            u32 w = 0;
            for (u32 e = 0; e < u.count; e++)
              if (u.bone[e] == g->palette[b]) w = u.weight[e];
            to[b] = w > 255 ? 255 : w;
          }
          if (C_NORMAL(c))
            for (u32 a = 0; a < 3; a++) to[g->normal_at + a] = u.n[a];
          for (u32 a = 0; a < 3; a++) placed[a] = u.p[a];
        } else {
          u32 own = g->bone < 0 ? v[C_SLOT(c)] : 0;
          for (u32 b = 0; b < g->bones; b++) to[b] = b == own ? 0x80 : 0;
          if (C_NORMAL(c)) {
            copy(to + g->normal_at, v + 6, 3);
            if (g->at->turn) {
              to[g->normal_at] = -(signed char)v[6];
              to[g->normal_at + 1] = -(signed char)v[7];
            }
          }
          place_vertex(g->at, v, placed);
        }
        for (u32 a = 0; a < 3; a++) {
          s32 p = placed[a];
          u32 abs = p < 0 ? -p : p;
          u32 q = (abs * 0x7fff + (max[a] >> 1)) / max[a];
          wr16(to + g->position_at + a * 2, p < 0 ? -q : q);
        }
      }
      /* The indices, in the package's own size: each the one before plus it. */
      u8 *ito = list + g->index_at;
      for (u32 k = 0, i = 0; k < C_INDICES(c); k++) {
        if (g->index_size == 1) ito[k] = i += v[k];
        else wr16(ito + k * 2, i += rd16(v + k * 2));
      }
      list_at += g->list_bytes;
      in_mesh++;
    }
    wr16(rec + 0x14, in_mesh);
    wr16(rec + 0x16, first);
    slot_base += mesh->slot_count;
    first += in_mesh;
  }
  for (u32 m = 0; m < material_count; m++) {
    u8 *rec = pmo + material_table + m * 0x10;
    wr32(rec, materials[m][0]);
    wr32(rec + 4, materials[m][1]);
    wr32(rec + 8, materials[m][2]);
    wr32(rec + 12, extra);
  }

  /* The texture set: the blocks' images, recoloured. */
  u8 *tmh = out + tmh_at;
  static const u8 tmh_magic[8] = {'.', 'T', 'M', 'H', '0', '.', '1', '4'};
  copy(tmh, tmh_magic, 8);
  wr32(tmh + 8, image_count);
  u8 *im = tmh + 16;
  for (u32 k = 0; k < image_count; k++) {
    copy(im, images[k].data, images[k].size);
    if (images[k].material) {
      u8 *pal = im + 16 + rd32(im + 16);
      u32 format = rd32(pal + 8), entries = rd32(pal + 12);
      for (u32 e = 0; e < entries; e++) {
        if (format == 3) wr32(pal + 16 + e * 4, recolor(rd32(pal + 16 + e * 4), 3, images[k].material));
        else wr16(pal + 16 + e * 2, recolor(rd16(pal + 16 + e * 2), format, images[k].material));
      }
    }
    im += images[k].size;
  }
  return total;
}

/*
 * `package`, again from an empty arena if the roll's earlier takes left it
 * too little room: a take's own bodies, images and skeleton always fit.
 */
static u32 write_package(u8 *out, const u8 *skeleton, u32 skeleton_size, u32 limit, u32 extra) {
  short_of_room = 0;
  u32 size = package(out, skeleton, skeleton_size, limit, extra);
  if (!size && short_of_room) {
    block_count = arena_used = 0;
    size = package(out, skeleton, skeleton_size, limit, extra);
  }
  return size;
}

/* ------------------------------------------------------------ the hook */

/* stitchWeapon's gunner path: one take per recipe, the frame's material word kept. */
static u32 stitch_gunner(u8 *buffer, u32 frame, u32 skeleton_at, u32 skeleton_size, u32 limit) {
  if (!load_gunner(frame, &gun_frame)) return 5;
  u8 raw[GUNNER_BONES * 48];
  if (!read_at(gun_frame.at, raw, gun_frame.bones * 48)) return 5;
  for (u32 b = 0; b < gun_frame.bones; b++)
    for (u32 e = 0; e < 12; e++) skins[b][e] = (s32)rd32(raw + (b * 12 + e) * 4);
  /* The last word of the frame's first material (materialExtra). */
  u32 extra = 0;
  const u8 *pmo = buffer + rd32(buffer + 4);
  if (rd32(buffer + 8) >= 0x38 && rd16(pmo + 0x1e)) extra = rd32(pmo + rd32(pmo + 0x30) + 12);
  u32 type = E_TYPE(frame);
  for (u32 rolls = 0; rolls < ROLLS; rolls++) {
    struct gunner_recipe r;
    if (!roll_gunner(frame, &r)) return 6;
    const s32 parts[GUNNER_ROLES] = {r.body, r.stock, r.barrel, r.limbs, r.second};
    for (u32 k = 1; k < GUNNER_ROLES; k++)
      if (parts[k] >= 0 && !load_gunner(parts[k], &gun_part[k])) return 5;
    block_count = arena_used = 0;
    if (!place_gunner(&r, type)) continue;
    if (write_package(buffer, buffer + skeleton_at, skeleton_size, limit, extra)) return 0;
  }
  return 7;
}

static u32 stitch(u8 *buffer, u32 capacity, u32 model) {
  if (!load_library()) return 2;
  u32 frame = 0;
  while (frame < model_count && E_MODEL(frame) != model) frame++;
  if (frame == model_count) return 3;
  /* The frame's skeleton, from the package DATA.BIN put in the slot. */
  if (rd32(buffer) < 2) return 4;
  u32 skeleton_at = rd32(buffer + 12), skeleton_size = rd32(buffer + 16);
  if (skeleton_at + skeleton_size > capacity) return 4;
  u32 limit = capacity < PACKAGE_MAX ? capacity : PACKAGE_MAX;
  if (E_TYPE(frame) >= GUNNER_CLASS) return stitch_gunner(buffer, frame, skeleton_at, skeleton_size, limit);
  if (!load_record(frame, &rec_frame)) return 5;
  for (u32 rolls = 0; rolls < ROLLS; rolls++) {
    struct recipe r;
    if (!roll(frame, &r)) return 6;
    if (!load_record(r.handle, &rec_handle) || !load_record(r.head, &rec_head)) return 5;
    if (r.guard >= 0 && !load_record(r.guard, &rec_guard)) return 5;
    if (r.second >= 0 && !load_record(r.second, &rec_second)) return 5;
    size(&r, &rec_head, r.guard >= 0 ? &rec_guard : 0);
    block_count = arena_used = 0;
    for (u32 take = 0; take < (r.twin ? 4u : 3u); take++) {
      u32 extras = take == 0, reduced = take >= 2, twin = r.twin && take < 3;
      if (!place(&r, extras, reduced, twin)) continue;
      if (write_package(buffer, buffer + skeleton_at, skeleton_size, limit, 0)) return 0;
    }
  }
  return 7;
}

/* Whether the relic table has (ranged, id) with `model`. */
static u32 is_relic(u32 ranged, u32 id, u32 model) {
  u32 key = (ranged ? 0x80000000u : 0) | id << 16 | model;
  u32 lo = 0, hi = rf_relics[0];
  while (lo < hi) {
    u32 mid = (lo + hi) >> 1, at = rf_relics[1 + mid];
    if (at == key) return 1;
    if (at < key) lo = mid + 1;
    else hi = mid;
  }
  return 0;
}

/* Writes `seed` into bytes 4-5 of `slot` if it holds the same weapon (bytes 0-3) unrolled. */
static void keep_seed(u8 *slot, const u8 *weapon, u32 seed) {
  for (u32 k = 0; k < 4; k++)
    if (slot[k] != weapon[k]) return;
  if (rd16(slot + 4)) return;
  wr16(slot + 4, seed);
}

/*
 * The equipped weapon's seed if it is a relic built as `model`: its box
 * slot's bytes 4-5, drawn from the clock and kept there (and in the equipped
 * copies) when they are 0. 0 if it isn't a relic.
 */
static u32 relic_seed(u8 *hunter, u32 model) {
  u8 *save = *(u8 **)rf_save_pointer;
  if (!save) return 0;
  u8 *block = save + SAVE_HUNTER;
  u32 index = rd16(block + HUNTER_WEAPON_INDEX);
  if (index >= BOX_SLOTS) return 0;
  u8 *slot = block + HUNTER_BOX + index * SLOT_BYTES;
  if (slot[0] != 1 || (slot[1] != 5 && slot[1] != 6)) return 0;
  if (!is_relic(slot[1] == 6, rd16(slot + 2), model)) return 0;
  u32 seed = rd16(slot + 4);
  if (!seed) {
    u32 t = ((u32 (*)(void))rf_time_low)();
    seed = (t ^ t >> 16) & 0xffff;
    if (!seed) seed = 1;
    keep_seed(block + HUNTER_EQUIPPED, slot, seed);
    keep_seed(save + SAVE_EQUIPPED, slot, seed);
    if (hunter) keep_seed(hunter + BUILT_EQUIPPED, slot, seed);
    wr16(slot + 4, seed);
  }
  return seed;
}

void rf_hook6(u8 *res, u8 *hunter, u32 n) {
  if ((n & 0xff) != 0) return;
  u8 *buffer = *(u8 **)(res + RES_BUFFER + WEAPON_SLOT * 4);
  u32 capacity = *(u32 *)(res + RES_CAPACITY + WEAPON_SLOT * 4);
  u32 file = *(u16 *)(res + RES_FILE + WEAPON_SLOT * 2);
  u32 base = (u32)rf_weapon_file_base;
  if (!buffer || file < base) return;
  if ((u32)rf_relic_mode == 2) {
    /* relics.ts relicState: the same look from the same seed. */
    u32 seed = relic_seed(hunter, file - base);
    if (!seed) {
      rf_stitch_status = 8;
      return;
    }
    rng_state = seed * 0x9e3779b1u ^ (file - base + 1) * 0x85ebca77u;
    if (!rng_state) rng_state = 0x2545f491;
  } else if (!rng_state) {
    rng_state = ((u32 (*)(void))rf_time_low)();
    if (!rng_state) rng_state = 0x2545f491;
  }
  fd = sceIoOpen("disc0:/PSP_GAME/USRDIR/FORGE.BIN", 1, 0);
  if (fd < 0) {
    rf_stitch_status = 1;
    return;
  }
  rf_stitch_status = stitch(buffer, capacity, file - base);
  sceIoClose(fd);
  if (!rf_stitch_status) {
    rf_stitch_count++;
    sceKernelDcacheWritebackAll();
  }
}
