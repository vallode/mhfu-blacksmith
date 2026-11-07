/**
 * Loads the DATA.BIN file-index -> original-path map vendored from
 * FUComplete/FUCTool (res/filelist.csv, GPL-3.0-or-later). See ../../NOTICE.md.
 *
 * filelist.csv indexes the JP disc's DATA.BIN. The EU disc's TOC has extra
 * entries (localized text etc.) that shift later files, so EU indices go
 * through `filelist-eu.json`. Other regions fall back to the JP indices.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Region } from "./sfo.js";
import euAlignment from "./filelist-eu.json" with { type: "json" };

const FILELIST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "vendor",
  "fuctool",
  "filelist.csv"
);

let cache: Map<number, string> | null = null;
const regionCache = new Map<Region, Map<number, string>>();

interface RegionAlignment {
  totalEntries: number;
  segments: { eu: number; jp: number; count: number }[];
}

/** Map a region's DATA.BIN indices to vendored paths. JP (and regions without an alignment yet) use filelist.csv as-is. */
export function loadFileList(region: Region = "jp"): Map<number, string> {
  if (region !== "eu") return loadJpFileList();
  const cached = regionCache.get(region);
  if (cached) return cached;
  const jp = loadJpFileList();
  const alignment = euAlignment as RegionAlignment;
  const map = new Map<number, string>();
  for (const segment of alignment.segments) {
    for (let i = 0; i < segment.count; i++) {
      const filePath = jp.get(segment.jp + i);
      if (filePath !== undefined) map.set(segment.eu + i, filePath);
    }
  }
  regionCache.set(region, map);
  return map;
}

function loadJpFileList(): Map<number, string> {
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
export function questFileIndices(region: Region = "jp"): number[] {
  const list = loadFileList(region);
  const indices: number[] = [];
  for (const [index, filePath] of list) {
    if (filePath.startsWith("mission_jpn/") && filePath.endsWith(".mib")) indices.push(index);
  }
  return indices.sort((a, b) => a - b);
}
