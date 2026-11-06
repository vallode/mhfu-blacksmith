"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { cn } from "@/lib/cn";
import { prefetchBundle } from "@/lib/client-data";
import { WEAPON_TYPES } from "@/lib/constants";
import { isNodeCollapsed, setNodeCollapsed } from "@/lib/tree-collapse-store";
import { useHunterProgress } from "@/context/HunterProgressContext";
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

export default function WeaponTreeRow({
  node,
  sectionType,
  basePath,
  treeKey,
  activeSlug,
  parentHref,
}: WeaponTreeRowProps) {
  const [collapsed, setCollapsed] = useState(() => isNodeCollapsed(treeKey, node.slug));

  const isExternal = node.type !== sectionType && (WEAPON_TYPES as readonly string[]).includes(node.type);
  const href = node.rarity
    ? isExternal
      ? `/blacksmith/${node.type}/${node.slug}/`
      : `${basePath}${node.slug}/`
    : undefined;
  const isActive = activeSlug === node.slug;

  // Markers for the loaded hunter: owned pieces, and weapons they can make
  // from an owned parent with what's in their item box right now.
  const progress = useHunterProgress();
  const owned = href ? progress.isOwned(href) : false;
  const upgrade =
    progress.active && href?.startsWith("/blacksmith/") && !owned && parentHref && progress.isOwned(parentHref)
      ? progress.upgradeCheck(node.type, node.slug)
      : null;
  const canUpgrade = upgrade?.status === "ready";

  const onToggleClick = (event: { preventDefault(): void; stopPropagation(): void }) => {
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
        const file = bundleForHref(node, isExternal ? `/blacksmith/${node.type}/` : basePath);
        if (file) prefetchBundle(file);
      }
    : undefined;

  const rowClass = cn(styles.row, {
    [styles["row--external"]]: isExternal,
    [styles["row--active"]]: isActive,
    [styles["row--owned"]]: owned,
    [styles["row--upgrade"]]: canUpgrade,
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
            if (event.key === "Enter" || event.key === " ") onToggleClick(event);
          }}
        >
          {collapsed ? "[+]" : "[-]"}
        </p>
      )}
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
        <ul className={node.children.length > 1 ? styles["multiple-children"] : undefined}>
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
