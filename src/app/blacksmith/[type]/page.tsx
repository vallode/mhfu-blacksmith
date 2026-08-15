import { notFound } from "next/navigation";
import { getWeaponTypes, getWeaponTree } from "@/lib/weapons";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import WeaponNav from "@/components/WeaponNav";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ type: string }>;
}

export async function generateStaticParams() {
  return getWeaponTypes().map((type) => ({ type }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const name = type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${name} tree — MHFU Blacksmith`,
  };
}

export default async function WeaponTreePage({ params }: Props) {
  const { type } = await params;

  if (!WEAPON_TYPES.includes(type as WeaponType)) {
    notFound();
  }

  const weaponType = type as WeaponType;
  const tree = getWeaponTree(weaponType);
  const basePath = `/blacksmith/${type}/`;

  return (
    <>
      <WeaponNav activeType={weaponType} />
      <hr className="border" />

      <div className="split-page">
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`weapon-${type}`}>
            {tree.map.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType={type}
                  basePath={basePath}
                />
              </ul>
            ))}
          </TreeScroll>
        </Card>

        <Card>
          <p>Select a weapon from the tree.</p>
        </Card>
      </div>
    </>
  );
}
