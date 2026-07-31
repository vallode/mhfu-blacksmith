import Link from "next/link";
import { getDecorationTree } from "@/lib/decorations";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Decorations — MHFU Blacksmith",
};

export default function DecorationsPage() {
  const tree = getDecorationTree();

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href="/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="search-trigger-wrap">
          <button className="search-trigger" aria-label="Search">
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-tree-page">
        <Card variant="weapon-tree">
          <div className="weapon-tree">
            {tree.map.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType="decoration"
                  basePath="/decorations/"
                />
              </ul>
            ))}
          </div>
        </Card>
        <Card>
          <p>Select a decoration from the tree.</p>
        </Card>
      </div>
    </>
  );
}
