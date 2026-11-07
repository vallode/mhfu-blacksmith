"use client";

import WeaponNav from "@/components/WeaponNav";
import WeaponTreePanel from "@/components/WeaponTreePanel";
import Card from "@/components/Card";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";

interface Props {
  type: WeaponType;
}

export default function WeaponTreeListClient({ type }: Props) {
  const { tree, loading } = useWeaponTree(type);

  return (
    <>
      <WeaponNav activeType={type} />
      <hr className="border" />

      <div className="split-page">
        <WeaponTreePanel type={type} tree={loading ? null : tree} />

        <Card>
          <p>{loading ? "Loading…" : "Select a weapon from the tree."}</p>
        </Card>
      </div>
    </>
  );
}
