import fs from "node:fs";
import path from "node:path";
import type { Metadata, Viewport } from "next";
import { rankName, type GuildRank } from "./min-rank";
import type { ArmorPiece, Decoration, Material, Monster, Weapon } from "./types";

export const SITE_NAME = "MHFU Blacksmith";
export const SITE_DESCRIPTION =
  "Monster Hunter Freedom Unite — weapons, armor, decorations and monsters, with every recipe, skill and drop.";
/** Discord colours the left edge of an embed with this. */
export const THEME_COLOR = "#6e905f";

/** Thumbnail for pages without a better one. */
export const DEFAULT_IMAGE = {
  url: "/images/favicons/felyne-icon-512.png",
  width: 512,
  height: 512,
};

/**
 * Rarity and gem colours for the embed stripe. These repeat the --color-rarity-*
 * and --color-gem-* tokens in src/app/globals.css, which a server-side
 * generateViewport can't read; keep them in sync.
 */
const RARITY_COLORS: Record<number, string> = {
  4: "#52f152",
  5: "#fd9dc8",
  6: "#83c3fc",
  7: "#ff9661",
  8: "#fd6960",
  9: "#ffc762",
  10: "#bb84fb",
};
const GEM_COLORS: Record<string, string> = {
  blue: "#80c2fc",
  cyan: "#97e0ef",
  gray: "#a0a0a0",
  green: "#86bf8d",
  orange: "#ff9661",
  pink: "#ea9aa4",
  red: "#fd6960",
  slate: "#afa0c5",
  white: "#ffffff",
  yellow: "#ffc762",
};

/** The 180px icon for a weapon type or monster category (the one used as its apple-touch-icon). */
export const typeIcon = (name: string) => ({
  url: `/images/favicons/${name}-apple-touch-icon.png`,
  width: 180,
  height: 180,
});

/** A monster's own 80px icon, else its category's. */
export function monsterIcon(slug: string, category: string) {
  const own = `/images/monsters/${slug}-favicon.png`;
  return fs.existsSync(path.join(process.cwd(), "public", own))
    ? { url: own, width: 80, height: 80 }
    : typeIcon(category);
}

/** The colour the site's icons are tinted with: a gem colour, else rarity 4+; none below that. */
export function tintFor(rarity?: number | null, gem?: string | null): string | undefined {
  if (gem && GEM_COLORS[gem]) return GEM_COLORS[gem];
  if (rarity && RARITY_COLORS[rarity]) return RARITY_COLORS[rarity];
  return undefined;
}

export const titleCase = (s: string): string =>
  s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const rankLabel = (rank: string | undefined): string =>
  rank ? rankName(rank as GuildRank) : "";

const zenny = (n: number | string | null | undefined): string | null =>
  n === null || n === undefined || n === "" ? null : `${Number(n).toLocaleString("en-US")}z`;

const matList = (mats: Material[] | null | undefined): string =>
  (mats ?? []).map((m) => `${m.name} ×${m.amount}`).join(", ");

/** "Create 1,150z: Dosbiscus ×1, …" — empty when there is no recipe. */
function recipe(label: string, cost: unknown, mats: Material[] | null | undefined): string {
  const list = matList(mats);
  if (!list) return "";
  const z = zenny(cost as number | null);
  return `${label}${z ? ` ${z}` : ""}: ${list}`;
}

const signed = (n: number | string): string => {
  const v = Number(n);
  return v > 0 ? `+${v}` : `${v}`.replace("-", "−");
};

/** Newline-separated lines, skipping empty ones. */
const lines = (...parts: (string | number | false | null | undefined)[]): string =>
  parts.filter((p) => p).join("\n");

/** Title, description and the Open Graph / Twitter tags that repeat them. */
export function pageMetadata({
  title,
  description,
  path,
  image,
}: {
  /** The bare name, e.g. "Golden Serpentblade"; the site name is added to the tab title. */
  title: string;
  description: string;
  /** Route path, e.g. "/blacksmith/great-sword/". Resolved against metadataBase. */
  path: string;
  /** Thumbnail shown beside the embed text; defaults to the felyne. */
  image?: { url: string; width?: number; height?: number };
}): Metadata {
  const images = [image ?? DEFAULT_IMAGE];
  return {
    title: `${title} — ${SITE_NAME}`,
    description,
    alternates: { canonical: path },
    // A page-level openGraph replaces the layout's wholesale, so repeat the site fields.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title,
      description,
      images,
    },
    // "summary" shows the small icon beside the text, which suits these icon-sized images.
    twitter: { card: "summary", title, description, images },
  };
}

/** Embed accent: the item's rarity colour, else the site green. */
export function accentViewport(color?: string): Viewport {
  return { themeColor: color ?? THEME_COLOR };
}

export function weaponDescription(w: Weapon): string {
  const stats = [
    titleCase(w.type),
    w.rarity ? `Rarity ${w.rarity}` : "",
    w.attack ? `Attack ${w.attack}` : "",
    ...(w.elements ?? []).map((e) => `${e.name} ${e.attack}`),
    w.affinity && w.affinity !== "0%" ? `Affinity ${w.affinity}` : "",
    w.slots ? `${w.slots} slot${w.slots > 1 ? "s" : ""}` : "",
  ].filter(Boolean);

  const from = Array.isArray(w.improve_from) ? w.improve_from.join(" / ") : w.improve_from;
  return lines(
    stats.join(" · "),
    w.create_mats?.length
      ? recipe("Create", w.create_cost, w.create_mats)
      : recipe(from ? `Upgrade from ${from}` : "Upgrade", w.improve_cost, w.improve_mats),
  );
}

export function armorDescription(p: ArmorPiece): string {
  const stats = [
    `${rankLabel(p.rank)} ${titleCase(p.type)}`.trim(),
    p.rarity ? `Rarity ${p.rarity}` : "",
    p.defence !== undefined ? `Defense ${p.defence}` : "",
    p.slots ? `${p.slots} slot${p.slots > 1 ? "s" : ""}` : "",
    p.hunter_type && p.hunter_type !== "Blademaster/Gunner" ? p.hunter_type : "",
  ].filter(Boolean);

  const res = (
    [
      ["Fire", p.fire_res],
      ["Water", p.water_res],
      ["Thunder", p.thunder_res],
      ["Ice", p.ice_res],
      ["Dragon", p.dragon_res],
    ] as const
  )
    .filter(([, v]) => v !== undefined)
    .map(([n, v]) => `${n} ${signed(v!)}`)
    .join(" · ");

  return lines(
    stats.join(" · "),
    p.skills?.length &&
      `Skills: ${p.skills.map((s) => `${s.name} ${signed(s.amount)}`).join(", ")}`,
    res && `Resist: ${res}`,
    recipe("Create", p.create_cost, p.create_mats),
  );
}

export function monsterDescription(m: Monster): string {
  return (
    lines(m.description, m.habitats?.length && `Habitats: ${m.habitats.join(", ")}`) ||
    `${m.name} — ${titleCase(m.type)} in Monster Hunter Freedom Unite.`
  );
}

export function decorationDescription(d: Decoration): string {
  const stats = [
    "Decoration",
    d.category ?? "",
    d.rarity ? `Rarity ${d.rarity}` : "",
    d.slots ? `${d.slots} slot${d.slots > 1 ? "s" : ""}` : "",
  ].filter(Boolean);

  return lines(
    stats.join(" · "),
    d.skills?.length && `Skills: ${d.skills.join(", ")}`,
    recipe("Create", d.create_cost, d.create_mats),
  );
}
