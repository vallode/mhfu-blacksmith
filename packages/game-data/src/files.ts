/**
 * The one way into `data/`. Every reader of the game data (the site, its
 * scripts and tests, mhfu-extract) loads a file with `readData`, given the
 * `data/` directory and the file's path inside it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** A data file's content: the parsed JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataDoc = any;

/**
 * Reads a data file, given `dataDir` and its path inside it, whole
 * (`"weapons/bow.json"`) or in segments as for `path.join`
 * (`"weapons", "bow.json"`).
 */
export function readData<T = DataDoc>(dataDir: string, ...rel: string[]): T {
  return JSON.parse(readFileSync(path.join(dataDir, ...rel), "utf-8")) as T;
}
