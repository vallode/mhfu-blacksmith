/**
 * Hunting horn melody effect names, descriptions and durations, keyed by
 * the disc's effect ID (`tables/horn.ts`). The disc gives each song's notes
 * and effect ID only; this text is hand-made (see the JSON's `_comment` for
 * where it came from).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MelodyEffect {
  id: number;
  effect: string;
  description: string | null;
  duration: string | null;
  extended_effect: string | null;
  extended_duration: string | null;
}

const EFFECTS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "melody-effects.json");

let cache: Map<number, MelodyEffect> | null = null;

export function melodyEffect(id: number): MelodyEffect {
  if (!cache) {
    const file = JSON.parse(readFileSync(EFFECTS_PATH, "utf-8")) as { effects: MelodyEffect[] };
    cache = new Map(file.effects.map((e) => [e.id, e]));
  }
  const effect = cache.get(id);
  if (!effect)
    throw new Error(`No melody effect for effect ID ${id} (overlay/melody-effects.json).`);
  return effect;
}
