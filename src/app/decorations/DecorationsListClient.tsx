"use client";

import Link from "next/link";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import { useDecorationTree } from "@/lib/client-data";

export default function DecorationsListClient() {
  const { tree, loading } = useDecorationTree();

  return (
    <>
      <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
        <div>
          <Link href="/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="ml-auto">
          <button
            className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
            aria-label="Search"
          >
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>
      <hr className="border" />

      <div className="split-page">
        <Card variant="weapon-tree">
          <TreeScroll treeKey="decorations">
            {!loading &&
              tree?.map((node) => (
                <ul key={node.slug}>
                  <WeaponTreeRow node={node} sectionType="decoration" basePath="/decorations/" />
                </ul>
              ))}
          </TreeScroll>
        </Card>
        <Card>
          <p>{loading ? "Loading…" : "Select a decoration from the tree."}</p>
        </Card>
      </div>
    </>
  );
}
