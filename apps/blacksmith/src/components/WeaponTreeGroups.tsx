"use client";

/**
 * The weapon tree card's list views: the tree's weapons, flat, under a
 * header per element or rarity that sticks to the top of the card while its
 * group scrolls by, and folds the group away when clicked. The rows are the
 * tree's own rows (WeaponTreeRow, under the panel's TreeFilterContext), so
 * owned names, material pips and filter dimming work as in the tree.
 */
import { useMemo, useState } from "react";
import ElementGlyph from "./ElementGlyph";
import { TreeBranch } from "./TreeScroll";
import WeaponTreeRow from "./WeaponTreeRow";
import { useTreeFilterResult } from "@/context/TreeFilterContext";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { ElementFilterId } from "@/lib/tree-filter";
import type { TreeGroup } from "@/lib/tree-groups";

interface Props {
  groups: TreeGroup[];
  sectionType: string;
  basePath: string;
  treeKey: string;
}

// Opaque, so rows scroll out of sight under a stuck header. TreeScroll
// indents the list by 13px; the header runs out to the card's edges.
const header = cn(
  "sticky top-0 z-1 -ml-[13px] flex h-[34px] w-[calc(100%+13px)] cursor-pointer items-center gap-3 border-b-2 border-black/40 px-5 text-left text-sub tracking-[0.12em] text-parchment uppercase",
  "[background:linear-gradient(var(--color-selector),var(--color-selector)),var(--color-sheet)]",
  "hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white focus-visible:outline-solid",
);

export default function WeaponTreeGroups({ groups, sectionType, basePath, treeKey }: Props) {
  const t = useT();
  const tt = t.equipment.tree;
  const result = useTreeFilterResult();
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // Each weapon listed flat: its upgrades are rows of their own here. Made
  // once per grouping, so the rows (memoised) keep their nodes. A
  // dual-element weapon is in two groups; only its first row is its anchor.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return groups.map((group) =>
      group.weapons.map(({ node, parentHref }) => {
        const listedAgain = seen.has(node.slug);
        seen.add(node.slug);
        return { node: { ...node, children: undefined }, parentHref, listedAgain };
      }),
    );
  }, [groups]);

  return groups.map((group, g) => {
    const isFolded = folded.has(group.key);
    const total = group.weapons.length;
    const matched = result
      ? group.weapons.filter(({ node }) => result.rows.get(node.slug)?.match).length
      : total;
    const element: ElementFilterId | undefined =
      group.element === undefined ? undefined : ((group.element ?? "none") as ElementFilterId);
    return (
      <section key={group.key}>
        <button
          type="button"
          aria-expanded={!isFolded}
          className={header}
          onClick={() => toggle(group.key)}
        >
          {element ? (
            <ElementGlyph filter={element} />
          ) : (
            <span
              className="size-[14px] flex-none"
              style={{ background: `var(--color-rarity-${group.rarity})` }}
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-auto truncate">
            {element ? t.equipment.treeElementFilters[element] : tt.rarityGroup(group.rarity!)}
          </span>
          <span className="flex-none tracking-normal text-white/70">
            <span aria-hidden="true">{matched === total ? total : `${matched}/${total}`}</span>
            <span className="sr-only">{tt.filterCount(matched, total)}</span>
          </span>
          <span className="flex-none tracking-normal text-white/30" aria-hidden="true">
            {isFolded ? "[+]" : "[-]"}
          </span>
        </button>
        {!isFolded && (
          <TreeBranch rows={total}>
            {rows[g].map(({ node, parentHref, listedAgain }) => (
              <WeaponTreeRow
                key={node.slug}
                node={node}
                parentHref={parentHref}
                sectionType={sectionType}
                basePath={basePath}
                treeKey={treeKey}
                listedAgain={listedAgain}
              />
            ))}
          </TreeBranch>
        )}
      </section>
    );
  });
}
