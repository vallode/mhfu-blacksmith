import fs from "fs";
import path from "path";
import { slugify } from "./slug";
import type { Decoration, WeaponTree } from "./types";

const contentDir = path.join(process.cwd(), "content");

export function getDecorations(): Decoration[] {
  const filePath = path.join(contentDir, "decorations", "decorations-crafting.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { weapons: Decoration[] };

  return raw.weapons
    .filter((d) => !("donotrender" in d))
    .map((d) => ({
      ...d,
      slug: slugify(d.name),
    }));
}

export function getDecoration(slug: string): Decoration | undefined {
  return getDecorations().find((d) => d.slug === slug);
}

export function getDecorationTree(): WeaponTree {
  const filePath = path.join(contentDir, "decorations", "map.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeaponTree;
}
