"use client";

import Link from "next/link";
import Icon from "./Icon";
import { prefetchBundle } from "@/lib/client-data";
import { WEAPON_TYPES } from "@/lib/constants";
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

  const rowClass = [
    "weapon-tree__row",
    isExternal ? "weapon-tree__row--external" : null,
    isActive ? "weapon-tree__row--active" : null,
  ]
    .filter(Boolean)
    .join(" ");

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
      <p className="name">{node.name}</p>
      {node.children && <p className="weapon-tree__row__toggle">[-]</p>}
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
        <ul className={node.children.length > 1 ? "multiple-children" : undefined}>
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
