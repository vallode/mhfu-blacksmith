/*
 * Key quests (quests.keyLabel): the quest counter's card (the Village
 * Chief's and the Guild's, in town) shows "Key Quest!" in its top right corner
 * when the quest it shows is a key quest, one of those its star needs
 * cleared before the Urgent Quest shows.
 *
 * RF_HOOK_QUEST_CARD runs just after lobby_task draws the card. The card
 * draws from a copy of the shown quest's board record (header 0x4c-0x7f),
 * at a fixed address its getter returns; bit 26 of its quest type marks a
 * key quest (bit 25 an Urgent Quest). "Key Quest!" is drawn as the card draws
 * "CLEAR!!" in its top left: the same print, glyph size, colours and
 * shadow. See ../src/patches/key-quests.ts.
 */
#include "rf.h"

extern const u8 rf_card_record[];   /* the shown quest's board record: u32 quest type first */
extern u8 *const rf_card_printer[]; /* the global holding the printer */
extern const u8 rf_card_print[];    /* print(printer, x, y, shadow, colour, text, dx, dy) */
extern const u8 rf_key_x[];         /* constants: the label's left and top */
extern const u8 rf_key_y[];

#define KEY_QUEST (1u << 26)

/* The printer's glyph size (the game's setter writes all three). */
#define PRINTER_GLYPH_W 0x12c
#define PRINTER_GLYPH_H 0x12d
#define PRINTER_LINE_H 0x15f

/* As the card draws "CLEAR!!". */
#define GLYPH 14
#define YELLOW 5
#define SHADOW 1
#define SHADOW_OFFSET 2

static const char label[] = "Key Quest!";

/* The label's width: half a glyph a character, as the game measures text. */
u32 rf_key_label_width(void) { return (sizeof label - 1) * GLYPH / 2; }

static void draw(u8 *counter) {
  (void)counter;
  if (!(*(const u32 *)rf_card_record & KEY_QUEST)) return;
  u8 *printer = *rf_card_printer;
  if (!printer) return;
  u8 w = printer[PRINTER_GLYPH_W], h = printer[PRINTER_GLYPH_H], line = printer[PRINTER_LINE_H];
  printer[PRINTER_GLYPH_W] = GLYPH;
  printer[PRINTER_GLYPH_H] = GLYPH;
  printer[PRINTER_LINE_H] = GLYPH;
  rf_call8(rf_card_print, (u32)printer, (u32)rf_key_x, (u32)rf_key_y, SHADOW, YELLOW, (u32)label,
           SHADOW_OFFSET, SHADOW_OFFSET);
  printer[PRINTER_GLYPH_W] = w;
  printer[PRINTER_GLYPH_H] = h;
  printer[PRINTER_LINE_H] = line;
}

void rf_key_quests_init(u32 reason, u8 *save) {
  (void)reason;
  (void)save;
  rf_on(RF_HOOK_QUEST_CARD, draw);
}
