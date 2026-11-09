/**
 * Writes `raw/attacks.json` for `extract --raw`: every monster attack table
 * (see `emit/attacks-raw.ts`). Searched: `eboot.bin`, `game_task.ovl`,
 * `game_sub.ovl`, every per-monster `overlay/emNN.ovl`, and the entries of
 * each `emmodel/emNN.pac` that are neither mesh nor textures (skeletons and
 * motion banks).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cribAttacks,
  dumpAttacksRaw,
  type AttackCrib,
  type SearchFile,
} from "../emit/attacks-raw.js";
import { isPac, readPac } from "../models/pac.js";
import { isPmo } from "../models/pmo.js";
import { isTmh } from "../models/tmh.js";
import type { MonsterOverlays } from "../monsters/overlays.js";
import crib from "../overlay/attack-crib.json" with { type: "json" };
import { listEmFiles, loadEmOverlays } from "./collision-raw.js";

const emName = (id: number) => `em${String(id).padStart(2, "0")}`;

/** The model packages' entries that aren't PMO or TMH, as search files. */
async function modelEntries(unpackedDir: string): Promise<SearchFile[]> {
  const dir = path.join(unpackedDir, "data-bin", "emmodel");
  const out: SearchFile[] = [];
  for (const [emId, name] of await listEmFiles(dir, "pac")) {
    const buf = await readFile(path.join(dir, name));
    if (!isPac(buf)) continue;
    for (const entry of readPac(buf)) {
      const data = entry.data;
      if (data.length === 0 || isPmo(data) || isTmh(data)) continue;
      out.push({ name: `emmodel/${name}#${entry.index}`, buf: data, emId });
    }
  }
  return out;
}

export async function writeAttacksRaw(
  unpackedDir: string,
  outDir: string,
  eboot: Buffer,
  overlays: MonsterOverlays,
  chunksOffset: number,
  /** vaddr of the EBOOT's offset 0, for reading vtables there; null if unknown. */
  ebootBase: number | null = null,
): Promise<void> {
  const emOvls = await loadEmOverlays(unpackedDir);
  const files: SearchFile[] = [
    { name: "eboot.bin", buf: eboot },
    { name: "game_task.ovl", buf: overlays.gameTask.reader.buf, ovl: overlays.gameTask },
    { name: "game_sub.ovl", buf: overlays.gameSub.reader.buf, ovl: overlays.gameSub },
    ...[...emOvls].map(([emId, ovl]) => ({
      name: `overlay/${emName(emId)}.ovl`,
      buf: ovl.reader.buf,
      ovl,
      emId,
    })),
    ...(await modelEntries(unpackedDir)),
  ];
  const started = Date.now();
  const dump = dumpAttacksRaw(
    files,
    cribAttacks(crib as AttackCrib),
    { ovl: overlays.gameTask, offset: chunksOffset },
    ebootBase === null ? null : { buf: eboot, base: ebootBase },
  );
  const rawPath = path.join(outDir, "raw", "attacks.json");
  await mkdir(path.dirname(rawPath), { recursive: true });
  await writeFile(rawPath, `${JSON.stringify(dump)}\n`, "utf-8");
  const tables = dump.files.flatMap((f) => f.tables);
  const records = tables.reduce((sum, t) => sum + t.count, 0);
  console.log(
    `Spawners: ${dump.spawners?.length ?? 0} (${dump.spawners?.filter((sp) => sp.slots.some((slot) => slot.tables)).length ?? 0} reaching an attack table).`,
  );
  console.log(
    `Wrote ${rawPath}: ${tables.length} attack tables (${records} records) in ${dump.files.filter((f) => f.tables.length).length} of ${files.length} files, ${((Date.now() - started) / 1000).toFixed(1)}s.`,
  );
}
