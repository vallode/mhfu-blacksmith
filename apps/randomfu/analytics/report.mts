/**
 * Prints what the site's analytics say: traffic, the builder's funnel, discs,
 * presets and changed options, failures and run times. It reads the
 * randomfu_events Analytics Engine dataset (worker.ts writes it) over
 * Cloudflare's SQL API.
 *
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… pnpm analytics [--days 7] [--host randomfu.vallode.com] [--testing]
 *
 * The token needs Account > Account Analytics > Read. --host keeps one
 * address (production, or a branch's preview); without it every host is
 * counted, and the first table says which there are. Visits with the
 * address's testing options (?debug, …) are left out unless --testing.
 *
 * Counts are of events, weighted by Analytics Engine's sampling
 * (`_sample_interval`); "sessions" are distinct browser-tab visits.
 */
import { parseArgs } from "node:util";
import { column, type BlobName, type DoubleName } from "./events.js";

const DATASET = "randomfu_events";

const { values: args } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    host: { type: "string" },
    testing: { type: "boolean", default: false },
  },
});
const days = Number(args.days);
if (!Number.isInteger(days) || days < 1 || days > 90) {
  throw new Error("--days is a whole number from 1 to 90 (Analytics Engine keeps 3 months)");
}
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read).");
  process.exit(1);
}

/** A column by its name in events.ts. */
const c = (name: BlobName | DoubleName) => column(name);
/** A string literal; only for the fixed strings here and a checked --host. */
const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;
if (args.host && !/^[a-z0-9.-]+(:\d+)?$/i.test(args.host)) {
  throw new Error("--host is a host name, like randomfu.vallode.com");
}
const n = "SUM(_sample_interval)";
const sessions = "COUNT(DISTINCT index1)";

const scope = [
  `timestamp > NOW() - INTERVAL '${days}' DAY`,
  ...(args.host ? [`${c("host")} = ${quote(args.host)}`] : []),
  ...(args.testing ? [] : [`${c("testing")} = ''`]),
].join(" AND ");

type Row = Record<string, string | number>;

async function sql(query: string): Promise<Row[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: `${query} FORMAT JSON`,
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Analytics Engine said ${response.status}: ${text}\n${query}`);
  return (JSON.parse(text) as { data: Row[] }).data;
}

/** Events of some kinds, in scope. */
function from(events: string[], extra = ""): string {
  const kinds = events.map(quote).join(", ");
  return `FROM ${DATASET} WHERE ${scope} AND ${c("event")} IN (${kinds})${extra ? ` AND ${extra}` : ""}`;
}

/** Prints a table; a query Analytics Engine refuses is reported, and the rest still print. */
async function table(title: string, query: Promise<Row[]> | Row[]): Promise<void> {
  let rows: Row[];
  try {
    rows = await query;
  } catch (error) {
    console.log(`\n${title}\n  (failed: ${(error as Error).message})`);
    return;
  }
  console.log(`\n${title}`);
  if (rows.length === 0) return console.log("  (nothing yet)");
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const num = typeof v === "number" ? v : Number(v);
    if (typeof v !== "string" || (v !== "" && Number.isFinite(num))) {
      return Number.isInteger(num) ? String(num) : num.toFixed(1);
    }
    return v === "" ? "–" : v;
  };
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => cell(r[k]).length)));
  const line = (values: string[]) =>
    `  ${values.map((v, i) => v.padEnd(widths[i]!)).join("  ")}`.trimEnd();
  console.log(line(keys));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const row of rows) console.log(line(keys.map((k) => cell(row[k]))));
}

console.log(
  `randomfu analytics, the last ${days} days${args.host ? ` on ${args.host}` : ""}` +
    (args.testing ? ", testing visits included" : ""),
);

// ---------------------------------------------------------------- traffic

const views = `${n} AS views, ${sessions} AS sessions`;
await table(
  "Hosts",
  sql(
    `SELECT ${c("host")} AS host, ${views} ${from(["pageview"])} GROUP BY host ORDER BY views DESC`,
  ),
);
await table(
  "Pages",
  sql(
    `SELECT ${c("page")} AS page, ${views} ${from(["pageview"])} GROUP BY page ORDER BY views DESC`,
  ),
);
await table(
  "By day",
  sql(
    `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, ${views} ${from(["pageview"])} GROUP BY day ORDER BY day`,
  ),
);
await table(
  "Referrers",
  sql(
    `SELECT ${c("referrer")} AS referrer, ${views} ${from(["pageview"], `${c("referrer")} != ''`)} GROUP BY referrer ORDER BY views DESC LIMIT 15`,
  ),
);
await table(
  "Countries",
  sql(
    `SELECT ${c("country")} AS country, ${sessions} AS sessions ${from(["pageview"])} GROUP BY country ORDER BY sessions DESC LIMIT 15`,
  ),
);
await table(
  "Devices",
  sql(
    `SELECT ${c("device")} AS device, ${c("os")} AS os, ${c("browser")} AS browser, ${sessions} AS sessions ${from(["pageview"])} GROUP BY device, os, browser ORDER BY sessions DESC LIMIT 15`,
  ),
);

// ---------------------------------------------------------------- the builder's funnel

async function funnel(): Promise<Row[]> {
  const steps = await sql(
    `SELECT ${c("detail")} AS step, AVG(${c("stepIndex")}) AS at, ${sessions} AS sessions ${from(["step"])} GROUP BY step ORDER BY at`,
  );
  const reached = async (events: string[], extra: string) =>
    Number((await sql(`SELECT ${sessions} AS sessions ${from(events, extra)}`))[0]?.sessions ?? 0);
  const stages: { stage: string; sessions: number }[] = [
    {
      stage: "opened the builder",
      sessions: await reached(["pageview"], `${c("page")} = 'build'`),
    },
    { stage: "supported disc", sessions: await reached(["disc"], `${c("ok")} = 1`) },
    ...steps.map((s) => ({ stage: `step: ${s.step}`, sessions: Number(s.sessions) })),
    { stage: "previewed", sessions: await reached(["run_done"], `${c("dryRun")} = 1`) },
    { stage: "randomized", sessions: await reached(["run_done"], `${c("dryRun")} = 0`) },
    {
      stage: "downloaded the ISO",
      sessions: await reached(["download"], `${c("detail")} = 'iso'`),
    },
  ];
  const top = stages[0]?.sessions || 1;
  return stages.map((f) => ({ ...f, of_builder: `${Math.round((f.sessions / top) * 100)}%` }));
}
await table("Funnel (sessions)", funnel());

await table(
  "How runs start (not previews)",
  sql(
    `SELECT ${c("detail")} AS via, ${n} AS runs ${from(["run_start"], `${c("dryRun")} = 0`)} GROUP BY via ORDER BY runs DESC`,
  ),
);

// ---------------------------------------------------------------- discs and settings

await table(
  "Discs checked",
  sql(
    `SELECT ${c("region")} AS region, ${c("discId")} AS disc, ${c("ok")} AS supported, ${sessions} AS sessions ${from(["disc"])} GROUP BY region, disc, supported ORDER BY sessions DESC`,
  ),
);
await table(
  "Presets of finished runs (not previews)",
  sql(
    `SELECT ${c("preset")} AS preset, ${c("base")} AS base, ${n} AS runs, AVG(${c("changedCount")}) AS options_changed ${from(["run_done"], `${c("dryRun")} = 0`)} GROUP BY preset, base ORDER BY runs DESC`,
  ),
);
await table(
  "Presets picked",
  sql(
    `SELECT ${c("preset")} AS preset, ${n} AS picks, ${sessions} AS sessions ${from(["preset"])} GROUP BY preset ORDER BY picks DESC`,
  ),
);

/** The most distinct lists a tally reads; past it, the tally is of the commonest lists only. */
const TALLY_ROWS = 10000;

/** The finished runs' comma-separated lists, counted item by item. */
async function tally(name: "changedGroups" | "changedKeys", limit: number): Promise<Row[]> {
  const rows = await sql(
    `SELECT ${c(name)} AS list, ${n} AS runs ${from(["run_done"], `${c("dryRun")} = 0`)} GROUP BY list ORDER BY runs DESC LIMIT ${TALLY_ROWS}`,
  );
  if (rows.length >= TALLY_ROWS) {
    console.log(`\n  (${name}: only the ${TALLY_ROWS} commonest combinations are counted)`);
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const item of String(row.list).split(",").filter(Boolean)) {
      counts.set(item, (counts.get(item) ?? 0) + Number(row.runs));
    }
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item, runs]) => ({ [name === "changedGroups" ? "step" : "option"]: item, runs }));
}
await table("Steps changed from the base preset (finished runs)", tally("changedGroups", 20));
await table("Options changed most (finished runs)", tally("changedKeys", 25));
await table(
  "Settings loaded",
  sql(
    `SELECT ${c("detail")} AS source, ${c("ok")} AS ok, ${n} AS loads ${from(["settings_load"])} GROUP BY source, ok ORDER BY loads DESC`,
  ),
);
await table(
  "Downloads and shares",
  sql(
    `SELECT ${c("event")} AS event, ${c("detail")} AS kind, ${n} AS clicks, ${sessions} AS sessions ${from(["download", "share"])} GROUP BY event, kind ORDER BY clicks DESC`,
  ),
);

// ---------------------------------------------------------------- failures

await table(
  "Failures",
  sql(
    `SELECT ${c("event")} AS event, ${c("detail")} AS detail, ${c("error")} AS error, ${n} AS times, ${sessions} AS sessions ` +
      `FROM ${DATASET} WHERE ${scope} AND (${c("event")} IN ('disc_error', 'run_error', 'js_error') OR (${c("event")} = 'settings_load' AND ${c("ok")} = 0)) ` +
      `GROUP BY event, detail, error ORDER BY times DESC LIMIT 25`,
  ),
);
await table(
  "Failures by build",
  sql(
    `SELECT ${c("version")} AS build, ${c("event")} AS event, ${n} AS times ${from(["disc_error", "run_error", "js_error"])} GROUP BY build, event ORDER BY times DESC LIMIT 15`,
  ),
);

// ---------------------------------------------------------------- timing

const quantiles = (name: DoubleName) =>
  `quantileWeighted(0.5, ${c(name)}, _sample_interval) / 1000 AS median_s, ` +
  `quantileWeighted(0.9, ${c(name)}, _sample_interval) / 1000 AS p90_s`;
await table(
  "Run times",
  sql(
    `SELECT ${c("dryRun")} AS preview, ${c("device")} AS device, ${n} AS runs, ${quantiles("ms")} ${from(["run_done"])} GROUP BY preview, device ORDER BY runs DESC`,
  ),
);
await table(
  "Run times by CPU cores (not previews)",
  sql(
    `SELECT ${c("cores")} AS cores, ${n} AS runs, ${quantiles("ms")} ${from(["run_done"], `${c("dryRun")} = 0`)} GROUP BY cores ORDER BY cores`,
  ),
);
await table(
  "Disc check times",
  sql(
    `SELECT ${c("device")} AS device, ${n} AS checks, ${quantiles("ms")} ${from(["disc", "disc_error"])} GROUP BY device ORDER BY checks DESC`,
  ),
);
