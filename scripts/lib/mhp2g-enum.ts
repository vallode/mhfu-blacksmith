/**
 * Reads the name tables in the vendored IncognitoMan/mhp2g-patterns `.enum`
 * files (MIT, tools/mhfu-extract/vendor/mhp2g-patterns/includes/): blocks of
 * `str Name[N] = { "a", "b", ... };`, where a string's position is its game
 * ID. Only the strings are trusted; the declared N is often off by one.
 */
import fs from "fs";
import path from "path";

const INCLUDES = path.join(process.cwd(), "tools/mhfu-extract/vendor/mhp2g-patterns/includes");

export function readEnumFile(file: string): Map<string, string[]> {
  const source = fs.readFileSync(path.join(INCLUDES, file), "utf-8");
  const tables = new Map<string, string[]>();
  for (const block of source.matchAll(/str\s+(\w+)\s*\[\s*\d+\s*\]\s*=\s*\{([\s\S]*?)\};/g)) {
    const names = [...block[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      m[1].replace(/\\(.)/g, "$1").trim(),
    );
    tables.set(block[1], names);
  }
  return tables;
}

/** The game's "empty slot" name: a run of full-width or ASCII dashes. */
export const isPlaceholder = (name: string) => name === "" || /^[－\-]+$/u.test(name);

/**
 * Case-, space- and punctuation-insensitive key ("GoldenMoonGreavesZ" =
 * "GoldenMoon Greaves Z"). Keeps "+", which tells items apart
 * ("Kut-Ku Scale" vs "Kut-Ku Scale+").
 */
export const loose = (name: string) => name.toLowerCase().replace(/[^a-z0-9+]/g, "");
