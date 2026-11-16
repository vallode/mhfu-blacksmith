# randomfu web app

randomfu's front end: the randomizer (`packages/randomfu`) as a static
web app that runs entirely in the browser. It's a step-by-step builder: pick your ISO, choose a seed and a
preset (or load a shared settings string), go through the options a group
at a time (Rewards, Gathering, Quests, Monsters, Smithy, Shops) or
skip them, review, and download the randomized ISO and spoiler log.
Nothing is uploaded.

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
pnpm test:e2e       # builds, then checks the app in Chromium against a Node run
pnpm social-card    # builds, then redraws social-card.png (needs Chromium)
```

Links to the app unfurl into a card (Discord, Bluesky, Slack, …) from the
Open Graph tags in `index.html`: its title and description, the site
green along Discord's edge, and `social-card.png`, a 1200×630 picture
drawn by the built page itself in the site's style. Redraw it with
`pnpm social-card` after changing the look or the card's wording, and
commit it. The tags need absolute URLs, so `build.mjs` fills in
`%SITE_URL%`: the `SITE_URL` environment variable if set (for a build
served elsewhere, such as a preview), `https://randomfu.vallode.com`
otherwise.

`dist/` is a plain static site: host it anywhere (GitHub Pages, Netlify,
any web server). It's deployed to [randomfu.vallode.com](https://randomfu.vallode.com)
as a Cloudflare Worker, configured by `wrangler.jsonc` here (see the root
README for how deploys run). Response headers are in `_headers`, which
`build.mjs` copies into `dist/`.

`index.html` sets a Content-Security-Policy: the page can only load its own
scripts, styles and images and can't make any requests, so nothing it reads
can leave the browser. A change that needs more (a font from elsewhere, a
fetch) has to loosen it; `pnpm test:e2e` fails on any violation.

How it works:

- The randomizer runs in a worker (`worker.ts`), which reads the ISO with
  `FileReaderSync`, so the shared code's synchronous reads work unchanged,
  and hands it to randomfu's `runRandomizer` (`src/run.ts`).
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
  checks the downloaded ISO is byte for byte what `runRandomizer` gives in
  Node for the same settings. It needs Playwright's Chromium.
- For testing in game, three address options change a run: `?poogie-test`
  makes a happy Poogie always give the rarest reward, `?loader-demo` adds
  the code loader with its demo blob (Guild Cards capped at 3, 1000z on
  every save load; see `packages/randomfu/docs/code-loader.md`), neither
  for play, and `?debug` adds research detail to the spoiler log (such as
  the monster names learned from quest text). They can go together
  (`?poogie-test&debug`).

It's licensed GPL-3.0-or-later like the rest of randomfu; the build ships
`LICENSE.txt`, and its source maps carry the full source.
