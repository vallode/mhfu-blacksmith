/**
 * Checks every file under data/ against its JSON Schema in data/schemas/.
 * Exits with code 1 if any file fails.
 */
import fs from "fs";
import path from "path";
import Ajv from "ajv";

const dataDir = path.join(process.cwd(), "data");
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));
const jsonFiles = (dir: string) =>
  fs
    .readdirSync(path.join(dataDir, dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));

const checks: [label: string, schema: string, files: string[]][] = [
  ["weapons", "weapon", jsonFiles("weapons")],
  ["armor", "armor", jsonFiles("armor")],
  ["decorations", "decoration", ["decorations.json"]],
  ["monsters", "monster", jsonFiles("monsters")],
  ["quests", "quest", jsonFiles("quests")],
  ["items", "item", ["items.json"]],
  ["equipment IDs", "equipment-ids", ["equipment-ids.json"]],
];

let failed = false;
for (const [label, schemaName, files] of checks) {
  console.log(`Validating ${label}...`);
  const validate = ajv.compile(
    readJson(path.join(dataDir, "schemas", `${schemaName}.schema.json`)) as object,
  );
  for (const file of files) {
    if (validate(readJson(path.join(dataDir, file)))) {
      console.log(`  OK   data/${file}`);
      continue;
    }
    failed = true;
    const errors = validate.errors ?? [];
    console.log(`  FAIL data/${file} (${errors.length} error(s))`);
    for (const e of errors) console.log(`       ${e.instancePath || "(root)"}: ${e.message}`);
  }
}

if (failed) {
  console.error("\nValidation failed. Fix the errors above before building.");
  process.exit(1);
}
console.log("\nAll files valid.");
