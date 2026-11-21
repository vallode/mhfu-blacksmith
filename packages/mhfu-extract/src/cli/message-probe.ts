/**
 * `message-probe` subcommand: lists every message file in an unpack with its
 * tables' string counts, and which equipment tables each count matches
 * (strings/message-probe.ts). For finding where a game keeps its names;
 * the report has counts only, so it is safe to share.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { MHP2_EU_TABLES, MHP2_REGULAR_ITEMS } from "../games/mhp2.js";
import { ARMOR_SLOT_COUNTS } from "../tables/armor.js";
import { TABLE_COUNTS } from "../tables/offsets.js";
import {
  probeMessageFiles,
  type KnownCount,
  type ProbedMessageFile,
} from "../strings/message-probe.js";
import { manifestGame, type UnpackManifest } from "./unpack.js";

/** What has how many entries, per game; combined counts too, for name tables that hold two kinds. */
export function knownCounts(game: string): KnownCount[] {
  if (game === "mhp2") {
    const t = MHP2_EU_TABLES;
    return [
      { name: "blademaster", count: t.weaponsBlademaster.count },
      { name: "gunner", count: t.weaponsGunner.count },
      { name: "weapons", count: t.weaponsBlademaster.count + t.weaponsGunner.count },
      { name: "head", count: t.armorHead.count },
      { name: "chest", count: t.armorChest.count },
      { name: "arm", count: t.armorArm.count },
      { name: "waist", count: t.armorWaist.count },
      { name: "leg", count: t.armorLeg.count },
      { name: "regular items", count: MHP2_REGULAR_ITEMS },
      { name: "items", count: t.itemTable.count },
      { name: "decorations", count: t.decorationValues.count },
    ];
  }
  if (game === "mhp2g") {
    return [
      { name: "blademaster", count: TABLE_COUNTS.weaponsBlademaster },
      { name: "gunner", count: TABLE_COUNTS.weaponsGunner },
      { name: "weapons", count: TABLE_COUNTS.weaponsBlademaster + TABLE_COUNTS.weaponsGunner },
      ...Object.entries(ARMOR_SLOT_COUNTS).map(([name, count]) => ({ name, count })),
      { name: "regular items", count: TABLE_COUNTS.regularItems },
      { name: "items", count: TABLE_COUNTS.items },
      { name: "decorations", count: TABLE_COUNTS.decorations },
    ];
  }
  return [];
}

async function walk(dir: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch {
    return out;
  }
  for (const name of names) {
    const rel = `${prefix}/${name}`;
    if ((await stat(path.join(dir, name))).isDirectory()) {
      out.push(...(await walk(path.join(dir, name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

export async function runMessageProbe(options: {
  unpacked: string;
  out?: string;
}): Promise<ProbedMessageFile[]> {
  const manifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  ) as UnpackManifest;
  const game = manifestGame(manifest);
  const known = knownCounts(game);

  const paths = [
    ...(await walk(path.join(options.unpacked, "data-bin"), "data-bin")),
    ...(await walk(path.join(options.unpacked, "usrdir"), "usrdir")),
  ];
  const results: ProbedMessageFile[] = [];
  // One file at a time: an unpack is a few hundred MB.
  for (const rel of paths) {
    const buf = await readFile(path.join(options.unpacked, rel));
    results.push(...probeMessageFiles([{ name: rel, buf }], known));
  }

  const out = options.out ?? path.join(options.unpacked, "message-probe.json");
  await writeFile(
    out,
    `${JSON.stringify({ game, region: manifest.region, discId: manifest.discId, files: results }, null, 2)}\n`,
    "utf-8",
  );
  console.log(`${results.length} message files in ${manifest.discId} (${game}):\n`);
  for (const f of results) {
    const tables = f.tables
      .map((t) => `${t.strings}${t.matches.length ? `[${t.matches.join(",")}]` : ""}`)
      .join(" ");
    console.log(`  ${f.file}: ${f.tables.length} tables: ${tables}`);
  }
  console.log(`\nWrote ${out}`);
  return results;
}
