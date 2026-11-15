import { slugify } from "./slug";
import type { Decoration } from "./types";
import { cached } from "./data-cache";
import { gameRecords } from "./game-records";

const cache = new Map<"all", Decoration[]>();

export function getDecorations(): Decoration[] {
  return cached(cache, "all", loadDecorations);
}

/** The decorations, named in the page's language; slugs from their English names. */
function loadDecorations(): Decoration[] {
  const records = gameRecords();
  const english = records.english<{ decorations: Decoration[] }>("decorations.json").decorations;
  return records
    .named<{ decorations: Decoration[] }>("decorations.json")
    .decorations.map((d, i) => ({ ...d, slug: slugify(english[i]!.name) }));
}

export function getDecoration(slug: string): Decoration | undefined {
  return getDecorations().find((d) => d.slug === slug);
}
