/**
 * Turns an event the page sent into an Analytics Engine data point
 * (events.ts has the layout), adding what only the Worker knows: the host,
 * the country, and the device, browser and OS read from the User-Agent.
 * The User-Agent itself and the IP address aren't kept. Anything that isn't
 * one of EVENTS, or comes from a bot, gives null and isn't stored.
 */
import {
  BLOBS,
  BLOB_LIMITS,
  DEFAULT_BLOB_LIMIT,
  DOUBLES,
  EVENTS,
  LIST_BLOBS,
  SERVER_BLOBS,
  type BlobName,
} from "./events.js";

export interface DataPoint {
  blobs: string[];
  doubles: number[];
  indexes: string[];
}

export interface RequestFacts {
  host: string;
  country: string;
  userAgent: string;
}

/** Bodies longer than this are refused before parsing. */
export const MAX_BODY = 16384;

const BOTS =
  /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|curl|wget|python|node-fetch|axios|go-http/i;

export function isBot(userAgent: string): boolean {
  return !userAgent || BOTS.test(userAgent);
}

export function device(userAgent: string): string {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function browser(userAgent: string): string {
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/SamsungBrowser\//.test(userAgent)) return "Samsung";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "other";
}

export function os(userAgent: string): string {
  if (/Windows/.test(userAgent)) return "Windows";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "macOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "other";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `text` cut to at most `limit` UTF-8 bytes, never in the middle of a character. */
export function cutBytes(text: string, limit: number): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return text;
  let end = limit;
  // Back up to the start of a character (continuation bytes are 10xxxxxx).
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return decoder.decode(bytes.subarray(0, end));
}

export function toDataPoint(body: unknown, facts: RequestFacts): DataPoint | null {
  if (isBot(facts.userAgent)) return null;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const sent = body as Record<string, unknown>;
  if (!(EVENTS as readonly unknown[]).includes(sent.event)) return null;

  const server: Record<(typeof SERVER_BLOBS)[number], string> = {
    host: facts.host,
    country: facts.country,
    device: device(facts.userAgent),
    browser: browser(facts.userAgent),
    os: os(facts.userAgent),
  };
  const blobs = BLOBS.map((name: BlobName) => {
    const value = name in server ? server[name as keyof typeof server] : sent[name];
    if (typeof value !== "string") return "";
    const cut = cutBytes(value, BLOB_LIMITS[name] ?? DEFAULT_BLOB_LIMIT);
    if (cut === value || !LIST_BLOBS.includes(name)) return cut;
    return cut.slice(0, Math.max(0, cut.lastIndexOf(",")));
  });
  const doubles = DOUBLES.map((name) => {
    const value = sent[name];
    if (typeof value === "boolean") return value ? 1 : 0;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  const session = typeof sent.session === "string" ? sent.session.slice(0, 32) : "";
  return { blobs, doubles, indexes: [session] };
}
