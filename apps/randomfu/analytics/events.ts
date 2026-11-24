/**
 * What the site counts, shared by the pages (client.ts), the Worker that
 * stores it (worker.ts, collect.ts) and the report (report.mts).
 *
 * Every event is one Workers Analytics Engine data point with the same
 * layout: up to 20 strings (`blob1`…`blob20`) and 20 numbers
 * (`double1`…`double20`), in the order of BLOBS and DOUBLES, so a column
 * always means the same thing whatever the event. The index (what
 * Analytics Engine samples by) is the session, so a sampled visit keeps all
 * of its events.
 *
 * Nothing here comes from the user's files: the disc is described only by
 * what the check tells the page (its ID and region) and its size.
 */

/** Where the pages send events: next to them, so `e` from any page is `/e`. */
export const EVENT_PATH = "/e";

export const EVENTS = [
  /** A page was opened. `referrer`, `screenWidth`. */
  "pageview",
  /** A builder step was shown for the first time this visit. `detail` = step id, `stepIndex`. */
  "step",
  /** The disc was checked. `region`, `discId`, `ok` = supported, `ms`, `sizeMb`. */
  "disc",
  /** The disc couldn't be read. `error`, `ms`, `sizeMb`. */
  "disc_error",
  /** A preset was picked. `preset`. */
  "preset",
  /** Settings were loaded. `detail` = string or file, `ok`, `error`. */
  "settings_load",
  /** A run started. `detail` = how (quick, review, preview), `dryRun`, the settings columns. */
  "run_start",
  /** A run finished. `ms`, `problems`, `dryRun`, the settings columns. */
  "run_done",
  /** A run failed. `error`, `ms`, `dryRun`. */
  "run_error",
  /** A download link was clicked. `detail` = iso, spoiler or settings. */
  "download",
  /** The settings string was copied. `detail` = copy. */
  "share",
  /** An uncaught error on the page or in its worker. `error`, `detail` = where. */
  "js_error",
] as const;
export type EventName = (typeof EVENTS)[number];

/** The string columns, blob1 onwards. */
export const BLOBS = [
  "event",
  /** about, faq or build. */
  "page",
  /** A random ID for one browser tab's visit (sessionStorage), never kept past it. */
  "session",
  /** Set by the Worker: the address it was served at (production or a preview). */
  "host",
  /** Set by the Worker: Cloudflare's two-letter country code. */
  "country",
  /** Set by the Worker from the User-Agent: desktop, mobile or tablet. */
  "device",
  /** Set by the Worker from the User-Agent. */
  "browser",
  /** Set by the Worker from the User-Agent. */
  "os",
  /** The referring site's host, or `ref:<name>` from a `?ref=` or `?utm_source=` link. */
  "referrer",
  /** The disc's region (eu, jp, …), once checked. */
  "region",
  /** The disc's ID (ULES01213, …), once checked. */
  "discId",
  /** The preset the settings match, or `custom`. */
  "preset",
  /** The last preset picked, which `changedGroups` and `changedKeys` compare with, or `defaults`. */
  "base",
  /** The builder steps (rewards, quests, …) with an option changed from `base`, comma-separated. */
  "changedGroups",
  /** The options changed from `base`, comma-separated. */
  "changedKeys",
  /** What the event is about: a step, how a run started, a download's kind, … */
  "detail",
  /** An error's message. */
  "error",
  /** The full settings string (seed included), for any question the other columns can't answer. */
  "settings",
  /** The build (commit) and randomfu's logic version: `<commit> v<logic>`. */
  "version",
  /** The address's testing options (debug, poogie-test, loader-demo), comma-separated. */
  "testing",
] as const;

/** The number columns, double1 onwards. */
export const DOUBLES = [
  /** How long it took, in milliseconds. */
  "ms",
  /** 1 for a preview run. */
  "dryRun",
  /** 1 if it worked (a supported disc, settings that loaded). */
  "ok",
  /** The disc's size in MB. */
  "sizeMb",
  /** Recipe warnings in a finished run. */
  "problems",
  /** The step's place in the step bar, from 0. */
  "stepIndex",
  /** navigator.hardwareConcurrency. */
  "cores",
  /** navigator.deviceMemory, in GB (Chromium only, capped at 8). */
  "memoryGb",
  /** The screen's width in CSS pixels. */
  "screenWidth",
  /** How many options differ from `base`. */
  "changedCount",
] as const;

export type BlobName = (typeof BLOBS)[number];
export type DoubleName = (typeof DOUBLES)[number];

/** Columns the Worker fills in, which the page doesn't send. */
export const SERVER_BLOBS = ["host", "country", "device", "browser", "os"] as const;
type ServerBlob = (typeof SERVER_BLOBS)[number];

/** What the page sends: the event and any of its columns. */
export type EventBody = { event: EventName } & Partial<
  Record<Exclude<BlobName, "event" | ServerBlob>, string> & Record<DoubleName, number | boolean>
>;

/**
 * The most UTF-8 bytes a string column may take; anything longer is cut.
 * Settings strings reach about 2800 bytes (Chaos) and every option key
 * together about 2400. At their limits all twenty columns come to 9340
 * bytes, under Analytics Engine's 16 KB of blobs per data point.
 */
export const BLOB_LIMITS: Partial<Record<BlobName, number>> = {
  changedKeys: 3000,
  settings: 4000,
  error: 300,
};
/** Comma-separated columns: cut at the last whole item, never in the middle of one. */
export const LIST_BLOBS: readonly BlobName[] = ["changedGroups", "changedKeys", "testing"];
export const DEFAULT_BLOB_LIMIT = 120;

/** A column's name in Analytics Engine's SQL: `blob3`, `double1`. */
export function column(name: BlobName | DoubleName): string {
  const blob = (BLOBS as readonly string[]).indexOf(name);
  if (blob >= 0) return `blob${blob + 1}`;
  return `double${(DOUBLES as readonly string[]).indexOf(name) + 1}`;
}
