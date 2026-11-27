/**
 * The eval's offline checks, with no API call: the oracle (the expected
 * answers) must score 1 on every metric, and the keyword stub shows the
 * floor. `pnpm --filter discord-bot eval:check`
 */
import { METRICS, gradeCase, loadCases, runCase } from "./sets.js";

const cases = loadCases();
for (const model of ["oracle", "keyword"]) {
  const sums = Object.fromEntries(METRICS.map((m) => [m, 0]));
  const misses: string[] = [];
  for (const c of cases) {
    const { grade, explanation } = gradeCase(c, await runCase(c, { model }));
    for (const m of METRICS) sums[m] += grade[m as keyof typeof grade];
    if (!grade.all)
      misses.push(
        `  ${c.id}: ${Object.entries(grade)
          .filter(([k, v]) => k !== "all" && !v)
          .map(([k]) => k + (explanation[k] ? ` (${explanation[k]})` : ""))
          .join("; ")}`,
      );
  }
  console.log(`${model}: ` + METRICS.map((m) => `${m} ${sums[m]}/${cases.length}`).join(", "));
  if (model === "oracle" && sums.all !== cases.length) {
    console.log(misses.join("\n"));
    process.exitCode = 1;
  } else if (model === "keyword") console.log(misses.join("\n"));
}
