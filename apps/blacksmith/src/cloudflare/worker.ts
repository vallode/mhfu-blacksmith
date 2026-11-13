/**
 * The site's Cloudflare Worker (wrangler.jsonc). The site is static, served
 * from out/ as assets; only the set builder and share links run this script
 * first (`run_worker_first`), so every other request stays a static one.
 *
 * It serves share links (`/sets/<code>/<slug>/`, src/lib/set-link.ts) the set
 * builder's page, and gives them, and the older `/set-builder/?s=<code>`,
 * their own link embeds. The page is one static file for every set, so this
 * decodes the code and rewrites the page's meta tags (src/lib/set-embed.ts):
 * the set's name (or its skills) as the title, its skill points as the
 * description, and its card as the image. It also serves:
 *
 * - `/set-builder/card.png?s=<code>&v=<version>`: the card, drawn with
 *   satori and resvg (src/lib/set-card.ts), and kept in Cloudflare's cache.
 *   `v` is the data and card version, so a new version gets a new image.
 * - `/set-builder/oembed.json?s=<code>`: the set's oEmbed file, which gives
 *   Discord the line above the title ("G-Rank Blademaster Set"), like the
 *   detail pages' static ones.
 *
 * Anything else, or a code that doesn't open, gets the page as it is. Which
 * of these a request gets is decided in routes.ts.
 */
import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import satori, { init as initSatori } from "satori/wasm";
import initYoga from "yoga-wasm-web";
import yogaWasm from "yoga-wasm-web/dist/yoga.wasm";
import { SITE_NAME } from "../lib/embed-format";
import {
  CARD,
  SET_CARD_ASSETS_PATH,
  SET_CARD_FONT,
  SET_CARD_FONT_PATH,
  SET_CARD_VERSION,
  setCardTree,
  type CardAssets,
} from "../lib/set-card";
import { SHARE_PARAM } from "../lib/set-codec";
import { sharePath } from "../lib/set-link";
import {
  buildSetEmbed,
  SET_EMBED_DATA_PATH,
  setReader,
  type SetEmbed,
  type SetEmbedData,
} from "../lib/set-embed";
import { builderPage, CARD_PATH, OEMBED_PATH, route } from "./routes";
import type { ReactNode } from "react";
import type { BuildSet } from "../lib/set-build";
import type { SkillTreeData } from "../lib/set-search";

// The few Workers runtime types used here. @cloudflare/workers-types would
// replace the DOM types the rest of the app is checked against.
interface Env {
  /** The static assets in out/. */
  ASSETS: { fetch(request: Request | URL): Promise<Response> };
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface RewriterElement {
  setAttribute(name: string, value: string): void;
  setInnerContent(content: string): void;
  append(content: string, options?: { html: boolean }): void;
}
declare class HTMLRewriter {
  on(selector: string, handlers: { element(element: RewriterElement): void }): HTMLRewriter;
  transform(response: Response): Response;
}
/** Cloudflare's cache for this zone. */
declare const caches: { default: Cache };

/**
 * Load something once per isolate, with the first call's arguments; a failure
 * is retried on the next call.
 */
function once<A extends unknown[], T>(
  load: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let promise: Promise<T> | null = null;
  return (...args) =>
    (promise ??= load(...args).catch((e: unknown) => {
      promise = null;
      throw e;
    }));
}

async function asset(env: Env, origin: string, path: string): Promise<Response> {
  const res = await env.ASSETS.fetch(new URL(path, origin));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res;
}

const loadEmbedData = once(async (env: Env, origin: string) => {
  const data = (await (await asset(env, origin, SET_EMBED_DATA_PATH)).json()) as SetEmbedData;
  return {
    read: setReader(data),
    version: `${data.version}.${SET_CARD_VERSION}`,
    trees: data.trees,
  };
});

/**
 * A share code's set, or null when the code doesn't open. Throws when the set
 * data can't be loaded, which is worth a retry (unavailable), not a 404.
 */
async function readCode(env: Env, origin: string, code: string) {
  const { read, version, trees } = await loadEmbedData(env, origin);
  const shared = read(code);
  return shared && { ...shared, version, trees };
}

/** A 503 for something that failed to load: clients retry instead of keeping a missing image. */
function unavailable(what: string, e: unknown): Response {
  console.error(`Couldn't load ${what}`, e);
  return new Response(`Couldn't load ${what}`, {
    status: 503,
    headers: { "Retry-After": "60", "Cache-Control": "no-store" },
  });
}

// Each WebAssembly module is set up on its own: resvg refuses a second
// initWasm, so a retry after a failed asset fetch mustn't run it again.
const initResvgOnce = once(() => initResvg(resvgWasm));
const initSatoriOnce = once(async () => initSatori(await initYoga(yogaWasm)));

/** The card's font, frame and sprites. */
const loadCardAssets = once(async (env: Env, origin: string) => {
  const [font, assets] = await Promise.all([
    asset(env, origin, SET_CARD_FONT_PATH).then((r) => r.arrayBuffer()),
    asset(env, origin, SET_CARD_ASSETS_PATH).then((r) => r.json() as Promise<CardAssets>),
  ]);
  const fonts = [
    { name: SET_CARD_FONT, data: font, weight: 400 as const, style: "normal" as const },
  ];
  return { fonts, assets };
});

/** The card for a set, as a PNG. */
async function drawCard(
  env: Env,
  origin: string,
  set: BuildSet,
  trees: SkillTreeData[],
): Promise<Uint8Array> {
  const [{ fonts, assets }] = await Promise.all([
    loadCardAssets(env, origin),
    initResvgOnce(),
    initSatoriOnce(),
  ]);
  const tree = setCardTree(set, trees, assets.sprites, assets.frame);
  // satori's types want a React element; the tree is the same shape.
  const svg = await satori(tree as unknown as ReactNode, {
    width: CARD.width,
    height: CARD.height,
    fonts,
  });
  return new Resvg(svg).render().asPng();
}

const cardUrl = (origin: string, code: string, version: string) => {
  const url = new URL(CARD_PATH, origin);
  url.searchParams.set(SHARE_PARAM, code);
  url.searchParams.set("v", version);
  return url;
};

/**
 * The card image, from Cloudflare's cache or drawn now. The cache key is the
 * card's canonical URL (the code without its name, the current version, no
 * other parameters), so each set is drawn once per version whatever URL asks
 * for it, and a HEAD request is answered from the same entry.
 */
async function cardResponse(
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  code: string,
): Promise<Response> {
  let r;
  try {
    r = await readCode(env, url.origin, code);
  } catch (e) {
    return unavailable("the set data", e);
  }
  if (!r) return new Response("Not found", { status: 404 });
  const key = new Request(cardUrl(url.origin, r.canonical, r.version));

  const cache = caches.default;
  let res = await cache.match(key);
  if (!res) {
    let png: Uint8Array;
    try {
      png = await drawCard(env, url.origin, r.set, r.trees);
    } catch (e) {
      return unavailable("the set card", e);
    }
    res = new Response(png as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  // A link to an older version still gets the current card, but not for long.
  if (url.searchParams.get("v") === r.version) return res;
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(res.body, { status: res.status, headers });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const oembedUrl = (origin: string, code: string) => {
  const url = new URL(OEMBED_PATH, origin);
  url.searchParams.set(SHARE_PARAM, code);
  return url.href;
};

/** The set's oEmbed file, the same shape as the detail pages' (seo.ts oembedJson). */
function oembedResponse(embed: SetEmbed, origin: string): Response {
  const body = {
    version: "1.0",
    type: "link",
    provider_name: SITE_NAME,
    provider_url: `${origin}/`,
    author_name: embed.author,
    author_url: `${origin}/set-builder/`,
  };
  return Response.json(body, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

/** The page with the set's embed in its meta tags. */
function rewritePage(
  page: Response,
  embed: SetEmbed,
  url: URL,
  code: string,
  shared: { canonical: string; version: string; name?: string },
): Response {
  const shareUrl = new URL(sharePath(code, shared.name), url.origin);
  // The card doesn't show the name, so every name for a set shares one image URL.
  const image = cardUrl(url.origin, shared.canonical, shared.version).href;
  const content: Record<string, string> = {
    'meta[name="description"]': embed.description,
    'meta[name="theme-color"]': embed.color,
    'meta[property="og:title"]': embed.title,
    'meta[property="og:description"]': embed.description,
    'meta[property="og:url"]': shareUrl.href,
    'meta[property="og:image"]': image,
    'meta[property="og:image:width"]': String(CARD.width),
    'meta[property="og:image:height"]': String(CARD.height),
    // A large image under the text, instead of a thumbnail beside it.
    'meta[name="twitter:card"]': "summary_large_image",
    'meta[name="twitter:title"]': embed.title,
    'meta[name="twitter:description"]': embed.description,
    'meta[name="twitter:image"]': image,
    'meta[name="twitter:image:width"]': String(CARD.width),
    'meta[name="twitter:image:height"]': String(CARD.height),
  };
  const tag = (name: string, attrs: string) => `<${name} ${attrs}/>`;
  let rewriter = new HTMLRewriter()
    .on("title", {
      element: (el) => el.setInnerContent(`${embed.author}: ${embed.title} — ${SITE_NAME}`),
    })
    .on("head", {
      element: (el) =>
        el.append(
          [
            tag(
              "link",
              `rel="alternate" type="application/json+oembed" href="${escapeHtml(oembedUrl(url.origin, code))}"`,
            ),
            tag("meta", `property="og:image:alt" content="${escapeHtml(embed.details)}"`),
            tag("meta", `name="twitter:image:alt" content="${escapeHtml(embed.details)}"`),
          ].join(""),
          { html: true },
        ),
    });
  for (const [selector, value] of Object.entries(content)) {
    // setAttribute escapes quotes but not &, so a name with "&amp;" in it
    // would be read back as "&".
    const escaped = value.replace(/&/g, "&amp;");
    rewriter = rewriter.on(selector, { element: (el) => el.setAttribute("content", escaped) });
  }
  const out = rewriter.transform(page);
  // The static file's ETag would let a revalidation answer 304 for a
  // different body.
  const headers = new Headers(out.headers);
  headers.delete("ETag");
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const target = route(url, request.method);
    if (target.kind === "asset") return env.ASSETS.fetch(request);
    const { code } = target;

    if (target.kind === "card") return cardResponse(env, ctx, url, code);

    if (target.kind === "oembed") {
      let r;
      try {
        r = await readCode(env, url.origin, code);
      } catch (e) {
        return unavailable("the set data", e);
      }
      const embed = r && buildSetEmbed(r.set, r.trees, r.name);
      return embed ? oembedResponse(embed, url.origin) : new Response("Not found", { status: 404 });
    }

    const page = await env.ASSETS.fetch(target.shareLink ? builderPage(request) : request);
    if (!page.ok || !page.headers.get("Content-Type")?.startsWith("text/html")) return page;
    let r;
    try {
      r = await readCode(env, url.origin, code);
    } catch (e) {
      // The page still opens the set; it just goes out with the generic
      // embed, uncached, so the next fetch tries again.
      console.error("Couldn't load the set data", e);
      const headers = new Headers(page.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(page.body, { status: page.status, headers });
    }
    const embed = r && buildSetEmbed(r.set, r.trees, r.name);
    return r && embed ? rewritePage(page, embed, url, code, r) : page;
  },
};

export default worker;
