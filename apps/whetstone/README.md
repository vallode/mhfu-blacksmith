# Whetstone web app

Whetstone's front end: the overhaul (`packages/whetstone`) as a static web
app that runs entirely in the browser. It has three pages: an about page
(`index.html`), a FAQ (`faq.html`), and the builder (`build.html`). The
builder goes step by step: pick your ISO, pick a preset (or load a shared
settings string or file), go through the mods a group at a time (Camera,
HUD, Quality of life, Monsters & Poogie, Boot & buttons) or skip them,
review, and download the patched ISO and its log. Nothing is uploaded.

The option steps and presets are in `steps.ts`: each step lists
`OptionDef.section`s of `WHETSTONE_OPTIONS`, and a section no step lists
gets a step of its own, so new options always show up. The presets only
pick option values; the defaults stay in the library, since randomfu's
settings strings depend on them.

The pages are styled after the MHFU Blacksmith site: `build.mjs` reads the
site's design tokens and in-game frames from
`apps/blacksmith/src/app/globals.css` and copies its font and sprites from
`apps/blacksmith/public/`, and `style.css` uses them. Every page starts its
`<head>` with `head.html` and its body with `masthead.html` (the wordmark
and the links between the pages), which `build.mjs` puts in place of
`<!--HEAD-->` and `<!--MASTHEAD-->`.

```bash
# from apps/whetstone, or `pnpm --filter whetstone-web <script>` from the root
pnpm build          # builds dist/: the three pages, app.js, worker.js
pnpm test           # unit tests (steps and presets, the browser shims, the node map preview)
```

`.claude/launch.json`'s `whetstone` entry builds and serves `dist/` on
port 3460. `dist/` is a plain static site: host it anywhere.
`head.html` sets every page's Content-Security-Policy: a page loads only
its own scripts, styles and images and connects nowhere.

How it works:

- Whetstone runs in a worker (`worker.ts`), which reads the ISO with
  `FileReaderSync`, so the shared code's synchronous reads work unchanged,
  and hands it to Whetstone's `runWhetstone` (`src/run.ts`).
- Writes go to an `OverlaySource` (`whetstone/src/disc/image.ts`). The
  finished ISO is a Blob of slices of the user's own file plus the changed
  sectors, so the disc is never copied into memory.
- The Node-only modules the shared code imports are swapped for browser
  versions at build time (`shims/`): SHA-1/SHA-256 (tested against Node's),
  the vendored file list and name tables (embedded), and `Buffer`.
- For testing in game, two address options change a run: `?poogie-test`
  makes a happy Poogie always give the rarest reward, and `?loader-demo`
  adds the code loader with its demo blob (see
  `packages/whetstone/docs/code-loader.md`). Neither is for play.

It's licensed GPL-3.0-or-later like the rest of Whetstone; the build ships
`LICENSE.txt`, and its source maps carry the full source.
