"use client";

import WeaponTreeListClient from "@/app/blacksmith/[type]/WeaponTreeListClient";
import WeaponDetailClient from "@/app/blacksmith/[type]/[slug]/WeaponDetailClient";
import ArmorTreeListClient from "@/app/armorsmith/[slot]/[rank]/ArmorTreeListClient";
import ArmorDetailClient from "@/app/armorsmith/[slot]/[rank]/[slug]/ArmorDetailClient";
import MonsterListClient from "@/app/monsters/[category]/MonsterListClient";
import MonsterDetailClient from "@/app/monsters/[category]/[slug]/MonsterDetailClient";
import DecorationsListClient from "@/app/decorations/DecorationsListClient";
import DecorationDetailClient from "@/app/decorations/[slug]/DecorationDetailClient";
import HomeContent from "@/app/HomeContent";
import BlacksmithListContent from "@/app/blacksmith/BlacksmithListContent";
import ArmorsmithListContent from "@/app/armorsmith/ArmorsmithListContent";
import BestiaryListContent from "@/app/monsters/BestiaryListContent";
import {
  WEAPON_TYPES,
  ARMOR_SLOTS,
  ARMOR_RANKS,
  MONSTER_CATEGORIES,
  type WeaponType,
  type ArmorSlot,
  type ArmorRank,
  type MonsterCategory,
} from "./constants";

export type RouteMatch =
  | { kind: "home" }
  | { kind: "weapon-list" }
  | { kind: "weapon-tree"; type: WeaponType }
  | { kind: "weapon-detail"; type: WeaponType; slug: string }
  | { kind: "armor-list" }
  | { kind: "armor-tree"; slot: ArmorSlot; rank: ArmorRank }
  | { kind: "armor-detail"; slot: ArmorSlot; rank: ArmorRank; slug: string }
  | { kind: "monster-list" }
  | { kind: "monster-tree"; category: MonsterCategory }
  | { kind: "monster-detail"; category: MonsterCategory; slug: string }
  | { kind: "decoration-list" }
  | { kind: "decoration-detail"; slug: string }
  | { kind: "unknown" };

/**
 * Matches a pathname against every route this app can fully render from
 * client-side cached data (see src/lib/client-data.ts) — i.e. everything
 * except the calculator/hunter/options pages, which aren't worth
 * reconstructing this way. Shared by the offline click-interceptor
 * (src/components/OfflineNavGuard.tsx) and the SW navigation-fallback shell
 * (src/app/offline).
 */
export function matchOfflineRoute(pathname: string): RouteMatch {
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return { kind: "home" };

  if (parts[0] === "blacksmith") {
    if (parts.length === 1) return { kind: "weapon-list" };
    const type = parts[1];
    if (!WEAPON_TYPES.includes(type as WeaponType)) return { kind: "unknown" };
    if (parts.length === 2) return { kind: "weapon-tree", type: type as WeaponType };
    if (parts.length === 3) {
      return { kind: "weapon-detail", type: type as WeaponType, slug: parts[2] };
    }
  }

  if (parts[0] === "armorsmith") {
    if (parts.length === 1) return { kind: "armor-list" };
    const [, slot, rank, slug] = parts;
    if (!ARMOR_SLOTS.includes(slot as ArmorSlot)) return { kind: "unknown" };
    if (parts.length >= 2 && !rank) return { kind: "unknown" };
    if (rank && !ARMOR_RANKS.includes(rank as ArmorRank)) return { kind: "unknown" };
    if (parts.length === 3) {
      return { kind: "armor-tree", slot: slot as ArmorSlot, rank: rank as ArmorRank };
    }
    if (parts.length === 4) {
      return { kind: "armor-detail", slot: slot as ArmorSlot, rank: rank as ArmorRank, slug };
    }
  }

  if (parts[0] === "monsters") {
    if (parts.length === 1) return { kind: "monster-list" };
    const category = parts[1];
    if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) return { kind: "unknown" };
    if (parts.length === 2) return { kind: "monster-tree", category: category as MonsterCategory };
    if (parts.length === 3) {
      return { kind: "monster-detail", category: category as MonsterCategory, slug: parts[2] };
    }
  }

  if (parts[0] === "decorations") {
    if (parts.length === 1) return { kind: "decoration-list" };
    if (parts.length === 2) return { kind: "decoration-detail", slug: parts[1] };
  }

  return { kind: "unknown" };
}

/** Renders the same content the real statically-exported route would. */
export function renderOfflineRoute(match: RouteMatch): React.ReactNode {
  switch (match.kind) {
    case "home":
      return <HomeContent />;
    case "weapon-list":
      return <BlacksmithListContent />;
    case "weapon-tree":
      return <WeaponTreeListClient type={match.type} />;
    case "weapon-detail":
      return <WeaponDetailClient type={match.type} slug={match.slug} />;
    case "armor-list":
      return <ArmorsmithListContent />;
    case "armor-tree":
      return <ArmorTreeListClient slot={match.slot} rank={match.rank} />;
    case "armor-detail":
      return <ArmorDetailClient slot={match.slot} rank={match.rank} slug={match.slug} />;
    case "monster-list":
      return <BestiaryListContent />;
    case "monster-tree":
      return <MonsterListClient category={match.category} />;
    case "monster-detail":
      return <MonsterDetailClient category={match.category} slug={match.slug} />;
    case "decoration-list":
      return <DecorationsListClient />;
    case "decoration-detail":
      return <DecorationDetailClient slug={match.slug} />;
    case "unknown":
      return null;
  }
}
