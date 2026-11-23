/*
 * The target camera (the camera.target option, and a setting in randomfu's
 * START menu entry): L turns the camera to face a large monster in the
 * hunter's area from behind the hunter, as the newer games' target camera
 * does, instead of behind where the hunter faces. See
 * src/patches/target-camera.ts, which finds the addresses below on each disc
 * and puts the hook in.
 *
 * The game's follow camera (EU 0x08886E50, the renderer's mode at +0xB0)
 * turns by a yaw at the renderer's +0x150 sub-object: +0x80 the yaw it turns
 * to, +0x82 the yaw it has, both s16, the angle of the camera's eye seen from
 * the hunter (atan2(x, z) in 65536ths of a turn: behind a hunter facing f is
 * f + 0x8000). Every frame, whatever set the yaw to turn to (L's recentre,
 * D-pad left and right, a forced view), it moves the yaw it has a quarter of
 * the way there. That one read of +0x80 goes through the menu hook's stub
 * (RF_HOOK_MENU, a call of its own), which is where this gives its own yaw
 * instead: the game then turns to the monster as smoothly as it turns
 * behind the hunter on L, and nothing of the game's fights it.
 *
 * Buttons, as the camera has them (+0x84 held, +0x86 pressed this frame;
 * the game clears both in menus):
 * - L: face the target, the large monster nearest the middle of the screen
 *   unless one is targeted already. With no large monster in the area, L
 *   is the game's own. L twice quickly is the game's L too: behind the
 *   hunter (the newer games' double tap).
 * - L held, D-pad left or right: the next large monster to that side,
 *   which the camera turns to.
 * - D-pad left or right alone: the game's turn, and the target camera lets go.
 *
 * Modes: Tap turns the camera to the target once, until it faces it (it
 * follows the target as it turns, then stays put); Follow keeps it facing the
 * target until L twice, the D-pad turns it, or the target leaves the area or
 * falls.
 *
 * The target is marked on screen, on the HUD hook, while the camera has it
 * (and for a moment after, fading): a small reticle of corner brackets, the
 * same size at any distance (Target mark in the START menu turns it off).
 * It sits where the monster stands, raised to the height of its body (the
 * middle of its joints, eased slowly), so it holds still as the monster
 * moves its head and tail; the renderer's view and projection put it on
 * screen as hitboxes.c does.
 *
 * Built with the FPU (single precision only), like camera.c. Floats are
 * never live across a game call: the mark is worked out into `rects` first,
 * then filled.
 */
#include "rf.h"

/* Found per disc (src/patches/target-camera.ts). */
extern u8 *const rf_camera[];  /* the global holding the renderer */
extern u8 *const rf_monsters[]; /* game_task's monster manager global */
extern const u8 rf_game_task[]; /* where game_task.ovl loads */
extern const u8 rf_em_chunks[]; /* game_task's species table */
extern const u8 rf_target_yaw[]; /* the game's read of the yaw (the hook's call): `lh $v0, 0x80($a0)` */
extern const u8 rf_fill[];       /* fill(hud, x, y, w, h, r, g, b, alpha): the HUD's translucent fill */
/* A constant, not an address: the disc's MODE_* + 1 (an extern's address is never 0). */
extern const u8 rf_camera_target[];
u32 sceKernelGetSystemTimeLow(void);

#define MODE_OFF 0
#define MODE_TAP 1
#define MODE_FOLLOW 2
#define MODES 3

/* The renderer. */
#define FOLLOW 0x150  /* the follow camera's yaw sub-object */
#define TURN_TO 0x80  /* s16: the yaw the camera turns to */
#define YAW 0x82      /* s16: the yaw it has */
#define HELD 0x84     /* u16: the camera's buttons, held */
#define PRESSED 0x86  /* and pressed this frame */
#define SUBJECT 0xa84 /* the entity the camera follows: the hunter */
#define VIEW 0xb80       /* 4×4, row vectors */
#define PROJECTION 0xc00
#define HUD_HUNTER 0x530 /* the HUD object's hunter */

/* The monster manager and its monsters (the hunter has the same layout). */
#define MANAGER_SLOTS 0x1220
#define SLOTS 20
#define FLAGS 0x4 /* bit 0: active in the hunter's area */
#define POSITION 0x40
#define AREA 0x29a
#define EM_ID 0x1e8
#define HP 0x2e4
#define JOINTS 0x190      /* the joints' array, JOINT_BYTES each */
#define JOINT_COUNT 0x1a4 /* u32: how many (48 a Rathalos, 16 a Velocidrome) */
#define JOINT_BYTES 0x250
#define JOINT_MATRIX 0xd0 /* the joint's world matrix, row vectors: its place at [12..14] */
#define MAX_JOINTS 96
#define CHUNK_BYTES 0x1d0
#define CHUNK_SET 0x14f /* the species' stat set: 0 for small monsters */
#define SPECIES 90

#define L 0x100
#define RIGHT 0x20
#define LEFT 0x80

#define DOUBLE_TAP 400000 /* µs between L presses for the game's L */
#define SWING_TIME 3000000 /* µs a tap's turn lasts at most */
#define FACING 0x100      /* a tap's turn ends this close (1.4°) */
#define NEAREST 40.0f     /* closer than this, the direction isn't worked out again */
#define TURN 65536.0f / 6.2831853f

#define MARK_OFF 0
#define MARK_ON 1
#define MARKS 2

static u32 mode(void) {
  const struct rf_save_data *d = rf_save_data();
  u32 chosen = d ? d->camera_target : 0;
  return chosen && chosen <= MODES ? chosen - 1 : (u32)rf_camera_target - 1;
}

/* The mark: as chosen in game, else on. */
static u32 mark(void) {
  const struct rf_save_data *d = rf_save_data();
  u32 chosen = d ? d->camera_mark : 0;
  return chosen && chosen <= MARKS ? chosen - 1 : MARK_ON;
}

static int in_ram(const void *p) {
  const u32 a = (u32)p;
  return a >= 0x08800000 && a < 0x0a000000 && !(a & 3);
}

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

static float absf(float x) { return x < 0 ? -x : x; }

/* atan2(y, x) in radians, to about 0.005. */
static float arctan2(float y, float x) {
  const float ax = absf(x), ay = absf(y);
  if (ax == 0.0f && ay == 0.0f) return 0.0f;
  const float a = ax < ay ? ax / ay : ay / ax;
  const float s = a * a;
  float r = ((-0.0464964749f * s + 0.15931422f) * s - 0.327622764f) * s * a + a;
  if (ay > ax) r = 1.57079637f - r;
  if (x < 0) r = 3.14159274f - r;
  return y < 0 ? -r : r;
}

/* The yaw that looks at `monster` past `hunter`: the angle from the monster to the hunter. */
static int yaw_to(const u8 *hunter, const u8 *monster, s16 *yaw) {
  const float *h = (const float *)(hunter + POSITION);
  const float *m = (const float *)(monster + POSITION);
  const float x = h[0] - m[0], z = h[2] - m[2];
  if (x * x + z * z < NEAREST * NEAREST) return 0;
  *yaw = (s16)(s32)(arctan2(x, z) * TURN);
  return 1;
}

static u8 *monster(u32 slot, const u8 *hunter) {
  u8 *manager = *rf_monsters;
  if (!in_ram(manager)) return 0;
  u8 *m = *(u8 **)(manager + MANAGER_SLOTS + slot * 4);
  if (!in_ram(m)) return 0;
  const u32 em = m[EM_ID];
  if (em == 0 || em >= SPECIES || (signed char)rf_em_chunks[em * CHUNK_BYTES + CHUNK_SET] <= 0)
    return 0;
  if (!(m[FLAGS] & 1) || *(const u16 *)(m + AREA) != *(const u16 *)(hunter + AREA)) return 0;
  return *(const s16 *)(m + HP) > 0 ? m : 0;
}

#define NONE 0xff
static u32 state;  /* MODE_OFF: the game's camera, else what the target's for */
static u32 target; /* its manager slot, or NONE */
static const u8 *targeted; /* and the monster in it */
static u32 pressed_at;     /* µs, at the last L that turned to a target */
static int aimed;          /* that L turned to one */
static u32 swing_from;     /* µs, when a tap's turn began */
static s16 want;           /* the yaw to the target */
static u32 marked_until;   /* µs: the mark shows until then */
#define LINGER 600000      /* µs the mark stays, fading, once the camera lets go */

/*
 * The large monster to turn to from yaw `from`: `side` 0 the one nearest it,
 * 1 the next one to the right (the yaw going down), -1 to the left.
 */
static u32 pick(const u8 *hunter, s16 from, int side) {
  u32 best = NONE, best_by = 0x20000;
  for (u32 slot = 0; slot < SLOTS; slot++) {
    const u8 *m = monster(slot, hunter);
    s16 yaw;
    if (!m || !yaw_to(hunter, m, &yaw)) continue;
    const s16 delta = (s16)(yaw - from);
    u32 by;
    if (side == 0) {
      by = (u32)(delta < 0 ? -delta : delta);
    } else {
      if (slot == target && m == targeted) continue;
      by = (u16)(side > 0 ? -delta : delta); /* how far round that way, 0 to a whole turn */
    }
    if (by < best_by) {
      best_by = by;
      best = slot;
    }
  }
  return best;
}

static void aim(u32 slot, const u8 *hunter, u32 now, u32 how) {
  target = slot;
  targeted = monster(slot, hunter);
  state = how;
  swing_from = now;
}

static void yaw(u8 *arg) {
  struct rf_menu *call = (struct rf_menu *)arg;
  if (call->game != rf_target_yaw) return;
  u8 *r = *rf_camera;
  u8 *follow = (u8 *)call->args[0];
  const u32 how = mode();
  if (!in_ram(r) || follow != r + FOLLOW || how == MODE_OFF || how >= MODES ||
      !game_task_loaded()) {
    state = MODE_OFF;
    return;
  }
  const u8 *hunter = *(u8 **)(r + SUBJECT);
  if (!in_ram(hunter)) {
    state = MODE_OFF;
    return;
  }
  const u32 held = *(const u16 *)(follow + HELD), pressed = *(const u16 *)(follow + PRESSED);
  const s16 has = *(const s16 *)(follow + YAW);
  const u32 now = sceKernelGetSystemTimeLow();

  if (pressed & L) {
    if (aimed && now - pressed_at < DOUBLE_TAP) {
      /* L twice: the game's, behind the hunter. */
      aimed = 0;
      state = MODE_OFF;
      return;
    }
    const u32 slot = state != MODE_OFF && monster(target, hunter) == targeted
                         ? target
                         : pick(hunter, has, 0);
    aimed = slot != NONE;
    pressed_at = now;
    if (slot == NONE) {
      state = MODE_OFF;
      return;
    }
    aim(slot, hunter, now, how);
  } else if ((held & L) && (pressed & (LEFT | RIGHT))) {
    const s16 from = state != MODE_OFF ? want : has;
    const u32 slot = pick(hunter, from, pressed & RIGHT ? 1 : -1);
    if (slot != NONE) aim(slot, hunter, now, how);
    aimed = 0;
  } else if (pressed & (LEFT | RIGHT)) {
    state = MODE_OFF; /* the player turns the camera */
  }
  if (state == MODE_OFF) return;

  const u8 *m = monster(target, hunter);
  if (!m || m != targeted) {
    state = MODE_OFF;
    return;
  }
  yaw_to(hunter, m, &want);
  if (state == MODE_TAP) {
    const s16 left = (s16)(want - has);
    if ((left < FACING && left > -FACING) || now - swing_from > SWING_TIME) state = MODE_OFF;
  }
  marked_until = now + LINGER;
  *(s16 *)(follow + TURN_TO) = want;
  call->result = want;
  call->handled = 1;
}

/* --- The mark (the HUD hook). --- */

#define WIDTH 480.0f
#define HEIGHT 272.0f
#define NEAR_W 20.0f
#define MAX_RECTS 8
#define RETICLE 10   /* half the reticle's side, in pixels */
#define ARM 6        /* each corner's arms */
#define BAR 2        /* and how thick */
#define LIFT_EASE 0.04f /* a frame, how far the mark's height moves to the body's */

static struct {
  s16 x, y, w, h;
} rects[MAX_RECTS];
static u32 rect_count;

static void rect(s32 x, s32 y, s32 w, s32 h) {
  if (x < 0) w += x, x = 0;
  if (y < 0) h += y, y = 0;
  if (x + w > (s32)WIDTH) w = (s32)WIDTH - x;
  if (y + h > (s32)HEIGHT) h = (s32)HEIGHT - y;
  if (w <= 0 || h <= 0 || rect_count >= MAX_RECTS) return;
  rects[rect_count].x = (s16)x;
  rects[rect_count].y = (s16)y;
  rects[rect_count].w = (s16)w;
  rects[rect_count].h = (s16)h;
  rect_count++;
}

/* A world point on screen; 0 when it's behind the near plane. */
static int project(const u8 *renderer, const float *p, float *sx, float *sy) {
  const float *v = (const float *)(renderer + VIEW), *m = (const float *)(renderer + PROJECTION);
  const float x = p[0] * v[0] + p[1] * v[4] + p[2] * v[8] + v[12];
  const float y = p[0] * v[1] + p[1] * v[5] + p[2] * v[9] + v[13];
  const float z = p[0] * v[2] + p[1] * v[6] + p[2] * v[10] + v[14];
  const float cx = x * m[0] + y * m[4] + z * m[8] + m[12];
  const float cy = x * m[1] + y * m[5] + z * m[9] + m[13];
  const float w = x * m[3] + y * m[7] + z * m[11] + m[15];
  if (!(w > NEAR_W)) return 0;
  *sx = WIDTH * 0.5f * (1.0f + cx / w);
  *sy = HEIGHT * 0.5f * (1.0f - cy / w);
  return 1;
}

/*
 * The height of the monster's body above where it stands: the middle of its
 * joints' heights, eased slowly so the mark holds still while it moves its
 * head, tail and legs. A new target starts at its height then.
 */
static const u8 *lifted;
static u32 lifted_at;
static float lift;

static float body_height(const u8 *m, u32 now) {
  const u8 *joints = *(u8 *const *)(m + JOINTS);
  const u32 count = *(const u32 *)(m + JOINT_COUNT);
  const float ground = ((const float *)(m + POSITION))[1];
  float height = lift;
  if (in_ram(joints) && count && count <= MAX_JOINTS) {
    float sum = 0;
    for (u32 k = 0; k < count; k++) {
      sum += ((const float *)(joints + k * JOINT_BYTES + JOINT_MATRIX))[13];
    }
    height = sum / (float)count - ground;
    if (height < 0) height = 0;
  }
  if (m != lifted || now - lifted_at > 200000) lift = height;
  else lift += (height - lift) * LIFT_EASE;
  lifted = m;
  lifted_at = now;
  return lift;
}

/* Corner brackets, the same size whatever the distance, at the monster's body. */
static int reticle(const u8 *renderer, const u8 *m, u32 now) {
  const float *at = (const float *)(m + POSITION);
  const float p[3] = {at[0], at[1] + body_height(m, now), at[2]};
  float fx, fy;
  if (!project(renderer, p, &fx, &fy)) return 0;
  const s32 x = (s32)(fx + 0.5f), y = (s32)(fy + 0.5f);
  const s32 l = x - RETICLE, t = y - RETICLE, r = x + RETICLE, b = y + RETICLE;
  rect_count = 0;
  rect(l, t, ARM, BAR), rect(l, t + BAR, BAR, ARM - BAR);
  rect(r - ARM, t, ARM, BAR), rect(r - BAR, t + BAR, BAR, ARM - BAR);
  rect(l, b - BAR, ARM, BAR), rect(l, b - ARM, BAR, ARM - BAR);
  rect(r - ARM, b - BAR, ARM, BAR), rect(r - BAR, b - ARM, BAR, ARM - BAR);
  return 1;
}

static void draw(u8 *hud) {
  if (mark() != MARK_ON || !game_task_loaded()) return;
  const u32 now = sceKernelGetSystemTimeLow();
  const s32 left = (s32)(marked_until - now);
  if (left <= 0 || left > LINGER) return;
  u8 *renderer = *rf_camera;
  const u8 *hunter = *(u8 **)(hud + HUD_HUNTER);
  if (!in_ram(renderer) || !in_ram(hunter) || target == NONE) return;
  const u8 *m = monster(target, hunter);
  if (!m || m != targeted || !reticle(renderer, m, now)) return;
  /* Full while the camera has it, then fading. */
  const u32 alpha = state != MODE_OFF ? 0xc0 : (u32)(0xc0 * (u32)left / LINGER);
  for (u32 k = 0; k < rect_count; k++) {
    rf_call9(rf_fill, (u32)hud, (u32)rects[k].x, (u32)rects[k].y, (u32)rects[k].w,
             (u32)rects[k].h, 0xff, 0xb0, 0x20, alpha);
  }
}

/* --- The settings, in randomfu's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const names[MODES] = {"OFF", "TAP", "FOLLOW"};

static void set(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < MODES) d->camera_target = (u8)(c + 1);
  state = MODE_OFF;
}

static const char *const mark_names[MARKS] = {"OFF", "ON"};

static void set_mark(u32 c) {
  struct rf_save_data *d = rf_save_data();
  if (d && c < MARKS) d->camera_mark = (u8)(c + 1);
}

static const struct rf_setting mark_setting = {
    "Target mark",
    "Mark the monster the target\ncamera turns to with a\nreticle.",
    mark_names,
    MARKS,
    mark,
    set_mark,
};

static const struct rf_setting setting = {
    "Target camera",
    "L turns the camera to the\nlarge monster nearest the\nmiddle; L twice, behind you.\nHold L, D-pad left/right:\nthe next monster. FOLLOW\nkeeps the monster in view.",
    names,
    MODES,
    mode,
    set,
};

void rf_target_camera_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  state = MODE_OFF;
  target = NONE;
  targeted = 0;
  aimed = 0;
  marked_until = 0;
  lifted = 0;
  rf_on(RF_HOOK_MENU, yaw);
  rf_on(RF_HOOK_HUD, draw);
  if (rf_add_setting) {
    rf_add_setting(&setting);
    rf_add_setting(&mark_setting);
  }
}
