/**
 * `extract` for an MHF2 unpack: reads its equipment tables (games/mhp2.ts)
 * and writes them as numbers-only JSON, one file per table, with a manifest
 * of the checks. No names yet: those are in MHF2's own message files, and
 * MHFU's name lists don't line up with MHF2's IDs. The output is not the
 * site's `data/` shape.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import { checkMhp2Tables, MHP2_EU_TABLES, readMhp2Tables, type Mhp2Check } from "../games/mhp2.js";
import { ARMOR_SLOTS } from "../tables/armor.js";
import { manifestGame, type UnpackManifest } from "./unpack.js";

export interface Mhp2ExtractionManifest {
  game: "mhp2";
  region: string;
  discId: string;
  extractedAt: string;
  checks: Mhp2Check[];
  counts: Record<string, number>;
  /** Where each table was read from, as hex file offsets in eboot.bin. */
  offsets: Record<string, string>;
}

export async function runExtractMhp2(options: {
  unpacked: string;
  out: string;
}): Promise<Mhp2ExtractionManifest> {
  const manifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  ) as UnpackManifest;
  if (manifestGame(manifest) !== "mhp2") {
    throw new Error(`${options.unpacked} is not an MHF2 unpack.`);
  }
  if (manifest.region !== "eu") {
    throw new Error(
      `MHF2 table offsets are known for the EU disc (ULES00851) only, not ${manifest.region.toUpperCase()} (${manifest.discId}). Run table-probe on it to find them.`,
    );
  }
  if (manifest.eboot === false) {
    throw new Error(`${options.unpacked} was unpacked with --skip-eboot, so it has no eboot.bin.`);
  }
  const reader = new BinaryReader(await readFile(path.join(options.unpacked, "eboot.bin")));
  const tables = readMhp2Tables(reader);
  const checks = checkMhp2Tables(reader, tables);
  for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  if (!checks[0]!.ok) {
    throw new Error("This EBOOT isn't the EU MHF2 one the table offsets were found in.");
  }

  await mkdir(options.out, { recursive: true });
  const files: Record<string, unknown> = {
    "weapon-class-modifiers.json": tables.weaponClassModifiers,
    "weapons-blademaster.json": tables.blademaster,
    "weapons-gunner.json": tables.gunner,
    "sharpness.json": tables.sharpness,
    "items.json": tables.items,
    "decoration-values.json": tables.decorationValues,
    "decoration-skills.json": tables.decorationSkills,
    ...Object.fromEntries(ARMOR_SLOTS.map((slot) => [`armor-${slot}.json`, tables.armor[slot]])),
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(path.join(options.out, name), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  const result: Mhp2ExtractionManifest = {
    game: "mhp2",
    region: manifest.region,
    discId: manifest.discId,
    extractedAt: new Date().toISOString(),
    checks,
    counts: Object.fromEntries(
      Object.entries(files).map(([name, value]) => [name, (value as unknown[]).length]),
    ),
    offsets: Object.fromEntries(
      Object.entries(MHP2_EU_TABLES).map(([name, t]) => [name, `0x${t.offset.toString(16)}`]),
    ),
  };
  await writeFile(
    path.join(options.out, "EXTRACTION.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf-8",
  );
  console.log(`Wrote ${Object.keys(files).length} tables and EXTRACTION.json to ${options.out}`);
  return result;
}
