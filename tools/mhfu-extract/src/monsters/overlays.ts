/**
 * Loads the monster overlays from an `unpack`ed directory. `unpack` keeps
 * the vendored file names for both JP and EU (`filelist-eu.json` maps the EU
 * indexes), so they are always `data-bin/overlay/game_task.ovl`,
 * `game_sub.ovl` and `emXX.ovl`, XX being the emID of the monster the file
 * is built around (`em01.ovl` = Rathian).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseOvl, type OvlFile } from "../container/ovl.js";
import type { AddressSpace } from "./hitzones.js";

export interface MonsterOverlays {
  gameTask: OvlFile;
  gameSub: OvlFile;
  /** `emXX.ovl` files by XX. */
  em: Map<number, OvlFile>;
}

export const OVERLAY_DIR = path.join("data-bin", "overlay");

export async function loadMonsterOverlays(unpackedDir: string): Promise<MonsterOverlays> {
  const dir = path.join(unpackedDir, OVERLAY_DIR);
  const load = async (name: string) => parseOvl(await readFile(path.join(dir, name)));
  const em = new Map<number, OvlFile>();
  for (const name of (await readdir(dir)).sort()) {
    const match = /^em(\d+)\.ovl$/.exec(name);
    if (match) em.set(Number(match[1]), await load(name));
  }
  return { gameTask: await load("game_task.ovl"), gameSub: await load("game_sub.ovl"), em };
}

export const emFileName = (n: number) => `em${String(n).padStart(2, "0")}.ovl`;

/** `emXX.ovl` files whose mapped image contains `vaddr`. */
export function emFilesContaining(overlays: MonsterOverlays, vaddr: number): number[] {
  return [...overlays.em].filter(([, ovl]) => ovl.isOwnVaddr(vaddr)).map(([n]) => n);
}

/**
 * Resolves a vaddr seen in monster `emId`'s chunk: `game_task.ovl` itself,
 * else that monster's own `emXX.ovl`, else the one `emXX.ovl` that maps it
 * (null when several do: the em overlays share a load slot, so the address
 * alone doesn't say which).
 */
export function monsterAddressSpace(overlays: MonsterOverlays): AddressSpace {
  return (vaddr, emId) => {
    if (overlays.gameTask.isOwnVaddr(vaddr))
      return { ovl: overlays.gameTask, file: "game_task.ovl" };
    const own = overlays.em.get(emId);
    if (own?.isOwnVaddr(vaddr)) return { ovl: own, file: emFileName(emId) };
    const candidates = emFilesContaining(overlays, vaddr);
    if (candidates.length !== 1) return null;
    const n = candidates[0]!;
    return { ovl: overlays.em.get(n)!, file: emFileName(n) };
  };
}
