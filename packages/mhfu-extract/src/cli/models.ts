/**
 * `models` subcommand — converts `.pac` model packages from an `unpack`
 * output (`data-bin/weapon/*.pac`, ...) into `.glb` files.
 *
 * Experimental. Weapons and armor come out in their bind pose; monsters are
 * skinned to their skeleton and carry every motion in their package as an
 * animation clip. Verified by rendering weapons, armor and monsters from an
 * EU disc; see README "3D models".
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildGlb, type GlbStats } from "../models/gltf.js";
import { isPac, readPac } from "../models/pac.js";
import { isPmo } from "../models/pmo.js";
import { packageModel } from "../models/rig.js";
import { isTmh, readTmh } from "../models/tmh.js";

export interface ModelsOptions {
  /** A `.pac` file or a directory searched recursively for them. */
  in: string;
  out: string;
}

export interface ModelResult {
  source: string;
  output?: string;
  stats?: GlbStats;
  error?: string;
}

async function listPacs(input: string): Promise<string[]> {
  if (!(await stat(input)).isDirectory()) return [input];
  const entries = await readdir(input, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".pac"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export async function convertPac(file: string, outDir: string, root: string): Promise<ModelResult> {
  const source = path.relative(root, file) || path.basename(file);
  try {
    const buf = await readFile(file);
    if (!isPac(buf)) return { source, error: "not a .pac package" };
    const entries = readPac(buf);
    const pmoEntry = entries.find((entry) => isPmo(entry.data));
    if (!pmoEntry)
      return {
        source,
        error: `no PMO mesh (entries: ${entries.map((e) => e.magic ?? "?").join(", ")})`,
      };
    const tmhEntry = entries.find((entry) => isTmh(entry.data));
    const { pmo, rig } = packageModel(entries, pmoEntry.index);
    const textures = tmhEntry ? readTmh(tmhEntry.data) : [];
    const { glb, stats } = await buildGlb(pmo, textures, source, {}, rig);
    const output = path.join(outDir, source.replace(/\.pac$/, ".glb"));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, glb);
    return { source, output, stats };
  } catch (err) {
    return { source, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runModels(options: ModelsOptions): Promise<ModelResult[]> {
  const files = await listPacs(options.in);
  const root = (await stat(options.in)).isDirectory() ? options.in : path.dirname(options.in);
  const results: ModelResult[] = [];
  for (const file of files) {
    const result = await convertPac(file, options.out, root);
    results.push(result);
    if (result.error) console.log(`skip ${result.source}: ${result.error}`);
    else
      console.log(
        `ok   ${result.source}: ${result.stats!.primitives} primitives, ${result.stats!.vertices} vertices, ${result.stats!.triangles} triangles${result.stats!.clips ? `, ${result.stats!.clips} clips` : ""}`,
      );
  }
  return results;
}
