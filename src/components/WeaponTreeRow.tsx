import Link from "next/link";
import Icon from "./Icon";
import type { WeaponTreeNode } from "@/lib/types";

interface WeaponTreeRowProps {
  node: WeaponTreeNode;
  sectionType: string;
  basePath: string;
}

export default function WeaponTreeRow({
  node,
  sectionType,
  basePath,
}: WeaponTreeRowProps) {
  const isExternal = node.type !== sectionType;
  const href = node.rarity
    ? isExternal
      ? `/blacksmith/${node.type}/${node.slug}/`
      : `${basePath}${node.slug}/`
    : undefined;

  const rowClass = [
    "weapon-tree__row",
    isExternal ? "weapon-tree__row--external" : null,
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
        <Link id={node.slug} className={rowClass} href={href}>
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
            />
          ))}
        </ul>
      )}
    </li>
  );
}
