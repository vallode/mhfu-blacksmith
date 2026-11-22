/**
 * randomfu's Cloudflare Worker (wrangler.jsonc). The site is static assets;
 * only EVENT_PATH runs this script (`run_worker_first`), so every page,
 * script and image stays a free static request.
 *
 * It takes the pages' events (client.ts) and writes each to the EVENTS
 * Analytics Engine dataset (collect.ts decides what's kept). Without the
 * binding (a local `wrangler dev` with none set up) it accepts and drops
 * them. `pnpm analytics` reads them back (report.mts). Each address may send
 * 1500 events a minute (LIMITER): a coarse flood guard, high enough for many
 * visitors sharing one address (mobile networks, campuses, VPNs), so a
 * script can't flood the dataset. A refused request still runs this script
 * and counts against the Worker's daily requests, so it doesn't protect
 * those; a WAF rate-limiting rule in front of /e would. A script can still
 * send plausible events slowly, as with any analytics endpoint.
 */
import { MAX_BODY, toDataPoint, type DataPoint } from "./collect.js";
import { EVENT_PATH } from "./events.js";

// The few Workers runtime types used here; @cloudflare/workers-types would
// replace the DOM types the rest of the app is checked against.
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  EVENTS?: { writeDataPoint(point: DataPoint): void };
  /** Events per minute from one address (wrangler.jsonc); the address isn't stored. */
  LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const empty = (status: number) => new Response(null, { status });

async function collect(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return empty(405);
  // Events come from the site's own pages.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return empty(403);
  const address = request.headers.get("cf-connecting-ip");
  if (address && env.LIMITER) {
    let allowed = true;
    try {
      allowed = (await env.LIMITER.limit({ key: address })).success;
    } catch (error) {
      // The limiter failing lets events through rather than dropping them.
      console.error("rate limit failed", error);
    }
    if (!allowed) return empty(429);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return empty(413);
  const text = await request.text();
  if (text.length > MAX_BODY) return empty(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return empty(400);
  }
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  const point = toDataPoint(body, {
    host: new URL(request.url).host,
    country: cf?.country ?? "",
    userAgent: request.headers.get("user-agent") ?? "",
  });
  try {
    if (point) env.EVENTS?.writeDataPoint(point);
  } catch (error) {
    // An event Analytics Engine refuses is dropped; the page doesn't wait on it anyway.
    console.error("writeDataPoint failed", error);
  }
  return empty(204);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === EVENT_PATH) return collect(request, env);
    return env.ASSETS.fetch(request);
  },
};
