/**
 * Reports the earliest quest progress needed for each weapon, armor piece and decoration
 * (see src/lib/min-rank.ts), to audit the derivation.
 * Usage: tsx scripts/compute-min-rank.ts [out.json]
 */
import fs from "fs";
import path from "path";
import { loadMinRanks, type Recipes } from "./lib/min-rank-data";
import type { Progress } from "../src/lib/min-rank";

const dataDir = path.join(process.cwd(), "data");
const ranks = loadMinRanks(dataDir);

const weapons: Record<string, Record<string, Progress>> = {};
for (const file of fs.readdirSync(path.join(dataDir, "weapons"))) {
  const type = file.replace(/\.json$/, "");
  const list = JSON.parse(fs.readFileSync(path.join(dataDir, "weapons", file), "utf-8")) as {
    weapons: { name: string }[];
  };
  weapons[type] = Object.fromEntries(list.weapons.map((w) => [w.name, ranks.weapon(type, w.name)]));
}

const armor: Record<string, Record<string, Progress>> = {};
for (const file of fs.readdirSync(path.join(dataDir, "armor"))) {
  const slot = file.replace(/\.json$/, "");
  const list = JSON.parse(fs.readFileSync(path.join(dataDir, "armor", file), "utf-8")) as {
    armor: ({ name: string } & Recipes)[];
  };
  armor[slot] = Object.fromEntries(list.armor.map((p) => [p.name, ranks.armor(p)]));
}

const decorations: Record<string, Progress> = Object.fromEntries(
  (
    JSON.parse(fs.readFileSync(path.join(dataDir, "decorations.json"), "utf-8")) as {
      decorations: ({ name: string } & Recipes)[];
    }
  ).decorations.map((d) => [d.name, ranks.decoration(d)]),
);

const summarize = (group: Record<string, Record<string, Progress>>) => {
  const counts: Record<string, number> = {};
  for (const items of Object.values(group))
    for (const p of Object.values(items)) {
      const r = p?.rank ?? "unreachable";
      counts[r] = (counts[r] ?? 0) + 1;
    }
  return counts;
};

console.log("sources:", ranks.sourceCount, "items with a known source");
console.log("weapons by minRank:", summarize(weapons));
console.log("armor by minRank:", summarize(armor));
console.log("decorations by minRank:", summarize({ decorations }));
console.log("materials with no source:", ranks.unsourced.size);

const out = process.argv[2];
if (out) {
  fs.writeFileSync(
    out,
    JSON.stringify(
      { weapons, armor, decorations, unsourced: [...ranks.unsourced].sort() },
      null,
      1,
    ),
  );
  console.log("wrote", out);
}
