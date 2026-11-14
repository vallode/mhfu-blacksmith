/**
 * `extract` for an MHF2 unpack: reads its equipment tables (games/mhp2.ts)
 * and their English names and descriptions from MHF2's own message files
 * (games/mhp2-text.ts), and writes them as JSON, one file per table, with a
 * manifest of the checks. The output is not the site's `data/` shape yet.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import {
  checkMhp2Tables,
  MHP2_EU_TABLES,
  MHP2_REGULAR_ITEMS,
  readMhp2Tables,
  type Mhp2Check,
} from "../games/mhp2.js";
import { MHP2_EU_MESSAGE_FILES, readMhp2Text } from "../games/mhp2-text.js";
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
  if (!checks[0]!.ok) {
    for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
    throw new Error("This EBOOT isn't the EU MHF2 one the table offsets were found in.");
  }

  const messageFiles = await Promise.all(
    MHP2_EU_MESSAGE_FILES.map((i) =>
      readFile(path.join(options.unpacked, "data-bin", "_unindexed", `${i}.bin`)),
    ),
  );
  const { text, checks: textChecks } = readMhp2Text(messageFiles, {
    items: tables.items.length,
    blademaster: tables.blademaster.length,
    gunner: tables.gunner.length,
    head: tables.armor.head.length,
    chest: tables.armor.chest.length,
    arm: tables.armor.arm.length,
    waist: tables.armor.waist.length,
    leg: tables.armor.leg.length,
  });
  checks.push(...textChecks);
  for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  // `placeholder`: named like entry 0 ("Nothing equipped."), as unused slots are.
  const named = <T extends { index: number }>(rows: T[], kind: keyof typeof text, offset = 0) =>
    rows.map((row) => {
      const name = text[kind].names[offset + row.index] ?? null;
      return {
        name,
        description: text[kind].descriptions[offset + row.index] ?? null,
        placeholder: name === text[kind].names[0],
        ...row,
      };
    });

  await mkdir(options.out, { recursive: true });
  const files: Record<string, unknown> = {
    "weapon-class-modifiers.json": tables.weaponClassModifiers,
    "weapons-blademaster.json": named(tables.blademaster, "blademaster"),
    "weapons-gunner.json": named(tables.gunner, "gunner"),
    "sharpness.json": tables.sharpness,
    "items.json": named(tables.items, "items"),
    // Decoration d is item ID 713 + d, as in MHFU (948 + d there).
    "decoration-values.json": named(tables.decorationValues, "items", MHP2_REGULAR_ITEMS),
    "decoration-skills.json": tables.decorationSkills,
    ...Object.fromEntries(
      ARMOR_SLOTS.map((slot) => [`armor-${slot}.json`, named(tables.armor[slot], slot)]),
    ),
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
