"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { cn } from "@/lib/cn";
import { prefetchBundle } from "@/lib/client-data";
import { isNodeCollapsed, setNodeCollapsed } from "@/lib/tree-collapse-store";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { useTreeFilterResult } from "@/context/TreeFilterContext";
import type { MaterialCheck } from "@/lib/hunter-progress";
import { rowStatus } from "@/lib/tree-filter";
import type { WeaponTreeNode } from "@/lib/types";

interface WeaponTreeRowProps {
  node: WeaponTreeNode;
  sectionType: string;
  basePath: string;
  /** Same key TreeScroll uses for this tree; persists collapse state across navigation. */
  treeKey: string;
  activeSlug?: string;
  /** The enclosing row's page, if any: the weapon this one is upgraded from. */
  parentHref?: string;
  /** Rendered inside another row's branch (draws the connector lines). */
  nested?: boolean;
  /** A later sibling follows, so the vertical connector runs on past this row. */
  hasNextSibling?: boolean;
}

// Each row is a full-width line with a highlight strip drawn by ::before.
// On desktop the strip spans the whole tree card regardless of indentation:
// it is anchored to the row's right edge and is as wide as the card
// (half the viewport, minus the page gutter and the gap between cards).
// Rows a tree filter (WeaponTreePanel) rules out fade in place, so the
// connector lines and indentation never move.
const rowBase = [
  "relative flex h-[38px] w-full min-w-max flex-row items-center pr-[0.9rem] text-white",
  "transition-opacity duration-150 ease-out motion-reduce:transition-none",
  "before:absolute before:top-0 before:left-[calc(100%-50vw+2.3rem+0.65rem)] before:z-0 before:block before:h-full before:w-[calc(50vw-2.3rem-0.65rem)] before:bg-transparent",
  "mobile:before:left-0 mobile:before:w-full",
  "hover:before:hover-glow focus:before:hover-glow",
].join(" ");

// Tree connectors from the parent's toggle down to this row: a vertical line
// (::before) and a horizontal stub (::after) in the card's line colour.
const connector = [
  "relative",
  "before:absolute before:top-0 before:-left-4 before:-z-1 before:block before:h-[19px] before:w-[3px] before:bg-line",
  "after:absolute after:top-[19px] after:-left-4 after:-z-1 after:block after:h-[3px] after:w-4 after:bg-line",
].join(" ");

/** Map a tree-row href to its data bundle, so we can warm the cache on hover. */
function bundleForHref(node: WeaponTreeNode, basePath: string): string | null {
  if (basePath.startsWith("/blacksmith/")) return `weapon-${node.type}`;
  if (basePath.startsWith("/armorsmith/")) {
    // basePath is /armorsmith/<slot>/<rank>/ — the tree stays within one bundle
    const rank = basePath.split("/")[3];
    return `armor-${node.type}-${rank}`;
  }
  if (basePath.startsWith("/decorations/")) return "decorations";
  return null;
}

/**
 * Improve materials for an upgrade the hunter could make from an owned
 * parent: one square each, filled when the item box has enough and hollow
 * when short, then a have/total count. Pushed to the row's right edge.
 */
function MaterialPips({ materials }: { materials: MaterialCheck[] }) {
  const have = materials.filter((m) => m.have >= m.need).length;
  const all = have === materials.length;
  return (
    <span
      className="relative z-10 ml-auto flex flex-[0_0_auto] items-center gap-1 pl-4"
      role="img"
      aria-label={`${have} of ${materials.length} materials owned`}
      title={materials
        .map((m) => `${m.name}: ${Number.isFinite(m.have) ? m.have : "∞"}/${m.need}`)
        .join("\n")}
    >
      {materials.map((m, i) => (
        <span
          key={i}
          className={cn(
            "size-[10px] border-2 border-rarity-9",
            m.have >= m.need && "border-positive bg-positive",
          )}
        />
      ))}
      <span className={cn("ml-[2px] text-[15px] leading-none whitespace-nowrap", all ? "text-white" : "text-rarity-9")}>
        {have}/{materials.length}
      </span>
    </span>
  );
}

export default function WeaponTreeRow({
  node,
  sectionType,
  basePath,
  treeKey,
  activeSlug,
  parentHref,
  nested = false,
  hasNextSibling = false,
}: WeaponTreeRowProps) {
  const [collapsed, setCollapsed] = useState(() =>
    isNodeCollapsed(treeKey, node.slug),
  );

  const isActive = activeSlug === node.slug;

  // Markers for the loaded hunter: owned pieces, and weapons they can make
  // from an owned parent with what's in their item box right now. In a
  // filtered weapon tree the panel has already worked this out for every row.
  const progress = useHunterProgress();
  const filtered = useTreeFilterResult()?.rows.get(node.slug);
  const { href, external: isExternal, owned, upgrade } =
    filtered ?? rowStatus(node, sectionType, basePath, parentHref, progress);
  const dimmed = filtered ? !filtered.match : false;
  const canUpgrade = upgrade?.status === "ready";

  const onToggleClick = (event: {
    preventDefault(): void;
    stopPropagation(): void;
  }) => {
    // Rows can be links (a parent weapon still has its own page), so stop
    // the click from also triggering navigation.
    event.preventDefault();
    event.stopPropagation();
    setCollapsed((value) => {
      const next = !value;
      setNodeCollapsed(treeKey, node.slug, next);
      return next;
    });
  };

  const onPointerEnter = href
    ? () => {
        const file = bundleForHref(
          node,
          isExternal ? `/blacksmith/${node.type}/` : basePath,
        );
        if (file) prefetchBundle(file);
      }
    : undefined;

  const rowClass = cn(
    rowBase,
    // Weapons from another tree (e.g. a cross-type upgrade) are dimmed.
    isExternal && "text-muted",
    // The current page's row keeps a steady (non-pulsing) highlight.
    isActive && "before:animate-none before:[background:var(--gradient-hover-glow)]",
    // Weapons the hunter can make right now get a softer resting highlight.
    canUpgrade &&
      !isActive &&
      "[&:not(:hover):not(:focus)]:before:[background:var(--gradient-upgrade-glow)]",
    // Ruled out by the tree filter.
    dimmed && "opacity-30",
  );

  const inner = (
    <>
      {node.rarity && (
        <Icon
          type={node.type}
          size="mini"
          rarity={node.rarity}
          color={node.color}
          element={node.element}
        />
      )}
      {/* Owned pieces get gold names, as in the game's lists. */}
      <p className={cn("truncate", owned && "text-gold")}>{node.name}</p>
      {owned && <span className="sr-only"> (owned)</span>}
      {canUpgrade && <span className="sr-only"> (you can make this upgrade now)</span>}
      {node.children && (
        <p
          className="cursor-pointer px-[3px] font-[monospace] opacity-20"
          role="button"
          tabIndex={0}
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={onToggleClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              onToggleClick(event);
          }}
        >
          {collapsed ? "[+]" : "[-]"}
        </p>
      )}
      {upgrade && upgrade.status !== "unknown" && <MaterialPips materials={upgrade.materials} />}
    </>
  );

  return (
    <li className={nested ? cn(connector, hasNextSibling && "before:h-full") : undefined}>
      {href ? (
        <Link
          id={node.slug}
          className={rowClass}
          href={href}
          title={
            canUpgrade && upgrade?.status === "ready"
              ? `You can make this upgrade now (${upgrade.cost.toLocaleString()}z, materials in your item box)`
              : owned
                ? "In your equipment box"
                : undefined
          }
          onPointerEnter={onPointerEnter}
          onFocus={onPointerEnter}
        >
          {inner}
        </Link>
      ) : (
        <span id={node.slug} className={rowClass}>
          {inner}
        </span>
      )}

      {node.children && !collapsed && (
        <ul>
          {node.children.map((child, i) => (
            <WeaponTreeRow
              key={child.slug}
              node={child}
              sectionType={sectionType}
              basePath={basePath}
              treeKey={treeKey}
              activeSlug={activeSlug}
              parentHref={href}
              nested
              hasNextSibling={i < node.children!.length - 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
