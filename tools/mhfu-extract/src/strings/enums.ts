/**
 * Parses the vendored mhp2g-patterns `.enum` files
 * (vendor/mhp2g-patterns/includes/*.enum, MIT — see ../../NOTICE.md).
 *
 * These are name tables indexed by the same IDs the binary structs use
 * internally (`ItemID[1262]`, `WepBMID[1151]`, `HeadArmorID[437]`, ...).
 * They are hand-transcribed by the pattern's author, not extracted from the
 * disc — used here as the bootstrap/cross-check name source until
 * `src/strings/names.ts` can pull English strings directly from the disc
 * (see that module for why that isn't wired up yet).
 *
 * File format (ImHex pattern language `str` declarations):
 *   str HeadArmorID[437] = {
 *     "－－－－－－",
 *     "Leather Helm",
 *     ...
 *   };
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const VENDOR_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "vendor",
  "mhp2g-patterns",
  "includes"
);

/** A run of dashes/hyphens (full-width or ASCII) — the game's "empty slot" placeholder name. */
const PLACEHOLDER_NAME = /^[－\-]+$/u;

function parseEnumBlocks(source: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  const blockPattern = /str\s+(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*\{([\s\S]*?)\};/g;

  for (const match of source.matchAll(blockPattern)) {
    const [, name, countStr, body] = match;
    const expectedCount = Number.parseInt(countStr!, 10);
    const entries: string[] = [];

    const stringPattern = /"((?:[^"\\]|\\.)*)"/g;
    for (const strMatch of body!.matchAll(stringPattern)) {
      entries.push(strMatch[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    }

    if (entries.length !== expectedCount) {
      throw new Error(
        `enums: ${name} declared ${expectedCount} entries but parsed ${entries.length} — .enum format may have changed`
      );
    }
    blocks.set(name!, entries);
  }
  return blocks;
}

let cache: Map<string, string[]> | null = null;

/** Loads and merges every `.enum` file's `str Name[N] = {...}` blocks by name. */
export function loadEnums(): Map<string, string[]> {
  if (cache) return cache;
  const merged = new Map<string, string[]>();
  for (const file of ["equip.enum", "items.enum", "monster.enum"]) {
    const text = readFileSync(path.join(VENDOR_DIR, file), "utf-8");
    for (const [name, entries] of parseEnumBlocks(text)) merged.set(name, entries);
  }
  cache = merged;
  return merged;
}

export function isPlaceholderName(name: string): boolean {
  return PLACEHOLDER_NAME.test(name);
}

/** Looks up `enums[table][index]`, returning null for out-of-range/placeholder entries. */
export function lookupName(enums: Map<string, string[]>, table: string, index: number): string | null {
  const entries = enums.get(table);
  if (!entries) throw new Error(`enums: unknown table "${table}"`);
  const name = entries[index];
  if (name === undefined || isPlaceholderName(name)) return null;
  return name;
}
