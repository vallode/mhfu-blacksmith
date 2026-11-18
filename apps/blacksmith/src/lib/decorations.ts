import { slugify } from "./slug";
import type { Decoration } from "./types";
import { DATA_DIR } from "./paths";
import { cached } from "./data-cache";
import { readData } from "game-data";

const dataDir = DATA_DIR;

const cache = new Map<"all", Decoration[]>();

export function getDecorations(): Decoration[] {
  return cached(cache, "all", loadDecorations);
}

function loadDecorations(): Decoration[] {
  const raw = readData<{ decorations: Decoration[] }>(dataDir, "decorations.json");

  return raw.decorations.map((d) => ({ ...d, slug: slugify(d.name) }));
}

export function getDecoration(slug: string): Decoration | undefined {
  return getDecorations().find((d) => d.slug === slug);
}
