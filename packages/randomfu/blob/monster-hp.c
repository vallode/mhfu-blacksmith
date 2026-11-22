/*
 * Monster HP (the hud.monsterHp option): a gauge per large monster under the
 * name plate, drawn with the HUD's gauge routines, sprites and colours.
 * See ../docs/code-loader.md and src/patches/monster-hp.ts, which finds the
 * game's addresses below on each disc. It only reads game state.
 */
#include "rf.h"

/* Found per disc (src/patches/monster-hp.ts). */
extern const u8 rf_game_task[];      /* game_task.ovl's load address */
extern u8 *const rf_monsters[];      /* the global holding the monster manager */
extern const u8 rf_em_chunks[];      /* game_task's per-species table */
extern const u8 rf_hud_frame[];      /* frame(hud, x, y, w, h, sprite) */
extern const u8 rf_hud_cap[];        /* cap(hud, x, y, sprite) */
extern const u8 rf_hud_fill[];       /* fill(hud, x, y, w, h, r, g, b) */
extern const u8 rf_map_shows[];      /* the map's test: does it show this monster? (hud, m) */
extern const u8 rf_hud_sprite[];     /* sprite(hud, x, y, w, h, sprite): a sprite stretched to w×h */
extern const u8 rf_hud_sprites[];    /* the HUD's sprite table that `sprite` indexes */
extern const u8 rf_crowns[];         /* the Guild Card's crown table */
extern const u8 *const rf_crown_groups[]; /* by emID: the emIDs that share its crowns, ending 0xFF */
/* A constant, not an address: the disc's default MODE_* + 1 (an extern's address is never 0). */
extern const u8 rf_monster_hp_mode[];

#define MODE_OFF 0
#define MODE_PAINTED 1
#define MODE_ALWAYS 2
#define MODES 3

/* The mode: the one chosen in game (kept in randomfu's save data), else the disc's. */
static u32 mode(void) {
  const struct rf_save_data *d = rf_save_data();
  u32 chosen = d ? d->monster_hp : 0;
  return chosen && chosen <= MODES ? chosen - 1 : (u32)rf_monster_hp_mode - 1;
}

/* The monster manager: up to 20 monsters in the hunter's area, large and small. */
#define MANAGER_SLOTS 0x1220
#define SLOTS 20
/* A monster (and the hunter: the same entity layout). */
#define FLAGS 0x4 /* bit 0: active in the hunter's area (the map's test checks it) */
#define AREA 0x29a
#define EM_ID 0x1e8
#define HP 0x2e4
#define HP_MAX 0x41e
#define SIZE 0x274 /* u16: its size in percent, rolled from the quest (src/game/spawns.ts) */
/* game_task's species table: 0x1D0 bytes each, by monster id; its stat set is 0 for small monsters. */
#define CHUNK_BYTES 0x1d0
#define CHUNK_SET 0x14f
#define SPECIES 90
/* The HUD: bit 1 of +0x1194 hides the gauges (the gauge routine checks it too). */
#define HUD_FLAGS 0x1194
#define HUD_GAUGES_HIDDEN 2
#define HUD_HUNTER 0x530

/*
 * Layout: a short gauge in the stamina gauge's style (its frame and its
 * end cap, the cap mirrored on the left too) per monster, stacked on the
 * left edge under the hunter's name plate, and a crown after it when the
 * monster's size makes one.
 */
#define FRAME_SPRITE 4
#define CAP_SPRITE 6
#define CAP_U 52 /* sprite 6's place in the HUD texture, to mirror it */
#define CAP_V 44
#define CAP_W 24
#define CAP_H 12
#define CAP_TEXTURE 0x8001
#define X (4 + CAP_W)
#define Y 92
#define ROW 14
#define WIDTH 80
#define HEIGHT 8
#define FILL_Y 1
#define FILL_H 2
#define ROWS 3

/*
 * The mirrored cap: a sprite record of the table's 12-byte format with a
 * negative width, so the stretching sprite routine reads the cap right to
 * left. The routine reaches it by an index past the table's end.
 */
static struct {
  s16 u, v, w, h;
  u16 texture, set;
} __attribute__((aligned(4))) left_cap = {CAP_U + CAP_W, CAP_V, -CAP_W, CAP_H, CAP_TEXTURE, 0};

/* The HUD's own colours: the hunter's red (health lost) and the stamina yellow. */
#define HP_R 0xc0
#define HP_G 0x10
#define HP_B 0x10
#define TRAIL_R 0xf0
#define TRAIL_G 0xf0
#define TRAIL_B 0x00

/*
 * The crown mark: the HUD texture's own crowns (sprites 31 and 32, 16×12),
 * drawn over the right end cap, overlapping the gauge's end and centred on
 * the bar's height. It has no mini crown: that's the gold one, smaller,
 * with the same centre.
 */
#define CROWN_CENTRE_X (X + WIDTH + 6)
#define CROWN_TOP(h) (((7 - (s32)(h)) / 2)) /* from the row's y: the bar's middle is y + 3.5 */
#define CROWN_W 16
#define CROWN_H 12
#define MINI_W 12
#define MINI_H 9
#define SILVER_SPRITE 31
#define GOLD_SPRITE 32

/*
 * The crown table: 14-byte entries, u8 at +3 the emID whose group the entry
 * covers, then s16 silver, gold and mini thresholds (all 0 without crowns).
 */
#define CROWN_ENTRIES 62
#define CROWN_BYTES 14
#define CROWN_GROUP 3
#define CROWN_SILVER 4
#define CROWN_GOLD 6
#define CROWN_MINI 8
#define GROUP_END 0xff

#define NO_CROWN 0
#define MINI 1
#define SILVER 2
#define GOLD 3

/* The crown the Guild Card would give a monster of this size, as it decides (EBOOT 0x08853F84). */
static u32 crown(u32 em, u32 size) {
  for (u32 i = 0; i < CROWN_ENTRIES; i++) {
    const u8 *entry = rf_crowns + i * CROWN_BYTES;
    s32 silver = *(const s16 *)(entry + CROWN_SILVER);
    s32 gold = *(const s16 *)(entry + CROWN_GOLD);
    s32 mini = *(const s16 *)(entry + CROWN_MINI);
    if (!silver && !gold && !mini) continue;
    const u8 *group = rf_crown_groups[entry[CROWN_GROUP]];
    if (!group) continue;
    for (u32 k = 0; k < SPECIES && group[k] != GROUP_END; k++) {
      if (group[k] != em) continue;
      if ((s32)size <= mini) return MINI;
      if ((s32)size >= gold) return GOLD;
      if ((s32)size >= silver) return SILVER;
      return NO_CROWN;
    }
  }
  return NO_CROWN;
}

/* Per manager slot: who was there and how much of the bar the trail still shows. */
static u8 *seen[SLOTS];
static u16 trail[SLOTS];

static int game_task_loaded(void) {
  const u32 *name = (const u32 *)(rf_game_task + 0x20);
  return name[0] == 0x656d6167 && name[1] == 0x7361745f; /* "game_tas" */
}

static int is_large(u32 em) {
  return em > 0 && em < SPECIES && (signed char)rf_em_chunks[em * CHUNK_BYTES + CHUNK_SET] > 0;
}

typedef u32 (*map_shows_fn)(u8 *hud, u8 *m);

/* The sprite index the routine turns into `record`: index × 12 wraps to the offset (× 0xAAAAAAAB is ÷ 3). */
static u32 sprite_index(const void *record) {
  return (((u32)record - (u32)rf_hud_sprites) >> 2) * 0xaaaaaaabu;
}

static void fill(u8 *hud, u32 x, u32 y, u32 w, u32 r, u32 g, u32 b) {
  if (w) rf_call8(rf_hud_fill, (u32)hud, x, y, w, FILL_H, r, g, b);
}

static void draw(u8 *hud) {
  const u32 now = mode();
  if (now == MODE_OFF || now >= MODES) return;
  if (*(u32 *)(hud + HUD_FLAGS) & HUD_GAUGES_HIDDEN) return;
  if (!game_task_loaded()) return;
  u8 *manager = *rf_monsters;
  u8 *hunter = *(u8 **)(hud + HUD_HUNTER);
  if (!manager || !hunter) return;
  u16 area = *(u16 *)(hunter + AREA);
  u32 always = now == MODE_ALWAYS;
  u32 row = 0;
  for (u32 slot = 0; slot < SLOTS; slot++) {
    u8 *m = *(u8 **)(manager + MANAGER_SLOTS + slot * 4);
    if (!m || !is_large(m[EM_ID])) continue;
    if (!(m[FLAGS] & 1) || *(u16 *)(m + AREA) != area) continue;
    s32 hp = *(short *)(m + HP);
    u32 max = *(u16 *)(m + HP_MAX);
    if (max == 0 || hp <= 0) continue;
    if (!always && !(u8)((map_shows_fn)rf_map_shows)(hud, m)) continue;
    if ((u32)hp > max) hp = (s32)max;
    u32 w = ((u32)hp * WIDTH + max - 1) / max;
    if (seen[slot] != m || trail[slot] < w) trail[slot] = (u16)w;
    seen[slot] = m;
    if (row == ROWS) continue;
    u32 y = Y + row * ROW;
    rf_call8(rf_hud_frame, (u32)hud, X, y, WIDTH, HEIGHT, FRAME_SPRITE, 0, 0);
    rf_call8(rf_hud_sprite, (u32)hud, X - CAP_W, y, CAP_W, CAP_H, sprite_index(&left_cap), 0, 0);
    rf_call8(rf_hud_cap, (u32)hud, X + WIDTH, y, CAP_SPRITE, 0, 0, 0, 0);
    fill(hud, X + w, y + FILL_Y, trail[slot] - w, TRAIL_R, TRAIL_G, TRAIL_B);
    fill(hud, X, y + FILL_Y, w, HP_R, HP_G, HP_B);
    const u32 c = crown(m[EM_ID], *(u16 *)(m + SIZE));
    if (c == MINI) {
      rf_call8(rf_hud_sprite, (u32)hud, CROWN_CENTRE_X - MINI_W / 2, y + CROWN_TOP(MINI_H), MINI_W, MINI_H,
               GOLD_SPRITE, 0, 0);
    } else if (c != NO_CROWN) {
      rf_call8(rf_hud_sprite, (u32)hud, CROWN_CENTRE_X - CROWN_W / 2, y + CROWN_TOP(CROWN_H), CROWN_W, CROWN_H,
               c == GOLD ? GOLD_SPRITE : SILVER_SPRITE, 0, 0);
    }
    if (trail[slot] > w) trail[slot]--;
    row++;
  }
}

/* --- The setting, in randomfu's START menu entry (menu.c), when the disc has it. --- */

__attribute__((weak)) void rf_add_setting(const struct rf_setting *setting);

static const char *const mode_names[MODES] = {"Off", "On map", "Always"};
static u32 get_mode(void) { return mode(); }
static void set_mode(u32 choice) {
  struct rf_save_data *d = rf_save_data();
  if (d && choice < MODES) d->monster_hp = (u8)(choice + 1);
}
static const struct rf_setting setting = {
    "Monster health",
    "A health gauge for each\nlarge monster in your area,\nunder your name. On the map:\nwhile the map shows it, from\na Paintball hit until the\nmark wears off.",
    mode_names,
    MODES,
    get_mode,
    set_mode,
};

void rf_monster_hp_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  rf_on(RF_HOOK_HUD, draw);
  if (rf_add_setting) rf_add_setting(&setting);
}
