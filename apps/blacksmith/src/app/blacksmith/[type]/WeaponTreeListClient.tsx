"use client";

import WeaponNav from "@/components/WeaponNav";
import WeaponTreePanel from "@/components/WeaponTreePanel";
import Card from "@/components/Card";
import type { WeaponType } from "@/lib/constants";
import { useWeaponTree } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";
import Loading from "@/components/Loading";
import { useT } from "@/context/LanguageContext";

interface Props {
  type: WeaponType;
}

export default function WeaponTreeListClient({ type }: Props) {
  const { tree, loading } = useWeaponTree(type);
  const t = useT();

  return (
    <>
      <WeaponNav activeType={type} />
      <BorderRule />

      <div className="split-page">
        <WeaponTreePanel type={type} tree={loading ? null : tree} />

        <Card>
          {loading ? (
            <Loading>{t.common.loading}</Loading>
          ) : (
            <p className="leading-[1.2] whitespace-normal">{t.equipment.tree.selectWeapon}</p>
          )}
        </Card>
      </div>
    </>
  );
}
