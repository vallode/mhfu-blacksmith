/**
 * The site's Cloudflare Worker (wrangler.jsonc). The site is static, served
 * from out/ as assets; only the set builder runs this script first
 * (`run_worker_first`), so every other request stays a static one.
 *
 * It gives shared sets (`/set-builder/?s=<code>`) their own link embeds. The
 * page is one static file for every set, so this decodes the code and
 * rewrites the page's meta tags (src/lib/set-embed.ts): the set's skills as
 * the title, its defense, resistances and bad skills as the description, and
 * its card as the image. It also serves:
 *
 * - `/set-builder/card.png?s=<code>&v=<version>`: the card, drawn with
 *   satori and resvg (src/lib/set-card.ts), and kept in Cloudflare's cache.
 *   `v` is the data and card version, so a new version gets a new image.
 * - `/set-builder/oembed.json?s=<code>`: the set's oEmbed file, which gives
 *   Discord the line above the title ("G-Rank Blademaster Set"), like the
 *   detail pages' static ones.
 *
 * Anything else, or a code that doesn't open, gets the page as it is.
 */
import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import satori, { init as initSatori } from "satori/wasm";
import initYoga from "yoga-wasm-web";
import yogaWasm from "yoga-wasm-web/dist/yoga.wasm";
import { SITE_NAME } from "../lib/embed-format";
import {
  CARD,
  SET_CARD_FONT,
  SET_CARD_FONT_PATH,
  SET_CARD_FRAME_PATH,
  SET_CARD_SPRITES_PATH,
  SET_CARD_VERSION,
  setCardTree,
  type CardSprites,
} from "../lib/set-card";
import { SHARE_PARAM } from "../lib/set-codec";
import {
  SET_EMBED_DATA_PATH,
  setReader,
  type SetEmbed,
  type SetEmbedData,
  type SetReader,
} from "../lib/set-embed";
import type { ReactNode } from "react";
import type { BuildSet } from "../lib/set-build";

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

const OEMBED_PATH = "/set-builder/oembed.json";
const CARD_PATH = "/set-builder/card.png";

/** Load something once per isolate; a failure is retried on the next request. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () =>
    (promise ??= load().catch((e: unknown) => {
      promise = null;
      throw e;
    }));
}

async function asset(env: Env, origin: string, path: string): Promise<Response> {
  const res = await env.ASSETS.fetch(new URL(path, origin));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res;
}

let embedData: (() => Promise<{ read: SetReader; version: string; data: SetEmbedData }>) | null =
  null;
const loadEmbedData = (env: Env, origin: string) =>
  (embedData ??= once(async () => {
    const data = (await (await asset(env, origin, SET_EMBED_DATA_PATH)).json()) as SetEmbedData;
    return { read: setReader(data), version: `${data.version}.${SET_CARD_VERSION}`, data };
  }))();

async function readCode(env: Env, origin: string, code: string) {
  try {
    const { read, version, data } = await loadEmbedData(env, origin);
    const r = read(code);
    return r && { ...r, version, trees: data.trees };
  } catch (e) {
    console.error("Couldn't load the set embed data", e);
    return null;
  }
}

function dataUri(bytes: ArrayBuffer, type: string): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** The card renderer: the WebAssembly modules, the font, the frame and sprites. */
let renderer:
  (() => Promise<(set: BuildSet, trees: SetEmbedData["trees"]) => Promise<Uint8Array>>) | null =
  null;
const loadRenderer = (env: Env, origin: string) =>
  (renderer ??= once(async () => {
    const [yoga, , font, frame, sprites] = await Promise.all([
      initYoga(yogaWasm),
      initResvg(resvgWasm),
      asset(env, origin, SET_CARD_FONT_PATH).then((r) => r.arrayBuffer()),
      asset(env, origin, SET_CARD_FRAME_PATH).then(async (r) =>
        dataUri(await r.arrayBuffer(), "image/png"),
      ),
      asset(env, origin, SET_CARD_SPRITES_PATH).then((r) => r.json() as Promise<CardSprites>),
    ]);
    initSatori(yoga);
    const fonts = [
      { name: SET_CARD_FONT, data: font, weight: 400 as const, style: "normal" as const },
    ];
    return async (set: BuildSet, trees: SetEmbedData["trees"]) => {
      const tree = setCardTree(set, trees, sprites, frame);
      // satori's types want a React element; the tree is the same shape.
      const svg = await satori(tree as unknown as ReactNode, {
        width: CARD.width,
        height: CARD.height,
        fonts,
      });
      return new Resvg(svg).render().asPng();
    };
  }))();

const cardUrl = (origin: string, code: string, version: string) => {
  const url = new URL(CARD_PATH, origin);
  url.searchParams.set(SHARE_PARAM, code);
  url.searchParams.set("v", version);
  return url;
};

/** The card image, from Cloudflare's cache or drawn now. */
async function cardResponse(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  code: string,
): Promise<Response> {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const r = await readCode(env, url.origin, code);
  if (!r) return new Response("Not found", { status: 404 });
  let png: Uint8Array;
  try {
    png = await (await loadRenderer(env, url.origin))(r.set, r.trees);
  } catch (e) {
    console.error("Couldn't draw the set card", e);
    return new Response("Couldn't draw the card", { status: 500 });
  }
  // A link to an older version still gets the current card, but not for long.
  const current = url.searchParams.get("v") === r.version;
  const res = new Response(png as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    },
  });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
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
  version: string,
): Response {
  const shareUrl = new URL("/set-builder/", url.origin);
  shareUrl.searchParams.set(SHARE_PARAM, code);
  const image = cardUrl(url.origin, code, version).href;
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
    rewriter = rewriter.on(selector, { element: (el) => el.setAttribute("content", value) });
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
    const code = url.searchParams.get(SHARE_PARAM);
    if (!code || (request.method !== "GET" && request.method !== "HEAD")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === CARD_PATH) return cardResponse(request, env, ctx, url, code);

    if (url.pathname === OEMBED_PATH) {
      const r = await readCode(env, url.origin, code);
      return r ? oembedResponse(r.embed, url.origin) : new Response("Not found", { status: 404 });
    }

    const page = await env.ASSETS.fetch(request);
    if (!page.ok || !page.headers.get("Content-Type")?.startsWith("text/html")) return page;
    const r = await readCode(env, url.origin, code);
    return r ? rewritePage(page, r.embed, url, code, r.version) : page;
  },
};

export default worker;
