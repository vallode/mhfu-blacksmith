import styles from "@/styles/weapon-tree.module.scss";
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
    styles["weapon-tree__row"],
    isExternal ? styles["weapon-tree__row--external"] : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li>
      <a
        id={node.slug}
        className={rowClass}
        href={href}
      >
        {node.rarity && (
          <div
            className={[
              "icon icon--mini",
              `icon--${node.type}`,
              `icon--rarity-${node.rarity}`,
              node.color ? `icon--${node.color}` : "",
              node.element ? `icon--${node.element}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <img src={`/images/${node.type}-mini.png`} alt="" />
          </div>
        )}
        <p className="name">{node.name}</p>
        {node.children && (
          <p className={styles["weapon-tree__row__toggle"]}>[-]</p>
        )}
      </a>

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
