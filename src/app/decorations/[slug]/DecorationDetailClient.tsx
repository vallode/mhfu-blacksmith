"use client";

import Link from "next/link";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import MaterialRow from "@/components/MaterialRow";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import cardStyles from "@/styles/weapon-card.module.scss";
import { useDecoration } from "@/lib/client-data";

interface Props {
  slug: string;
}

export default function DecorationDetailClient({ slug }: Props) {
  const { item: deco, tree, loading } = useDecoration(slug);

  if (loading) {
    return (
      <>
        <nav className="weapon-navigation">
          <div>
            <Link href="/decorations/" aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Loading…</p>
      </>
    );
  }
  if (!deco) {
    return (
      <>
        <nav className="weapon-navigation">
          <div>
            <Link href="/decorations/" aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Not found.</p>
      </>
    );
  }

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href="/decorations/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-details-page">
        <Card variant="weapon-tree">
          <TreeScroll treeKey="decorations" activeSlug={slug}>
            {tree?.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType="decoration"
                  basePath="/decorations/"
                  activeSlug={slug}
                />
              </ul>
            ))}
          </TreeScroll>
        </Card>

        <Card className={cardStyles["weapon-card"]}>
          <div className={cardStyles["weapon-card__header"]}>
            <Icon
              type="decoration"
              size="large"
              color={deco.color}
              alt={deco.name}
            />
            <p>{deco.name}</p>
          </div>

          <div className={cardStyles["weapon-card__details"]}>
            <div className="stats">
              <div>
                <h3>Slots:</h3>
                <p>
                  <span id="weaponSlots">
                    {Array.from({ length: 3 }, (_, i) =>
                      i < (deco.slots ?? 0) ? "O" : "-"
                    ).join("")}
                  </span>
                </p>
              </div>
              {deco.category && (
                <div>
                  <h3>Category:</h3>
                  <p><span>{deco.category}</span></p>
                </div>
              )}
            </div>

            {deco.skills && deco.skills.length > 0 && (
              <>
                <hr />
                <div className="skills">
                  {deco.skills.map((skill, i) => (
                    <p key={i} className="element">{skill}</p>
                  ))}
                </div>
              </>
            )}

            {deco.create_mats && deco.create_mats.length > 0 && (
              <div className="requirements">
                <div className="create_mats">
                  <p>
                    <span>Create cost: </span>{deco.create_cost}z
                  </p>
                  {deco.create_mats.map((m, i) => (
                    <MaterialRow key={i} material={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
