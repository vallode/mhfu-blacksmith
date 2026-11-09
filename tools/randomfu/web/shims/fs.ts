/**
 * `node:fs` for the browser build. The randomizer reads three kinds of
 * vendored files at run time (the DATA.BIN file list and the name tables);
 * the build embeds them and this serves them by the end of their path.
 * Anything else isn't available in the browser.
 */
import filelist from "../../../mhfu-extract/vendor/fuctool/filelist.csv";
import equipEnum from "../../../mhfu-extract/vendor/mhp2g-patterns/includes/equip.enum";
import itemsEnum from "../../../mhfu-extract/vendor/mhp2g-patterns/includes/items.enum";
import monsterEnum from "../../../mhfu-extract/vendor/mhp2g-patterns/includes/monster.enum";

const FILES: Record<string, string> = {
  "fuctool/filelist.csv": filelist,
  "includes/equip.enum": equipEnum,
  "includes/items.enum": itemsEnum,
  "includes/monster.enum": monsterEnum,
};

function embedded(path: string): string | undefined {
  const normal = path.replace(/\\/g, "/");
  for (const [suffix, text] of Object.entries(FILES)) if (normal.endsWith(suffix)) return text;
  return undefined;
}

export function readFileSync(path: string): string {
  const text = embedded(String(path));
  if (text === undefined) throw new Error(`No file system in the browser (${path})`);
  return text;
}

export function existsSync(path: string): boolean {
  return embedded(String(path)) !== undefined;
}

function unavailable(): never {
  throw new Error("No file system in the browser");
}

export const openSync = unavailable;
export const readSync = unavailable;
export const writeSync = unavailable;
export const closeSync = unavailable;
export const fstatSync = unavailable;
export const ftruncateSync = unavailable;
export const writeFileSync = unavailable;
export const rmSync = unavailable;
export const mkdtempSync = unavailable;
export default { readFileSync, existsSync };
