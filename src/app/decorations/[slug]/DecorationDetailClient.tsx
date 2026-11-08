"use client";

import Link from "next/link";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailRule,
  MaterialList,
  Requirements,
  Slots,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import { useDecoration } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";
import Loading from "@/components/Loading";

interface Props {
  slug: string;
}

export default function DecorationDetailClient({ slug }: Props) {
  const { item: deco, tree, loading } = useDecoration(slug);

  if (loading || !deco) {
    // Keep the split layout (and the tree card frame) in place while the data
    // bundle loads so the sidebar doesn't flash in once it resolves.
    return (
      <>
        <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
          <div>
            <Link href="/decorations/" aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <BorderRule />
        <div className="split-page">
          <Card variant="weapon-tree">
            <TreeScroll treeKey={"decorations"} activeSlug={slug}>
              {null}
            </TreeScroll>
          </Card>
          <Card>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</Card>
        </div>
      </>
    );
  }

  return (
    <>
      <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
        <div>
          <Link href="/decorations/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
      </nav>
      <BorderRule />

      <div className="split-page">
        <Card variant="weapon-tree">
          <TreeScroll treeKey="decorations" activeSlug={slug}>
            {tree?.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType="decoration"
                  basePath="/decorations/"
                  treeKey="decorations"
                  activeSlug={slug}
                />
              </ul>
            ))}
          </TreeScroll>
        </Card>

        <DetailCard>
          <DetailHeader>
            <Icon type="decoration" size="large" color={deco.color} alt={deco.name} />
            <p>{deco.name}</p>
          </DetailHeader>

          <DetailBody>
            <StatList>
              <Stat label="Slots:">
                <Slots count={deco.slots} />
              </Stat>
              {deco.category && (
                <Stat label="Category:">
                  <StatValue>{deco.category}</StatValue>
                </Stat>
              )}
            </StatList>

            {deco.skills && deco.skills.length > 0 && (
              <>
                <DetailRule />
                <div className="flex flex-1 flex-col gap-[13px]">
                  {deco.skills.map((skill, i) => (
                    <p key={i} className={i === 0 ? "w-full font-normal" : undefined}>
                      {skill}
                    </p>
                  ))}
                </div>
              </>
            )}

            {deco.create_mats && deco.create_mats.length > 0 && (
              <Requirements>
                <MaterialList
                  label="Create cost"
                  cost={deco.create_cost}
                  materials={deco.create_mats}
                />
              </Requirements>
            )}
          </DetailBody>
        </DetailCard>
      </div>
    </>
  );
}
