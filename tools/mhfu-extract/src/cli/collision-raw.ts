/**
 * Writes the monster hitbox raw dumps for `extract --raw` (see
 * `emit/collision-raw.ts`): `raw/collision.json`, `raw/emmodel.json` and the
 * model packages' unidentified entries as `raw/emmodel/emNN.<index>.bin`.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseOvl, type OvlFile } from "../container/ovl.js";
import { dumpCollisionRaw, dumpEmModelRaw, type EmModelRawEntry } from "../emit/collision-raw.js";
import { OVERLAY_DIR, type MonsterOverlays } from "../monsters/overlays.js";
import { loadEnums, lookupName } from "../strings/enums.js";

const EM_FILE = /^em(\d+)\.(ovl|pac)$/;

export async function listEmFiles(dir: string, ext: "ovl" | "pac"): Promise<[number, string][]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => [name, EM_FILE.exec(name)] as const)
    .filter(([, m]) => m?.[2] === ext)
    .map(([name, m]) => [Number.parseInt(m![1]!, 10), name] as [number, string])
    .sort((a, b) => a[0] - b[0]);
}

/** Loads the per-monster `overlay/emNN.ovl` files by emID, skipping any that aren't MWo3. */
export async function loadEmOverlays(unpackedDir: string): Promise<Map<number, OvlFile>> {
  const dir = path.join(unpackedDir, OVERLAY_DIR);
  const overlays = new Map<number, OvlFile>();
  for (const [emId, name] of await listEmFiles(dir, "ovl")) {
    try {
      overlays.set(emId, parseOvl(await readFile(path.join(dir, name))));
    } catch (err) {
      console.log(`skip overlay/${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return overlays;
}

export async function writeCollisionRaw(
  unpackedDir: string,
  outDir: string,
  overlays: MonsterOverlays,
  chunksOffset: number,
): Promise<void> {
  const rawDir = path.join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });
  const enums = loadEnums();
  const names = (emId: number) => lookupName(enums, "emID", emId);

  const emOvls = await loadEmOverlays(unpackedDir);
  const collision = dumpCollisionRaw(overlays.gameTask, chunksOffset, emOvls, names);
  const collisionPath = path.join(rawDir, "collision.json");
  await writeFile(collisionPath, `${JSON.stringify(collision)}\n`, "utf-8");
  const resolved = collision.filter((c) => c.collision).length;
  console.log(
    `Wrote ${collisionPath} (${resolved} of ${collision.length} collision pointers resolved, ${emOvls.size} emNN.ovl files).`,
  );

  const modelDir = path.join(unpackedDir, "data-bin", "emmodel");
  const binDir = path.join(rawDir, "emmodel");
  await mkdir(binDir, { recursive: true });
  const models: EmModelRawEntry[] = [];
  let binCount = 0;
  for (const [, name] of await listEmFiles(modelDir, "pac")) {
    const { entry, unknown } = dumpEmModelRaw(
      `emmodel/${name}`,
      await readFile(path.join(modelDir, name)),
    );
    models.push(entry);
    for (const { index, data } of unknown) {
      await writeFile(path.join(binDir, `${name.replace(/\.pac$/, "")}.${index}.bin`), data);
      binCount++;
    }
  }
  const modelPath = path.join(rawDir, "emmodel.json");
  await writeFile(modelPath, `${JSON.stringify(models)}\n`, "utf-8");
  console.log(
    `Wrote ${modelPath} (${models.length} packages) and ${binCount} unidentified entries to ${binDir}.`,
  );
}
