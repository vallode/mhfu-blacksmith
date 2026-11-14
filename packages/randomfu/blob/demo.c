/*
 * The code loader's demo (randomize --loader-demo, not for play): every
 * save load adds 1000 zenny, so it's seen to run at once.
 */
#include "rf.h"

void rf_init(u32 reason, u8 *save, u8 *blob) {
  (void)blob;
  if (reason == RF_SAVE_LOADED) *(u32 *)(save + RF_SAVE_ZENNY) += 1000;
}
