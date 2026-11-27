/*
 * Not a feature: an object for test/blob-link.test.ts with every relocation
 * the linker handles (HI16/LO16 against data, read-only data and zeroed
 * data, 26-bit calls within the blob and to the game, 32-bit pointers).
 */
#include "rf.h"

static u32 calls;
u32 table[2] = {10, 20};
static const char name[] = "rf";

__attribute__((noinline)) static u32 helper(u32 x) { return x * 3 + table[x & 1]; }
u32 (*const pick)(u32) = helper;

void rf_init(u32 reason, u8 *save, u8 *blob) {
  (void)blob;
  calls++;
  *(u32 *)(save + 0x10) = pick(reason) + (u8)name[1] + calls;
  sceIoClose((s32)reason);
}

u32 rf_hook0(u32 x) { return calls + x; }
