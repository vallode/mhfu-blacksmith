"use client";

import WeaponNav from "@/components/WeaponNav";
import WeaponTreePanel from "@/components/WeaponTreePanel";
import Card from "@/components/Card";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";
import Loading from "@/components/Loading";

interface Props {
  type: WeaponType;
}

export default function WeaponTreeListClient({ type }: Props) {
  const { tree, loading } = useWeaponTree(type);

  return (
    <>
      <WeaponNav activeType={type} />

      <div className="split-page" data-fill-screen>
        <WeaponTreePanel type={type} tree={loading ? null : tree} />

        {/* Phones show one pane at a time: here, the tree. */}
        <Card className="mobile:hidden">
          {loading ? (
            <Loading>Loading…</Loading>
          ) : (
            <p className="leading-[1.2] whitespace-normal">Select a weapon from the tree.</p>
          )}
        </Card>
      </div>
    </>
  );
}
