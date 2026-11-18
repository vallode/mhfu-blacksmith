# randomfu

The randomizer. `README.md` documents every option and what it found in
the game files; read the section for the option you're changing.

## Text written into the game

Anything randomfu writes for the player to read in game (the bookshelf
guides in `src/hints/`) is styled from `src/hints/style.ts`, which records
what was seen to render on the EU disc in PPSSPP: the `~Cnn` colours, the
boxed `~C30`, button icons, symbols and their byte and column costs.

- Use the `STYLE` roles (heading, name, note, none, element, status, rank,
  source) with `paint`, not raw codes, so both books keep one colour
  per kind of thing. Add a role there before reaching for a new colour.
- `compact` every page: it drops codes nothing shows and restates a line's
  colour after a line break (whether colour carries over isn't known).
- Room is bytes, not characters: ★ is 3 bytes and a colour code 4. Measure
  a change against the books' shared room (`shelfRoom`, `writeGuides`) on
  vanilla and shuffled seeds before adding styling.
- Pages are 8 lines of 46 columns; symbols count two (`width`,
  `checkPage`). Never use `~C01`/`~C25` (black) or more than ten `~B` icons
  a page.
