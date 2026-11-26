/**
 * A table of every variant's scores, latency and cost, from its
 * results.jsonl and errors.jsonl. Cost is each row's served model and usage
 * times _state.json's prices (cache writes 1.25× input, cache reads 0.1×).
 *
 *   tsx apps/discord-bot/eval/summary.ts .claude/hillclimb/sets-translation
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Row {
  prompt_id: string;
  rep: number;
  model: string;
  status: string;
  latency_s: number;
  usage?: Record<string, number>;
  cost_usd?: number;
  grade: Record<string, number>;
}

const flow = process.argv[2] ?? ".claude/hillclimb/sets-translation";
const state = JSON.parse(readFileSync(join(flow, "_state.json"), "utf8")) as {
  metrics: { id: string; label: string }[];
  prices: Record<string, { in: number; out: number }>;
};

const jsonl = (p: string) =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
    : [];

function cost(model: string, u: Record<string, number> = {}): number | null {
  const price = Object.entries(state.prices).find(([id]) => model.startsWith(id))?.[1];
  if (!price) return null;
  const input =
    (u.input_tokens ?? 0) +
    1.25 * (u.cache_creation_input_tokens ?? 0) +
    0.1 * (u.cache_read_input_tokens ?? 0);
  return (input * price.in + (u.output_tokens ?? 0) * price.out) / 1e6;
}

const variants = readdirSync(flow)
  .filter((d) => /^(baseline|v\d+)$/.test(d) && existsSync(join(flow, d, "results.jsonl")))
  .sort((a, b) => (a === "baseline" ? -1 : b === "baseline" ? 1 : +a.slice(1) - +b.slice(1)));

const head = [
  "Variant",
  "Model",
  "Cases",
  "Errors",
  ...state.metrics.map((m) => m.label),
  "Median s",
  "Cost/case",
  "Spent",
];
console.log(`| ${head.join(" | ")} |\n|${head.map(() => " --- ").join("|")}|`);
for (const v of variants) {
  const rows = jsonl(join(flow, v, "results.jsonl")) as Row[];
  // An error a later attempt replaced still cost what it cost, but isn't
  // an open error.
  const done = new Set(rows.map((r) => `${r.prompt_id}\0${r.rep}`));
  const errors = jsonl(join(flow, v, "errors.jsonl")) as Partial<Row>[];
  const open = new Set(errors.map((e) => `${e.prompt_id}\0${e.rep}`).filter((k) => !done.has(k)));
  const ok = rows.filter((r) => r.status === "ok");
  const pct = (id: string) =>
    ok.length
      ? `${Math.round((100 * ok.reduce((s, r) => s + (r.grade[id] ?? 0), 0)) / ok.length)}%`
      : "-";
  const lat = ok.map((r) => r.latency_s).sort((a, b) => a - b);
  const costs = [...rows, ...errors].map(
    (r) => r.cost_usd ?? (r.model ? cost(r.model, r.usage) : 0),
  );
  const priced = costs.every((c) => c !== null);
  const spent = costs.reduce<number>((s, c) => s + (c ?? 0), 0);
  const models = [...new Set(rows.map((r) => r.model))].join(", ");
  console.log(
    `| ${[
      v,
      models,
      rows.length,
      open.size,
      ...state.metrics.map((m) => pct(m.id)),
      lat.length ? lat[Math.floor(lat.length / 2)]!.toFixed(2) : "-",
      priced && rows.length ? `$${(spent / rows.length).toFixed(4)}` : "-",
      priced ? `$${spent.toFixed(3)}` : "-",
    ].join(" | ")} |`,
  );
}
