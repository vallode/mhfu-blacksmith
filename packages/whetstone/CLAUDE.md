# Whetstone

The mods, the disc code and the code loader that randomfu builds on.
`README.md` documents every option and what it found in the game files;
read the section for the option you're changing. `docs/code-loader.md` has
the loader's design.

## HUD text in the blob

The blob (`blob/*.c`: damage numbers, the START menu's window, photo mode's
help, bulk combine's count) prints with the HUD's own routines and writes
its own `~C` colour codes. These aren't the bookshelf rules in
`packages/randomfu/CLAUDE.md`, which are for the books' pages:

- Colour codes are the ones listed in randomfu's
  `packages/randomfu/src/hints/style.ts` (seen to render on the EU disc in
  PPSSPP); end a coloured run with `~C00`.
- Damage numbers' black drop shadow (`~C01`, which the game doesn't use on
  the HUD) is deliberate, as are their colours: white, orange (`~C11`) on a
  weak point, and the element colours red fire, blue water, yellow thunder,
  cyan ice, magenta dragon (README, "Damage numbers").
- The START menu window is drawn like the game's Options: its title on the
  light bar, each value in `~C05`, the setting's help left of the list
  (README, "The START menu entry").
- Only the code-reading print (`window`'s, `rf_print`) reads `~C` colours and
  `~B` button icons; the plain one doesn't.
- Text the blob writes is English on every disc.
- Keep the blob's `rf_` names and `rf.h`: they're from before the split.
  The disc file is `WHTSTN.BIN`.
