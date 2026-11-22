/*
 * Photo mode (the camera.photoMode option, and a setting in randomfu's START
 * menu entry): in a quest, holding L and R and pressing START stops the game
 * and hands the camera to the player, with the HUD gone; START again puts
 * the camera back where it was and the game goes on. See
 * src/patches/photo.ts, which finds the addresses below on each disc and
 * patches the pause's dimming.
 *
 * The freeze is the game's own pause (in a quest, alone): pause(save)
 * sets the save's pause byte to 1 and stops the sound, and while the byte
 * isn't 0 game_task's frame runs only the HUD's update and the dimming, not
 * the hunters, monsters, camera or clock. The HUD's layers that draw the
 * gauges (and hook 1, so every blob drawing), the map and the item bar skip
 * themselves while paused. Photo mode then writes 2 to the byte: the game
 * still takes it as paused, but the dimming (patched) draws only for 1.
 * Leaving sets it back to 1 and calls the game's unpause, which resumes the
 * sound.
 *
 * The camera: while paused nothing writes the renderer's eye and target, so
 * this writes them (and the copies the view is built from) once a frame on
 * the pad hook, before the frame is drawn, and has the game build the view
 * and projection from them (look(renderer)). Leaving writes back what they
 * were.
 *
 * The stage's ambient effects (EU 0x09A4F060's manager) are updated in the
 * play update, which the pause skips too. The rain is one of them: a texture
 * on a mesh at the camera (type 0xD: its update copies the camera's position
 * to +0x50 and scrolls the texture, which is the rain falling). Frozen, it
 * stays where the camera was. Each frame, once the view is built, photo mode
 * runs the update of each effect of that type and puts its texture's scroll
 * back after, so the rain stays still round the camera it flies; leaving puts
 * back the camera angles the effect keeps, so the game's next update doesn't
 * scroll it by the photo camera's turn. The other ambient effects (animated
 * textures) stay frozen, like the hunters, monsters and their effects.
 *
 * Input: the pad hook gets the buttons before the game. While photo mode is
 * on it holds the game's input lock and clears the buttons and stick it
 * passes on, so the paused HUD sees nothing (it would unpause on × or ○, and
 * open the menu on START); after, it lets the lock go at once but keeps the
 * buttons cleared until every one is up.
 *
 * Built with the FPU (single precision only), like camera.c.
 */
#include "rf.h"

/* Found per disc (src/patches/photo.ts). */
extern u8 *const rf_camera[];  /* the global holding the renderer */
extern u8 *const rf_pad[];     /* the global holding the game's pad object */
extern const u8 rf_pause[];    /* pause(save): the pause byte 1 and the sound stopped, alone */
extern const u8 rf_unpause[];  /* unpause(save): the byte 4 (0 the next frame), the sound on */
extern const u8 rf_no_pause[]; /* noPause(save, 0): 1 where the game can't pause (online) */
extern const u8 rf_look[];     /* look(renderer): the view and projection from the eye and target */
extern u8 *const rf_ambient[]; /* the global holding the stage's ambient effects (rain) */
/* Constants, not addresses, from the effects' update: the list's head in the manager, an
 * effect's next, and its update's slot in its vtable. */
extern const u8 rf_ambient_list[];
extern const u8 rf_ambient_next[];
extern const u8 rf_ambient_slot[];
/* A constant, not an address: the disc's choice + 1 (an extern's address is never 0). */
extern const u8 rf_photo_mode[];

/* The save's pause byte: 0 playing, 1 paused, 4 unpausing; 2 is photo mode's. */
#define PAUSE 0x6af1a
#define PAUSED 1
#define PHOTO 2

/* The HUD object hook 0 passes: the quest's START menu is open. */
#define MENU_OPEN 0x52d
#define PAD_LOCK 0x17 /* the pad object's: 1 while shops and dialogues have the buttons */

/* The renderer. */
#define FOV 0x0c    /* vertical, radians: the projection is rebuilt when it differs from +0x10 */
#define EYE 0x20    /* vec4s: the camera, then what it looks at */
#define TARGET 0x30
#define VIEW_EYE 0xb40 /* the copies the view is built from */
#define VIEW_TARGET 0xb50

/* The SceCtrlData the pad hook gets. */
#define CTRL_BUTTONS 4
#define CTRL_X 8
#define CTRL_Y 9
#define SELECT 0x0001
#define START 0x0008
#define UP 0x0010
#define RIGHT 0x0020
#define DOWN 0x0040
#define LEFT 0x0080
#define L 0x0100
#define R 0x0200
#define TRIANGLE 0x1000
#define CIRCLE 0x2000
#define CROSS 0x4000
#define SQUARE 0x8000

/* Speeds, a frame (the game runs at 30 a second), at full stick. */
#define TURN 0.055f   /* radians */
#define MOVE 0.02f    /* of the distance, plus: */
#define MOVE_MIN 3.0f /* units (a hunter is about 170 tall) */
#define NEAR_FAR 1.03f
#define ZOOM 1.015f
#define DEAD 28  /* of the stick's 128 */
#define MIN_DISTANCE 25.0f
#define MAX_DISTANCE 5000.0f
#define MAX_UP 0.97f /* the sine of the steepest angle above or below what it looks at */
#define MIN_FOV 0.1f
#define MAX_FOV 1.6f

static u8 *save;
static u8 *hud;      /* the HUD, as hook 0 last passed it */
static u32 frames;   /* pad hook calls */
static u32 quest_at; /* the frame hook 0 last ran */

static int on;           /* photo mode */
static int locking;      /* the input lock is ours, until every button is up */
static u32 ignored;      /* buttons held when it started, ignored until let go */
static u32 last;         /* the buttons it acted on last frame */
static u32 previous;     /* the buttons last frame, as the pad gave them */
static u32 kept[16];     /* the renderer's eye, target and their copies, as they were */
static float kept_fov;
static float focus[3];   /* what the camera looks at */
static float offset[3];  /* the camera, from there */
static float fov;
static float start_focus[3], start_offset[3], start_fov;

static int in_ram(const void *p) {
  const u32 a = (u32)p;
  return a >= 0x08800000 && a < 0x0a000000 && !(a & 3);
}

static u8 *renderer(void) {
  u8 *r = *rf_camera;
  return in_ram(r) ? r : 0;
}

static u8 *pad(void) {
  u8 *p = *rf_pad;
  return in_ram(p) ? p : 0;
}

static float root(float x) {
  float r;
  __asm__("sqrt.s %0, %1" : "=f"(r) : "f"(x));
  return r;
}

static float length(const float *v) { return root(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

/* (x, y) turned by `a` radians (small: a frame's turn), as cos and sin by their series. */
static void turn(float *x, float *y, float a) {
  const float a2 = a * a;
  const float c = 1.0f - a2 * 0.5f + a2 * a2 * (1.0f / 24.0f), s = a * (1.0f - a2 * (1.0f / 6.0f));
  const float nx = *x * c - *y * s;
  *y = *x * s + *y * c;
  *x = nx;
}

/* The stick's axis as -1 to 1, 0 inside the dead zone. */
static float axis(u8 raw) {
  s32 v = (s32)raw - 128;
  const s32 sign = v < 0 ? -1 : 1;
  v *= sign;
  if (v <= DEAD) return 0.0f;
  float f = (float)(v - DEAD) / (float)(127 - DEAD);
  if (f > 1.0f) f = 1.0f;
  return (float)sign * f;
}

/* An ambient effect: its type, and for type 0xD (at the camera) its textures' scroll. */
#define EFFECT_TYPE 0x18
#define AT_CAMERA 0x0d
#define ANGLES 0x60 /* the camera's yaw and pitch, as its last update saw them */
#define SCROLL 0x64 /* to 0x94: the layers' scroll, U and V, and how they ease */
#define SCROLL_WORDS 12
#define MAX_EFFECTS 64
#define KEPT_EFFECTS 8

/* The effects at the camera, and their angles, as they were when photo mode started. */
static u8 *kept_effects[KEPT_EFFECTS];
static u32 kept_angles[KEPT_EFFECTS];
static u32 kept_count;

/* The ambient effects at the camera, `fn` called on each (at most MAX_EFFECTS walked). */
static void at_camera(void (*fn)(u8 *effect)) {
  u8 *manager = *rf_ambient;
  if (!in_ram(manager)) return;
  u8 *effect = *(u8 **)(manager + (u32)rf_ambient_list);
  for (int n = 0; n < MAX_EFFECTS && in_ram(effect); n++) {
    u8 *next = *(u8 **)(effect + (u32)rf_ambient_next);
    if (*(u32 *)(effect + EFFECT_TYPE) == AT_CAMERA && in_ram(*(u8 **)effect)) fn(effect);
    effect = next;
  }
}

static void keep_angles(u8 *effect) {
  if (kept_count >= KEPT_EFFECTS) return;
  kept_effects[kept_count] = effect;
  kept_angles[kept_count++] = *(u32 *)(effect + ANGLES);
}

/* An effect at the camera to the camera, its textures (the rain) as they were. */
static void to_camera(u8 *effect) {
  u8 *vtable = *(u8 **)effect;
  void (*update)(u8 *) = *(void (**)(u8 *))(vtable + (u32)rf_ambient_slot);
  if (!in_ram((void *)update)) return;
  u32 *scroll = (u32 *)(effect + SCROLL), keep[SCROLL_WORDS];
  for (int k = 0; k < SCROLL_WORDS; k++) keep[k] = scroll[k];
  update(effect);
  for (int k = 0; k < SCROLL_WORDS; k++) scroll[k] = keep[k];
}

/*
 * Their angles back as the game had them, so its next update doesn't scroll the
 * textures by the photo camera's turn; for the effects still in the list only.
 */
static void put_back_angles(u8 *effect) {
  for (u32 k = 0; k < kept_count; k++) {
    if (kept_effects[k] == effect) *(u32 *)(effect + ANGLES) = kept_angles[k];
  }
}

static void write_camera(u8 *r) {
  float *e = (float *)(r + EYE), *t = (float *)(r + TARGET);
  float *ve = (float *)(r + VIEW_EYE), *vt = (float *)(r + VIEW_TARGET);
  for (u32 k = 0; k < 3; k++) {
    e[k] = ve[k] = focus[k] + offset[k];
    t[k] = vt[k] = focus[k];
  }
  *(float *)(r + FOV) = fov;
  ((void (*)(u8 *))rf_look)(r);
}

static void begin(u8 *r, u8 *p, u32 buttons) {
  if (((u32(*)(u8 *, u32))rf_no_pause)(save, 0)) return;
  ((void (*)(u8 *))rf_pause)(save);
  if (save[PAUSE] != PAUSED) return; /* the game didn't pause: online */
  save[PAUSE] = PHOTO;
  const u32 *words = (const u32 *)(r + EYE);
  for (u32 k = 0; k < 8; k++) kept[k] = words[k];
  words = (const u32 *)(r + VIEW_EYE);
  for (u32 k = 0; k < 8; k++) kept[8 + k] = words[k];
  kept_fov = *(const float *)(r + FOV);
  const float *e = (const float *)(r + VIEW_EYE), *t = (const float *)(r + VIEW_TARGET);
  for (u32 k = 0; k < 3; k++) {
    focus[k] = t[k];
    offset[k] = e[k] - t[k];
  }
  float d = length(offset);
  if (!(d >= MIN_DISTANCE && d <= MAX_DISTANCE)) {
    /* Behind and above what it looks at. */
    offset[0] = 0.0f, offset[1] = 150.0f, offset[2] = 400.0f;
  }
  fov = kept_fov;
  if (!(fov >= MIN_FOV && fov <= MAX_FOV)) fov = 0.8726646f;
  for (u32 k = 0; k < 3; k++) start_focus[k] = focus[k], start_offset[k] = offset[k];
  start_fov = fov;
  kept_count = 0;
  at_camera(keep_angles);
  on = 1;
  ignored = buttons;
  last = 0;
  if (!p[PAD_LOCK]) locking = 1;
}

/* The camera (when there's still a renderer) and the game back as they were. */
static void end(u8 *r, u8 *p) {
  on = 0;
  if (r) {
    u32 *words = (u32 *)(r + EYE);
    for (u32 k = 0; k < 8; k++) words[k] = kept[k];
    words = (u32 *)(r + VIEW_EYE);
    for (u32 k = 0; k < 8; k++) words[k] = kept[8 + k];
    *(float *)(r + FOV) = kept_fov;
    ((void (*)(u8 *))rf_look)(r);
  }
  at_camera(put_back_angles);
  /*
   * The input lock back now, as it was when photo mode started (off), not when the buttons
   * are let go: by then the game runs and may have locked them itself. The buttons stay
   * cleared until then, so the START that ended it doesn't reach the game.
   */
  if (p && locking) p[PAD_LOCK] = 0;
  /* Unless the game unpaused by itself. */
  if (save[PAUSE] == PHOTO) {
    save[PAUSE] = PAUSED;
    ((void (*)(u8 *))rf_unpause)(save);
  }
}

static void fly(u8 *ctrl, u32 buttons) {
  ignored &= buttons;
  const u32 b = buttons & ~ignored, pressed = b & ~last;
  last = b;
  if (pressed & SELECT) {
    for (u32 k = 0; k < 3; k++) focus[k] = start_focus[k], offset[k] = start_offset[k];
    fov = start_fov;
  }

  /* The stick turns the camera round what it looks at: across, then up and down. */
  const float sx = axis(ctrl[CTRL_X]), sy = axis(ctrl[CTRL_Y]);
  if (sx != 0.0f) turn(&offset[0], &offset[2], sx * TURN);
  float d = length(offset);
  float h = root(offset[0] * offset[0] + offset[2] * offset[2]);
  if (sy != 0.0f && h > 0.001f) {
    float nh = h, ny = offset[1];
    turn(&nh, &ny, sy * TURN);
    if (nh > 0.0f && ny <= d * MAX_UP && ny >= -d * MAX_UP) {
      offset[0] *= nh / h;
      offset[2] *= nh / h;
      offset[1] = ny;
      h = nh;
    }
  }

  /* □ and ○ bring it nearer and take it further. */
  float scale = 1.0f;
  if (b & SQUARE) scale /= NEAR_FAR;
  if (b & CIRCLE) scale *= NEAR_FAR;
  if (d * scale < MIN_DISTANCE) scale = MIN_DISTANCE / d;
  if (d * scale > MAX_DISTANCE) scale = MAX_DISTANCE / d;
  for (u32 k = 0; k < 3; k++) offset[k] *= scale;
  d *= scale;
  h *= scale;

  /* The D-pad moves it along the ground as it faces, △ and × up and down. */
  const float step = MOVE_MIN + d * MOVE;
  if (h > 0.001f) {
    const float fx = -offset[0] / h, fz = -offset[2] / h;
    float ahead = 0.0f, across = 0.0f;
    if (b & UP) ahead += step;
    if (b & DOWN) ahead -= step;
    if (b & RIGHT) across += step;
    if (b & LEFT) across -= step;
    focus[0] += fx * ahead - fz * across;
    focus[2] += fz * ahead + fx * across;
  }
  if (b & TRIANGLE) focus[1] += step;
  if (b & CROSS) focus[1] -= step;

  /* L narrows the view, R widens it. */
  if (b & L) fov /= ZOOM;
  if (b & R) fov *= ZOOM;
  if (fov < MIN_FOV) fov = MIN_FOV;
  if (fov > MAX_FOV) fov = MAX_FOV;
}

static u32 setting(void);

static void quest_frame(u8 *arg) {
  hud = arg;
  quest_at = frames;
}

static void pad_hook(u8 *ctrl) {
  frames++;
  if (!ctrl) return;
  u32 *buttons = (u32 *)(ctrl + CTRL_BUTTONS);
  const u32 now = *buttons;
  u8 *r = renderer(), *p = pad();
  if (on) {
    if (!r || !p || save[PAUSE] != PHOTO || ((now & ~ignored & ~last) & START)) {
      end(r, p);
    } else {
      fly(ctrl, now);
      write_camera(r);
      /* The rain to the camera just built, whichever of the two hooks runs first. */
      at_camera(to_camera);
    }
  } else if (setting() && (now & (L | R)) == (L | R) && (now & START)) {
    /*
     * L, R and START: START is kept from the game (no menu) whether or not photo mode can
     * start, and it starts on START's press, in a quest frame, when nothing has the game.
     */
    const int quest = frames - quest_at <= 2 && in_ram(hud);
    if (!(previous & START) && quest && r && p && !save[PAUSE] && !hud[MENU_OPEN] &&
        !p[PAD_LOCK]) {
      begin(r, p, now);
      if (on) write_camera(r);
    }
    *buttons = now & ~START;
  }
  previous = now;
  if (on || locking) {
    if (!on && !now) locking = 0;
    if (p && on) p[PAD_LOCK] = 1;
    *buttons = 0;
    ctrl[CTRL_X] = ctrl[CTRL_Y] = 128;
  }
}

/* --- The setting, in randomfu's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

#define CHOICES 2
static const char *const names[CHOICES] = {"Off", "On"};

static u32 setting(void) {
  const struct rf_save_data *d = rf_save_data();
  const u8 chosen = d ? d->photo_mode : 0;
  return chosen && chosen <= CHOICES ? chosen - 1u : (u32)rf_photo_mode - 1u;
}

static void set(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < CHOICES) d->photo_mode = (u8)(c + 1);
}

static const struct rf_setting photo_setting = {
    "Photo mode",
    "Hold L+R, press START in a\nquest: time stops and the\ncamera flies. Stick turns,\nD-pad "
    "moves, ~B02~B01 height,\n~B03~B00 distance, L R zoom,\nSELECT resets, START ends.",
    names,
    CHOICES,
    setting,
    set,
};

void rf_photo_init(u32 reason, u8 *s) {
  (void)reason;
  save = s;
  hud = 0;
  frames = 0;
  quest_at = (u32)-100;
  on = locking = 0;
  last = ignored = previous = 0;
  kept_count = 0;
  rf_on(RF_HOOK_QUEST_FRAME, quest_frame);
  rf_on(RF_HOOK_PAD, pad_hook);
  if (rf_add_setting) rf_add_setting(&photo_setting);
}
