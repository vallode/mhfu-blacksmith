/*
 * Send All to Item Box: a row in the reward screen's menu, between "Send to
 * Item Box" and "End", that sends every reward the Item Box can take in one
 * go, as "Send to Item Box" does item by item, and ends the screen as End
 * does. What doesn't fit stays in the rewards, and the menu with it. See src/patches/send-all.ts, which finds the game's addresses
 * below on each disc and makes the game's menu four rows long, the new row
 * reading "End" (so a disc whose blob didn't load has two that end).
 *
 * Hooks:
 * - The menu hook's reward label call (RF_CALL_REWARD_LABEL): box() asking
 *   the game for a row's label. Row 2 of the reward menu's names is ours.
 *   It's asked every frame the screen shows, which is how the rest knows.
 * - The pad hook: the confirm button on our row, in the menu, is ours. The
 *   game never sees it, or it would end (row 2 is past "Send to Item Box").
 * - The menu hook's quest draw (the HUD's menu layer, which draws the help
 *   bar): our row's help, and End's, which the game would get wrong (it
 *   takes the row + 4 as the help's message). Registered before menu.c's,
 *   so it makes the game's call.
 */
#include "rf.h"

/* Found per disc (src/patches/send-all.ts). */
extern const u8 rf_add_to_box[]; /* add_to_box(save, item, amount, slot): what doesn't fit */
extern const u8 rf_item_seen[];  /* item_seen(save, item), as the game after a send */
extern const u8 rf_can_store[];  /* can_store(object, item): 0 for an item the box can't take */
extern u8 *const rf_can_store_object[];
extern const u8 rf_sound[]; /* sound(object, 0, id, 0, 0, 0, 0, 0, [sp] 0) */
extern u8 *const rf_sound_object[];
extern const u8 rf_reward_names[];  /* the reward menu's label IDs, u16 a row */
extern const u8 rf_comrade_names[]; /* the comrade's items' */
extern const u8 rf_reward_confirm[]; /* the button that chooses on this disc (× or ○) */
extern const u8 rf_help_rect[];      /* the help bar's window rect */
extern const u8 rf_window[];         /* window(hud, rect, text, alpha) */

/* The HUD object: the reward screen's state (0 its menu), menu row and whose items. */
#define STATE 0x120a
#define ROW 0x120b
#define COMRADE 0x1218
/* The help bar: shown with bit 2, its message group and message (the game's tables). */
#define HELP_SHOWS 0x5e8
#define HELP_GROUP 0x5fe
#define HELP_MESSAGE 0x5fc
#define REWARD_HELP 6 /* the group; row k's help is message k + 4 */
#define END_HELP 6    /* End's, when it was row 2 */
#define NO_HELP 0xffff
#define MENU 0
#define DONE 6 /* where End goes with no rewards left */
#define SEND_ROW 2
#define END_ROW 3

/* The save's rewards: slots of item and amount, 8 a row, 4 rows (2 for the comrade's). */
#define REWARDS 0x390
#define SLOTS 32
#define COMRADE_SLOTS 16

/* The game's sounds, as "Send to Item Box": sent, and refused (the box is full); End's. */
#define SOUND_SENT 25
#define SOUND_REFUSED 21
#define SOUND_END 19

/* While the screen shows: the label call counts this up each frame, the pad down. */
#define LIVE 3
static u8 live;
static u8 *hud;
static u8 *save;
static u32 previous; /* the buttons last frame */
static u8 held;      /* the confirm press we took, until it's let go */

static const char label[] = "Send All to Item Box";
static const char help[] = "Send every reward to the\nItem Box and finish. Any\nthat don't fit stay here.";

static void sound(u32 id) {
  rf_call9(rf_sound, (u32)*rf_sound_object, 0, id, 0, 0, 0, 0, 0, 0);
}

typedef u32 (*can_store_fn)(u8 *, u32);
typedef u32 (*add_fn)(u8 *, u32, u32, u32);
typedef void (*seen_fn)(u8 *, u32);

/*
 * Sends what fits, and ends the screen if no reward is left in any slot (as
 * End, which would otherwise ask to sell them; the comrade's screen shows 16).
 */
static void send_all(void) {
  u16 *slot = (u16 *)(save + REWARDS);
  const u32 slots = hud[COMRADE] ? COMRADE_SLOTS : SLOTS;
  u32 sent = 0, left = 0;
  for (u32 k = 0; k < slots; k++, slot += 2) {
    const u32 item = slot[0];
    if (!item) continue;
    if (!((can_store_fn)rf_can_store)(*rf_can_store_object, item)) {
      left++;
      continue;
    }
    const u32 over = ((add_fn)rf_add_to_box)(save, item, (u32)(s16)slot[1], 0xffff) & 0xffff;
    ((seen_fn)rf_item_seen)(save, item);
    if (over) {
      left++;
      if ((s16)slot[1] != (s16)over) sent++;
      slot[1] = (u16)over;
    } else {
      sent++;
      slot[0] = slot[1] = 0;
    }
  }
  if (left) {
    sound(SOUND_REFUSED);
    return;
  }
  /* As End's check, which adds up the amounts of the slots with an item. */
  for (u32 k = slots; k < SLOTS; k++, slot += 2) {
    if (slot[0] && slot[1]) {
      sound(SOUND_SENT);
      return;
    }
  }
  sound(sent ? SOUND_SENT : SOUND_END);
  hud[STATE] = DONE;
}

static int on_row(u32 row) { return live && hud && hud[STATE] == MENU && hud[ROW] == row; }

static void pad(u8 *ctrl) {
  u32 *buttons = (u32 *)(ctrl + 4);
  const u32 b = *buttons, confirm = (u32)rf_reward_confirm;
  if (held) {
    if (b & confirm) *buttons = b & ~confirm;
    else held = 0;
  } else if ((b & confirm) && !(previous & confirm) && on_row(SEND_ROW)) {
    send_all();
    held = 1;
    *buttons = b & ~confirm;
  }
  previous = b;
  if (live) live--;
}

static void menu(u8 *arg) {
  struct rf_menu *m = (struct rf_menu *)arg;
  if (m->site == RF_CALL_REWARD_LABEL) {
    const u32 names = m->args[2];
    if ((names != (u32)rf_reward_names && names != (u32)rf_comrade_names) || m->s2 != SEND_ROW) {
      return;
    }
    live = LIVE;
    m->result = (s32)label;
    m->handled = 1;
    return;
  }
  if (m->site != RF_MENU_QUEST * 4 + RF_MENU_DRAW || m->handled) return;
  u8 *q = (u8 *)m->args[0];
  hud = q;
  if (!live || q[STATE] != MENU || q[HELP_GROUP] != REWARD_HELP) return;
  const u32 row = q[ROW];
  u16 *message = (u16 *)(q + HELP_MESSAGE);
  if (row == END_ROW) *message = END_HELP;
  if (row == SEND_ROW) *message = NO_HELP;
  m->result = (s32)rf_call8(m->game, m->args[0], m->args[1], m->args[2], m->args[3], 0, 0, 0, 0);
  m->handled = 1;
  if (row == SEND_ROW) {
    *message = END_HELP;
    if (q[HELP_SHOWS] & 4) {
      ((void (*)(u8 *, const u8 *, const char *, u32))rf_window)(q, rf_help_rect, help, 0xff);
    }
  }
}

void rf_send_all_init(u32 reason, u8 *s) {
  (void)reason;
  save = s;
  live = 0;
  held = 0;
  previous = 0;
  rf_on(RF_HOOK_PAD, pad);
  rf_on(RF_HOOK_MENU, menu);
}
