/**
 * Loads the DATA.BIN file-index -> original-path map vendored from
 * FUComplete/FUCTool (res/filelist.csv, GPL-3.0-or-later). See ../../NOTICE.md.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FILELIST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "vendor",
  "fuctool",
  "filelist.csv",
);

let cache: Map<number, string> | null = null;

export function loadFileList(): Map<number, string> {
  if (cache) return cache;
  const text = readFileSync(FILELIST_PATH, "utf-8");
  const map = new Map<number, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commaIndex = trimmed.indexOf(",");
    if (commaIndex === -1) continue;
    const index = Number.parseInt(trimmed.slice(0, commaIndex), 10);
    const filePath = trimmed.slice(commaIndex + 1);
    if (!Number.isNaN(index)) map.set(index, filePath);
  }
  cache = map;
  return map;
}

/** Returns file indices whose vendored path matches `mission_jpn/*.mib` (quests). */
export function questFileIndices(): number[] {
  const list = loadFileList();
  const indices: number[] = [];
  for (const [index, filePath] of list) {
    if (filePath.startsWith("mission_jpn/") && filePath.endsWith(".mib")) indices.push(index);
  }
  return indices.sort((a, b) => a - b);
}
