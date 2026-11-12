"use client";

import { usePathname } from "next/navigation";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import DecorationNav from "@/components/DecorationNav";
import TreeScroll from "@/components/TreeScroll";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import { useDecorationTree } from "@/lib/client-data";

/**
 * The decorations frame: nav, divider and the decoration tree down the left,
 * with the page (a decoration's details, or NO DATA on /decorations/) on the
 * right. It lives in the decorations layout so it stays mounted while you move
 * between decorations; only the right-hand card re-renders.
 */
export function DecorationShell({ slug, children }: { slug?: string; children: React.ReactNode }) {
  const { tree } = useDecorationTree();
  return (
    <>
      <DecorationNav />
      <BorderRule />
      <div className="split-page">
        <CardBox>
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
                    scroll={false}
                  />
                </ul>
              ))}
            </TreeScroll>
          </Card>
        </CardBox>
        {children}
      </div>
    </>
  );
}

/** DecorationShell for the current route (used by the decorations layout). */
export default function DecorationRouteShell({ children }: { children: React.ReactNode }) {
  const [section, slug] = usePathname().split("/").filter(Boolean);
  return (
    <DecorationShell slug={section === "decorations" ? slug : undefined}>
      {children}
    </DecorationShell>
  );
}
