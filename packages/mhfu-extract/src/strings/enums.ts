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
  "includes",
);

/** A run of dashes/hyphens (full-width or ASCII) — the game's "empty slot" placeholder name. */
const PLACEHOLDER_NAME = /^[－\-]+$/u;

function parseEnumBlocks(source: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  const blockPattern = /str\s+(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*\{([\s\S]*?)\};/g;

  for (const match of source.matchAll(blockPattern)) {
    const [, name, countStr, body] = match;
    const declaredCount = Number.parseInt(countStr!, 10);
    const entries: string[] = [];

    const stringPattern = /"((?:[^"\\]|\\.)*)"/g;
    for (const strMatch of body!.matchAll(stringPattern)) {
      entries.push(strMatch[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    }

    // The declared `str Name[N]` header count is unreliable — every single
    // table in these vendored files is off from its own parsed entry count
    // (checked across equip.enum/items.enum/monster.enum), usually by
    // exactly one. The *parsed* count is what matters: cross-checked against
    // real EBOOT stat-array lengths (tables/*.ts), it matches exactly for
    // every table, including ChestArmorID (declared 435, actual 420 — the
    // real chest armor stat table also has 420 entries). So we trust
    // `entries.length`, not `declaredCount`, and only guard against the
    // parser finding suspiciously few strings (a real sign the format
    // changed), not against this known, harmless header/body mismatch.
    if (entries.length < declaredCount / 2) {
      throw new Error(
        `enums: ${name} declared ${declaredCount} entries but parsed only ${entries.length} — .enum format may have changed`,
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

/**
 * Looks up `enums[table][index]`, returning null for out-of-range/placeholder
 * entries. Trims the resolved name: the vendored `.enum` files carry at
 * least one known transcription typo with stray leading/trailing whitespace
 * baked into the string literal itself (e.g. `"Diablo Guards "`,
 * `equip.enum:908`, confirmed against sibling variants like
 * `"Diablo Guards U"` that are correctly spaced) — trimming is safe and
 * zero-risk since no real equipment name is intentionally
 * leading/trailing-whitespace-padded.
 */
export function lookupName(
  enums: Map<string, string[]>,
  table: string,
  index: number,
): string | null {
  const entries = enums.get(table);
  if (!entries) throw new Error(`enums: unknown table "${table}"`);
  const name = entries[index];
  if (name === undefined || isPlaceholderName(name)) return null;
  return name.trim();
}
