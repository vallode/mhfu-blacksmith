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
import styles from "./WeaponTreeRow.module.scss";
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
}

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

/** One square per improve material, filled when the item box has enough of it. */
function MaterialPips({ materials }: { materials: MaterialCheck[] }) {
  const have = materials.filter((m) => m.have >= m.need).length;
  const all = have === materials.length;
  return (
    <span
      className={styles.pips}
      role="img"
      aria-label={`${have} of ${materials.length} materials owned`}
      title={materials
        .map((m) => `${m.name}: ${Number.isFinite(m.have) ? m.have : "∞"}/${m.need}`)
        .join("\n")}
    >
      {materials.map((m, i) => (
        <span key={i} className={cn(styles.pip, m.have >= m.need && styles["pip--have"])} />
      ))}
      <span className={cn(styles.pipCount, !all && styles["pipCount--short"])}>
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

  const rowClass = cn(styles.row, {
    [styles["row--external"]]: isExternal,
    [styles["row--active"]]: isActive,
    [styles["row--owned"]]: owned,
    [styles["row--upgrade"]]: canUpgrade,
    [styles["row--dimmed"]]: dimmed,
  });

  const inner = (
    <>
      {node.rarity && (
        <Icon
          type={node.type}
          size="mini"
          rarity={node.rarity}
          color={node.color}
          element={node.element}
          className={styles.rowIcon}
        />
      )}
      <p className={styles.name}>{node.name}</p>
      {owned && <span className="sr-only"> (owned)</span>}
      {canUpgrade && <span className="sr-only"> (you can make this upgrade now)</span>}
      {node.children && (
        <p
          className={styles.toggle}
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
    <li>
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
        <ul
          className={
            node.children.length > 1 ? styles["multiple-children"] : undefined
          }
        >
          {node.children.map((child) => (
            <WeaponTreeRow
              key={child.slug}
              node={child}
              sectionType={sectionType}
              basePath={basePath}
              treeKey={treeKey}
              activeSlug={activeSlug}
              parentHref={href}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
