/**
 * `export-site` subcommand — converts the model packages the website shows
 * and writes them under `public/models/` with a manifest the site reads.
 *
 *   public/models/monsters/emNN.glb
 *   public/models/manifest.json   { "monsters": { "<site monster name>": "monsters/emNN.glb" } }
 *
 * Monsters map by game ID: `emmodel/emNN.pac` is `emID[NN]` in the vendored
 * monster.enum, matched to `data/monsters/*.json` by name. The manifest is
 * keyed by the site's monster name so the site resolves its own slugs. Weapons and armor
 * need the EBOOT's model-ID tables and aren't exported yet.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildGlb } from "../models/gltf.js";
import { isPac, readPac } from "../models/pac.js";
import { isPmo, readPmo } from "../models/pmo.js";
import { isTmh, readTmh } from "../models/tmh.js";
import { loadEnums, lookupName } from "../strings/enums.js";

export interface ExportSiteOptions {
  /** An `unpack` output directory (containing `data-bin/`). */
  unpacked: string;
  /** The repository's `data/` directory. */
  data: string;
  /** Output directory, normally the repository's `public/models/`. */
  out: string;
}

export interface SiteModelManifest {
  monsters: Record<string, string>;
}

/** monster.enum names that differ from the site's names. */
const MONSTER_NAME_ALIASES: Record<string, string> = {
  "One-Ear Yian Garuga": "Scarred Yian Garuga",
  "Terra Shogun Ceanatur": "Terra Shogun Ceanataur",
};

/** Convert the first PMO + TMH in a package to GLB bytes, or null when it has no mesh. */
function packageToGlb(buf: Buffer, name: string): Buffer | null {
  if (!isPac(buf)) return null;
  const entries = readPac(buf);
  const pmoEntry = entries.find((entry) => isPmo(entry.data));
  if (!pmoEntry) return null;
  const tmhEntry = entries.find((entry) => isTmh(entry.data));
  return buildGlb(readPmo(pmoEntry.data), tmhEntry ? readTmh(tmhEntry.data) : [], name).glb;
}

async function siteMonsterNames(dataDir: string): Promise<Set<string>> {
  const names = new Set<string>();
  const dir = path.join(dataDir, "monsters");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const { monsters } = JSON.parse(await readFile(path.join(dir, file), "utf-8")) as { monsters: { name: string }[] };
    for (const monster of monsters) names.add(monster.name);
  }
  return names;
}

export async function runExportSite(options: ExportSiteOptions): Promise<SiteModelManifest> {
  const enums = loadEnums();
  const siteNames = await siteMonsterNames(options.data);
  const manifest: SiteModelManifest = { monsters: {} };
  const monsterDir = path.join(options.out, "monsters");
  await mkdir(monsterDir, { recursive: true });

  const emDir = path.join(options.unpacked, "data-bin", "emmodel");
  const files = (await readdir(emDir)).filter((f) => /^em\d+\.pac$/.test(f)).sort();
  for (const file of files) {
    const id = Number.parseInt(file.slice(2), 10);
    const gameName = lookupName(enums, "emID", id);
    const siteName = gameName ? (MONSTER_NAME_ALIASES[gameName] ?? gameName) : null;
    if (!siteName || !siteNames.has(siteName)) {
      console.log(`skip ${file}: ${gameName ?? "unnamed"} has no monster page`);
      continue;
    }
    const key = siteName;
    if (manifest.monsters[key]) {
      console.log(`skip ${file}: ${siteName} already exported`);
      continue;
    }
    const glb = packageToGlb(await readFile(path.join(emDir, file)), siteName);
    if (!glb) {
      console.log(`skip ${file}: no mesh`);
      continue;
    }
    const relative = `monsters/${file.replace(/\.pac$/, ".glb")}`;
    await writeFile(path.join(options.out, relative), glb);
    manifest.monsters[key] = relative;
    console.log(`ok   ${file} -> ${relative} (${siteName}, ${Math.round(glb.length / 1024)} KB)`);
  }

  // Keep entries from earlier exports whose files are still there (e.g. an
  // export from a partial unpack shouldn't drop monsters exported before).
  const manifestPath = path.join(options.out, "manifest.json");
  try {
    const previous = JSON.parse(await readFile(manifestPath, "utf-8")) as SiteModelManifest;
    for (const [key, relative] of Object.entries(previous.monsters ?? {})) {
      if (manifest.monsters[key]) continue;
      try {
        await readFile(path.join(options.out, relative));
        manifest.monsters[key] = relative;
      } catch {
        // file removed since; drop the entry
      }
    }
  } catch {
    // no previous manifest
  }
  const sorted: SiteModelManifest = {
    monsters: Object.fromEntries(Object.entries(manifest.monsters).sort(([a], [b]) => a.localeCompare(b))),
  };
  await writeFile(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted;
}
