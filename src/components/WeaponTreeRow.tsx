"use client";

import Link from "next/link";
import Icon from "./Icon";
import { cn } from "@/lib/cn";
import { prefetchBundle } from "@/lib/client-data";
import { WEAPON_TYPES } from "@/lib/constants";
import styles from "./WeaponTreeRow.module.scss";
import type { WeaponTreeNode } from "@/lib/types";

interface WeaponTreeRowProps {
  node: WeaponTreeNode;
  sectionType: string;
  basePath: string;
  activeSlug?: string;
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
  activeSlug,
}: WeaponTreeRowProps) {
  const isExternal = node.type !== sectionType && (WEAPON_TYPES as readonly string[]).includes(node.type);
  const href = node.rarity
    ? isExternal
      ? `/blacksmith/${node.type}/${node.slug}/`
      : `${basePath}${node.slug}/`
    : undefined;
  const isActive = activeSlug === node.slug;

  const onPointerEnter = href
    ? () => {
        const file = bundleForHref(node, isExternal ? `/blacksmith/${node.type}/` : basePath);
        if (file) prefetchBundle(file);
      }
    : undefined;

  const rowClass = cn(styles.row, {
    [styles["row--external"]]: isExternal,
    [styles["row--active"]]: isActive,
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
      {node.children && <p className={styles.toggle}>[-]</p>}
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          id={node.slug}
          className={rowClass}
          href={href}
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

      {node.children && (
        <ul className={node.children.length > 1 ? styles["multiple-children"] : undefined}>
          {node.children.map((child) => (
            <WeaponTreeRow
              key={child.slug}
              node={child}
              sectionType={sectionType}
              basePath={basePath}
              activeSlug={activeSlug}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
