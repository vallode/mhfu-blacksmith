/*
 * The camera's field of view and distance (the camera.fov and
 * camera.distance options, and two settings in randomfu's START menu
 * entry). See src/patches/camera.ts, which patches the EBOOT and finds the
 * addresses below on each disc.
 *
 * Field of view: the EBOOT's projection update is patched (on every disc
 * this blob is on) to multiply the angle by a float kept in its own last
 * word, rf_fov_scale, which the disc sets to its option's scale. This sets
 * it to the save's choice, and has the projection rebuilt. The code itself
 * never changes at run time.
 *
 * Distance: the camera follows the hunter with presets from a block the
 * stage brings (or the EBOOT's own), which the renderer points to. Once a
 * frame, on the pad hook (every task: the village too), a block the camera
 * hasn't been seen with, or one the game loaded again, is copied, and its
 * presets are written back scaled: each preset's distance, and its eye's
 * height above the point it looks at, so the camera moves back down the
 * same line. Changing the setting scales them again from the copy, and
 * words the game writes over replace the copy's. A scaled block is marked,
 * in the last of the zeros after its field of view, with the choice it was
 * scaled with: the blob loads again after every save load, knowing nothing,
 * and works the game's values back out from it.
 *
 * Built with the FPU (single precision only), like hitboxes.c. It makes no
 * game calls.
 */
#include "rf.h"

/* Found per disc (src/patches/camera.ts). */
extern u8 *const rf_camera[]; /* the global holding the renderer */
extern u32 rf_fov_scale[];    /* the patched projection update's scale: a float */
/* Constants, not addresses: the disc's choices + 1 (an extern's address is never 0). */
extern const u8 rf_camera_fov[];
extern const u8 rf_camera_distance[];

#define CHOICES 4
static const float fov_scales[CHOICES] = {1.0f, 1.15f, 1.25f, 1.4f};
static const float distance_scales[CHOICES] = {1.0f, 1.15f, 1.3f, 1.5f};

/* The renderer. */
#define BUILT_FOV 0x10 /* the field of view the projection was last built with */
#define BLOCK 0x1bc    /* the camera's block of presets */
/*
 * A block: the field of view in radians (most stages 50°, 20 of them 50° or
 * 51° to a few bits), seven zeros, then the presets.
 */
#define MIN_FOV 0.3f
#define MAX_FOV 1.6f
#define PRESETS 5
#define PRESET_WORDS 8 /* ?, eye height, distance, 0, look height, 0, ?, 0 */
#define EYE 1
#define DISTANCE 2
#define LOOK 4
#define WORDS (PRESETS * PRESET_WORDS)
#define MARK_WORD 7
#define MARK 0x52460000 /* "RF": scaled, with the choice in the low bits */

static u32 choice(u8 chosen, const u8 *disc) {
  return chosen && chosen <= CHOICES ? chosen - 1u : (u32)disc - 1u;
}
static u32 fov(void) {
  const struct rf_save_data *d = rf_save_data();
  return choice(d ? d->camera_fov : 0, rf_camera_fov);
}
static u32 distance(void) {
  const struct rf_save_data *d = rf_save_data();
  return choice(d ? d->camera_distance : 0, rf_camera_distance);
}

static int in_ram(const void *p) {
  const u32 a = (u32)p;
  return a >= 0x08800000 && a < 0x0a000000 && !(a & 3);
}

static u8 *renderer(void) {
  u8 *r = *rf_camera;
  return in_ram(r) ? r : 0;
}

static void apply_fov(void) {
  union {
    float f;
    u32 u;
  } scale = {fov_scales[fov()]};
  *(volatile u32 *)rf_fov_scale = scale.u;
  u8 *r = renderer();
  if (r) *(volatile u32 *)(r + BUILT_FOV) = 0; /* differs from the angle: rebuilt next frame */
}

/* The choice a block was scaled with by this or an earlier load of the blob, or 0. */
static u32 marked(const u32 *b) {
  const u32 m = b[MARK_WORD];
  return (m & 0xffff0000) == MARK && (m & 0xffff) < CHOICES ? m & 0xffff : 0;
}

static int is_block(const u32 *b) {
  const float angle = *(const float *)b;
  if (!(angle > MIN_FOV && angle < MAX_FOV)) return 0;
  for (u32 k = 1; k < 8; k++)
    if (b[k] && !(k == MARK_WORD && marked(b))) return 0;
  const float *p = (const float *)(b + 8);
  for (u32 k = 0; k < WORDS; k += PRESET_WORDS) {
    const u32 *w = b + 8 + k;
    if (w[3] || w[5] || w[7] || !(p[k + DISTANCE] > 0.0f) || !(p[k + DISTANCE] < 5000.0f))
      return 0;
  }
  return 1;
}

/* Presets with the camera `s` times as far from what it looks at. */
static void scale(u32 *presets, float s) {
  float *w = (float *)presets;
  for (u32 k = 0; k < WORDS; k += PRESET_WORDS) {
    w[k + EYE] = w[k + LOOK] + (w[k + EYE] - w[k + LOOK]) * s;
    w[k + DISTANCE] *= s;
  }
}

static const u32 *seen;   /* the block last scaled */
static u32 original[WORDS]; /* its presets as the game had them */
static u32 written[WORDS];  /* and as they were written */
static u32 scaled_with;     /* the choice they were scaled with */

static void follow(u8 *arg) {
  (void)arg;
  u8 *r = renderer();
  if (!r) return;
  u32 *b = *(u32 **)(r + BLOCK);
  if (!in_ram(b)) return;
  u32 *presets = b + 8;
  const u32 now = distance();
  int changed = b != seen;
  for (u32 k = 0; !changed && k < WORDS; k++) changed = presets[k] != written[k];
  if (!changed && now == scaled_with) return;
  if (changed) {
    if (!is_block(b)) return;
    if (b != seen) {
      /* New to this load of the blob: an earlier load may have scaled it. */
      for (u32 k = 0; k < WORDS; k++) original[k] = presets[k];
      const u32 before = marked(b);
      if (before) scale(original, 1.0f / distance_scales[before]);
      seen = b;
    } else {
      /* The game wrote to it (all of it, loading it again, or a few words): what it wrote is its own. */
      for (u32 k = 0; k < WORDS; k++)
        if (presets[k] != written[k]) original[k] = presets[k];
    }
  }
  for (u32 k = 0; k < WORDS; k++) written[k] = original[k];
  if (now) scale(written, distance_scales[now]);
  for (u32 k = 0; k < WORDS; k++) presets[k] = written[k];
  b[MARK_WORD] = now ? MARK | now : 0;
  scaled_with = now;
}

/* --- The settings, in randomfu's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const fov_names[CHOICES] = {"Normal", "Wide", "Wider", "Widest"};
static const char *const distance_names[CHOICES] = {"Normal", "Far", "Farther", "Farthest"};

static void set_fov(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->camera_fov = (u8)(c + 1);
  apply_fov();
}
static void set_distance(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->camera_distance = (u8)(c + 1);
}

static const struct rf_setting fov_setting = {
    "Field of view",
    "How wide the camera sees.\nWide, Wider and Widest are\n1.15, 1.25 and 1.4 times\nthe game's own.",
    fov_names,
    CHOICES,
    fov,
    set_fov,
};
static const struct rf_setting distance_setting = {
    "Camera distance",
    "How far back the camera\nsits, at the same angle.\nFar, Farther and Farthest\nare 1.15, 1.3 and 1.5\ntimes the game's own.",
    distance_names,
    CHOICES,
    distance,
    set_distance,
};

void rf_camera_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  seen = 0;
  scaled_with = 0;
  apply_fov();
  rf_on(RF_HOOK_PAD, follow);
  if (rf_add_setting) {
    rf_add_setting(&fov_setting);
    rf_add_setting(&distance_setting);
  }
}
