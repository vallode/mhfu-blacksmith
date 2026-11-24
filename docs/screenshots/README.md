# In-game screenshots

Captures from MHFU itself, kept as reference for the site's look and feel:
layouts, frames, type, colours, icon placement. They are reference material,
not site assets — nothing here is copied into `apps/blacksmith/public` or
shipped with the site.

## Adding a screenshot

- **Name it** `<area>-<what>[-<detail>].png`: lowercase, words joined by
  dashes. The folder already says the area, so keep the name about the
  screen: `crafting/weapon-tree-branch-selected.png`,
  `ui/item-box-page-2.png`.
- **Crop to the screen.** One screen per file, as PNG (these are mostly flat
  colour and text; JPEG smears the type).
- **Match the set.** The captures here are cropped to the PSP screen and
  scaled to 960×544 (twice the game's 480×272 native resolution), so new
  ones should be too. That keeps the text readable and makes layouts
  comparable across screenshots.
- **Blank out hunter names and guild cards** before committing.
- Prefer the screen that shows the state you are styling. If two states
  matter (default and selected, for example), keep both.

Captures are copyrighted game content: this folder is for reading and
comparing while working, not for republishing. Keep the set small — if a
capture is no longer useful to a design decision, delete it rather than
archiving it.

## Optimizing

`pnpm screenshots:optimize` runs every PNG here through
`oxipng -o max --strip all` and fails on anything that isn't 960×544. It is
lossless, so the pixels stay as captured. `--dry-run` only checks; pass file
or directory paths to work on a subset. Install oxipng with
`brew install oxipng`.

## Folders

| Folder      | What goes there                                                                             |
| ----------- | ------------------------------------------------------------------------------------------- |
| `ui/`       | Menus, item and equipment lists, detail panels, selector bars, dialogs, text boxes          |
| `crafting/` | Smithy, weapon trees, upgrade and forge screens, armor and decoration lists                 |
| `hunter/`   | Hunter status and equipment, item box, guild card, save and load screens                    |
| `quests/`   | Guild hall, quest listings, quest details, rewards                                          |
| `monsters/` | Monster lists and detail screens, weakness and hitzone panels                               |
| `maps/`     | Area maps, the world map, and the map screens the quest and area pages take their cues from |
