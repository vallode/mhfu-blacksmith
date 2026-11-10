# randomfu web app

randomfu (`packages/randomfu`) as a static web app that runs entirely in
the browser. It's a step-by-step builder: pick your ISO, choose a seed and a
preset (or load a shared settings string), go through the options a group
at a time (Logic, Rewards, Gathering, Quests, Smithy, Shops), review, and download
the randomized ISO and spoiler log. Nothing is uploaded. Settings that
change the EBOOT decrypt the disc's own in the browser; only if that fails
does the app ask for a PPSSPP EBOOT dump.

The steps for options come from `OPTIONS`' sections (`OPTION_STEPS` in
`app.ts`); a section no step lists gets a step of its own, so new
options always show up. The page is styled after the MHFU Blacksmith site:
`build.mjs` reads the site's design tokens and in-game frames from
`apps/blacksmith/src/app/globals.css` and copies its font and sprites from
`apps/blacksmith/public/`, and `style.css` uses them.

```bash
# from apps/randomfu, or `pnpm --filter randomfu-web <script>` from the root
pnpm build          # builds dist/: index.html, app.js, worker.js
pnpm test           # unit tests (the browser shims)
pnpm test:e2e       # builds, then checks the app in Chromium against the CLI
```

`dist/` is a plain static site: host it anywhere (GitHub Pages, Netlify,
any web server). How it works:

- The randomizer runs in a worker (`worker.ts`) and reads the ISO with
  `FileReaderSync`, so the shared code's synchronous reads work unchanged.
- Writes go to an `OverlaySource` (randomfu's `src/disc/image.ts`): a 2 KB sector is
  copied into memory the first time it's written. The finished ISO is a
  Blob of slices of the user's own file plus the changed sectors, so the
  disc is never copied into memory (a few MB of changes for a full run).
- The Node-only modules the shared code imports are swapped for browser
  versions at build time (`shims/`): SHA-1/SHA-256 (tested against
  Node's), the vendored file list and name tables (embedded), and
  `Buffer` (the `buffer` package).
- The EBOOT is decrypted in-process (`mhfu-extract/src/container/prx.ts`,
  see its README), which runs in the worker as it does in Node.
- `pnpm test:e2e` walks through every step with a fixture disc whose EBOOT
  is encrypted like a real one, randomizes with every shuffle on, and
  checks the downloaded ISO is byte for byte the CLI's for the same
  settings; then a disc whose EBOOT can't be decrypted, with a dump
  instead. It needs Playwright's Chromium.
- CSO images aren't read in the browser yet: decompress to ISO first.

It's licensed GPL-3.0-or-later like the rest of randomfu; the build ships
`LICENSE.txt`, and its source maps carry the full source.
