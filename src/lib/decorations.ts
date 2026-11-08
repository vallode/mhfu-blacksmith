import fs from "fs";
import path from "path";
import { slugify } from "./slug";
import type { Decoration } from "./types";

const dataDir = path.join(process.cwd(), "data");

export function getDecorations(): Decoration[] {
  const filePath = path.join(dataDir, "decorations.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { decorations: Decoration[] };

  return raw.decorations.map((d) => ({ ...d, slug: slugify(d.name) }));
}

export function getDecoration(slug: string): Decoration | undefined {
  return getDecorations().find((d) => d.slug === slug);
}
