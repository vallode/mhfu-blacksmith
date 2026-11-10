# MHFU Blacksmith

Next.js (App Router, static export) site for Monster Hunter Freedom Unite data,
styled to look like the game's UI.

Lives in `apps/blacksmith` (see the root `CLAUDE.md` for the repository
layout); paths below are relative to it. It reads its game data from the root
`data/` through `DATA_DIR` (`src/lib/paths.ts`).

Checks (from `apps/blacksmith`): `pnpm lint`, `pnpm typecheck`, `pnpm test`;
and `pnpm format:check` from the repository root.

## Styling

Styling is Tailwind CSS v4. `src/app/globals.css` is the only stylesheet.

### Where styles go

- **Utilities in the markup.** Put Tailwind classes on the element they style.
  Don't add CSS or SCSS modules, and don't use `@apply`.
- **Reuse through components, not CSS.** When markup repeats, make a small
  component (see `src/components/DetailPanel.tsx`: `Stat`, `MaterialList`, …).
  For a class string shared by a few elements, use a named constant, either in
  the component file or in `src/styles/*.ts` (`tables.ts`, `settings.ts`,
  `progress.ts`).
- **`globals.css` holds only what utilities can't express:** design tokens
  (`@theme`), custom utilities (`@utility`), element resets, and the few
  global layout classes (`.split-page`, `.list-row`, `.blacksmith__title`).
- **Style elements directly; avoid descendant selectors.** Descendant variants
  (`[&_th]:text-warm`) are fine where the markup is generated in loops, as in
  the tables.

### Tokens

- **Colours and other design values live in the `@theme` block** in
  `globals.css`. Use their utilities instead of hex values:
  - UI: `text-gold`, `text-stat`, `text-positive`, `text-negative`,
    `text-element`, `text-warm`, `text-muted`, `text-parchment`,
    `text-unavailable`, `bg-accent`, `bg-selector`, `border-hr`, `bg-line`
  - Game palettes (any colour utility: `text-`, `bg-`, `border-`, …):
    `rarity-{4..10}`, `gem-{blue,cyan,…}`, `note-{a,b,g,p,r,w,y}`,
    `sharpness-{1..7}`
  - In TS or inline styles, use the variable: `var(--color-rarity-7)`.
- **New values:** if a value is used in more than one place, add a token.
  A true one-off can be an arbitrary value (`bg-[#22281c]`).
- **The root font size is 62.5%,** so `1rem` = 10px. The spacing scale is
  4px per step (`--spacing: 0.4rem`): `p-4` = 16px, `gap-2` = 8px.
- **Text comes in four sizes,** the `--text-*` tokens in `@theme`. Use these
  instead of `text-[…rem]`:
  - `text-main` (22px, 20px on phones up to 600px): the game's text.
    Lists, values, titles and selector bars; `Card`'s default.
  - `text-sub` (18px): labels, notices and set-builder rows.
  - `text-small` (16px): descriptions, tabs, meta lines and settings.
  - `text-fine` (14px): hints, badges and the dense hitzone table.

  Only display text (the home menu) and glyph-only buttons (`×`) size
  themselves. A new size goes into the scale, and into `cn()`'s list.

- **Type is BIZ UDGothic on the game's character pitch.** Its Latin glyphs
  are fixed width (0.5em), and `body` adds `--tracking-game` letter-spacing
  (14% of each element's own font size), so every character takes one
  0.64em cell like the game's text. Leave text on it unless a style needs
  its own spacing (uppercase headings, the dense hitzone table);
  `tracking-game` restores it.
- **Size text columns in character cells, not `ch`.** `1ch` is only the
  glyph; a cell is the glyph plus tracking (`--cell`). `w-cells-10` fits ten
  characters.
- **Layouts use the site's own width variants,** not `sm:`/`md:`:
  - `mobile:` (below 900px: phones and portrait tablets): one pane at a time,
    with the tab bar along the bottom.
  - `compact:` (900px to 1199px: landscape tablets, small laptops): two
    panes, with the sidebar an icon rail that opens over the page. The detail
    pane is about as narrow as a phone here, so dense content (hitzone and
    melody tables, two-across drop lists) usually takes its phone styling
    under `compact:` too.
  - `wide:` (1200px and up): the full sidebar, which the user can collapse.

  `text-main` steps down to 20px only on phones proper (600px and below).

### Custom utilities

Effects that are awkward as class strings are `@utility` rules in
`globals.css`. They work with variants (`hover:before:hover-glow`).

| Utility                   | What it does                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `w-cells-N`               | Width of N character cells (`--cell`), e.g. `w-cells-12` for a 12-character label                      |
| `pixelated`               | Crisp pixel-art image rendering                                                                        |
| `hover-glow`              | Pulsing green highlight (with `animate-hover-glow` / `--gradient-hover-glow`)                          |
| `card-frame`              | The in-game 9-slice frame (`Card`, toasts); with `frame-cover`, drawn again over the content           |
| `divider-tile`            | Tiled page-header divider (`BorderRule`)                                                               |
| `icon-mask`, `icon-badge` | Icon tint mask and corner badge, driven by CSS variables from `iconStyle()` in `src/lib/icon-style.ts` |

Animations: `animate-hover-glow`, `animate-toast-in`, `animate-loading-in` (the
delayed fade-in on `Loading`, the loading GIF next to a status message).

### Cascade rules (read before adding CSS)

- **Un-layered CSS beats every Tailwind utility,** whatever its specificity.
  Never add un-layered rules that set properties utilities may also set.
  - Element resets go in `@layer base` (modern-normalize, `a`, `hr`).
  - Component defaults go in `@layer components`. For example `.card-copy p`
    (one-line, tight paragraphs inside a `Card`) is there, so any utility on a
    paragraph overrides it.
- **Don't use `!important` (`text-gold!`).** If a utility doesn't apply, find
  the un-layered rule that wins and move it into a layer.
- **Don't put two utilities that set the same property on one element,**
  unless `cn()` resolves them. Tailwind orders utilities by its own rules,
  not by the order in your class string.

### `cn()` and overriding component defaults

`cn()` (`src/lib/cn.ts`) is `clsx` plus `tailwind-merge`. Components put their
defaults first and the caller's `className` last, so a later class replaces a
conflicting earlier one: `<Card className="flex-none text-small">`.

`Card` is two boxes: `className` styles the frame (its size and place in the
layout, its text size) and `bodyClassName` the content inside it (gaps,
direction). The body sits at the frame's outline and the frame draws over it,
so rows that run out to the edge pass under its notches. Give the body its
padding with the `card-p-*`, `card-px-*`, `card-py-*`, `card-pl-*` and
`card-pr-*` utilities (`card-py-7`, `card-px-[1.6rem]`), not `p-*`: they count
from the card's outer edge, whatever the frame. A card whose content scrolls
takes `scroll`.

`tailwind-merge` only replaces a class with one of the same variant: a
`mobile:` class only replaces another `mobile:` class. `cn()` is told the type
scale's names, so `text-main` and `text-gold` don't replace each other, and
`<Card className="text-small">` replaces `Card`'s `text-main` at every width.

### Good to know

- **`hover:`** only applies on devices that can hover, so hover styles don't
  stick after a tap on phones.
- **Alpha colours** such as `text-white/60` compile to `oklab(…)` colours.
  They may differ from the old `rgba(…)` values by 1–2/255 in screenshots.
- **Prettier sorts classes:** the codebase is formatted with Prettier and
  `prettier-plugin-tailwindcss`, which also sorts classes in `cn()` calls.
  Run `pnpm format` (from the root) before committing.

### Checking styling changes

There are no style tests, so check changes in a browser at desktop (1400px),
compact (900px and 1024px), tablet (768px) and phone (390px) widths.

For refactors that shouldn't change the look, compare against the previous
version: screenshots, or `getComputedStyle` of the affected elements. Some
UI only renders with a hunter save loaded. Drop
`test/fixtures/MHP2NDG.BIN` onto the upload card on `/hunter/` to load one.
