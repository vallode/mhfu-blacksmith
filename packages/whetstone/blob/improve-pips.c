/*
 * Improve pips (the smithy.improvePips option): in the box picker the smithy's
 * Improve shows, a small pip in the top left corner of each weapon the
 * hunter can improve right now, into any of the weapons it improves into.
 * See src/patches/improve-pips.ts, which finds the addresses below on each
 * disc and puts the hook in.
 *
 * What the game does (lobby_task, found on the FUC disc from RAM with the
 * picker open, and matched on EU):
 *
 * - The box picker draws its 10 x 10 grid of the page with
 *   `grid(object, cursor, flags, layout)`: `cursor` the box index (0-799),
 *   whose page of 100 it shows; `flags` 0x10 for the equipment box (the
 *   save's +0x548, 12 bytes a slot), 0x400 to dim all but weapons (what
 *   Improve asks for); `layout` a row of the grid's table, s16s: the first
 *   cell's x, y, its width and height, and the steps to the next column and
 *   row. Cell k is at column k % 10, row k / 10.
 * - Choosing a weapon lists what it improves into: its row of the
 *   upgrade table (28 bytes a weapon, one section for melee weapons and one
 *   for ranged) holds the four materials (item, amount) that improving into
 *   it takes and, at +16, the five weapons it improves into (0 for none).
 *   A ranged weapon only has a row when the game's check says so.
 * - A target is greyed out when any material is short (the pouch and box
 *   together: `has(_, item, amount)`) or the zenny is (`afford(_, cost)`,
 *   the cost from `cost(_, type, id)`: half the target's price). Those
 *   are lobby_task's own checks, called here the same way.
 *
 * The hook: the picker's call to `grid` goes through the menu hook's stub
 * (RF_HOOK_MENU, a call of its own, known by its `game`). This makes the
 * call, then draws the pips with the HUD's fill, over the icons, in their
 * layer. Which weapons can be improved is worked out once for a page and
 * kept while the picker shows: again for a cell whose slot changes, and for
 * the whole page when the zenny does (an improvement spends it).
 */
#include "rf.h"

/* Found per disc (src/patches/improve-pips.ts). */
extern const u8 rf_pip_grid[];    /* grid(object, cursor, flags, layout) */
extern const u8 rf_pip_layouts[]; /* the grid's layouts, 24 bytes each */
extern u8 *const rf_pip_hud[];    /* the global holding the HUD the grid draws with */
extern const u8 rf_pip_melee[];   /* the upgrade table's melee section */
extern const u8 rf_pip_ranged[];  /* and its ranged section */
extern const u8 rf_pip_has[];     /* has(_, item, amount): the pouch and box hold that many */
extern const u8 rf_pip_cost[];    /* cost(_, type, id): zenny to improve into it */
extern const u8 rf_pip_afford[];  /* afford(_, zenny) */
extern const u8 rf_pip_listed[];  /* listed(_, type, id): a ranged weapon with an upgrade row */
extern const u8 rf_fill[];        /* fill(hud, x, y, w, h, r, g, b, alpha) */

#define EQUIPMENT 0x10
#define WEAPONS 0x400
#define OTHER_LIST 0x100 /* a list that isn't the box's pages */

#define BOX 0x548
#define SLOT_BYTES 12
#define MELEE 5
#define RANGED 6

#define ROW_BYTES 28
#define MATERIALS 4
#define TARGETS 16 /* u16[5] */
#define TARGET_COUNT 5

#define COLUMNS 10
#define CELLS 100
#define LAYOUT_BYTES 24

/* The pip: 3 x 3, in a dark frame, 1 in from the cell's top left corner. */
#define PIP 3

typedef u32 (*check3_fn)(u32, u32, u32);
typedef u32 (*check2_fn)(u32, u32);

static u8 *save;
static u8 live;          /* counted down by the pad, up by the picker's draw */
static s32 page = -1;    /* the box index of the first cell of what's known */
static u32 zenny;        /* when it was worked out */
static u8 known[CELLS];  /* 1 once a cell is worked out */
static u8 marked[CELLS]; /* and whether it gets a pip */
static u8 types[CELLS];  /* what was in the slot */
static u16 ids[CELLS];

/* Whether improving into `id` (a `type` weapon, its row in `table`) can be paid for now. */
static u32 can_make(const u8 *table, u32 type, u32 id) {
  const u16 *row = (const u16 *)(table + id * ROW_BYTES);
  for (u32 k = 0; k < MATERIALS; k++) {
    const u32 item = row[k * 2];
    if (item && !((check3_fn)rf_pip_has)(0, item, (u32)(s32)(s16)row[k * 2 + 1])) return 0;
  }
  const u32 cost = ((check3_fn)rf_pip_cost)(0, type, id);
  return ((check2_fn)rf_pip_afford)(0, cost) & 0xff;
}

static u32 improvable(u32 type, u32 id) {
  const u8 *table;
  if (type == MELEE) table = rf_pip_melee;
  else if (type == RANGED && (((check3_fn)rf_pip_listed)(0, type, id) & 0xff)) {
    table = rf_pip_ranged;
  } else {
    return 0;
  }
  const u16 *targets = (const u16 *)(table + id * ROW_BYTES + TARGETS);
  for (u32 k = 0; k < TARGET_COUNT; k++) {
    if (targets[k] && can_make(table, type, targets[k])) return 1;
  }
  return 0;
}

static void fill(u8 *hud, s32 x, s32 y, u32 size, u32 r, u32 g, u32 b) {
  rf_call9(rf_fill, (u32)hud, (u32)x & 0xffff, (u32)y & 0xffff, size, size, r, g, b, 0xff);
}

static void pips(u32 cursor, u32 layout) {
  const u32 first = cursor / CELLS * CELLS;
  const u32 money = *(const u32 *)(save + RF_SAVE_ZENNY);
  if (!live || (s32)first != page || money != zenny) {
    for (u32 k = 0; k < CELLS; k++) known[k] = 0;
    page = (s32)first;
    zenny = money;
  }
  live = 2;
  u8 *hud = *rf_pip_hud;
  const s16 *l = (const s16 *)(rf_pip_layouts + layout * LAYOUT_BYTES);
  const u8 *slot = save + BOX + first * SLOT_BYTES;
  for (u32 k = 0; k < CELLS; k++, slot += SLOT_BYTES) {
    const u32 type = slot[0] ? slot[1] : 0xff;
    const u32 id = *(const u16 *)(slot + 2);
    if (!known[k] || types[k] != type || ids[k] != id) {
      marked[k] = type != 0xff && improvable(type, id);
      types[k] = (u8)type;
      ids[k] = (u16)id;
      known[k] = 1;
    }
    if (!marked[k]) continue;
    const s32 x = l[0] + (s32)(k % COLUMNS) * l[4] + 1;
    const s32 y = l[1] + (s32)(k / COLUMNS) * l[5] + 1;
    fill(hud, x - 1, y - 1, PIP + 2, 0x10, 0x10, 0x10);
    fill(hud, x, y, PIP, 0xff, 0x96, 0x28);
  }
}

static void grid(u8 *arg) {
  struct rf_menu *call = (struct rf_menu *)arg;
  if (call->game != rf_pip_grid || call->handled) return;
  const u32 *a = call->args;
  call->result = (s32)rf_call8(rf_pip_grid, a[0], a[1], a[2], a[3], 0, 0, 0, 0);
  call->handled = 1;
  const s32 cursor = (s32)(s16)a[1];
  const u32 flags = a[2];
  if ((flags & (EQUIPMENT | WEAPONS)) != (EQUIPMENT | WEAPONS) || (flags & OTHER_LIST)) return;
  if (cursor < 0 || !*rf_pip_hud) return;
  pips((u32)cursor, a[3]);
}

static void pad(u8 *ctrl) {
  (void)ctrl;
  if (live) live--;
}

void rf_improve_pips_init(u32 reason, u8 *s) {
  (void)reason;
  save = s;
  live = 0;
  page = -1;
  rf_on(RF_HOOK_MENU, grid);
  rf_on(RF_HOOK_PAD, pad);
}
