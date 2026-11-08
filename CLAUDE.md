# MHFU Blacksmith

Next.js (App Router, static export) site for Monster Hunter Freedom Unite data,
styled to look like the game's UI.

Checks: `pnpm lint`, `npx tsc --noEmit -p .`, `pnpm test`, `pnpm format:check`.

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
    `text-unavailable`, `bg-accent`, `border-hr`, `bg-line`
  - Game palettes (any colour utility: `text-`, `bg-`, `border-`, …):
    `rarity-{4..10}`, `gem-{blue,cyan,…}`, `note-{a,b,g,p,r,w,y}`,
    `sharpness-{1..7}`
  - In TS or inline styles, use the variable: `var(--color-rarity-7)`.
- **New values:** if a value is used in more than one place, add a token.
  A true one-off can be an arbitrary value (`bg-[#22281c]`).
- **The root font size is 62.5%,** so `1rem` = 10px. The spacing scale is
  4px per step (`--spacing: 0.4rem`): `p-4` = 16px, `gap-2` = 8px. Much of the
  existing code uses exact rem values (`text-[1.6rem]` = 16px); keep the sizes
  the game UI uses.
- **Type is BIZ UDGothic on the game's character pitch.** Its Latin glyphs
  are fixed width (0.5em), and `body` adds `--tracking-game` letter-spacing
  (14% of each element's own font size), so every character takes one
  0.64em cell like the game's text. Leave text on it unless a style needs
  its own spacing (uppercase headings, the dense hitzone table);
  `tracking-game` restores it.
- **Size text columns in character cells, not `ch`.** `1ch` is only the
  glyph; a cell is the glyph plus tracking (`--cell`). `w-cells-10` fits ten
  characters.
- **Phone layout uses the `mobile:` variant** (600px wide and below), which
  matches the original media queries. Use it rather than `sm:`/`md:`.

### Custom utilities

Effects that are awkward as class strings are `@utility` rules in
`globals.css`. They work with variants (`hover:before:hover-glow`).

| Utility                   | What it does                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `w-cells-N`               | Width of N character cells (`--cell`), e.g. `w-cells-12` for a 12-character label                      |
| `pixelated`               | Crisp pixel-art image rendering                                                                        |
| `hover-glow`              | Pulsing green highlight (with `animate-hover-glow` / `--gradient-hover-glow`)                          |
| `card-frame`              | The in-game 9-slice frame (`Card`, toasts)                                                             |
| `divider-tile`            | Tiled page-header divider (`BorderRule`)                                                               |
| `icon-mask`, `icon-badge` | Icon tint mask and corner badge, driven by CSS variables from `iconStyle()` in `src/lib/icon-style.ts` |

Animations: `animate-hover-glow`, `animate-toast-in`.

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
conflicting earlier one: `<Card className="overflow-auto py-7">`.

`tailwind-merge` only replaces a class with one of the same variant. `Card`
sets `text-[2.6rem] mobile:text-[2rem]`, so to change its font size everywhere
pass both, e.g. `text-[1.6rem] mobile:text-[1.6rem]`.

### Good to know

- **`hover:`** only applies on devices that can hover, so hover styles don't
  stick after a tap on phones.
- **Alpha colours** such as `text-white/60` compile to `oklab(…)` colours.
  They may differ from the old `rgba(…)` values by 1–2/255 in screenshots.
- **Prettier sorts classes:** the codebase is formatted with Prettier and
  `prettier-plugin-tailwindcss`, which also sorts classes in `cn()` calls.
  Run `pnpm format` before committing.

### Checking styling changes

There are no style tests, so check changes in a browser at desktop (1400px)
and phone (390px) widths.

For refactors that shouldn't change the look, compare against the previous
version: screenshots, or `getComputedStyle` of the affected elements. Some
UI only renders with a hunter save loaded. Drop
`test/fixtures/MHP2NDG.BIN` onto the upload card on `/hunter/` to load one.
