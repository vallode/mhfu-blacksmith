"use client";

import WeaponNav from "@/components/WeaponNav";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";

interface Props {
  type: WeaponType;
}

export default function WeaponTreeListClient({ type }: Props) {
  const { tree, loading } = useWeaponTree(type);
  const basePath = `/blacksmith/${type}/`;

  return (
    <>
      <WeaponNav activeType={type} />
      <hr className="border" />

      <div className="split-page">
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`weapon-${type}`}>
            {!loading &&
              tree?.map((node) => (
                <ul key={node.slug}>
                  <WeaponTreeRow node={node} sectionType={type} basePath={basePath} />
                </ul>
              ))}
          </TreeScroll>
        </Card>

        <Card>
          <p>{loading ? "Loading…" : "Select a weapon from the tree."}</p>
        </Card>
      </div>
    </>
  );
}
