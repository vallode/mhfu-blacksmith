"use client";

import Link from "next/link";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import MaterialRow from "@/components/MaterialRow";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import cardStyles from "@/styles/weapon-card.module.scss";
import type { ArmorSlot, ArmorRank } from "@/lib/constants";
import { useArmorPiece } from "@/lib/client-data";

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
  slug: string;
}

export default function ArmorDetailClient({ slot, rank, slug }: Props) {
  const { item: piece, tree, loading } = useArmorPiece(slot, rank, slug);

  const basePath = `/armorsmith/${slot}/${rank}/`;

  if (loading) {
    return (
      <>
        <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
          <div>
            <Link href="/armorsmith/" aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Loading…</p>
      </>
    );
  }
  if (!piece) {
    return (
      <>
        <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
          <div>
            <Link href="/armorsmith/" aria-label="Back">
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
      <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
        <div>
          <Link href="/armorsmith/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
      </nav>
      <hr className="border" />

      <div className="split-page">
        {tree && (
          <Card variant="weapon-tree">
            <TreeScroll treeKey={`armor-${slot}-${rank}`} activeSlug={slug}>
              {tree.map((node) => (
                <ul key={node.slug}>
                  <WeaponTreeRow node={node} sectionType={slot} basePath={basePath} activeSlug={slug} />
                </ul>
              ))}
            </TreeScroll>
          </Card>
        )}

        <Card className={cardStyles["weapon-card"]}>
          <div className={cardStyles["weapon-card__header"]}>
            <Icon type={slot} size="large" alt={piece.name} />
            <p>{piece.name}</p>
            {piece.sex && <span className="sex">{piece.sex}</span>}
            {piece.hunter_type && <span className="hunter_type">{piece.hunter_type}</span>}
          </div>

          <div className={cardStyles["weapon-card__details"]}>
            <div className="stats stats--armor">
              <div>
                <h3>Defence:</h3>
                <p><span>{piece.defence}</span></p>
              </div>
              <div>
                <h3>Slots:</h3>
                <p>
                  <span id="weaponSlots">
                    {Array.from({ length: 3 }, (_, i) =>
                      i < (piece.slots ?? 0) ? "O" : "-"
                    ).join("")}
                  </span>
                </p>
              </div>
              {piece.fire_res !== undefined && (
                <div>
                  <h3>Fire res:</h3>
                  <p><span>{piece.fire_res}</span></p>
                </div>
              )}
              {piece.water_res !== undefined && (
                <div>
                  <h3>Water res:</h3>
                  <p><span>{piece.water_res}</span></p>
                </div>
              )}
              {piece.thunder_res !== undefined && (
                <div>
                  <h3>Thunder res:</h3>
                  <p><span>{piece.thunder_res}</span></p>
                </div>
              )}
              {piece.ice_res !== undefined && (
                <div>
                  <h3>Ice res:</h3>
                  <p><span>{piece.ice_res}</span></p>
                </div>
              )}
              {piece.dragon_res !== undefined && (
                <div>
                  <h3>Dragon res:</h3>
                  <p><span>{piece.dragon_res}</span></p>
                </div>
              )}
            </div>

            <hr />

            {piece.skills && piece.skills.length > 0 && (
              <div className="skills">
                <h2>Skills</h2>
                {piece.skills.map((skill, i) => (
                  <div key={i}>
                    <h3>{skill.name}</h3>
                    <p className={Number(skill.amount) < 0 ? "negative" : "positive"}>
                      {skill.amount}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {piece.create_mats && piece.create_mats.length > 0 && (
              <div className="requirements">
                <div className="create_mats">
                  <p>
                    <span>Create cost: </span>{piece.create_cost}z
                  </p>
                  {piece.create_mats.map((m, i) => (
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
