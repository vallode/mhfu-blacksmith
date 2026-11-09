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
import LastWeaponRedirect from "@/app/blacksmith/LastWeaponRedirect";
import ArmorRedirect from "@/app/armorsmith/ArmorRedirect";
import MonsterRedirect from "@/app/monsters/MonsterRedirect";
import { MonsterShell } from "@/app/monsters/MonsterShell";
import QuestBoardsContent from "@/app/quests/QuestBoardsContent";
import QuestHubShell from "@/app/quests/[hub]/QuestHubShell";
import QuestListClient from "@/app/quests/[hub]/QuestListClient";
import QuestDetailClient from "@/app/quests/[hub]/[id]/QuestDetailClient";
import { QUEST_HUB_SLUGS, type QuestHubSlug } from "./quests";
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
  | { kind: "quest-list" }
  | { kind: "quest-hub"; hub: QuestHubSlug }
  | { kind: "quest-detail"; hub: QuestHubSlug; id: number }
  | { kind: "unknown" };

/**
 * Matches a pathname against every route this app can fully render from
 * client-side cached data (see src/lib/client-data.ts) — i.e. everything
 * except the hunter/options pages, which aren't worth
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

  if (parts[0] === "quests") {
    if (parts.length === 1) return { kind: "quest-list" };
    const hub = parts[1] as QuestHubSlug;
    if (!QUEST_HUB_SLUGS.includes(hub)) return { kind: "unknown" };
    if (parts.length === 2) return { kind: "quest-hub", hub };
    const id = Number(parts[2]);
    if (parts.length === 3 && Number.isInteger(id)) return { kind: "quest-detail", hub, id };
  }

  return { kind: "unknown" };
}

/** Renders the same content the real statically-exported route would. */
export function renderOfflineRoute(match: RouteMatch): React.ReactNode {
  switch (match.kind) {
    case "home":
      return <HomeContent />;
    case "weapon-list":
      return <LastWeaponRedirect />;
    case "weapon-tree":
      return <WeaponTreeListClient type={match.type} />;
    case "weapon-detail":
      return <WeaponDetailClient type={match.type} slug={match.slug} />;
    case "armor-list":
      return <ArmorRedirect />;
    case "armor-tree":
      return <ArmorTreeListClient slot={match.slot} rank={match.rank} />;
    case "armor-detail":
      return <ArmorDetailClient slot={match.slot} rank={match.rank} slug={match.slug} />;
    case "monster-list":
      return (
        <MonsterShell>
          <MonsterRedirect />
        </MonsterShell>
      );
    case "monster-tree":
      return (
        <MonsterShell category={match.category}>
          <MonsterListClient />
        </MonsterShell>
      );
    case "monster-detail":
      return (
        <MonsterShell category={match.category} slug={match.slug}>
          <MonsterDetailClient category={match.category} slug={match.slug} />
        </MonsterShell>
      );
    case "decoration-list":
      return <DecorationsListClient />;
    case "decoration-detail":
      return <DecorationDetailClient slug={match.slug} />;
    case "quest-list":
      return <QuestBoardsContent />;
    case "quest-hub":
      return (
        <QuestHubShell hub={match.hub}>
          <QuestListClient hub={match.hub} />
        </QuestHubShell>
      );
    case "quest-detail":
      return (
        <QuestHubShell hub={match.hub}>
          <QuestDetailClient hub={match.hub} id={match.id} />
        </QuestHubShell>
      );
    case "unknown":
      return null;
  }
}
