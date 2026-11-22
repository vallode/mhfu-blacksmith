/**
 * Every page's analytics (page.js, loaded by head.html before anything
 * else runs): a page view, and the page's uncaught errors. The builder sends its own events from app.ts.
 */
import { track, watchErrors } from "./client.js";

/** Where the visitor came from: a `?ref=`/`?utm_source=` name, or the referring site's host. */
function referrer(): string {
  const params = new URLSearchParams(location.search);
  const ref = params.get("ref") ?? params.get("utm_source");
  if (ref) return `ref:${ref}`;
  try {
    const host = document.referrer ? new URL(document.referrer).host : "";
    return host === location.host ? "" : host;
  } catch {
    return "";
  }
}

watchErrors();
track("pageview", { referrer: referrer() });
