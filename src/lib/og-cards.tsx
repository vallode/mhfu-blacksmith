import fs from "node:fs";
import path from "node:path";
import { OG_COLORS, renderOgCard, tintFor, type Chip } from "./og";
import { rankLabel, titleCase } from "./seo";
import type { Decoration, Monster } from "./types";

/** One card per kind of page; the routes under src/app only pick the data. */

const exists = (file: string) => fs.existsSync(path.join(process.cwd(), "public", file));

export function weaponTypeCard(type: string, count: number) {
  return renderOgCard({
    kicker: "Weapon tree",
    title: titleCase(type),
    body: `${count} weapons, from the first forge to G-Rank upgrades, with every recipe.`,
    sprite: { src: `/images/${type}.png`, tint: OG_COLORS.rarity[4] },
  });
}

export function armorSetCard(slot: string, rank: string, count: number) {
  return renderOgCard({
    kicker: "Armor",
    title: `${rankLabel(rank)} ${titleCase(slot)}`,
    body: `${count} pieces with their defense, skills and recipes.`,
    sprite: { src: `/images/${slot}.png`, tint: OG_COLORS.rarity[4] },
  });
}

export function monsterCard(m: Monster) {
  const sprite = exists(`/images/monsters/${m.slug}-favicon.png`)
    ? { src: `/images/monsters/${m.slug}-favicon.png` }
    : exists(`/images/monsters/${m.slug}.png`)
      ? { src: `/images/monsters/${m.slug}.png` }
      : undefined;

  return renderOgCard({
    kicker: titleCase(m.type),
    title: m.name,
    body: m.description,
    chips: (m.habitats ?? []).slice(0, 4).map((label) => ({ label })),
    sprite,
  });
}

export function monsterCategoryCard(category: string, names: string[]) {
  return renderOgCard({
    kicker: "Bestiary",
    title: titleCase(category),
    body: `${names.length} monsters: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}`,
    sprite: exists(`/images/monsters/${category}.png`)
      ? { src: `/images/monsters/${category}.png` }
      : undefined,
  });
}

export function decorationCard(d: Decoration) {
  const chips: Chip[] = (d.skills ?? []).map((s) => ({
    label: s,
    color: /[-−]\d+$/.test(s) ? OG_COLORS.negative : OG_COLORS.positive,
  }));
  if (d.slots) chips.push({ label: "Slots", value: String(d.slots) });

  return renderOgCard({
    kicker: `Decoration${d.category ? ` · ${d.category}` : ""}${d.rarity ? ` · Rarity ${d.rarity}` : ""}`,
    title: d.name,
    chips,
    sprite: { src: "/images/decoration.png", tint: tintFor(d.rarity, d.color) },
  });
}

export function siteCard(kicker: string, title: string, body: string, sprite?: string) {
  return renderOgCard({
    kicker,
    title,
    body,
    sprite: { src: sprite ?? "/images/favicons/felyne-favicon.png" },
  });
}
