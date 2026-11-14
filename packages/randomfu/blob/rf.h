/*
 * What blob code can rely on. The code loader copies the linked blob into
 * the freed Guild Card slots after every save load and new game, then calls
 * rf_init. See ../docs/code-loader.md.
 */
#ifndef RF_H
#define RF_H

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef signed int s32;

/* rf_init's reason. */
#define RF_SAVE_LOADED 0
#define RF_NEW_GAME 1

/* Save struct offsets, shared by EU and JP. */
#define RF_SAVE_ZENNY 0x696F0

/*
 * Called after every load of the blob, with the save struct (a fixed
 * address per region) and where the blob starts. Everything in the blob,
 * code and data, is fresh from the disc at this point.
 */
void rf_init(u32 reason, u8 *save, u8 *blob);

/*
 * Game functions the linker provides (src/patches/code-loader.ts). Call
 * them like any function.
 */
s32 sceIoOpen(const char *path, s32 flags, s32 mode);
s32 sceIoRead(s32 fd, void *data, u32 size);
s32 sceIoClose(s32 fd);

#endif
