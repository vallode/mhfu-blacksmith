/*
 * The camera's field of view, distance and tilt (the camera.fov,
 * camera.distance and camera.tilt options, and three settings in randomfu's
 * START menu entry). See src/patches/camera.ts, which patches the EBOOT and finds the
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
 * Tilt: the presets are the steps D-pad up and down move the camera
 * through, which the renderer keeps as a level (0 the highest, preset 4; 4
 * the lowest, preset 3). Smooth tilt writes every preset as the same
 * camera, at preset 1's distance from what it looks at (scaled with the
 * distance), at the save's pitch. It keeps the game's level on the middle
 * one, so the game's step is the input: when the game steps the level,
 * while the button that stepped it stays held the pitch moves that way,
 * and the game eases the camera after it. A tilted block keeps preset 1 as
 * the game had it in two more of the zeros after its field of view; its
 * mark says so. The save keeps a copy of the block's presets as the game had
 * them, which a blob loaded again takes if it's this block's; else the
 * other presets come back as the EBOOT's own (most stages share them) until
 * the game loads the block again. Only EU's renderer is known to keep the
 * level where this looks (rf_camera_level), so tilt is off elsewhere.
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
extern const u8 rf_camera_tilt[];
/* The renderer's tilt level's offset + 1; 1 where it isn't known (only EU's is), and tilt stays off. */
extern const u8 rf_camera_level[];
extern u8 *const rf_pad[]; /* the global holding the game's pad object */
u32 sceKernelGetSystemTimeLow(void);

#define CHOICES 4
static const float fov_scales[CHOICES] = {1.0f, 1.15f, 1.25f, 1.4f};
static const float distance_scales[CHOICES] = {1.0f, 1.15f, 1.3f, 1.5f};
/* The tilt: the game's steps, or smooth at this many radians a microsecond. */
#define DEGREES_A_SECOND(d) ((d) * 3.14159265f / 180.0f / 1000000.0f)
#define LONGEST_FRAME 100000 /* µs: a longer gap (a pause, the first frame) counts as 1/30 s */
#define FRAME 33333
static const float tilt_rates[CHOICES] = {0.0f, DEGREES_A_SECOND(30), DEGREES_A_SECOND(50),
                                          DEGREES_A_SECOND(80)};

/* The renderer. */
#define BUILT_FOV 0x10 /* the field of view the projection was last built with */
#define LEVELS 5 /* the u32 at rf_camera_level - 1: the tilt step, 0 (the highest) to 4 */
#define MIDDLE 2 /* preset 1, the usual camera */
static const u8 level_presets[LEVELS] = {4, 0, 1, 2, 3};
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
#define MARK 0x52460000 /* "RF": scaled, with the distance's choice in the low bits */
#define TILTED 0x100    /* and smooth tilt on: */
#define KEPT_EYE 5      /* preset 1's eye height and distance as the game had them */
#define KEPT_DISTANCE 6
#define USUAL 1 /* preset 1 */
/* The EBOOT's own presets (EU 0x08933B00), which most stages' blocks share. */
static const float game_presets[WORDS] = {
    0, 300, 160, 0, 184, 0, 80, 0, 0, 270, 490, 0, 170, 0, 80, 0, 0, 140, 490, 0,
    170, 0, 80, 0, 0, 60, 450, 0, 210, 0, 60, 0, 0, 400, 220, 0, 195, 0, 80, 0,
};
/* How far smooth tilt goes: the sine of the angle looking down, and the eye's lowest height. */
#define HIGHEST 0.82f /* 55° */
#define LOWEST -0.34f /* 20° up */
#define FLOOR 40.0f   /* above the ground under the hunter, as the look height is */

/* The D-pad, in the SceCtrlData the pad hook gets. */
#define CTRL_BUTTONS 4
#define UP 0x10
#define DOWN 0x40
#define PAD_LOCK 0x17 /* the pad object's: 1 while shops and dialogues have the buttons */

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
static int tilt_known(void) { return (u32)rf_camera_level > 1; }
static u32 tilt(void) {
  if (!tilt_known()) return 0;
  const struct rf_save_data *d = rf_save_data();
  return choice(d ? d->camera_tilt : 0, rf_camera_tilt);
}

static float root(float x) {
  float r;
  __asm__("sqrt.s %0, %1" : "=f"(r) : "f"(x));
  return r;
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

/* The distance's choice a block was scaled with by this or an earlier load of the blob, and TILTED, or 0. */
static u32 marked(const u32 *b) {
  const u32 m = b[MARK_WORD];
  return (m & 0xffff0000) == MARK && (m & 0xffff & ~TILTED) < CHOICES ? m & 0xffff : 0;
}

static int is_block(const u32 *b) {
  const float angle = *(const float *)b;
  if (!(angle > MIN_FOV && angle < MAX_FOV)) return 0;
  const u32 m = marked(b);
  for (u32 k = 1; k < 8; k++)
    if (b[k] && !(k == MARK_WORD && m) &&
        !((k == KEPT_EYE || k == KEPT_DISTANCE) && (m & TILTED)))
      return 0;
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

static const u32 *seen;   /* the block last written */
static u32 original[WORDS]; /* its presets as the game had them */
static u32 written[WORDS];  /* and as they were written */
static u32 scaled_with;     /* the distance's choice they were written with */
static u32 tilted_with;     /* the tilt's */
static float pitch;         /* smooth tilt's: the sine of the angle the camera looks down at */
static float pitch_written; /* the one written */
static int pitched;         /* pitch is set */
static int loaded;          /* and the save's looked at */
static float pitch_saved;   /* the one in the save */
static u32 holding;         /* the D-pad button tilting the camera, 0 for none */
static float heading;       /* 1 to look further down, -1 up */
static u32 held1, held2;    /* UP and DOWN the last two frames */
static u32 last_time;       /* µs, at the last frame */

static void save_pitch(void) {
  struct rf_save_data *d = rf_save_data();
  if (!d) return;
  d->camera_pitched = 1;
  d->camera_pitch = (s16)(pitch * 32000.0f);
  pitch_saved = pitch;
}

static int locked(void) {
  const u8 *p = *rf_pad;
  return in_ram(p) && p[PAD_LOCK];
}

/* The sine of the angle preset `k` of `presets` looks down at. */
static float pitch_of(const u32 *presets, u32 k) {
  const float *p = (const float *)presets + k * PRESET_WORDS;
  const float up = p[EYE] - p[LOOK];
  return up / root(up * up + p[DISTANCE] * p[DISTANCE]);
}

/* Every preset of `presets` (the game's, scaled) as preset 1, at the pitch, kept in range. */
static void tilt_all(u32 *presets, const float *usual, float s) {
  const float look = usual[LOOK], up = usual[EYE] - look;
  const float r = root(up * up + usual[DISTANCE] * usual[DISTANCE]) * s;
  float lowest = (FLOOR - look) / r;
  if (lowest < LOWEST) lowest = LOWEST;
  if (pitch > HIGHEST) pitch = HIGHEST;
  if (pitch < lowest) pitch = lowest;
  const u32 *keep = (const u32 *)usual;
  for (u32 k = 0; k < WORDS; k += PRESET_WORDS) {
    float *w = (float *)(presets + k);
    for (u32 i = 0; i < PRESET_WORDS; i++) presets[k + i] = keep[i];
    w[EYE] = look + r * pitch;
    w[DISTANCE] = r * root(1.0f - pitch * pitch);
  }
}

static void follow(u8 *ctrl) {
  u8 *r = renderer();
  if (!r) return;
  u32 *b = *(u32 **)(r + BLOCK);
  if (!in_ram(b)) return;
  u32 *presets = b + 8;
  const u32 now = distance(), smooth = tilt();
  int changed = b != seen;
  for (u32 k = 0; !changed && k < WORDS; k++) changed = presets[k] != written[k];
  if (changed) {
    if (!is_block(b)) return;
    if (b != seen) {
      /* New to this load of the blob: an earlier load may have written it. */
      for (u32 k = 0; k < WORDS; k++) original[k] = presets[k];
      const u32 before = marked(b);
      if (before & TILTED) {
        if (!pitched) {
          pitch = pitch_of(presets, USUAL); /* as an earlier load left it, unless the save has one */
          pitched = 1;
        }
        /*
         * Every preset is the tilted camera: the save's copy if it's this block's (preset 1
         * agrees with what the block kept), else preset 1 as kept and the EBOOT's others,
         * exact again once the game loads the block again.
         */
        const struct rf_save_data *d = rf_save_data();
        const u32 *usual = presets + USUAL * PRESET_WORDS;
        const u32 *copy = d ? d->camera_presets + USUAL * PRESET_WORDS : 0;
        if (copy && d->camera_block == (u32)b && copy[EYE] == b[KEPT_EYE] &&
            copy[DISTANCE] == b[KEPT_DISTANCE] && copy[LOOK] == usual[LOOK]) {
          for (u32 k = 0; k < WORDS; k++) original[k] = d->camera_presets[k];
        } else {
          for (u32 k = 0; k < WORDS; k++) ((float *)original)[k] = game_presets[k];
          for (u32 i = 0; i < PRESET_WORDS; i++) original[USUAL * PRESET_WORDS + i] = usual[i];
          original[USUAL * PRESET_WORDS + EYE] = b[KEPT_EYE];
          original[USUAL * PRESET_WORDS + DISTANCE] = b[KEPT_DISTANCE];
        }
      } else if (before) {
        scale(original, 1.0f / distance_scales[before]);
      }
      seen = b;
    } else {
      /* The game wrote to it (all of it, loading it again, or a few words): what it wrote is its own. */
      for (u32 k = 0; k < WORDS; k++)
        if (presets[k] != written[k]) original[k] = presets[k];
    }
  }

  /*
   * Smooth tilt: the game's step is the input. A step of one, just after a press of the
   * button, tilts the camera that way for a frame, and on while the button is held and
   * the game keeps the buttons.
   */
  const u32 time = sceKernelGetSystemTimeLow();
  u32 elapsed = time - last_time;
  last_time = time;
  if (elapsed > LONGEST_FRAME) elapsed = FRAME;
  const u32 buttons = ctrl ? *(const u32 *)(ctrl + CTRL_BUTTONS) & (UP | DOWN) : 0;
  const u32 pressed = (buttons & ~held1) | (held1 & ~held2); /* this frame or the last */
  held2 = held1;
  held1 = buttons;
  if (smooth) {
    u32 *level = (u32 *)(r + (u32)rf_camera_level - 1);
    const u32 l = *level;
    if (!loaded) {
      const struct rf_save_data *d = rf_save_data();
      if (d && d->camera_pitched) {
        pitch = pitch_saved = (float)d->camera_pitch / 32000.0f;
      } else if (!pitched) {
        /* From the step the game is on, so the camera doesn't move. */
        pitch = pitch_of(original, l < LEVELS ? level_presets[l] : USUAL);
      }
      pitched = 1;
      loaded = d != 0;
    }
    const int lock = locked();
    int stepped = 0;
    if (l < LEVELS && l != MIDDLE) {
      if ((l == MIDDLE - 1 || l == MIDDLE + 1) && (pressed == UP || pressed == DOWN) && !lock) {
        holding = buttons & pressed; /* 0 for a tap already let go: it still tilts a frame */
        heading = l < MIDDLE ? 1.0f : -1.0f;
        stepped = 1;
      }
      *level = MIDDLE;
    }
    if (holding && (!(buttons & holding) || lock)) holding = 0;
    if (holding || stepped)
      pitch += heading * tilt_rates[smooth] * (float)(s32)elapsed * root(1.0f - pitch * pitch);
    if (!holding && pitch != pitch_saved) save_pitch();
  } else {
    holding = 0;
  }

  if (!changed && now == scaled_with && smooth == tilted_with && (!smooth || pitch == pitch_written))
    return;
  for (u32 k = 0; k < WORDS; k++) written[k] = original[k];
  if (now) scale(written, distance_scales[now]);
  if (smooth) {
    tilt_all(written, (const float *)original + USUAL * PRESET_WORDS, distance_scales[now]);
    b[KEPT_EYE] = original[USUAL * PRESET_WORDS + EYE];
    b[KEPT_DISTANCE] = original[USUAL * PRESET_WORDS + DISTANCE];
    struct rf_save_data *d = rf_save_data();
    if (d) {
      d->camera_block = (u32)b;
      for (u32 k = 0; k < WORDS; k++) d->camera_presets[k] = original[k];
    }
  } else {
    b[KEPT_EYE] = b[KEPT_DISTANCE] = 0;
  }
  for (u32 k = 0; k < WORDS; k++) presets[k] = written[k];
  b[MARK_WORD] = now || smooth ? MARK | now | (smooth ? TILTED : 0) : 0;
  scaled_with = now;
  tilted_with = smooth;
  pitch_written = pitch;
}

/* --- The settings, in randomfu's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const fov_names[CHOICES] = {"Normal", "Wide", "Wider", "Widest"};
static const char *const distance_names[CHOICES] = {"Normal", "Far", "Farther", "Farthest"};
static const char *const tilt_names[CHOICES] = {"Steps", "Slow", "Smooth", "Fast"};

static void set_fov(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->camera_fov = (u8)(c + 1);
  apply_fov();
}
static void set_distance(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->camera_distance = (u8)(c + 1);
}
static void set_tilt(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->camera_tilt = (u8)(c + 1);
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

static const struct rf_setting tilt_setting = {
    "Camera tilt",
    "How D-pad up and down tilt\nthe camera. Steps is the\ngame's own five; Slow,\nSmooth and Fast tilt it\nwhile held, 30, 50 and 80\ndegrees a second.",
    tilt_names,
    CHOICES,
    tilt,
    set_tilt,
};

void rf_camera_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  seen = 0;
  scaled_with = 0;
  tilted_with = 0;
  pitched = loaded = 0;
  pitch_saved = 2.0f; /* none */
  holding = held1 = held2 = 0;
  last_time = sceKernelGetSystemTimeLow() - FRAME;
  apply_fov();
  rf_on(RF_HOOK_PAD, follow);
  if (rf_add_setting) {
    rf_add_setting(&fov_setting);
    rf_add_setting(&distance_setting);
    if (tilt_known()) rf_add_setting(&tilt_setting);
  }
}
