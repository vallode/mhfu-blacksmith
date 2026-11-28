/**
 * Checks every game's files under data/<game>/ against their JSON Schemas
 * in data/schemas/ (shared by every game), as they are on disk (records
 * with IDs; names in data/<game>/strings/). Exits with code 1 if any file
 * fails.
 */
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import { gameDataDir, schemasDir } from "game-data";
import { DATA_GAMES } from "game-data/games";
import { DATA_DIR } from "../src/lib/paths";

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));

let failed = false;
for (const game of DATA_GAMES) {
  const gameDir = gameDataDir(DATA_DIR, game);
  const jsonFiles = (dir: string) =>
    fs
      .readdirSync(path.join(gameDir, dir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => path.join(dir, f));
  const optional = (file: string) => (fs.existsSync(path.join(gameDir, file)) ? [file] : []);

  const checks: [label: string, schema: string, files: string[]][] = [
    ["weapons", "weapon", jsonFiles("weapons")],
    ["armor", "armor", jsonFiles("armor")],
    ["decorations", "decoration", optional("decorations.json")],
    ["monsters", "monster", jsonFiles("monsters")],
    ["quests", "quest", jsonFiles("quests")],
    ["gathering points", "gathering", optional("gathering.json")],
    ["shops", "shop", optional("shops.json")],
    ["items", "item", optional("items.json")],
    ["combinations", "combination", optional("combinations.json")],
    ["Veggie Elder trades", "veggie-trade", optional("veggie-trades.json")],
    ["Pokke Farm", "farm", optional("farm.json")],
    ["Guild Card awards", "award", optional("awards.json")],
    ["skills", "skill", optional("skills.json")],
    ["motion values", "motion-values", optional("motion-values.json")],
    ["string tables", "strings", jsonFiles("strings")],
    ["locales", "locale", fs.existsSync(path.join(gameDir, "locales")) ? jsonFiles("locales") : []],
  ];

  for (const [label, schemaName, files] of checks) {
    console.log(`Validating ${game} ${label}...`);
    const validate = ajv.compile(
      readJson(path.join(schemasDir(DATA_DIR), `${schemaName}.schema.json`)) as object,
    );
    for (const file of files) {
      if (validate(readJson(path.join(gameDir, file)))) {
        console.log(`  OK   data/${game}/${file}`);
        continue;
      }
      failed = true;
      const errors = validate.errors ?? [];
      console.log(`  FAIL data/${game}/${file} (${errors.length} error(s))`);
      for (const e of errors) console.log(`       ${e.instancePath || "(root)"}: ${e.message}`);
    }
  }
}

if (failed) {
  console.error("\nValidation failed. Fix the errors above before building.");
  process.exit(1);
}
console.log("\nAll files valid.");
