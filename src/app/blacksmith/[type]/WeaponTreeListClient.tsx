"use client";

import WeaponNav from "@/components/WeaponNav";
import WeaponTreePanel from "@/components/WeaponTreePanel";
import Card from "@/components/Card";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";

interface Props {
  type: WeaponType;
}

export default function WeaponTreeListClient({ type }: Props) {
  const { tree, loading } = useWeaponTree(type);

  return (
    <>
      <WeaponNav activeType={type} />
      <BorderRule />

      <div className="split-page">
        <WeaponTreePanel type={type} tree={loading ? null : tree} />

        <Card>
          <p className="leading-[1.2] whitespace-normal">
            {loading ? "Loading…" : "Select a weapon from the tree."}
          </p>
        </Card>
      </div>
    </>
  );
}
