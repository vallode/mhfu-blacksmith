/**
 * The site's Cloudflare Worker (wrangler.jsonc). The site is static, served
 * from out/ as assets; only the set builder runs this script first
 * (`run_worker_first`), so every other request stays a free static one.
 *
 * It gives shared sets (`/set-builder/?s=<code>`) their own link embeds: the
 * page is one static file for every set, so this decodes the code and
 * rewrites the page's title, description, image and colour meta tags with the
 * set's skills, defense, pieces and decorations (src/lib/set-embed.ts). It
 * also serves the set's oEmbed file, which gives Discord the line above the
 * title ("G Rank Blademaster Set"), like the detail pages' static ones.
 *
 * Anything else, or a code that doesn't open, gets the page as it is.
 */
import { SITE_NAME } from "../lib/embed-format";
import { SHARE_PARAM } from "../lib/set-codec";
import {
  SET_EMBED_DATA_PATH,
  setEmbedder,
  type SetEmbed,
  type SetEmbedData,
} from "../lib/set-embed";

// The few Workers runtime types used here. @cloudflare/workers-types would
// replace the DOM types the rest of the app is checked against.
interface Env {
  /** The static assets in out/. */
  ASSETS: { fetch(request: Request | URL): Promise<Response> };
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

/** The set builder's oEmbed file: `/set-builder/oembed.json?s=<code>`. */
const OEMBED_PATH = "/set-builder/oembed.json";

/** The embed data, loaded once per isolate (a retry after a failure). */
let embedder: Promise<(code: string) => SetEmbed | null> | null = null;

function loadEmbedder(env: Env, origin: string) {
  embedder ??= env.ASSETS.fetch(new URL(SET_EMBED_DATA_PATH, origin))
    .then((res) => {
      if (!res.ok) throw new Error(`${SET_EMBED_DATA_PATH}: ${res.status}`);
      return res.json() as Promise<SetEmbedData>;
    })
    .then(setEmbedder)
    .catch((e: unknown) => {
      embedder = null;
      throw e;
    });
  return embedder;
}

async function embedFor(env: Env, origin: string, code: string): Promise<SetEmbed | null> {
  try {
    return (await loadEmbedder(env, origin))(code);
  } catch (e) {
    console.error("Couldn't load the set embed data", e);
    return null;
  }
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
function rewritePage(page: Response, embed: SetEmbed, url: URL, code: string): Response {
  const shareUrl = new URL("/set-builder/", url.origin);
  shareUrl.searchParams.set(SHARE_PARAM, code);
  const image = new URL(embed.image.url, url.origin).href;
  const content: Record<string, string> = {
    'meta[name="description"]': embed.description,
    'meta[name="theme-color"]': embed.color,
    'meta[property="og:title"]': embed.title,
    'meta[property="og:description"]': embed.description,
    'meta[property="og:url"]': shareUrl.href,
    'meta[property="og:image"]': image,
    'meta[property="og:image:width"]': String(embed.image.width),
    'meta[property="og:image:height"]': String(embed.image.height),
    'meta[name="twitter:title"]': embed.title,
    'meta[name="twitter:description"]': embed.description,
    'meta[name="twitter:image"]': image,
    'meta[name="twitter:image:width"]': String(embed.image.width),
    'meta[name="twitter:image:height"]': String(embed.image.height),
  };
  let rewriter = new HTMLRewriter()
    .on("title", {
      element: (el) => el.setInnerContent(`${embed.author}: ${embed.title} — ${SITE_NAME}`),
    })
    .on("head", {
      element: (el) =>
        el.append(
          `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(oembedUrl(url.origin, code))}"/>`,
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get(SHARE_PARAM);
    if (!code || (request.method !== "GET" && request.method !== "HEAD")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === OEMBED_PATH) {
      const embed = await embedFor(env, url.origin, code);
      return embed ? oembedResponse(embed, url.origin) : new Response("Not found", { status: 404 });
    }

    const page = await env.ASSETS.fetch(request);
    if (!page.ok || !page.headers.get("Content-Type")?.startsWith("text/html")) return page;
    const embed = await embedFor(env, url.origin, code);
    return embed ? rewritePage(page, embed, url, code) : page;
  },
};

export default worker;
